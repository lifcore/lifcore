import { operacional } from '../supabaseSchemas'
import { formatarDataBR } from '../utils/formatarData'
import { listarCenarioAtual } from './cenarioAtualService'
import { listarLotesEstudoPorCotacao, listarPropostasPorLote, listarRedePorLote, listarLegendaPorLote } from './estudoMercadoService'
import {
  calcularComposicaoDaCotacao,
  calcularValorPropostaParaComposicao,
  calcularTotalCenarioAtual,
  calcularComparativo,
  calcularCustoPorVida,
} from './estudoFinanceiroService'
import { graficoBarrasVertical, graficoDivergente } from './graficosSvg'

/**
 * SPEC-001 §12 — Estudo de Mercado Executivo LifitSeg (era "Premium" —
 * renomeado 21/08, mesmo documento, mesmo padrão visual, só o nome
 * mudou pra bater com a nomenclatura de 3 níveis do Chief:
 * Essencial/Executivo/Corporativo).
 * Mesmo padrão do Report Center (documentoClienteService.js):
 *   1. montarDadosEstudoMercado(cotacaoId) → só busca e organiza dado
 *      (reaproveita os Services das Peças 1-3, nenhuma consulta nova).
 *   2. gerarHtmlEstudoMercado(dados) → função pura, sem banco, devolve
 *      HTML pronto pra abrir em janela e "Salvar como PDF" (Ctrl+P).
 *
 * Diretriz visual do Raphael: identidade LifitSeg (paleta do site,
 * REV-SITE-001), estética editorial/consultoria — não relatório técnico.
 *
 * Só entram no Estudo as propostas com status_revisao='confirmada'
 * (SPEC-001 §11 — seleção é sempre decisão do corretor), ordenadas por
 * ordem_apresentacao.
 */

