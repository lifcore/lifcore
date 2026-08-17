import { institucional, operacional } from '../supabaseSchemas'
import { montarRegistroComparavel, avaliarProntidao } from './smartQuoteLogica'

export { selecionarRegraPrecificacaoAplicavel, montarRegistroComparavel, avaliarProntidao } from './smartQuoteLogica'

/**
 * SPEC-002 §10 — Smart Quote, orquestração real (I/O). Monta o "banco
 * comparável" (§11) para todas as propostas confirmadas de uma
 * Cotação, contra o contexto real do cliente (região, segmento, total
 * de vidas). A lógica de seleção/normalização em si é pura, testada
 * isoladamente em `smartQuoteLogica.js` — este arquivo só busca dado.
 */
export async function montarBancoComparavel(cotacaoId, contexto) {
  const { data: propostas, error: erroPropostas } = await operacional
    .from('propostas_estudo')
    .select('*, propostas_estudo_faixas(*)')
    .eq('cotacao_id', cotacaoId)
    .eq('status_revisao', 'confirmada')
  if (erroPropostas) throw new Error(`Erro ao buscar propostas confirmadas: ${erroPropostas.message}`)

  const registros = []

  for (const proposta of propostas ?? []) {
    if (!proposta.plano_variante_id) {
      registros.push(montarRegistroComparavel({ proposta, planoVariante: null, regrasPrecificacao: [], regrasMercado: [], resumoRede: null, contexto }))
      continue
    }

    const [{ data: planoVariante }, { data: regrasPrecificacao }, { data: regrasMercado }, resumoRede] = await Promise.all([
      institucional.from('planos_variantes').select('*').eq('id', proposta.plano_variante_id).single(),
      institucional.from('regras_precificacao').select('*').eq('plano_variante_id', proposta.plano_variante_id),
      institucional.from('regras_mercado').select('*').eq('plano_variante_id', proposta.plano_variante_id).eq('status', 'vigente'),
      montarResumoRede(proposta.plano_variante_id),
    ])

    registros.push(
      montarRegistroComparavel({
        proposta,
        planoVariante,
        regrasPrecificacao: regrasPrecificacao ?? [],
        regrasMercado: regrasMercado ?? [],
        resumoRede,
        contexto,
      })
    )
  }

  return { registros, prontidao: avaliarProntidao(registros) }
}

async function montarResumoRede(planoVarianteId) {
  const { data, error } = await institucional
    .from('rede_credenciada')
    .select('*, prestadores_unidade(regiao)')
    .eq('plano_variante_id', planoVarianteId)
  if (error) throw new Error(`Erro ao buscar rede credenciada: ${error.message}`)

  const porRegiao = {}
  for (const linha of data ?? []) {
    const regiao = linha.prestadores_unidade?.regiao ?? 'sem região informada'
    porRegiao[regiao] = (porRegiao[regiao] ?? 0) + 1
  }

  return { totalPrestadores: (data ?? []).length, porRegiao }
}

/**
 * Contexto derivado da composição de vidas da própria Cotação —
 * região e segmento precisam ser informados à parte (não têm fonte
 * automática confiável ainda; nunca inferidos por suposição).
 */
export function derivarContextoDeComposicao(itensCotacao, { regiao = null, segmento = null } = {}) {
  const totalVidas = (itensCotacao ?? []).reduce((s, i) => s + (i.quantidade_vidas ?? 0), 0)
  return { regiao, segmento, totalVidas: totalVidas || null }
}
