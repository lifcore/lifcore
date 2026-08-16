/**
 * MOTOR UNIVERSAL (Edge Function) — Validações determinísticas
 * Porte de scripts/motor-universal/validacao.cjs — lógica idêntica.
 */

export interface EventoNormalizado {
  valor_bruto: number
  classificacao: string
  data_evento?: string | null
  numero_apolice_informado?: string | null
  numero_recibo_informado?: string | null
  numero_parcela_informado?: string | null
  [key: string]: unknown
}

export function validarQuantidade(eventos: EventoNormalizado[]) {
  if (!eventos || eventos.length === 0) {
    return { ok: false, motivo: 'Nenhum evento extraído do documento.' }
  }
  return { ok: true }
}

export function validarTotal(eventos: EventoNormalizado[], totalInformadoDocumento: number | null) {
  if (totalInformadoDocumento == null) return { ok: true, aplicavel: false }
  const soma = eventos.reduce((s, e) => s + e.valor_bruto, 0)
  const diferenca = Math.round((soma - totalInformadoDocumento) * 100) / 100
  if (Math.abs(diferenca) > 0.01) {
    return {
      ok: false,
      aplicavel: true,
      motivo: `Soma dos eventos (${soma.toFixed(2)}) não bate com o total do documento (${totalInformadoDocumento.toFixed(2)}). Diferença: ${diferenca.toFixed(2)}.`,
    }
  }
  return { ok: true, aplicavel: true }
}

export function validarSinais(eventos: EventoNormalizado[]) {
  for (const e of eventos) {
    const esperado = e.valor_bruto > 0 ? 'recebimento' : e.valor_bruto < 0 ? 'ajuste_estorno' : 'zero_sem_recebimento'
    if (e.classificacao !== esperado) {
      return { ok: false, motivo: `Evento com valor ${e.valor_bruto} classificado como "${e.classificacao}", esperado "${esperado}".` }
    }
  }
  return { ok: true }
}

export function validarIntegridade(eventos: EventoNormalizado[]) {
  const problemas: string[] = []
  eventos.forEach((e, i) => {
    if (e.valor_bruto == null || Number.isNaN(e.valor_bruto)) {
      problemas.push(`Evento ${i}: valor_bruto ausente ou inválido.`)
    }
    if (e.data_evento && Number.isNaN(Date.parse(e.data_evento))) {
      problemas.push(`Evento ${i}: data_evento impossível ("${e.data_evento}").`)
    }
  })

  const chaves: Record<string, number> = {}
  eventos.forEach((e) => {
    const chave = `${e.numero_apolice_informado}|${e.numero_recibo_informado}|${e.numero_parcela_informado}|${e.valor_bruto}`
    chaves[chave] = (chaves[chave] || 0) + 1
  })
  Object.entries(chaves).forEach(([chave, contagem]) => {
    if (contagem > 4) problemas.push(`Repetição suspeita (${contagem}x) da combinação apólice/recibo/parcela/valor: ${chave}`)
  })

  return { ok: problemas.length === 0, motivo: problemas.join(' ') || undefined }
}

export function validarTudo(eventos: EventoNormalizado[], totalInformadoDocumento: number | null) {
  const resultados = {
    quantidade: validarQuantidade(eventos),
    total: validarTotal(eventos, totalInformadoDocumento),
    sinais: validarSinais(eventos),
    integridade: validarIntegridade(eventos),
  }
  const falhas = Object.entries(resultados)
    .filter(([, r]) => !r.ok)
    .map(([nome, r]) => `${nome}: ${(r as { motivo?: string }).motivo}`)
  return { aprovado: falhas.length === 0, falhas, detalhes: resultados }
}
