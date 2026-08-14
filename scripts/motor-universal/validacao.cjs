/**
 * MOTOR UNIVERSAL — Validações determinísticas (DOC-COM-002, Passo 6 / Seção 10)
 *
 * Rodam DEPOIS de qualquer extração (código ou IA) — são a mesma régua
 * pros dois caminhos. Nunca decidem "parece certo" — só matemática e
 * integridade de dado, sem opinião.
 */

function validarQuantidade(eventos) {
  if (!eventos || eventos.length === 0) {
    return { ok: false, motivo: 'Nenhum evento extraído do documento.' }
  }
  return { ok: true }
}

function validarTotal(eventos, totalInformadoDocumento) {
  if (totalInformadoDocumento == null) return { ok: true, aplicavel: false }
  const soma = eventos.reduce((s, e) => s + e.valor_bruto, 0)
  const diferenca = Math.round((soma - totalInformadoDocumento) * 100) / 100
  if (Math.abs(diferenca) > 0.01) {
    return { ok: false, aplicavel: true, motivo: `Soma dos eventos (${soma.toFixed(2)}) não bate com o total do documento (${totalInformadoDocumento.toFixed(2)}). Diferença: ${diferenca.toFixed(2)}.` }
  }
  return { ok: true, aplicavel: true }
}

function validarSinais(eventos) {
  for (const e of eventos) {
    const esperado = e.valor_bruto > 0 ? 'recebimento' : e.valor_bruto < 0 ? 'ajuste_estorno' : 'zero_sem_recebimento'
    if (e.classificacao !== esperado) {
      return { ok: false, motivo: `Evento com valor ${e.valor_bruto} classificado como "${e.classificacao}", esperado "${esperado}".` }
    }
  }
  return { ok: true }
}

function validarIntegridade(eventos) {
  const problemas = []
  eventos.forEach((e, i) => {
    if (e.valor_bruto == null || Number.isNaN(e.valor_bruto)) {
      problemas.push(`Evento ${i}: valor_bruto ausente ou inválido.`)
    }
    if (e.data_evento && Number.isNaN(Date.parse(e.data_evento))) {
      problemas.push(`Evento ${i}: data_evento impossível ("${e.data_evento}").`)
    }
  })

  const chaves = {}
  eventos.forEach((e) => {
    const chave = `${e.numero_apolice_informado}|${e.numero_recibo_informado}|${e.numero_parcela_informado}|${e.valor_bruto}`
    chaves[chave] = (chaves[chave] || 0) + 1
  })
  Object.entries(chaves).forEach(([chave, contagem]) => {
    if (contagem > 4) problemas.push(`Repetição suspeita (${contagem}x) da combinação apólice/recibo/parcela/valor: ${chave}`)
  })

  return { ok: problemas.length === 0, motivo: problemas.join(' ') || undefined }
}

function validarTudo(eventos, totalInformadoDocumento) {
  const resultados = {
    quantidade: validarQuantidade(eventos),
    total: validarTotal(eventos, totalInformadoDocumento),
    sinais: validarSinais(eventos),
    integridade: validarIntegridade(eventos),
  }
  const falhas = Object.entries(resultados)
    .filter(([, r]) => !r.ok)
    .map(([nome, r]) => `${nome}: ${r.motivo}`)
  return { aprovado: falhas.length === 0, falhas, detalhes: resultados }
}

module.exports = { validarQuantidade, validarTotal, validarSinais, validarIntegridade, validarTudo }
