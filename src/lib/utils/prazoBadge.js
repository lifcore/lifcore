/**
 * LCDS-003 — Pipeline Opportunity Card: badge de data com 3 níveis.
 * Função única, compartilhada pelos 5 Pipelines (Lifcare + 4 módulos),
 * pra garantir que a regra de "o que é crítico" seja sempre a mesma em
 * qualquer lugar do sistema que mostrar esse badge.
 *
 * - vencido: data já passou
 * - critico: hoje até +2 dias
 * - no_prazo: mais de 2 dias à frente
 */
export function calcularNivelPrazo(dataISO) {
  if (!dataISO) return 'no_prazo'

  const hoje = new Date()
  hoje.setHours(0, 0, 0, 0)

  const alvo = new Date(`${dataISO}T00:00:00`)
  const diffDias = Math.round((alvo - hoje) / 86400000)

  if (diffDias < 0) return 'vencido'
  if (diffDias <= 2) return 'critico'
  return 'no_prazo'
}