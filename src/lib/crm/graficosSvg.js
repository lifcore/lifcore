/**
 * SPEC-001 §12 — Gráficos financeiros obrigatórios do PDF Premium.
 * SVG inline puro (sem lib de chart) — mais confiável que <canvas> na
 * hora de "Salvar como PDF" pelo navegador, mesmo mecanismo de
 * impressão já usado em documentoClienteService.js.
 *
 * Paleta LifitSeg (ATUALIZADA 27/08 — bate com o novo logo):
 *   dark #05191b · surface #0d2b2c · primary (âmbar) #ffbb44 ·
 *   offwhite #eeecea · text #293A38 · text-soft #687673 · success #4A9589
 *
 * ATUALIZADO (26/08) — polimento visual pedido pelo usuário ("fonte
 * confusa nos números" no PDF como um todo, gráfico incluso). SVG
 * inline não herda a fonte da página de forma confiável em todos os
 * motores de renderização, então todo <text> aqui carrega
 * `font-family` direto no atributo. Também adicionadas linhas de
 * grade sutis (referência visual de proporção sem poluir) e cantos de
 * barra um pouco mais arredondados. Segue 100% SVG puro — nenhuma lib
 * nova, nenhuma mudança na confiabilidade de impressão.
 *
 * ATUALIZADO (27/08) — troca de identidade tipográfica dos dois PDFs
 * pra sans-serif editorial (Inter); a fonte forçada aqui no SVG
 * acompanha a mesma troca, com Helvetica/Arial como fallback caso o
 * motor de renderização não tenha Inter instalada.
 */

const FONTE_NUMERICA = "'Inter', 'Helvetica Neue', Arial, sans-serif"

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
export function graficoBarrasVertical({ dados, largura = 680, altura = 280, formatarValor = (v) => v, corBarra = '#0d2b2c', corDestaque = '#ffbb44' }) {
  const valores = dados.map((d) => d.valor ?? 0)
  const maxValor = Math.max(...valores, 1)
  const margemBaixo = 56
  const margemTopo = 34
  const areaAltura = altura - margemBaixo - margemTopo
  const larguraBarra = Math.min(64, (largura - 40) / dados.length - 16)
  const espacamento = (largura - 40) / dados.length

  // Grade horizontal sutil (25/50/75/100%) — referência de proporção
  // entre as barras sem precisar de eixo numerado (o valor exato já
  // aparece em cima de cada barra).
  const linhasGrade = [0.25, 0.5, 0.75, 1]
    .map((fracao) => {
      const y = margemTopo + areaAltura * (1 - fracao)
      return `<line x1="20" y1="${y}" x2="${largura - 20}" y2="${y}" stroke="#e2ddd3" stroke-width="1" stroke-dasharray="2,3" />`
    })
    .join('')

  const barras = dados
    .map((d, i) => {
      const x = 20 + i * espacamento + (espacamento - larguraBarra) / 2
      const alturaBarra = maxValor > 0 ? (Math.abs(d.valor ?? 0) / maxValor) * areaAltura : 0
      const y = margemTopo + (areaAltura - alturaBarra)
      const cor = d.destaque ? corDestaque : corBarra
      return `
        <rect x="${x}" y="${y}" width="${larguraBarra}" height="${alturaBarra}" fill="${cor}" rx="6" />
        <text x="${x + larguraBarra / 2}" y="${y - 10}" text-anchor="middle" font-family="${FONTE_NUMERICA}" font-size="13" fill="#293A38" font-weight="700">${escaparTextoSvg(formatarValor(d.valor))}</text>
        <text x="${x + larguraBarra / 2}" y="${altura - margemBaixo + 20}" text-anchor="middle" font-family="${FONTE_NUMERICA}" font-size="11" font-weight="300" fill="#687673">${escaparTextoSvg(truncar(d.label, 14))}</text>
      `
    })
    .join('')

  return `<svg viewBox="0 0 ${largura} ${altura}" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:auto;">
    ${linhasGrade}
    <line x1="20" y1="${altura - margemBaixo}" x2="${largura - 20}" y2="${altura - margemBaixo}" stroke="#cdc6b6" stroke-width="1.5" />
    ${barras}
  </svg>`
}

/**
 * NOVO (28/08) — Dashboard Financeiro: gráfico de colunas com chip de
 * operadora + percentual embaixo de cada barra, e destaque "hero" pra
 * proposta recomendada (fundo escuro, borda dourada, estrela).
 * `dados`: [{ label, valor, percentual?, tipo?: 'atual'|'economia'|'investimento', destaque? }]
 *
 * Regra de linguagem (pedido do usuário): quando o valor é maior que o
 * atual, NUNCA trata como perda/vermelho — é "investimento em
 * melhoria" (âmbar), porque o cliente está buscando qualidade, não
 * economia. "economia" só aparece quando o valor é de fato menor.
 */
