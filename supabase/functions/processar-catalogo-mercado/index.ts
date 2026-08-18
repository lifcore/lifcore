/**
 * EDGE FUNCTION: processar-catalogo-mercado
 * SPEC-002 — Connect Center. Arquitetura v3 (18/08/2026) — correção de
 * execução, diretriz do Chief.
 *
 * Mudança de princípio em relação à v2: NENHUMA requisição fica esperando
 * o lote inteiro (nem 5, nem 2 blocos) — cada chamada processa NO MÁXIMO
 * 1 bloco e termina. O cliente (frontend) chama de novo pra cada bloco
 * seguinte, até não sobrar pendente. Isso elimina de vez a dependência
 * entre "tempo total do processamento" e "timeout de uma requisição HTTP"
 * — era exatamente isso que causava o IDLE_TIMEOUT visto em produção.
 *
 * Duas ações possíveis no corpo da requisição ({ loteId, acao }):
 * - acao omitida ou 'processar' (padrão): extrai e grava 1 bloco.
 * - acao: 'validar': roda a validação cruzada por segunda IA em 1 bloco já
 *   concluído que ainda não foi validado. Completamente separada da
 *   gravação — nunca bloqueia nem atrasa a ingestão principal (diretriz §8).
 *
 * Recuperação de bloco travado (lease/timeout, diretriz §5): antes de
 * escolher um bloco pra processar, qualquer bloco em 'processando' há mais
 * de LEASE_TIMEOUT_MS volta pra 'pendente' — cobre o caso do worker
 * anterior ter morrido por IDLE_TIMEOUT no meio do trabalho.
 *
 * Failover por bloco (diretriz §7): se o provedor ativo falhar num bloco
 * (mesmo depois do retry interno em erro 5xx, já embutido em cada
 * provider), tenta o provedor secundário só nesse bloco — nunca reinicia
 * o lote inteiro.
 *
 * Telemetria por etapa (diretriz §13): cada bloco registra em qual etapa
 * exata parou (START/IA_REQUEST/FAILOVER/IA_RESPONSE/JSON_VALIDADO/
 * NORMALIZACAO/DB_WRITE/DB_SUCCESS/CONCLUIDO), gravado no banco — não
 * depende só de console.error pra diagnosticar.
 */

import { createClient } from 'npm:@supabase/supabase-js@2'
import pdfParseModule from 'npm:pdf-parse@1.1.1'
import * as XLSX from 'npm:xlsx@0.18.5'
import {
  processarDominioPlanos,
  processarDominioPrecos,
  processarDominioRegraMercado,
  processarDominioRede,
  aplicarDivergenciasDireto,
  dividirEmBlocos,
  calcularAssinaturaEstrutural,
} from './motor-mercado/index.ts'
import { obterNomeProviderFailover, validarConsistenciaComIA } from './motor-mercado/ia-providers/index.ts'
import { validarBlocoComSegundaIA } from './motor-mercado/validacao-cruzada.ts'

const pdfParse = pdfParseModule as (buffer: Uint8Array) => Promise<{ text: string }>

const BUCKET = 'anexos'
const TAMANHO_MAXIMO_BLOCO = 6000 // caracteres
const TAMANHO_CONTEXTO_ANTERIOR = 800 // caracteres do final do bloco anterior, carregados como referência — não como dado novo (diretriz §1/§5)
const LEASE_TIMEOUT_MS = 120000 // 120s — a própria Edge Function morre aos 150s de IDLE_TIMEOUT; 120s de margem é seguro pra considerar um bloco "processando" como órfão.

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// deno-lint-ignore no-explicit-any
type Db = any
interface Divergencia {
  tabela_afetada: string
  registro_existente_id: string | null
  dado_novo: Record<string, unknown>
  dado_existente: Record<string, unknown> | null
  tipo_divergencia: 'novo' | 'alterado' | 'conflito'
}

function extensaoDoArquivo(caminho: string): string {
  return caminho.split('.').pop()?.toLowerCase() ?? ''
}

