/**
 * Utilitário central de formatação de datas para exibição (pt-BR).
 *
 * PROBLEMA QUE ISSO RESOLVE:
 * Campos de data "pura" no banco (ex: proxima_acao_data, data_vigencia,
 * vigencia_fim, data_cotacao, data_proxima_acao) são salvos como string
 * "YYYY-MM-DD", sem horário. Quando o JavaScript recebe essa string em
 * `new Date("2026-07-29")`, ele interpreta como meia-noite em UTC. Ao
 * formatar isso para o fuso do Brasil (UTC-3) com `.toLocaleDateString`,
 * o horário "volta" para a noite do dia anterior — exibindo 28/07 em
 * vez de 29/07. É um bug de deslocamento de 1 dia, silencioso e fácil
 * de espalhar pelo código sem perceber.
 *
 * REGRA DE USO:
 * - Para campos de DATA PURA (sem hora, tipo "YYYY-MM-DD"): use
 *   `formatarDataBR`.
 * - Para campos de TIMESTAMP completo (ex: criado_em, atualizado_em,
 *   que já vêm com hora/fuso do Postgres): pode seguir usando
 *   `new Date(valor).toLocaleDateString('pt-BR')` normalmente, pois
 *   esses já carregam informação de fuso e não sofrem esse problema.
 */

/** Formata uma data pura ("YYYY-MM-DD") ou timestamp para "DD/MM/AAAA", sem deslocamento de fuso. */
export function formatarDataBR(valor) {
  if (!valor) return null

  const apenasData = /^\d{4}-\d{2}-\d{2}$/.test(valor)

  if (apenasData) {
    const [ano, mes, dia] = valor.split('-').map(Number)
    return `${String(dia).padStart(2, '0')}/${String(mes).padStart(2, '0')}/${ano}`
  }

  // Timestamp completo (tem hora) — o Date nativo já lida bem com fuso aqui.
  return new Date(valor).toLocaleDateString('pt-BR')
}

/** Retorna a data de hoje (ou +diasAFrente) no formato "YYYY-MM-DD", usando o horário LOCAL do navegador — nunca UTC. */
export function dataLocalISO(diasAFrente = 0) {
  const data = new Date()
  data.setDate(data.getDate() + diasAFrente)
  const ano = data.getFullYear()
  const mes = String(data.getMonth() + 1).padStart(2, '0')
  const dia = String(data.getDate()).padStart(2, '0')
  return `${ano}-${mes}-${dia}`
}
