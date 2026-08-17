/**
 * CONNECT CENTER (Edge Function) — Contrato universal de provider de IA.
 * Mesmo espírito do Motor de Estudo de Mercado: qualquer IA, não só
 * Anthropic. Quatro formatos de saída, um por tipo de extração.
 */

export function validarSaidaPlanos(resultado, nomeProvider) {
  if (!resultado || !Array.isArray(resultado.planos)) {
    throw new Error(`Provider "${nomeProvider}" não devolveu "planos" como array.`)
  }
  resultado.planos.forEach((p, i) => {
    if (!p.nome_plano) throw new Error(`Provider "${nomeProvider}": plano ${i} sem "nome_plano".`)
  })
  return true
}

export function validarSaidaPrecos(resultado, nomeProvider) {
  if (!resultado || !Array.isArray(resultado.regras)) {
    throw new Error(`Provider "${nomeProvider}" não devolveu "regras" como array (preços).`)
  }
  // Nunca exige dimensão mínima aqui — a IA deve devolver o que encontrou,
  // mesmo que insuficiente. Quem decide "vigente" x "regra_insuficiente"
  // é validarRegraPrecificacao no service, nunca o provider de IA.
  return true
}

export function validarSaidaRegraMercado(resultado, nomeProvider) {
  if (!resultado || !Array.isArray(resultado.regras)) {
    throw new Error(`Provider "${nomeProvider}" não devolveu "regras" como array (regra de mercado).`)
  }
  resultado.regras.forEach((r, i) => {
    if (!r.chave || !r.conteudo) throw new Error(`Provider "${nomeProvider}": regra ${i} sem "chave" ou "conteudo".`)
  })
  return true
}

export function validarSaidaRede(resultado, nomeProvider) {
  if (!resultado || !Array.isArray(resultado.linhas)) {
    throw new Error(`Provider "${nomeProvider}" não devolveu "linhas" como array (rede).`)
  }
  return true
}
