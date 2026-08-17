/**
 * SPEC-001 §10 — Modelo financeiro. Funções puras (sem I/O), fáceis de
 * testar isoladamente. Nunca aproxima: se uma faixa da composição do
 * cliente não existir na proposta extraída, isso é reportado como
 * "faixa faltante", nunca preenchido por suposição.
 *
 * IMPORTANTE: os valores de `propostas_estudo_faixas.valor` são preço
 * POR VIDA (é o que o Multicálculo mostra por faixa). O "total" que o
 * próprio documento traz é uma referência genérica (1 vida por faixa),
 * não a composição real do cliente — por isso a mensalidade real da
 * proposta é sempre calculada aqui, contra a composição de vidas da
 * Cotação (`itens_cotacao`), nunca lida direto de `valor_total_mensal`.
 */

/**
 * Normaliza um rótulo de faixa etária pra uma chave comparável,
 * tolerando os formatos vistos no documento ("00 a 18", "59 ou mais")
 * e no cadastro da Cotação ("00-18", "59+"). Só para efeito de
 * casamento — nunca reescreve o rótulo original armazenado.
 */
export function normalizarFaixaEtaria(texto) {
  if (!texto) return null
  const t = texto.toLowerCase().trim()
  if (/ou mais|\+/.test(t)) {
    const numero = t.match(/\d+/)?.[0]
    return numero ? `${numero}+` : t
  }
  const numeros = t.match(/\d+/g)
  if (numeros && numeros.length === 2) return `${numeros[0]}-${numeros[1]}`
  return t
}

/** Agrega a composição de vidas por faixa a partir dos itens da Cotação (soma blocos de plano diferentes, se houver). */
export function calcularComposicaoDaCotacao(itensCotacao) {
  const porFaixa = {}
  for (const item of itensCotacao ?? []) {
    // itens_cotacao pode ter rótulo "00-18 (Nome do Plano)" quando há mais de um bloco — extrai só a faixa.
    const matchBloco = item.faixa_etaria.match(/^(.+?)\s*\(.+\)$/)
    const faixaBruta = matchBloco ? matchBloco[1] : item.faixa_etaria
    const chave = normalizarFaixaEtaria(faixaBruta)
    if (!chave) continue
    porFaixa[chave] = (porFaixa[chave] ?? 0) + (item.quantidade_vidas ?? 0)
  }
  return Object.entries(porFaixa).map(([faixaChave, vidas]) => ({ faixaChave, vidas }))
}

/**
 * Calcula a mensalidade real de uma proposta para a composição de
 * vidas informada. Faixas da composição sem correspondência na
 * proposta ficam listadas em `faixasFaltantes` — nunca aproximadas.
 */
export function calcularValorPropostaParaComposicao(proposta, composicao) {
  const valorPorFaixa = new Map(
    (proposta.faixas ?? []).map((f) => [normalizarFaixaEtaria(f.faixa_etaria), f.valor])
  )

  let valorMensal = 0
  const faixasFaltantes = []
  let totalVidas = 0

  for (const { faixaChave, vidas } of composicao) {
    totalVidas += vidas
    const valorUnitario = valorPorFaixa.get(faixaChave)
    if (valorUnitario == null) {
      faixasFaltantes.push(faixaChave)
      continue
    }
    valorMensal += valorUnitario * vidas
  }

  return {
    valorMensal: faixasFaltantes.length === composicao.length ? null : valorMensal,
    totalVidas,
    faixasFaltantes,
    cobertura: faixasFaltantes.length === 0 ? 'completa' : faixasFaltantes.length === composicao.length ? 'sem_dados' : 'parcial',
  }
}

/** Soma a mensalidade total do Cenário Atual (pode ter múltiplos planos — SPEC-001A §11). */
export function calcularTotalCenarioAtual(planosCenarioAtual) {
  let totalVidas = 0
  let totalMensal = 0
  let algumSemValor = false

  for (const plano of planosCenarioAtual ?? []) {
    totalVidas += plano.quantidade_vidas_informada ?? 0
    if (plano.mensalidade_informada == null) {
      algumSemValor = true
    } else {
      totalMensal += plano.mensalidade_informada
    }
  }

  return { totalMensal: algumSemValor && totalMensal === 0 ? null : totalMensal, totalVidas, algumSemValor }
}

/** Impacto mensal/anual/percentual — atual × proposta. SPEC-001 §10. */
export function calcularComparativo({ mensalAtual, mensalProposta }) {
  if (mensalAtual == null || mensalProposta == null) {
    return { impactoMensal: null, impactoAnual: null, impactoPercentual: null, tipo: null }
  }
  const impactoMensal = mensalProposta - mensalAtual
  const impactoAnual = impactoMensal * 12
  const impactoPercentual = mensalAtual !== 0 ? (impactoMensal / mensalAtual) * 100 : null
  const tipo = impactoMensal < 0 ? 'economia' : impactoMensal > 0 ? 'acrescimo' : 'igual'
  return { impactoMensal, impactoAnual, impactoPercentual, tipo }
}

/** Custo por vida — mensal ÷ total de vidas. Null se não houver vidas confiáveis. */
export function calcularCustoPorVida(mensal, totalVidas) {
  if (mensal == null || !totalVidas) return null
  return mensal / totalVidas
}
