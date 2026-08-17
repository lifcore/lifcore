/**
 * SPEC-001 §12 — Gráficos financeiros obrigatórios do PDF Premium.
 * SVG inline puro (sem lib de chart) — mais confiável que <canvas> na
 * hora de "Salvar como PDF" pelo navegador, mesmo mecanismo de
 * impressão já usado em documentoClienteService.js.
 *
 * Paleta LifitSeg (globals.css do site, REV-SITE-001):
 *   dark #082124 · surface #102D2F · primary (âmbar) #C9A45A ·
 *   offwhite #F7F4EF · text #293A38 · text-soft #687673 · success #4A9589
 */

function escaparTextoSvg(v) {
  return String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
}

function truncar(texto, max) {
  const t = String(texto ?? '')
  return t.length > max ? `${t.slice(0, max - 1)}…` : t
}

/**
 * Gráfico de barras verticais — usado para "custo atual × propostas"
 * e "distribuição de vidas por faixa". `dados`: [{ label, valor }].
 */
export function graficoBarrasVertical({ dados, largura = 680, altura = 280, formatarValor = (v) => v, corBarra = '#102D2F', corDestaque = '#C9A45A' }) {
  const valores = dados.map((d) => d.valor ?? 0)
  const maxValor = Math.max(...valores, 1)
  const margemBaixo = 56
  const margemTopo = 28
  const areaAltura = altura - margemBaixo - margemTopo
  const larguraBarra = Math.min(64, (largura - 40) / dados.length - 16)
  const espacamento = (largura - 40) / dados.length

  const barras = dados
    .map((d, i) => {
      const x = 20 + i * espacamento + (espacamento - larguraBarra) / 2
      const alturaBarra = maxValor > 0 ? (Math.abs(d.valor ?? 0) / maxValor) * areaAltura : 0
      const y = margemTopo + (areaAltura - alturaBarra)
      const cor = d.destaque ? corDestaque : corBarra
      return `
        <rect x="${x}" y="${y}" width="${larguraBarra}" height="${alturaBarra}" fill="${cor}" rx="3" />
        <text x="${x + larguraBarra / 2}" y="${y - 8}" text-anchor="middle" font-size="12" fill="#293A38" font-weight="600">${escaparTextoSvg(formatarValor(d.valor))}</text>
        <text x="${x + larguraBarra / 2}" y="${altura - margemBaixo + 18}" text-anchor="middle" font-size="11" fill="#687673">${escaparTextoSvg(truncar(d.label, 14))}</text>
      `
    })
    .join('')

  return `<svg viewBox="0 0 ${largura} ${altura}" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:auto;">
    <line x1="20" y1="${altura - margemBaixo}" x2="${largura - 20}" y2="${altura - margemBaixo}" stroke="#e2ddd3" stroke-width="1" />
    ${barras}
  </svg>`
}

/**
 * Gráfico divergente (economia × acréscimo) — barras horizontais a
 * partir de uma linha central em zero. `dados`: [{ label, valor }],
 * valor negativo = economia (verde), positivo = acréscimo (âmbar).
 */
export function graficoDivergente({ dados, largura = 680, altura = null, formatarValor = (v) => v }) {
  const alturaLinha = 36
  const alturaCalculada = altura ?? dados.length * alturaLinha + 20
  const centroX = largura / 2
  const maxAbs = Math.max(...dados.map((d) => Math.abs(d.valor ?? 0)), 1)
  const larguraMaxBarra = largura / 2 - 140

  const linhas = dados
    .map((d, i) => {
      const y = 10 + i * alturaLinha
      const valor = d.valor ?? 0
      const larguraBarra = maxAbs > 0 ? (Math.abs(valor) / maxAbs) * larguraMaxBarra : 0
      const economia = valor < 0
      const cor = economia ? '#4A9589' : '#C9A45A'
      const xBarra = economia ? centroX - larguraBarra : centroX
      return `
        <text x="${centroX - larguraMaxBarra - 12}" y="${y + 16}" text-anchor="end" font-size="12" fill="#293A38">${escaparTextoSvg(truncar(d.label, 20))}</text>
        <rect x="${xBarra}" y="${y}" width="${larguraBarra}" height="20" fill="${cor}" rx="3" />
        <text x="${economia ? xBarra - 8 : xBarra + larguraBarra + 8}" y="${y + 15}" text-anchor="${economia ? 'end' : 'start'}" font-size="12" font-weight="600" fill="${cor}">${escaparTextoSvg(formatarValor(valor))}</text>
      `
    })
    .join('')

  return `<svg viewBox="0 0 ${largura} ${alturaCalculada}" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:auto;">
    <line x1="${centroX}" y1="0" x2="${centroX}" y2="${alturaCalculada}" stroke="#e2ddd3" stroke-width="1" />
    ${linhas}
  </svg>`
}