function formatarMoeda(v) {
  return v == null ? '—' : (v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

const PAPEL_LABEL = {
  economica: '💰 Melhor custo-benefício',
  recomendada: '⭐ Recomendada',
  maior_aderencia: '🏥 Maior aderência de rede',
  outra: null,
}

export async function montarDadosEstudoMercado(cotacaoId) {
  const { data: cotacao, error: erroCotacao } = await operacional
    .from('cotacoes')
    .select('*, itens_cotacao(*)')
    .eq('id', cotacaoId)
    .single()
  if (erroCotacao) throw new Error(`Erro ao buscar cotação: ${erroCotacao.message}`)

  const { data: cliente, error: erroCliente } = await operacional
    .from('clientes_prospects')
    .select('razao_social, cnpj, cpf')
    .eq('id', cotacao.cliente_prospect_id)
    .single()
  if (erroCliente) throw new Error(`Erro ao buscar cliente: ${erroCliente.message}`)

  const cenarioAtual = await listarCenarioAtual(cotacaoId)
  const totalCenarioAtual = calcularTotalCenarioAtual(cenarioAtual)
  const composicao = calcularComposicaoDaCotacao(cotacao.itens_cotacao ?? [])

  const lotes = await listarLotesEstudoPorCotacao(cotacaoId)
  let todasPropostas = []
  let redeCompleta = []
  let legendaCompleta = []
  for (const lote of lotes) {
    const propostasDoLote = await listarPropostasPorLote(lote.id)
    todasPropostas = todasPropostas.concat(propostasDoLote.map((p) => ({ ...p, loteId: lote.id })))
    const rede = await listarRedePorLote(lote.id)
    redeCompleta = redeCompleta.concat(rede)
    const legenda = await listarLegendaPorLote(lote.id)
    legendaCompleta = legendaCompleta.concat(legenda)
  }

  const propostasSelecionadas = todasPropostas
    .filter((p) => p.status_revisao === 'confirmada')
    .sort((a, b) => (a.ordem_apresentacao ?? 999) - (b.ordem_apresentacao ?? 999))
    .map((p) => {
      const resultado = calcularValorPropostaParaComposicao(p, composicao)
      const comparativo = calcularComparativo({ mensalAtual: totalCenarioAtual.totalMensal, mensalProposta: resultado.valorMensal })
      const custoPorVida = calcularCustoPorVida(resultado.valorMensal, resultado.totalVidas)
      return { ...p, valorMensalCalculado: resultado.valorMensal, faixasFaltantes: resultado.faixasFaltantes, comparativo, custoPorVida }
    })

  const idsPropostasSelecionadas = new Set(propostasSelecionadas.map((p) => p.id))
  const redeDasSelecionadas = redeCompleta.filter((r) => idsPropostasSelecionadas.has(r.proposta_estudo_id))

  return {
    geradoEm: new Date().toISOString(),
    cliente,
    cotacao,
    cenarioAtual,
    totalCenarioAtual,
    composicao,
    propostasSelecionadas,
    rede: redeDasSelecionadas,
    legenda: legendaCompleta,
  }
}

/** Interseção e diferenças de prestador entre as propostas selecionadas — só operação de conjunto sobre dado real, nenhuma curadoria inventada. */
function calcularRedeComparativa(rede, propostas) {
  const porPrestador = {}
  for (const linha of rede) {
    if (!porPrestador[linha.prestador]) porPrestador[linha.prestador] = new Set()
    porPrestador[linha.prestador].add(linha.proposta_estudo_id)
  }
  const totalPropostas = propostas.length
  const comuns = Object.entries(porPrestador).filter(([, ids]) => ids.size === totalPropostas).map(([p]) => p)
  const exclusivos = propostas.map((p) => ({
    proposta: p,
    prestadores: Object.entries(porPrestador).filter(([, ids]) => ids.size === 1 && ids.has(p.id)).map(([nome]) => nome),
  }))
  return { comuns, exclusivos }
}

function escapeHtml(valor) {
  if (valor === null || valor === undefined) return ''
  return String(valor).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
}

export function gerarHtmlEstudoMercado(dados) {
  const { geradoEm, cliente, cenarioAtual, totalCenarioAtual, propostasSelecionadas, rede, legenda, regrasIncluidas } = dados

  const valoresGrafico = [
    { label: 'Atual', valor: totalCenarioAtual.totalMensal ?? 0 },
    ...propostasSelecionadas.map((p) => ({ label: p.plano ?? p.operadora_nome ?? '—', valor: p.valorMensalCalculado ?? 0, destaque: p.papel_selecao === 'recomendada' })),
  ].filter((d) => d.valor > 0)

  const graficoCusto = valoresGrafico.length >= 2 ? graficoBarrasVertical({ dados: valoresGrafico, formatarValor: formatarMoeda }) : null

  const impactosGrafico = propostasSelecionadas
    .filter((p) => p.comparativo.impactoMensal != null)
    .map((p) => ({ label: p.plano ?? p.operadora_nome ?? '—', valor: p.comparativo.impactoMensal }))
  const graficoImpacto = impactosGrafico.length > 0 ? graficoDivergente({ dados: impactosGrafico, formatarValor: formatarMoeda }) : null

  const redeComparativa = calcularRedeComparativa(rede, propostasSelecionadas)

  const menorValor = propostasSelecionadas.reduce((min, p) => (p.valorMensalCalculado != null && (min == null || p.valorMensalCalculado < min) ? p.valorMensalCalculado : min), null)
  const maiorValor = propostasSelecionadas.reduce((max, p) => (p.valorMensalCalculado != null && (max == null || p.valorMensalCalculado > max) ? p.valorMensalCalculado : max), null)
  const propostaRecomendada = propostasSelecionadas.find((p) => p.papel_selecao === 'recomendada')
  const propostaEconomica = propostasSelecionadas.find((p) => p.papel_selecao === 'economica')
  const propostaAderencia = propostasSelecionadas.find((p) => p.papel_selecao === 'maior_aderencia')

  const blocoDestaques = [propostaEconomica, propostaRecomendada, propostaAderencia]
    .filter(Boolean)
    .map((p) => `<div class="destaque-card"><span class="destaque-label">${PAPEL_LABEL[p.papel_selecao]}</span><strong>${escapeHtml(p.plano ?? p.operadora_nome ?? '—')}</strong></div>`)
    .join('')

  const linhasComparativo = propostasSelecionadas
    .map((p) => `
      <tr>
        <td><strong>${escapeHtml(p.operadora_nome ?? p.operadora_nome_extraido ?? '—')}</strong><br/><span class="sub">${escapeHtml(p.plano ?? '—')}</span></td>
        <td>${escapeHtml(p.acomodacao ?? '—')}</td>
        <td>${escapeHtml(p.coparticipacao ?? '—')}</td>
        <td class="valor">${formatarMoeda(p.valorMensalCalculado)}</td>
        <td class="valor">${formatarMoeda(p.custoPorVida)}</td>
      </tr>`)
    .join('')

  const linhasCenarioAtual = cenarioAtual
    .map((p) => `
      <tr>
        <td>${escapeHtml(p.operadora_nome ?? p.operadora_nome_livre ?? '—')}</td>
        <td>${escapeHtml(p.plano ?? '—')}</td>
        <td>${p.quantidade_vidas_informada ?? '—'}</td>
        <td class="valor">${formatarMoeda(p.mensalidade_informada)}</td>
      </tr>`)
    .join('')

  const listaComuns = redeComparativa.comuns.length
    ? `<p>Prestadores presentes em <strong>todas</strong> as propostas comparadas: ${redeComparativa.comuns.map(escapeHtml).join(', ')}.</p>`
    : ''
  const listaExclusivos = redeComparativa.exclusivos
    .filter((e) => e.prestadores.length > 0)
    .map((e) => `<p><strong>${escapeHtml(e.proposta.plano ?? '—')}</strong> — exclusivo(s): ${e.prestadores.map(escapeHtml).join(', ')}</p>`)
    .join('')

  const legendaPendente = legenda.length === 0
  const linhasLegenda = legenda.map((l) => `<tr><td>${escapeHtml(l.sigla)}</td><td>${escapeHtml(l.significado)}</td></tr>`).join('')

  const faixasFaltantesGeral = propostasSelecionadas.some((p) => p.faixasFaltantes?.length > 0)

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8" />
<title>Estudo de Mercado — ${escapeHtml(cliente.razao_social)}</title>
<style>
  * { box-sizing: border-box; }
  :root {
    --dark: #082124; --dark-deep: #041416; --surface: #102D2F;
    --primary: #C9A45A; --offwhite: #F7F4EF;
    --text: #293A38; --text-soft: #687673; --success: #4A9589;
  }
  body { font-family: 'Georgia', 'Times New Roman', serif; color: var(--text); background: var(--offwhite); max-width: 880px; margin: 0 auto; padding: 0; }
  section { padding: 48px 56px; page-break-after: always; }
  section:last-of-type { page-break-after: auto; }
  h1, h2, h3 { font-weight: 400; letter-spacing: 0.01em; }
  .capa { background: var(--dark); color: var(--offwhite); display: flex; flex-direction: column; justify-content: center; min-height: 100vh; }
  .capa .marca { font-size: 13px; letter-spacing: 0.24em; text-transform: uppercase; color: var(--primary); margin-bottom: 24px; }
  .capa h1 { font-size: 34px; margin: 0 0 12px; }
  .capa .tagline { font-size: 15px; color: #b9c4c2; max-width: 460px; line-height: 1.6; margin-bottom: 40px; }
  .capa .meta { font-size: 13px; color: #8fa19e; border-top: 1px solid #24403f; padding-top: 16px; }
  h2.titulo-secao { font-size: 12px; letter-spacing: 0.2em; text-transform: uppercase; color: var(--primary); margin: 0 0 24px; }
  .resumo-destaques { display: flex; gap: 16px; margin: 24px 0; }
  .destaque-card { flex: 1; border: 1px solid #ddd6c7; border-radius: 8px; padding: 16px; background: #fff; }
  .destaque-label { display: block; font-size: 11px; color: var(--text-soft); text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 6px; }
  .destaque-card strong { font-size: 16px; color: var(--dark); }
  .faixa-precos { font-size: 15px; margin: 16px 0; color: var(--text-soft); }
  .faixa-precos strong { color: var(--dark); font-size: 20px; }
  table { width: 100%; border-collapse: collapse; margin-top: 12px; font-size: 13px; }
  th { text-align: left; background: var(--surface); color: var(--offwhite); padding: 10px 12px; font-size: 10px; text-transform: uppercase; letter-spacing: 0.04em; font-weight: 400; }
  td { padding: 10px 12px; border-bottom: 1px solid #e4ded1; }
  td.valor { text-align: right; font-variant-numeric: tabular-nums; }
  td .sub { color: var(--text-soft); font-size: 12px; }
  .grafico-bloco { margin: 28px 0; padding: 20px; background: #fff; border-radius: 8px; border: 1px solid #e4ded1; }
  .grafico-titulo { font-size: 12px; color: var(--text-soft); text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 12px; }
  .aviso { font-size: 12px; color: var(--text-soft); font-style: italic; background: #f0ece0; border-left: 3px solid var(--primary); padding: 10px 14px; margin: 12px 0; }
  footer.rodape { font-size: 10px; color: var(--text-soft); text-align: center; padding: 16px; }
  @media print {
    body { background: #fff; }
    .capa { min-height: 100vh; }
    button.no-print { display: none; }
  }
</style>
</head>
<body>
  <button class="no-print" onclick="window.print()" style="position:fixed;top:16px;right:16px;padding:10px 18px;background:#C9A45A;color:#082124;border:none;border-radius:6px;cursor:pointer;font-weight:600;z-index:10;">🖨️ Imprimir / Salvar como PDF</button>

  <section class="capa">
    <div class="marca">LifitSeg</div>
    <h1>Estudo de Mercado — Executivo</h1>
    <p class="tagline">Uma análise técnica para encontrar o melhor equilíbrio entre investimento, cobertura e rede.</p>
    <div class="meta">Cliente: ${escapeHtml(cliente.razao_social)}<br/>Data: ${formatarDataBR(geradoEm.slice(0, 10))}</div>
  </section>

  <section>
    <h2 class="titulo-secao">Resumo Executivo</h2>
    <p class="faixa-precos">
      <strong>${propostasSelecionadas.length}</strong> alternativa(s) analisada(s)
      ${menorValor != null && maiorValor != null ? ` — ${formatarMoeda(menorValor)} a ${formatarMoeda(maiorValor)} por mês` : ''}
    </p>
    <div class="resumo-destaques">${blocoDestaques || '<p class="aviso">Nenhuma proposta marcada com papel de destaque ainda — defina na tela de Propostas de Mercado.</p>'}</div>
  </section>

  <section>
    <h2 class="titulo-secao">Cenário Atual</h2>
    ${cenarioAtual.length ? `
    <table>
      <thead><tr><th>Operadora</th><th>Plano</th><th>Vidas</th><th>Mensalidade</th></tr></thead>
      <tbody>${linhasCenarioAtual}</tbody>
    </table>
    <p class="faixa-precos">Total atual: <strong>${formatarMoeda(totalCenarioAtual.totalMensal)}</strong>/mês — ${totalCenarioAtual.totalVidas} vidas</p>
    ` : '<p class="aviso">Cenário atual não cadastrado para esta Cotação.</p>'}
  </section>

  <section>
    <h2 class="titulo-secao">Comparativo de Mercado</h2>
    <table>
      <thead><tr><th>Operadora / Plano</th><th>Acomodação</th><th>Coparticipação</th><th>Mensal</th><th>Por vida</th></tr></thead>
      <tbody>${linhasComparativo || '<tr><td colspan="5" class="sub">Nenhuma proposta confirmada ainda.</td></tr>'}</tbody>
    </table>
    ${faixasFaltantesGeral ? '<p class="aviso">⚠️ Uma ou mais propostas têm faixa etária sem preço extraído — o valor mensal dessas propostas pode estar subestimado.</p>' : ''}
  </section>

  <section>
    <h2 class="titulo-secao">Financeiro</h2>
    ${graficoCusto ? `<div class="grafico-bloco"><div class="grafico-titulo">Custo mensal — atual × propostas</div>${graficoCusto}</div>` : ''}
    ${graficoImpacto ? `<div class="grafico-bloco"><div class="grafico-titulo">Impacto mensal frente ao cenário atual</div>${graficoImpacto}</div>` : ''}
    ${propostasSelecionadas.map((p) => p.comparativo.impactoAnual != null ? `<p class="faixa-precos">${escapeHtml(p.plano ?? '—')}: impacto anual de <strong>${formatarMoeda(Math.abs(p.comparativo.impactoAnual))}</strong> (${p.comparativo.tipo === 'economia' ? 'economia' : 'acréscimo'})</p>` : '').join('')}
  </section>

  <section>
    <h2 class="titulo-secao">Rede Estratégica</h2>
    ${listaComuns}
    ${listaExclusivos || '<p class="aviso">Sem diferenças de rede identificadas entre as propostas selecionadas, ou rede ainda não processada para este lote.</p>'}
    ${legendaPendente ? '<p class="aviso">Legenda de códigos de atendimento não localizada neste documento — os códigos brutos ficam disponíveis para consulta, sem interpretação automática.</p>' : `
    <table><thead><tr><th>Código</th><th>Significado</th></tr></thead><tbody>${linhasLegenda}</tbody></table>
    `}
  </section>

  ${regrasIncluidas?.length ? `
  <section>
    <h2 class="titulo-secao">Regras Comerciais</h2>
    <p class="aviso">Regras de venda vigentes no momento da geração — não valem pra plano(s) que o cliente já tem ativo hoje (condições desses foram travadas na contratação original).</p>
    <table>
      <thead><tr><th>Operadora</th><th>Tipo</th><th>Descrição</th></tr></thead>
      <tbody>${regrasIncluidas.map((r) => `<tr><td>${escapeHtml(r.operadora)}</td><td>${escapeHtml(r.tipo)}</td><td>${escapeHtml(r.descricao)}</td></tr>`).join('')}</tbody>
    </table>
  </section>
  ` : ''}

  <section>
    <h2 class="titulo-secao">Conclusão</h2>
    <p class="faixa-precos">
      Foram comparadas ${propostasSelecionadas.length} propostas de mercado contra o cenário atual do cliente.
      ${menorValor != null ? `A opção de menor custo mensal é ${formatarMoeda(menorValor)}` : ''}
      ${maiorValor != null && menorValor != null && maiorValor !== menorValor ? `, contra ${formatarMoeda(maiorValor)} na opção de maior custo.` : '.'}
    </p>
    <p class="aviso">Esta síntese é factual, gerada a partir dos dados extraídos e confirmados. Uma leitura consultiva aprofundada (recomendação com justificativa) pode ser gerada separadamente, sob confirmação do corretor.</p>
  </section>

  <section>
    <h2 class="titulo-secao">Notas e Limitações</h2>
    <p class="aviso">Valores e condições são determinados pelas operadoras e podem ser alterados a qualquer momento pela seguradora — este estudo não vincula a prestação do serviço, que se dá apenas na assinatura do contrato.</p>
    <p class="aviso">A rede credenciada exibida é referencial; especialidades e coberturas devem ser confirmadas diretamente com a operadora antes da contratação.</p>
  </section>

  <footer class="rodape">LifitSeg — Estudo Comparativo gerado em ${formatarDataBR(geradoEm.slice(0, 10))}, a partir de documentos fornecidos pelas operadoras e conferidos pelo corretor responsável.</footer>
</body>
</html>`
}