async function extrairTexto(buffer: Uint8Array, extensao: string): Promise<string> {
  if (extensao === 'pdf') {
    const pdf = await pdfParse(buffer)
    return pdf.text
  }
  if (extensao === 'xlsx' || extensao === 'xls') {
    const workbook = XLSX.read(buffer, { type: 'array' })
    return workbook.SheetNames.map((nome: string) => XLSX.utils.sheet_to_csv(workbook.Sheets[nome])).join('\n\n')
  }
  return new TextDecoder('utf-8').decode(buffer)
}

async function obterContextoPlanos(operadoraId: string, db: Db): Promise<{ operadoraNome: string; produtoPadraoId: string }> {
  const { data: operadora } = await db.from('operadoras').select('razao_social').eq('id', operadoraId).single()
  const { data: produtoPadrao } = await db.from('produtos').select('id').eq('modulo', 'saude').limit(1).maybeSingle()
  if (!produtoPadrao) throw new Error('Nenhum produto cadastrado no catálogo institucional para o módulo saúde — cadastre ao menos um Produto antes de importar Planos.')
  return { operadoraNome: operadora?.razao_social ?? '', produtoPadraoId: produtoPadrao.id }
}

function carimbarRegiao(divergencias: Divergencia[], regiaoTarifariaId: string | null): Divergencia[] {
  return divergencias.map((d) =>
    d.tabela_afetada === 'regras_precificacao'
      ? { ...d, dado_novo: { ...(d.dado_novo as Record<string, unknown>), regiao_tarifaria_id: regiaoTarifariaId } }
      : d
  )
}

async function processarBlocoPorDominio(dominio: string, texto: string, lote: Record<string, unknown>, db: Db, nomeProviderForcado?: string): Promise<Divergencia[]> {
  const operadoraId = lote.operadora_id as string
  const regiaoTarifariaId = (lote.regiao_tarifaria_id as string) ?? null

  if (dominio === 'planos') {
    const { operadoraNome, produtoPadraoId } = await obterContextoPlanos(operadoraId, db)
    return processarDominioPlanos(texto, operadoraId, operadoraNome, produtoPadraoId, db, nomeProviderForcado)
  }
  if (dominio === 'precos') {
    const divergencias = await processarDominioPrecos(texto, operadoraId, db, regiaoTarifariaId, nomeProviderForcado)
    return carimbarRegiao(divergencias, regiaoTarifariaId)
  }
  if (['carencia', 'coparticipacao', 'reembolso', 'regra_comercial'].includes(dominio)) {
    return processarDominioRegraMercado(texto, dominio, operadoraId, db, nomeProviderForcado)
  }
  if (dominio === 'rede') {
    return processarDominioRede(texto, operadoraId, db, regiaoTarifariaId, nomeProviderForcado)
  }
  if (dominio === 'regras_gerais') {
    const { operadoraNome, produtoPadraoId } = await obterContextoPlanos(operadoraId, db)
    let todas: Divergencia[] = await processarDominioPlanos(texto, operadoraId, operadoraNome, produtoPadraoId, db, nomeProviderForcado)
    for (const sub of ['carencia', 'coparticipacao', 'reembolso', 'regra_comercial']) {
      const parcial = await processarDominioRegraMercado(texto, sub, operadoraId, db, nomeProviderForcado)
      todas = todas.concat(parcial)
    }
    return todas
  }
  throw new Error(`Domínio desconhecido: ${dominio}`)
}

async function atualizarEtapa(db: Db, blocoId: string, etapa: string) {
  await db.from('lotes_importacao_blocos').update({ etapa }).eq('id', blocoId)
}

/** Diretriz §5 — bloco travado em 'processando' por mais que o lease volta pra 'pendente'. Cobre worker morto por IDLE_TIMEOUT. */
async function recuperarBlocosTravados(db: Db, loteId: string) {
  const limite = new Date(Date.now() - LEASE_TIMEOUT_MS).toISOString()
  const { data: travados } = await db
    .from('lotes_importacao_blocos')
    .select('id, tentativas')
    .eq('lote_importacao_id', loteId)
    .eq('status', 'processando')
    .lt('processando_desde', limite)

  for (const b of travados ?? []) {
    await db
      .from('lotes_importacao_blocos')
      .update({ status: 'pendente', tentativas: ((b.tentativas as number) ?? 0) + 1, etapa: 'RECUPERADO_APOS_LEASE_EXPIRADO' })
      .eq('id', b.id)
  }
}

