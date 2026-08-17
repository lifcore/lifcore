/**
 * MOTOR DE ESTUDO DE MERCADO (Edge Function) — Contrato universal de
 * provider de IA.
 *
 * Reforço explícito do Raphael: a codificação deve aceitar qualquer API
 * de IA, não só a Anthropic que usamos hoje. Este contrato é o que
 * qualquer provider precisa cumprir para entrar no registro
 * (ia-providers/index.ts) — troca de IA é configuração (`IA_PROVIDER`),
 * nunca código espalhado pelo motor.
 *
 * Dois contratos separados porque as duas Passadas têm formatos de saída
 * diferentes (Propostas é uma lista pequena e estruturada; Rede
 * Credenciada é um chunk de prestador × coluna × código bruto).
 */

export function validarSaidaPropostas(resultado: { propostas?: unknown }, nomeProvider: string) {
  if (!resultado || typeof resultado !== 'object') {
    throw new Error(`Provider "${nomeProvider}" devolveu algo que não é um objeto (Passada 1 — Propostas).`)
  }
  if (!Array.isArray(resultado.propostas)) {
    throw new Error(`Provider "${nomeProvider}" não devolveu "propostas" como array.`)
  }
  resultado.propostas.forEach((p: Record<string, unknown>, i: number) => {
    if (typeof p.coluna_chave !== 'string' || !p.coluna_chave.trim()) {
      throw new Error(`Provider "${nomeProvider}": proposta ${i} sem "coluna_chave" — toda proposta precisa de uma identidade de coluna (operadora+plano+variante).`)
    }
  })
  return true
}

export function validarSaidaRedeChunk(resultado: { linhas?: unknown }, nomeProvider: string) {
  if (!resultado || typeof resultado !== 'object') {
    throw new Error(`Provider "${nomeProvider}" devolveu algo que não é um objeto (Passada 2 — Rede Credenciada).`)
  }
  if (!Array.isArray(resultado.linhas)) {
    throw new Error(`Provider "${nomeProvider}" não devolveu "linhas" como array (chunk de rede).`)
  }
  resultado.linhas.forEach((l: Record<string, unknown>, i: number) => {
    if (typeof l.prestador !== 'string' || !l.prestador.trim()) {
      throw new Error(`Provider "${nomeProvider}": linha ${i} do chunk de rede sem "prestador".`)
    }
  })
  return true
}
