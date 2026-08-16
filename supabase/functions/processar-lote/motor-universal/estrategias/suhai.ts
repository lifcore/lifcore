/**
 * MOTOR UNIVERSAL (Edge Function) — Estratégia homologada: SUHAI
 * Porte de scripts/motor-universal/estrategias/suhai.cjs — mesma
 * lógica já homologada (43 eventos, R$ 1.340,02).
 */

const NOME = 'suhai_comissoes_v1'

const CAMPOS_ESPERADOS = [
  'FAVORECIDO',
  'Nº RECIBO',
  'RAMO',
  'Nº APÓLICE',
  'ENDOSSO',
  'PARCELA',
  'DATA DO PAGAMENTO',
  'TIPO DE COMISSÃO',
  'PRÊMIO',
  'COMISSÃO',
]

function paraNumero(texto: string) {
  return Number(texto.replace(/\./g, '').replace(',', '.'))
}

function paraDataISO(dataBR: string) {
  const [d, m, a] = dataBR.split('/')
  return `${a}-${m}-${d}`
}

function identificarSeguradoraNoTexto(linhas: string[]) {
  const idx = linhas.findIndex((l) => l.toUpperCase() === 'EMPRESA')
  return idx >= 0 && linhas[idx + 1] ? linhas[idx + 1].trim() : null
}

function identificarPeriodo(linhas: string[]) {
  const idx = linhas.findIndex((l) => l.toUpperCase().startsWith('PER'))
  if (idx < 0 || !linhas[idx + 1]) return { periodoInicio: null, periodoFim: null }
  const m = linhas[idx + 1].match(/(\d{2}\/\d{2}\/\d{4})\s+A\s+(\d{2}\/\d{2}\/\d{4})/)
  if (!m) return { periodoInicio: null, periodoFim: null }
  return { periodoInicio: paraDataISO(m[1]), periodoFim: paraDataISO(m[2]) }
}

function identificarTotalDocumento(linhas: string[]) {
  const idx = linhas.findIndex((l) => l.toUpperCase() === 'TOTAL')
  if (idx < 0) return null
  const bloco = linhas.slice(idx + 1, idx + 5)
  if (bloco.length < 4) return null
  const totalComissao = bloco[3].replace(/\./g, '').replace(',', '.')
  const numero = Number(totalComissao)
  return Number.isNaN(numero) ? null : numero
}

function parsearLinhas(linhas: string[]) {
  const eventos = []
  for (let i = 0; i < linhas.length; i++) {
    if (!linhas[i].startsWith('LIFITSEG')) continue
    const bloco = linhas.slice(i, i + 12)
    if (bloco.length < 12) continue
    const [, recibo, , apolice, endosso, parcela, data, tipo, , , , comissao] = bloco
    eventos.push({
      linha_original_ref: String(i),
      numero_apolice_informado: apolice,
      numero_recibo_informado: recibo,
      numero_endosso_informado: endosso,
      numero_parcela_informado: parcela,
      segurado_informado: null,
      data_evento: paraDataISO(data),
      valor_bruto: paraNumero(comissao),
      valor_inss: 0,
      valor_irrf: 0,
      valor_iss: 0,
      valor_outros_descontos: 0,
      tipo_comissao_informado: tipo,
    })
    i += 11
  }
  return eventos
}

function extrair(linhas: string[]) {
  const nomeOrigemDocumento = identificarSeguradoraNoTexto(linhas)
  const { periodoInicio, periodoFim } = identificarPeriodo(linhas)
  const eventos = parsearLinhas(linhas)
  const totalInformadoDocumento = identificarTotalDocumento(linhas)
  return { nomeOrigemDocumento, periodoInicio, periodoFim, eventos, totalInformadoDocumento }
}

export default { nome: NOME, camposEsperados: CAMPOS_ESPERADOS, extrair }