async function recalcularResumoLote(db: Db, loteId: string) {
  const { data: blocosFinal } = await db.from('lotes_importacao_blocos').select('*').eq('lote_importacao_id', loteId).order('numero_bloco')
  const listaBlocos = blocosFinal ?? []
  const blocosSucesso = listaBlocos.filter((b: Record<string, unknown>) => b.status === 'concluido').length
  const blocosErro = listaBlocos.filter((b: Record<string, unknown>) => b.status === 'erro').length
  const blocosPendentes = listaBlocos.filter((b: Record<string, unknown>) => b.status === 'pendente' || b.status === 'processando').length

  const resumoExecucao = {
    total_blocos: listaBlocos.length,
    blocos_sucesso: blocosSucesso,
    blocos_erro: blocosErro,
    blocos_pendentes: blocosPendentes,
    erros: listaBlocos
      .filter((b: Record<string, unknown>) => b.status === 'erro')
      .map((b: Record<string, unknown>) => ({
        numero_bloco: b.numero_bloco,
        pagina_inicio: b.pagina_inicio,
        pagina_fim: b.pagina_fim,
        mensagem: b.erro,
        etapa: b.etapa,
      })),
  }

  const statusFinal = blocosPendentes > 0 ? 'processando_parcial' : blocosErro === 0 ? 'concluido' : 'concluido_com_erros'
  await db.from('lotes_importacao_mercado').update({ status: statusFinal, resumo_execucao: resumoExecucao, processado_em: new Date().toISOString() }).eq('id', loteId)

  return resumoExecucao
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const { loteId, acao, numeroBloco } = await req.json()

    // ============================================================
    // Teste A (diretriz do Chief, 18/08): isola o caminho mínimo
    // Worker → provedor de IA → resposta, SEM arquivo, SEM lote, SEM
    // banco. Não precisa de loteId. Objetivo: confirmar se o travamento
    // (execution_time_ms = 150512, praticamente o teto de 150s) está no
    // caminho até a IA, ou em algo antes disso (preparo do arquivo/bloco).
    // ============================================================
    if (acao === 'teste_ia') {
      const inicio = Date.now()
      const nomeProvider = Deno.env.get('IA_PROVIDER') || 'anthropic'
      try {
        const resultado = await validarConsistenciaComIA(nomeProvider, 'teste mínimo, sem arquivo', '{"teste": true}')
        return new Response(JSON.stringify({ ok: true, provider: nomeProvider, resultado, duracao_ms: Date.now() - inicio }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      } catch (e) {
        return new Response(
          JSON.stringify({ ok: false, provider: nomeProvider, error: (e as Error).message, duracao_ms: Date.now() - inicio }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
    }

    // ============================================================
    // Teste B (diretriz do Chief): pega o texto REAL de um bloco já
    // persistido (nenhum download/extração de arquivo aqui) e manda pro
    // prompt de verdade do domínio — mede quanto tempo a IA leva pra
    // responder com o conteúdo real, sem nenhuma orquestração ao redor
    // (sem telemetria por etapa, sem gravação no banco, sem lease). Só
    // precisa de loteId; numeroBloco é opcional, default 1.
    // ============================================================
    if (acao === 'teste_bloco_real') {
      const inicio = Date.now()
      console.log('[teste_bloco_real] início')
      try {
        const numeroBlocoTeste = numeroBloco ?? 1
        const SUPABASE_URL_TESTE = Deno.env.get('SUPABASE_URL')!
        const SERVICE_ROLE_KEY_TESTE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
        const dbTeste = createClient(SUPABASE_URL_TESTE, SERVICE_ROLE_KEY_TESTE, { db: { schema: 'institucional' } })

        const { data: loteTeste, error: erroLoteTeste } = await dbTeste.from('lotes_importacao_mercado').select('*').eq('id', loteId).single()
        console.log(`[teste_bloco_real] lote carregado: ${loteTeste?.id ?? 'ERRO'} dominio=${loteTeste?.dominio}`)
        if (erroLoteTeste || !loteTeste) {
          return new Response(
            JSON.stringify({ ok: false, etapa: 'buscar_lote', error: erroLoteTeste?.message ?? 'Lote não encontrado', duracao_ms: Date.now() - inicio }),
            { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }

        const { data: blocoTeste, error: erroBlocoTeste } = await dbTeste
          .from('lotes_importacao_blocos')
          .select('texto_bloco')
          .eq('lote_importacao_id', loteId)
          .eq('numero_bloco', numeroBlocoTeste)
          .single()
        console.log(`[teste_bloco_real] bloco carregado, tamanho_texto=${blocoTeste?.texto_bloco?.length ?? 'ERRO'}`)
        if (erroBlocoTeste || !blocoTeste) {
          return new Response(
            JSON.stringify({ ok: false, etapa: 'buscar_bloco', error: erroBlocoTeste?.message ?? 'Bloco não encontrado', duracao_ms: Date.now() - inicio }),
            { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }

        console.log('[teste_bloco_real] chamando processarBlocoPorDominio')
        const divergencias = await processarBlocoPorDominio(loteTeste.dominio, blocoTeste.texto_bloco, loteTeste, dbTeste)
        console.log(`[teste_bloco_real] processarBlocoPorDominio retornou ${divergencias.length} registros`)
        return new Response(
          JSON.stringify({ ok: true, tamanho_texto_bloco: blocoTeste.texto_bloco.length, registros_extraidos: divergencias.length, duracao_ms: Date.now() - inicio }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      } catch (e) {
        console.error(`[teste_bloco_real] EXCEÇÃO: ${(e as Error)?.message ?? String(e)}`)
        return new Response(
          JSON.stringify({
            ok: false,
            etapa: 'excecao_nao_tratada',
            error: (e as Error)?.message ?? String(e),
            stack: (e as Error)?.stack ?? null,
            duracao_ms: Date.now() - inicio,
          }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
    }

    if (!loteId) {
      return new Response(JSON.stringify({ ok: false, error: 'loteId é obrigatório' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
    const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const institucionalDb = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { db: { schema: 'institucional' } })

    const { data: lote, error: erroLote } = await institucionalDb.from('lotes_importacao_mercado').select('*').eq('id', loteId).single()
    if (erroLote) throw new Error(`Erro ao buscar lote: ${erroLote.message}`)

    if (lote.dominio === 'completo') {
      const motivo =
        'Processamento de arquivo completo (domínio "completo") ainda não implementado — depende da segmentação automática por IA, que é a Fase 2 do desenho, deliberadamente adiada até os domínios separados (Preços/Rede/Regras Gerais) estarem provados em volume real.'
      await institucionalDb.from('lotes_importacao_mercado').update({ status: 'nao_implementado', erro: motivo }).eq('id', loteId)
      return new Response(JSON.stringify({ ok: false, motivo }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // ============================================================
    // acao: 'validar' — validação cruzada, TOTALMENTE separada da
    // ingestão. Nunca roda na mesma chamada que extrai/grava (diretriz §8).
    // ============================================================
    if (acao === 'validar') {
      const { data: blocoParaValidar } = await institucionalDb
        .from('lotes_importacao_blocos')
        .select('*')
        .eq('lote_importacao_id', loteId)
        .eq('status', 'concluido')
        .is('validacao_cruzada', null)
        .order('numero_bloco')
        .limit(1)
        .maybeSingle()

      if (!blocoParaValidar) {
        return new Response(JSON.stringify({ ok: true, motivo: 'Nenhum bloco concluído pendente de validação cruzada.' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      try {
        const resultado = await validarBlocoComSegundaIA(blocoParaValidar.texto_bloco, blocoParaValidar.resultado_resumo ?? {})
        await institucionalDb.from('lotes_importacao_blocos').update({ validacao_cruzada: resultado }).eq('id', blocoParaValidar.id)
        return new Response(JSON.stringify({ ok: true, bloco_validado: blocoParaValidar.numero_bloco, resultado }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      } catch (e) {
        // Falha na validação nunca afeta o dado já gravado — só registra
        // que essa tentativa de validar não deu certo.
        await institucionalDb.from('lotes_importacao_blocos').update({ validacao_cruzada: { erro: (e as Error).message } }).eq('id', blocoParaValidar.id)
        return new Response(JSON.stringify({ ok: false, bloco_validado: blocoParaValidar.numero_bloco, error: (e as Error).message }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
    }

    // ============================================================
    // Fase de setup — só roda se ainda não existe nenhum bloco pra esse
    // lote. Extrai, divide, persiste todos como 'pendente', e ENCERRA —
    // não processa nenhum bloco ainda nesta mesma chamada (diretriz §2).
    // ============================================================
    const { data: blocosExistentes } = await institucionalDb.from('lotes_importacao_blocos').select('id').eq('lote_importacao_id', loteId).limit(1)

    if (!blocosExistentes || blocosExistentes.length === 0) {
      if (lote.status === 'concluido') {
        return new Response(JSON.stringify({ ok: true, motivo: 'Lote já concluído anteriormente, sem blocos pendentes. Nada a fazer.' }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      const { data: arquivoBlob, error: erroDownload } = await institucionalDb.storage.from(BUCKET).download(lote.storage_path)
      if (erroDownload) throw new Error(`Erro ao baixar arquivo: ${erroDownload.message}`)

      const buffer = new Uint8Array(await arquivoBlob.arrayBuffer())
      const extensao = extensaoDoArquivo(lote.storage_path)
      const texto = await extrairTexto(buffer, extensao)

      const textosBlocos = dividirEmBlocos(texto, TAMANHO_MAXIMO_BLOCO)
      const novosBlocos = textosBlocos.map((textoBloco: string, i: number) => ({
        lote_importacao_id: loteId,
        numero_bloco: i + 1,
        pagina_inicio: null, // lacuna conhecida: pdf-parse não preserva página real
        pagina_fim: null,
        texto_bloco: textoBloco,
        // Contexto entre blocos (diretriz §1 e §5): o final do bloco
        // anterior vai junto, só como referência — cobre cabeçalho de
        // tabela ou estrutura comercial cortada no meio de um corte
        // técnico. Nunca extraído como dado novo, só ajuda a IA a
        // entender o que está vendo.
        contexto_anterior: i > 0 ? textosBlocos[i - 1].slice(-TAMANHO_CONTEXTO_ANTERIOR) : null,
        status: 'pendente',
      }))

      const { error: erroInsercaoBlocos } = await institucionalDb.from('lotes_importacao_blocos').insert(novosBlocos)
      if (erroInsercaoBlocos) throw new Error(`Erro ao persistir blocos: ${erroInsercaoBlocos.message}`)

      const linhas = texto.split('\n').map((l: string) => l.trim()).filter((l: string) => l.length > 0)
      const assinatura = await calcularAssinaturaEstrutural(linhas)
      await institucionalDb
        .from('lotes_importacao_mercado')
        .update({ receita_extracao: { assinatura_estrutural: assinatura.hash }, status: 'processando_parcial' })
        .eq('id', loteId)

      // ENCERRA aqui, sem processar nenhum bloco ainda — a próxima chamada
      // já pega o bloco 1 normalmente.
      return new Response(JSON.stringify({ ok: true, fase: 'blocos_criados', total_blocos: novosBlocos.length }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // ============================================================
    // Fase de processamento — exatamente 1 bloco por chamada.
    // ============================================================
    await recuperarBlocosTravados(institucionalDb, loteId)

    const { data: bloco } = await institucionalDb
      .from('lotes_importacao_blocos')
      .select('*')
      .eq('lote_importacao_id', loteId)
      .in('status', ['pendente', 'erro'])
      .order('numero_bloco')
      .limit(1)
      .maybeSingle()

    if (!bloco) {
      const resumo = await recalcularResumoLote(institucionalDb, loteId)
      return new Response(JSON.stringify({ ok: true, motivo: 'Nenhum bloco pendente.', ...resumo }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const executionId = crypto.randomUUID()
    const inicioProcessamento = Date.now()
    await institucionalDb
      .from('lotes_importacao_blocos')
      .update({ status: 'processando', processando_desde: new Date().toISOString(), execution_id: executionId, etapa: 'START' })
      .eq('id', bloco.id)

    // Contexto entre blocos (diretriz §1/§5): junta o final do bloco
    // anterior como referência, claramente delimitado, antes de mandar
    // pra IA — nunca é extraído como dado novo, só ajuda a interpretar
    // cabeçalho/estrutura que um corte técnico possa ter cortado no meio.
    const textoParaProcessar = bloco.contexto_anterior
      ? `[CONTEXTO DO TRECHO ANTERIOR — só para referência, NÃO extraia dados repetidos daqui, use apenas pra entender cabeçalhos, colunas ou estrutura que podem continuar do trecho anterior]\n${bloco.contexto_anterior}\n\n[TRECHO ATUAL — extraia os dados daqui]\n${bloco.texto_bloco}`
      : bloco.texto_bloco

    try {
      await atualizarEtapa(institucionalDb, bloco.id, 'IA_REQUEST')

      const nomeProviderAtivo = Deno.env.get('IA_PROVIDER') || 'anthropic'
      let providerUsado = nomeProviderAtivo
      let divergencias: Divergencia[]
      try {
        divergencias = await processarBlocoPorDominio(lote.dominio, textoParaProcessar, lote, institucionalDb)
      } catch (erroPrimario) {
        // Failover — só neste bloco, nunca reinicia o lote (diretriz §7).
        await atualizarEtapa(institucionalDb, bloco.id, 'FAILOVER')
        providerUsado = obterNomeProviderFailover(nomeProviderAtivo)
        console.error(`[bloco ${bloco.numero_bloco}] Provedor ${nomeProviderAtivo} falhou (${(erroPrimario as Error).message}) — tentando ${providerUsado}.`)
        divergencias = await processarBlocoPorDominio(lote.dominio, textoParaProcessar, lote, institucionalDb, providerUsado)
      }

      await atualizarEtapa(institucionalDb, bloco.id, 'IA_RESPONSE')
      await atualizarEtapa(institucionalDb, bloco.id, 'JSON_VALIDADO') // validação de schema já ocorre dentro de interpretarXComIA
      await atualizarEtapa(institucionalDb, bloco.id, 'NORMALIZACAO') // carimbo de região etc. já ocorre dentro de processarBlocoPorDominio

      await atualizarEtapa(institucionalDb, bloco.id, 'DB_WRITE')
      // blocoId aqui garante idempotência (diretriz §4) — ver aplicarDivergenciasDireto.
      const resultadoAplicacao = await aplicarDivergenciasDireto(divergencias, institucionalDb, bloco.id)
      await atualizarEtapa(institucionalDb, bloco.id, 'DB_SUCCESS')

      const resumoBloco = {
        registros_gerados: divergencias.length,
        aplicados_sucesso: resultadoAplicacao.sucesso,
        aplicados_erro: resultadoAplicacao.erro,
        erros_aplicacao: resultadoAplicacao.erros,
      }

      await institucionalDb
        .from('lotes_importacao_blocos')
        .update({
          status: 'concluido',
          tentativas: ((bloco.tentativas as number) ?? 0) + 1,
          ia_utilizada: providerUsado,
          resultado_resumo: resumoBloco,
          processado_em: new Date().toISOString(),
          duracao_ms: Date.now() - inicioProcessamento,
          etapa: 'CONCLUIDO',
        })
        .eq('id', bloco.id)
    } catch (e) {
      await institucionalDb
        .from('lotes_importacao_blocos')
        .update({
          status: 'erro',
          tentativas: ((bloco.tentativas as number) ?? 0) + 1,
          erro: (e as Error).message,
          processado_em: new Date().toISOString(),
          duracao_ms: Date.now() - inicioProcessamento,
        })
        .eq('id', bloco.id)
    }

    const resumo = await recalcularResumoLote(institucionalDb, loteId)
    return new Response(JSON.stringify({ ok: true, bloco_processado: bloco.numero_bloco, ...resumo }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: (e as Error).message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
})