export function graficoColunasComChip({ dados, largura = 680, altura = 320, formatarValor = (v) => v }) {
  const valores = dados.map((d) => d.valor ?? 0)
  const maxValor = Math.max(...valores, 1)
  const margemBaixo = 78
  const margemTopo = 34
  const areaAltura = altura - margemBaixo - margemTopo
  const larguraBarra = Math.min(46, (largura - 40) / dados.length - 22)
  const espacamento = (largura - 40) / dados.length
  const larguraChip = Math.min(78, espacamento - 8)

  const linhasGrade = [0.25, 0.5, 0.75, 1]
    .map((fracao) => {
      const y = margemTopo + areaAltura * (1 - fracao)
      return `<line x1="20" y1="${y}" x2="${largura - 20}" y2="${y}" stroke="#e2ddd3" stroke-width="1" stroke-dasharray="2,3" />`
    })
    .join('')

  const elementos = dados
    .map((d, i) => {
      const xCentro = 20 + i * espacamento + espacamento / 2
      const x = xCentro - larguraBarra / 2
      const alturaBarra = maxValor > 0 ? (Math.abs(d.valor ?? 0) / maxValor) * areaAltura : 0
      const y = margemTopo + (areaAltura - alturaBarra)

      let corBarra = '#0d2b2c'
      if (d.tipo === 'economia') corBarra = '#5ff1b3'
      else if (d.tipo === 'investimento') corBarra = '#ffbb44'
      const corValor = d.tipo === 'economia' ? '#3B6D11' : d.tipo === 'investimento' ? '#854F0B' : '#293A38'

      const chipY = margemTopo + areaAltura + 14
      const chipAltura = d.percentual != null ? 34 : 22
      const chipX = xCentro - larguraChip / 2

      let chipFundo = '#f4f1e9'
      let chipBordaAttrs = ''
      let corNome = '#293A38'
      let corPercentual = '#687673'
      let prefixoNome = ''

      if (d.destaque) {
        chipFundo = '#05191b'
        chipBordaAttrs = 'stroke="#ffbb44" stroke-width="1.5"'
        corNome = '#ffbb44'
        prefixoNome = '★ '
        corPercentual = '#eeecea'
      } else if (d.tipo === 'economia') {
        chipFundo = '#e1f5ee'
        corNome = '#04342C'
        corPercentual = '#0F6E56'
      } else if (d.tipo === 'investimento') {
        corPercentual = '#854F0B'
      }

      const percentualTexto = d.percentual != null ? `${d.percentual < 0 ? '↓' : '↑'} ${Math.abs(d.percentual).toFixed(1)}%` : null

      return `
        <rect x="${x}" y="${y}" width="${larguraBarra}" height="${alturaBarra}" fill="${corBarra}" rx="5" />
        <text x="${xCentro}" y="${y - 10}" text-anchor="middle" font-family="${FONTE_NUMERICA}" font-size="12" font-weight="700" fill="${corValor}">${escaparTextoSvg(formatarValor(d.valor))}</text>
        <rect x="${chipX}" y="${chipY}" width="${larguraChip}" height="${chipAltura}" rx="7" fill="${chipFundo}" ${chipBordaAttrs} />
        <text x="${xCentro}" y="${chipY + 14}" text-anchor="middle" font-family="${FONTE_NUMERICA}" font-size="9" font-weight="700" fill="${corNome}">${escaparTextoSvg(truncar(`${prefixoNome}${d.label}`, 13))}</text>
        ${percentualTexto ? `<text x="${xCentro}" y="${chipY + 27}" text-anchor="middle" font-family="${FONTE_NUMERICA}" font-size="8.5" font-weight="700" fill="${corPercentual}">${escaparTextoSvg(percentualTexto)}</text>` : ''}
      `
    })
    .join('')

  return `<svg viewBox="0 0 ${largura} ${altura}" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:auto;">
    ${linhasGrade}
    <line x1="20" y1="${margemTopo + areaAltura}" x2="${largura - 20}" y2="${margemTopo + areaAltura}" stroke="#cdc6b6" stroke-width="1.5" />
    ${elementos}
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
      const cor = economia ? '#4A9589' : '#ffbb44'
      const xBarra = economia ? centroX - larguraBarra : centroX
      return `
        <text x="${centroX - larguraMaxBarra - 12}" y="${y + 16}" text-anchor="end" font-family="${FONTE_NUMERICA}" font-size="12" font-weight="500" fill="#293A38">${escaparTextoSvg(truncar(d.label, 20))}</text>
        <rect x="${xBarra}" y="${y}" width="${larguraBarra}" height="20" fill="${cor}" rx="5" />
        <text x="${economia ? xBarra - 8 : xBarra + larguraBarra + 8}" y="${y + 15}" text-anchor="${economia ? 'end' : 'start'}" font-family="${FONTE_NUMERICA}" font-size="12" font-weight="700" fill="${cor}">${escaparTextoSvg(formatarValor(valor))}</text>
      `
    })
    .join('')

  return `<svg viewBox="0 0 ${largura} ${alturaCalculada}" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:auto;">
    <line x1="${centroX}" y1="0" x2="${centroX}" y2="${alturaCalculada}" stroke="#cdc6b6" stroke-width="1.5" />
    ${linhas}
  </svg>`
}
