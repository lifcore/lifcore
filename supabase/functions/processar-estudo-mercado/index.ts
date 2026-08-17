/**
 * EDGE FUNCTION: processar-estudo-mercado
 * SPEC-001 — Motor de Estudo de Mercado, Peça 2 (Motor de Leitura do
 * Multicálculo). Disparada pelo front após o upload de um documento em
 * `operacional.lotes_importacao_estudo` (status inicial "recebido").
 *
 * Mesma estrutura de orquestração de supabase/functions/processar-lote —
 * dois clients de schema, download do Storage, pdf-parse, delega a
 * lógica de negócio para ./motor-estudo/index.ts.
 *
 * IMPORTANTE (mesma transparência do processar-lote): escrita e revisada
 * com cuidado, mas sem runtime Deno disponível neste processo para teste
 * ao vivo. Teste real só depois do deploy e uma primeira chamada real
 * com um Multicálculo de verdade.
 *
 * ESCOPO DESTA VERSÃO: só processa `tipo_documento = 'multicalculo'`.
 * Leitura de documento de Cenário Atual (SPEC-001 §7 — núcleo
 * compartilhado) fica para quando a Peça 3 (upload/revisão) estiver
 * desenhada — não implementado ainda, para não escrever caminho de
 * código sem tela que o exercite.
 */

import { createClient } from 'npm:@supabase/supabase-js@2'
// deno-lint-ignore no-explicit-any
import pdfParseModule from 'npm:pdf-parse@1.1.1'
import { processarMulticalculo } from './motor-estudo/index.ts'

const pdfParse = pdfParseModule as (buffer: Uint8Array) => Promise<{ text: string }>

const BUCKET = 'anexos'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { loteId } = await req.json()
    if (!loteId) {
      return new Response(JSON.stringify({ ok: false, error: 'loteId é obrigatório' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
    const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const operacionalDb = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { db: { schema: 'operacional' } })

    const { data: lote, error: erroLote } = await operacionalDb
      .from('lotes_importacao_estudo')
      .select('*')
      .eq('id', loteId)
      .single()
    if (erroLote) throw new Error(`Erro ao buscar lote: ${erroLote.message}`)

    if (lote.status !== 'recebido') {
      return new Response(
        JSON.stringify({ ok: false, motivo: `Lote com status "${lote.status}", esperado "recebido". Não reprocessado.` }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (lote.tipo_documento !== 'multicalculo') {
      return new Response(
        JSON.stringify({ ok: false, error: `tipo_documento "${lote.tipo_documento}" ainda não é processado por esta função — só "multicalculo" nesta versão.` }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const { data: arquivoBlob, error: erroDownload } = await operacionalDb.storage.from(BUCKET).download(lote.storage_path)
    if (erroDownload) throw new Error(`Erro ao baixar arquivo do Storage: ${erroDownload.message}`)

    const buffer = new Uint8Array(await arquivoBlob.arrayBuffer())
    const pdf = await pdfParse(buffer)
    const linhas = pdf.text
      .split('\n')
      .map((l: string) => l.trim())
      .filter((l: string) => l.length > 0)

    const resultado = await processarMulticalculo({ linhas, operacionalDb })

    // Grava as propostas + faixas, guardando o mapa coluna_chave -> id real para religar a Rede Credenciada em seguida.
    const colunaChaveParaId: Record<string, string> = {}
    for (const p of resultado.propostas) {
      const { data: propostaSalva, error: erroProposta } = await operacionalDb
        .from('propostas_estudo')
        .insert({
          lote_importacao_estudo_id: loteId,
          cotacao_id: lote.cotacao_id,
          coluna_chave: p.colunaChave,
          operadora_nome_extraido: p.operadoraNomeExtraido,
          plano: p.plano,
          produto: 'saude',
          modalidade: p.modalidade,
          acomodacao: p.acomodacao,
          coparticipacao: p.coparticipacao,
          valor_total_mensal: p.valorTotalMensal,
        })
        .select('id')
        .single()
      if (erroProposta) throw new Error(`Erro ao gravar proposta (${p.colunaChave}): ${erroProposta.message}`)

      colunaChaveParaId[p.colunaChave] = propostaSalva.id

      if (p.faixas.length) {
        const faixasParaInserir = p.faixas.map((f) => ({
          proposta_estudo_id: propostaSalva.id,
          faixa_etaria: f.faixaEtaria,
          valor: f.valor,
        }))
        const { error: erroFaixas } = await operacionalDb.from('propostas_estudo_faixas').insert(faixasParaInserir)
        if (erroFaixas) throw new Error(`Erro ao gravar faixas da proposta (${p.colunaChave}): ${erroFaixas.message}`)
      }
    }

    // Legenda descoberta no documento.
    if (resultado.legenda.length) {
      const legendaParaInserir = resultado.legenda.map((e) => ({
        lote_importacao_estudo_id: loteId,
        sigla: e.sigla,
        significado: e.significado,
        pagina_origem: e.paginaOrigem,
      }))
      const { error: erroLegenda } = await operacionalDb.from('legendas_documento_estudo').insert(legendaParaInserir)
      if (erroLegenda) throw new Error(`Erro ao gravar legenda: ${erroLegenda.message}`)
    }

    // Rede Credenciada — religa pela coluna_chave já conhecida.
    if (resultado.rede.length) {
      const redeParaInserir = resultado.rede.map((l) => ({
        lote_importacao_estudo_id: loteId,
        proposta_estudo_id: colunaChaveParaId[l.colunaChave] ?? null,
        coluna_chave: l.colunaChave,
        prestador: l.prestador,
        regiao: l.regiao,
        tipo: l.tipo,
        codigo_bruto: l.codigoBruto,
        pagina_origem: l.paginaOrigem,
      }))
      const { error: erroRede } = await operacionalDb.from('propostas_rede_credenciada').insert(redeParaInserir)
      if (erroRede) throw new Error(`Erro ao gravar rede credenciada: ${erroRede.message}`)
    }

    const statusPorConfianca: Record<string, string> = {
      alta: 'aguardando_confirmacao',
      revisao: 'revisao_necessaria',
      bloqueado: 'bloqueado',
    }

    const { error: erroUpdate } = await operacionalDb
      .from('lotes_importacao_estudo')
      .update({
        status: statusPorConfianca[resultado.confianca.nivel],
        nivel_confianca: resultado.confianca.nivel,
        motivo_confianca: resultado.confianca.motivo,
        origem_extracao: resultado.origemExtracao,
        assinatura_estrutural: resultado.assinatura.hash,
        quantidade_propostas_extraidas: resultado.propostas.length,
        quantidade_linhas_rede_extraidas: resultado.rede.length,
        receita_extracao: { ...resultado.receitaExtracao, redeResumo: resultado.redeResumo },
        processado_em: new Date().toISOString(),
      })
      .eq('id', loteId)
    if (erroUpdate) throw new Error(`Erro ao atualizar lote: ${erroUpdate.message}`)

    return new Response(
      JSON.stringify({
        ok: true,
        propostasExtraidas: resultado.propostas.length,
        linhasRedeExtraidas: resultado.rede.length,
        origemExtracao: resultado.origemExtracao,
        nivelConfianca: resultado.confianca.nivel,
        motivoConfianca: resultado.confianca.motivo,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
