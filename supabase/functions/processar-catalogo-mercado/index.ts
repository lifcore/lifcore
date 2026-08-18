/**
 * EDGE FUNCTION: processar-catalogo-mercado
 * SPEC-002 — Connect Center. Arquitetura v2 (18/08/2026), reescrita
 * completa desta camada a partir da diretriz do Chief + ajustes
 * discutidos com o Raphael no mesmo dia. Mudanças em relação à versão
 * anterior:
 *
 * 1. Divisão em blocos SOBE pra cá (antes só existia dentro de
 *    processarDominioPrecos) — agora vale pra todos os domínios, e cada
 *    bloco é PERSISTIDO (tabela lotes_importacao_blocos) antes de
 *    qualquer chamada de IA. Falha num bloco nunca mais derruba os
 *    blocos anteriores já concluídos; reprocessar retoma do bloco que
 *    falhou, não do arquivo inteiro.
 * 2. Fim da fila de aprovação bloqueante. Resultado vai direto pra
 *    tabela de domínio (via aplicarDivergenciasDireto), com sinal de
 *    confiança no próprio registro (status: vigente/regra_insuficiente
 *    ou vinculo_confirmado/sem_vinculo, dependendo da tabela) — nunca
 *    mais escondido numa fila que ninguém teria como revisar linha a
 *    linha em volume real.
 * 3. Domínio novo 'regras_gerais': 1 upload dispara as 5 extrações
 *    (Planos, Carências, Coparticipação, Reembolso, Regras Comerciais)
 *    automaticamente, por bloco.
 * 4. Domínio novo 'completo': registrado, mas ainda NÃO implementado —
 *    depende da segmentação automática por IA (Fase 2, deliberadamente
 *    adiada). Responde com mensagem clara em vez de tentar processar
 *    pela metade.
 * 5. Relatório simples de execução (resumo_execucao) gravado no lote ao
 *    final — total de blocos, sucesso, erro, com número do bloco e
 *    mensagem de cada erro.
 * 6. Validação cruzada por uma segunda IA, best-effort, depois que todos
 *    os blocos terminam — não bloqueia a resposta principal.
 *
 * LACUNA CONHECIDA, não resolvida aqui: página real de PDF vs. bloco de
 * caracteres. pdf-parse (biblioteca já em uso) extrai texto concatenado,
 * sem preservar limite de página por padrão — pagina_inicio/pagina_fim
 * ficam null pra fontes PDF até isso ser resolvido à parte (precisa
 * confirmar a API de extração por página da própria biblioteca antes de
 * prometer número de página real no relatório).
 *
 * IMPORTANTE (mesma transparência de sempre): escrita e revisada com
 * cuidado, sem runtime Deno disponível neste processo para teste ao
 * vivo. Teste real só após deploy.
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
import { validarBlocoComSegundaIA } from './motor-mercado/validacao-cruzada.ts'

const pdfParse = pdfParseModule as (buffer: Uint8Array) => Promise<{ text: string }>

const BUCKET = 'anexos'
const TAMANHO_MAXIMO_BLOCO = 6000 // caracteres — mesmo valor já validado hoje para Preços

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

// Centraliza o roteamento por domínio — cada chamada processa 1 bloco só.
// 'regras_gerais' é o único caso que dispara mais de uma extração por bloco.
async function processarBlocoPorDominio(dominio: string, texto: string, lote: Record<string, unknown>, db: Db): Promise<Divergencia[]> {
  const operadoraId = lote.operadora_id as string
  const regiaoTarifariaId = (lote.regiao_tarifaria_id as string) ?? null

  if (dominio === 'planos') {
    const { operadoraNome, produtoPadraoId } = await obterContextoPlanos(operadoraId, db)
    return processarDominioPlanos(texto, operadoraId, operadoraNome, produtoPadraoId, db)
  }

  if (dominio === 'precos') {
    const divergencias = await processarDominioPrecos(texto, operadoraId, db, regiaoTarifariaId)
    return carimbarRegiao(divergencias, regiaoTarifariaId)
  }

  if (['carencia', 'coparticipacao', 'reembolso', 'regra_comercial'].includes(dominio)) {
    return processarDominioRegraMercado(texto, dominio, operadoraId, db)
  }

  if (dominio === 'rede') {
    return processarDominioRede(texto, operadoraId, db, regiaoTarifariaId)
  }

  if (dominio === 'regras_gerais') {
    const { operadoraNome, produtoPadraoId } = await obterContextoPlanos(operadoraId, db)
    let todas: Divergencia[] = await processarDominioPlanos(texto, operadoraId, operadoraNome, produtoPadraoId, db)
    // Sequencial de propósito, não Promise.all — mesma lição de hoje: preferir
    // confiabilidade a velocidade quando são várias chamadas de IA em sequência.
    for (const sub of ['carencia', 'coparticipacao', 'reembolso', 'regra_comercial']) {
      const parcial = await processarDominioRegraMercado(texto, sub, operadoraId, db)
      todas = todas.concat(parcial)
    }
    return todas
  }

  throw new Error(`Domínio desconhecido: ${dominio}`)
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const { loteId } = await req.json()
    if (!loteId) {
      return new Response(JSON.stringify({ ok: false, error: 'loteId é obrigatório' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
    const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const institucionalDb = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { db: { schema: 'institucional' } })

    const { data: lote, error: erroLote } = await institucionalDb.from('lotes_importacao_mercado').select('*').eq('id', loteId).single()
    if (erroLote) throw new Error(`Erro ao buscar lote: ${erroLote.message}`)

    // 'completo' (PDF único, auto-segmentado) é Fase 2 — registrado, não implementado.
    if (lote.dominio === 'completo') {
      return new Response(
        JSON.stringify({
          ok: false,
          motivo: 'Processamento de arquivo completo (domínio "completo") ainda não implementado — depende da segmentação automática por IA, que é a Fase 2 do desenho, deliberadamente adiada até os domínios separados (Preços/Rede/Regras Gerais) estarem provados em volume real.',
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Blocos já existentes = retomada. Vazio = primeira execução deste lote.
    const { data: blocosExistentes } = await institucionalDb
      .from('lotes_importacao_blocos')
      .select('*')
      .eq('lote_importacao_id', loteId)
      .order('numero_bloco')

    let blocos: Array<Record<string, unknown>> = blocosExistentes ?? []

    if (blocos.length === 0) {
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
        pagina_inicio: null, // ver nota de lacuna conhecida no cabeçalho do arquivo
        pagina_fim: null,
        texto_bloco: textoBloco,
        status: 'pendente',
      }))

      const { data: blocosInseridos, error: erroInsercaoBlocos } = await institucionalDb
        .from('lotes_importacao_blocos')
        .insert(novosBlocos)
        .select('*')
      if (erroInsercaoBlocos) throw new Error(`Erro ao persistir blocos: ${erroInsercaoBlocos.message}`)

      blocos = blocosInseridos ?? []

      // Assinatura estrutural calculada sobre o texto completo, como sempre foi.
      const linhas = texto.split('\n').map((l: string) => l.trim()).filter((l: string) => l.length > 0)
      const assinatura = await calcularAssinaturaEstrutural(linhas)
      await institucionalDb.from('lotes_importacao_mercado').update({ receita_extracao: { assinatura_estrutural: assinatura.hash } }).eq('id', loteId)
    }

    // Processa só os blocos que ainda não terminaram com sucesso.
    for (const bloco of blocos) {
      if (bloco.status === 'concluido') continue

      await institucionalDb.from('lotes_importacao_blocos').update({ status: 'processando' }).eq('id', bloco.id)

      try {
        const divergencias = await processarBlocoPorDominio(lote.dominio, bloco.texto_bloco as string, lote, institucionalDb)
        const resultadoAplicacao = await aplicarDivergenciasDireto(divergencias, institucionalDb)

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
            ia_utilizada: Deno.env.get('IA_PROVIDER') || 'anthropic',
            resultado_resumo: resumoBloco,
            processado_em: new Date().toISOString(),
          })
          .eq('id', bloco.id)

        // Validação cruzada por bloco — best-effort, nunca derruba o bloco
        // que já concluiu com sucesso, mesmo se essa parte falhar.
        try {
          const resultadoValidacao = await validarBlocoComSegundaIA(bloco.texto_bloco as string, resumoBloco)
          await institucionalDb.from('lotes_importacao_blocos').update({ validacao_cruzada: resultadoValidacao }).eq('id', bloco.id)
        } catch (erroValidacao) {
          console.error(`[bloco ${bloco.numero_bloco}] Validação cruzada não concluída (não bloqueia): ${(erroValidacao as Error).message}`)
        }
      } catch (e) {
        // Falha localizada neste bloco — NÃO derruba os blocos anteriores já
        // concluídos, e o loop continua pros próximos blocos normalmente.
        await institucionalDb
          .from('lotes_importacao_blocos')
          .update({
            status: 'erro',
            tentativas: ((bloco.tentativas as number) ?? 0) + 1,
            erro: (e as Error).message,
            processado_em: new Date().toISOString(),
          })
          .eq('id', bloco.id)
      }
    }

    // Relê o estado final dos blocos pra montar o relatório simples.
    const { data: blocosFinal } = await institucionalDb
      .from('lotes_importacao_blocos')
      .select('*')
      .eq('lote_importacao_id', loteId)
      .order('numero_bloco')

    const listaBlocos = blocosFinal ?? []
    const blocosSucesso = listaBlocos.filter((b: Record<string, unknown>) => b.status === 'concluido').length
    const blocosErro = listaBlocos.filter((b: Record<string, unknown>) => b.status === 'erro').length

    const resumoExecucao = {
      total_blocos: listaBlocos.length,
      blocos_sucesso: blocosSucesso,
      blocos_erro: blocosErro,
      erros: listaBlocos
        .filter((b: Record<string, unknown>) => b.status === 'erro')
        .map((b: Record<string, unknown>) => ({
          numero_bloco: b.numero_bloco,
          pagina_inicio: b.pagina_inicio,
          pagina_fim: b.pagina_fim,
          mensagem: b.erro,
        })),
    }

    const statusFinal = blocosErro === 0 ? 'concluido' : 'concluido_com_erros'

    await institucionalDb
      .from('lotes_importacao_mercado')
      .update({ status: statusFinal, resumo_execucao: resumoExecucao, processado_em: new Date().toISOString() })
      .eq('id', loteId)

    return new Response(JSON.stringify({ ok: true, ...resumoExecucao }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: (e as Error).message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
})
