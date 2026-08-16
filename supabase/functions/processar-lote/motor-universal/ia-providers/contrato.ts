/**
 * MOTOR UNIVERSAL (Edge Function) — Contrato único de provider de IA
 * Porte de scripts/motor-universal/ia-providers/contrato.cjs.
 */

const CAMPOS_EVENTO_OBRIGATORIOS = ['valor_bruto']

export function validarSaidaProvider(resultado: { eventos?: unknown }, nomeProvider: string) {
  if (!resultado || typeof resultado !== 'object') {
    throw new Error(`Provider "${nomeProvider}" devolveu algo que não é um objeto.`)
  }
  if (!Array.isArray(resultado.eventos)) {
    throw new Error(`Provider "${nomeProvider}" não devolveu "eventos" como array.`)
  }
  resultado.eventos.forEach((e: Record<string, unknown>, i: number) => {
    CAMPOS_EVENTO_OBRIGATORIOS.forEach((campo) => {
      if (e[campo] === undefined) {
        throw new Error(`Provider "${nomeProvider}": evento ${i} sem o campo obrigatório "${campo}".`)
      }
    })
    if (typeof e.valor_bruto !== 'number' || Number.isNaN(e.valor_bruto)) {
      throw new Error(`Provider "${nomeProvider}": evento ${i} com valor_bruto inválido (${e.valor_bruto}).`)
    }
  })
  return true
}
