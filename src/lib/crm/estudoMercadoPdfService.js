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
import { graficoColunasComChip } from './graficosSvg'

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

/** NOVO (27/08) — mesmo quadro do Perfil do Corretor usado no Essencial,
 *  os dois documentos devem ter a mesma linguagem visual. */
function blocoCorretor(corretor) {
  const linhas = [
    corretor?.nome ? `<div class="corretor-nome">${escapeHtml(corretor.nome)}</div>` : '',
    corretor?.email ? `<div class="corretor-linha">${escapeHtml(corretor.email)}</div>` : '',
    corretor?.telefone ? `<div class="corretor-linha">${escapeHtml(corretor.telefone)}</div>` : '',
  ].filter(Boolean)
  if (linhas.length === 0) return ''
  return `<div class="corretor-quadro">
    <div class="corretor-rotulo">Corretor Responsável</div>
    ${linhas.join('')}
  </div>`
}

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

/** NOVO (28/08) — máscara de CNPJ, mesmo padrão do Essencial. */
function formatarCnpj(cnpj) {
  if (!cnpj) return null
  const digitos = String(cnpj).replace(/\D/g, '')
  if (digitos.length !== 14) return cnpj
  return digitos.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5')
}

// ATUALIZADO (28/08) — logo dividido em duas versões, cada uma sem a
// tagline embutida na imagem (evita redundância com o texto que já
// aparece ao lado dela no cabeçalho, e permite aumentar o logo sem
// pixelizar). Confirmado com o usuário, arquivos já hospedados:
//   - ESCURO (ícone + "LIFITSEG", texto branco): capa e fechamento
//   - CLARO (só o ícone): cabeçalho fino de cada seção, fundo claro
const LOGO_LIFITSEG_ESCURO = 'https://lifitseg.com.br/logo-clr.png'
const LOGO_LIFITSEG_CLARO = 'https://lifitseg.com.br/logo-esc.png'

/** NOVO (26/08) — logo de operadora, mesmo padrão do Essencial: caixa
 *  branca fixa atrás (o PDF é fundo claro, funciona pra qualquer logo
 *  independente do tema que foi desenhado). Sem logo cadastrado, não
 *  quebra nada — só não mostra imagem. */
function logoOperadora(logoUrl) {
  if (!logoUrl) return ''
  return `<div class="logo-operadora-box"><img src="${escapeHtml(logoUrl)}" alt="" class="logo-operadora-img" /></div>`
}

/** NOVO (26/08) — cabeçalho fino repetido no topo de cada seção
 *  (exceto capa/fechamento, que têm tratamento próprio). Mesmo padrão
 *  visual do documento de referência do usuário: logo pequeno + nome
 *  do documento, linha divisória embaixo. Repetido como HTML normal
 *  dentro de cada `<section>` — não usa cabeçalho/rodapé "fixo" de
 *  impressão (CSS `@page`), que tem suporte inconsistente entre
 *  navegadores; isso aqui é 100% confiável porque é conteúdo comum. */
function cabecalhoPagina() {
  return `<div class="cabecalho-pagina">
    <img src="${LOGO_LIFITSEG_CLARO}" alt="" class="cabecalho-pagina-logo" />
    <span class="cabecalho-pagina-divisor"></span>
    <span>Estudo de Mercado • Inteligência em Saúde e Seguros</span>
  </div>`
}

/** NOVO (26/08) — rodapé fino repetido no fim de cada seção. Sem
 *  número de página: o HTML não tem como saber em que página física
 *  cada seção vai cair depois de impresso (depende de quanto conteúdo
 *  coube antes, decidido pelo motor de impressão do navegador na hora
 *  de gerar) — mostrar um número aqui seria inventar um dado que a
 *  gente não tem como calcular direito. */
function rodapePagina() {
  return `<div class="rodape-pagina">LifitSeg • Documento executivo</div>`
}

/** NOVO (26/08) — linha de KPIs em caixa escura, mesmo padrão do
 *  documento de referência (número grande, rótulo pequeno em caixa
 *  alta embaixo). `itens`: [{ valor, rotulo }]. */
/** ATUALIZADO (28/08) — suporte a `destaque` (borda dourada), usado no
 *  KPI da proposta recomendada no Dashboard Financeiro. */
function blocoKpis(itens) {
  const cards = itens
    .map((i) => `<div class="kpi-card${i.destaque ? ' destaque' : ''}"><div class="kpi-valor${i.destaque ? ' destaque' : ''}">${escapeHtml(i.valor)}</div><div class="kpi-rotulo${i.destaque ? ' destaque' : ''}">${escapeHtml(i.rotulo)}</div></div>`)
    .join('')
  return `<div class="kpi-linha">${cards}</div>`
}

/** NOVO (28/08) — classifica o impacto sem carga negativa: só "economia"
 *  quando o valor é de fato menor; valor maior vira "investimento",
 *  nunca tratado como perda (pedido explícito do usuário — cliente
 *  pode estar buscando melhoria de qualidade, não economia). */
function classificarImpacto(impactoMensal) {
  if (impactoMensal == null) return null
  if (impactoMensal < 0) return 'economia'
  if (impactoMensal > 0) return 'investimento'
  return 'igual'
}

/** NOVO (28/08) — KPIs do Dashboard Financeiro. */
function montarKpisFinanceiro(totalCenarioAtual, propostasSelecionadas) {
  const itens = []
  if (totalCenarioAtual.totalMensal != null) itens.push({ valor: formatarMoeda(totalCenarioAtual.totalMensal), rotulo: 'Custo atual' })

  if (totalCenarioAtual.totalMensal != null) {
    const comEconomia = propostasSelecionadas.filter((p) => p.valorMensalCalculado != null && p.valorMensalCalculado < totalCenarioAtual.totalMensal)
    if (comEconomia.length) {
      const melhor = comEconomia.reduce((min, p) => (p.valorMensalCalculado < min.valorMensalCalculado ? p : min))
      itens.push({ valor: `${formatarMoeda(totalCenarioAtual.totalMensal - melhor.valorMensalCalculado)}/mês`, rotulo: 'Melhor economia' })
    }
  }

  const recomendada = propostasSelecionadas.find((p) => p.papel_selecao === 'recomendada')
  if (recomendada) itens.push({ valor: recomendada.plano ?? recomendada.operadora_nome ?? '—', rotulo: 'Recomendada', destaque: true })

  return itens
}

/** NOVO (28/08) — cards de impacto financeiro por proposta, mesmo
 *  padrão visual do Essencial (estudoEssencialPdfService.js). Reaproveita
 *  `p.comparativo` (já calculado em `calcularComparativo`, estudoFinanceiroService.js)
 *  em vez de recalcular impacto mensal/anual. */
function montarCardsImpacto(totalCenarioAtual, propostasSelecionadas) {
  const comImpacto = propostasSelecionadas.filter((p) => p.comparativo?.impactoMensal != null)
  if (!comImpacto.length) return ''
  return `<div class="impacto-grid">${comImpacto
    .map((p) => {
      const impactoMensal = p.comparativo.impactoMensal
      const tipo = classificarImpacto(impactoMensal)
      const percentual = totalCenarioAtual.totalMensal ? (Math.abs(impactoMensal) / totalCenarioAtual.totalMensal) * 100 : null
      const rotulo = tipo === 'economia' ? '↓ Economia' : tipo === 'investimento' ? '↑ Investimento em melhoria' : '= Mesmo valor'
      return `<div class="impacto-card ${tipo}">
        <div class="impacto-rotulo">${rotulo}</div>
        <div class="impacto-valor">${formatarMoeda(Math.abs(impactoMensal))}/mês</div>
        <div class="impacto-sub">${percentual != null ? `${percentual.toFixed(1)}% ${tipo === 'economia' ? 'mais barato' : 'acima'} · ` : ''}${p.comparativo.impactoAnual != null ? `${formatarMoeda(Math.abs(p.comparativo.impactoAnual))}/ano` : ''}</div>
        <div class="impacto-plano">${escapeHtml(p.plano ?? p.operadora_nome ?? '—')}</div>
      </div>`
    })
    .join('')}</div>`
}

/** NOVO (27/08) — card de plano pro comparativo em grade (mesmo padrão
 *  do Essencial, estudoEssencialPdfService.js — os dois documentos
 *  devem ter a mesma linguagem visual). Dois níveis de destaque:
 *  Cenário Atual (contorno fino, se distingue sem competir) e
 *  Recomendada (hero forte — borda dourada, elevação, selo). */
function montarCardPlano({ tipo, logoUrl, nomePlano, acomodacao, coparticipacao, redeResumo, custoMensal, custoAnual, fontePreco, papel, semCadastro = false }) {
  if (semCadastro) {
    return `<div class="plano-card"><div class="plano-card-nome sub">${escapeHtml(nomePlano)}</div></div>`
  }

  const classes = ['plano-card']
  let selo = ''
  if (tipo === 'atual') {
    classes.push('atual')
    selo = '<div class="selo-atual">Cenário atual</div>'
  } else if (papel === 'recomendada') {
    classes.push('recomendada')
    selo = '<div class="selo-recomendada">⭐ Recomendada</div>'
  }
  const badgePapel = tipo !== 'atual' && papel && papel !== 'recomendada' ? PAPEL_LABEL[papel] : null

  const linhaSe = (rotulo, valor) =>
    valor && valor !== '—' && valor !== 'não informado' ? `<div class="plano-detalhe"><strong>${escapeHtml(rotulo)}:</strong> ${escapeHtml(valor)}</div>` : ''

  return `<div class="${classes.join(' ')}">
    ${selo}
    <div>
      <div class="coluna-logo-caixa">${logoOperadora(logoUrl)}</div>
      <div class="plano-card-nome">${escapeHtml(nomePlano)}</div>
      ${badgePapel ? `<div class="plano-badge-papel">${badgePapel}</div>` : ''}
      ${linhaSe('Acomodação', acomodacao)}
      ${linhaSe('Coparticipação', coparticipacao)}
      ${linhaSe('Rede', redeResumo)}
    </div>
    <div class="plano-preco-box">
      <div class="plano-preco-rotulo">${tipo === 'atual' ? 'Custo atual' : 'Mensal'}</div>
      <div class="plano-preco-valor">${formatarMoeda(custoMensal)}</div>
      ${custoAnual != null ? `<div class="plano-preco-anual">${formatarMoeda(custoAnual)}/ano</div>` : ''}
      ${fontePreco ? `<div class="fonte-preco">${escapeHtml(fontePreco)}</div>` : ''}
    </div>
  </div>`
}

export function gerarHtmlEstudoMercado(dados) {
  const { geradoEm, cliente, corretor, cenarioAtual, totalCenarioAtual, propostasSelecionadas, rede, legenda, regrasIncluidas } = dados

  // NOVO (28/08) — Dashboard Financeiro: gráfico de colunas com chip
  // (nome + percentual) por proposta, mesmo padrão do Essencial.
  // Reaproveita p.comparativo.impactoMensal (já calculado) pra
  // classificar e calcular o percentual.
  const dadosGraficoFinanceiro = [
    { label: 'Atual', valor: totalCenarioAtual.totalMensal ?? 0, tipo: 'atual' },
    ...propostasSelecionadas.map((p) => {
      const impactoMensal = p.comparativo?.impactoMensal ?? null
      const percentual = impactoMensal != null && totalCenarioAtual.totalMensal ? (impactoMensal / totalCenarioAtual.totalMensal) * 100 : null
      return {
        label: p.plano ?? p.operadora_nome ?? '—',
        valor: p.valorMensalCalculado ?? 0,
        percentual,
        tipo: classificarImpacto(impactoMensal),
        destaque: p.papel_selecao === 'recomendada',
      }
    }),
  ].filter((d) => d.valor > 0)

  const graficoCusto = dadosGraficoFinanceiro.length >= 2 ? graficoColunasComChip({ dados: dadosGraficoFinanceiro, formatarValor: formatarMoeda }) : null

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

  // NOVO (27/08) — comparativo de mercado em cards (substitui a
  // tabela), mesmo padrão do Essencial: grid flexível, hero card pra
  // recomendada. Cenário Atual não entra aqui — continua na tabela da
  // seção 02, que já é sua própria listagem (pode ter vários planos
  // vigentes ao mesmo tempo).
  const cardsComparativo = propostasSelecionadas
    .map((p) => montarCardPlano({
      tipo: 'proposta',
      logoUrl: p.logoUrl,
      nomePlano: p.plano ?? p.operadora_nome ?? p.operadora_nome_extraido ?? '—',
      acomodacao: p.acomodacao,
      coparticipacao: p.coparticipacao,
      redeResumo: p.totalPrestadores != null ? `${p.totalPrestadores} prestador${p.totalPrestadores === 1 ? '' : 'es'}` : null,
      custoMensal: p.valorMensalCalculado,
      custoAnual: null,
      fontePreco: p.custoPorVida != null ? `${formatarMoeda(p.custoPorVida)} por vida` : null,
      papel: p.papel_selecao,
    }))
    .join('')

  const linhasCenarioAtual = cenarioAtual
    .map((p) => `
      <tr>
        <td><div class="celula-operadora">${logoOperadora(p.logoUrl)}<div>${escapeHtml(p.operadora_nome ?? p.operadora_nome_livre ?? '—')}</div></div></td>
        <td>${escapeHtml(p.plano ?? '—')}</td>
        <td>${escapeHtml(p.acomodacao ?? '—')}</td>
        <td>${escapeHtml(p.coparticipacao ?? '—')}</td>
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
  /* ATUALIZADO (27/08) — paleta institucional trocada pra bater com o
     novo logo (coração laranja/ciano) — mesmos hex do Essencial e do
     site. Acentos coral/cyan/lime disponíveis pra uso pontual, ainda
     não aplicados em nenhum elemento deste documento. */
  :root {
    --dark: #05191b; --dark-deep: #030f10; --surface: #0d2b2c;
    --primary: #ffbb44; --offwhite: #eeecea;
    --coral: #fb9874; --cyan: #cdfa9a; --lime: #5ff1b3;
    --text: #293A38; --text-soft: #687673; --success: #4A9589;
  }
  /* NOVO (27/08) — numeração de página física via CSS Paged Media.
     Best-effort: renderiza no Chrome/Chromium (motor usado por
     "Salvar como PDF"), sem suporte no Firefox — mesma ressalva já
     aplicada nos fixes de impressão anteriores deste arquivo. Cor em
     hex fixo porque custom properties (var()) têm suporte instável
     dentro de margin boxes de @page. */
  @page {
    margin: 18mm 14mm;
    @bottom-right { content: "Página " counter(page) " de " counter(pages); font-family: 'Inter', Arial, sans-serif; font-size: 9px; color: #687673; }
  }
  /* ATUALIZADO (27/08) — troca de identidade tipográfica: sans-serif
     editorial (Inter) em todo o documento, substituindo a serifada
     (Georgia). Pesos estritos por função: 300 em rótulos/legendas, 500
     em dado de tabela, 700 em valor financeiro — ver comentários nas
     classes abaixo onde cada peso é aplicado. */
  body { font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: var(--text); background: var(--offwhite); max-width: 880px; margin: 0 auto; padding: 0; }
  section { padding: 48px 56px; page-break-after: always; }
  section:last-of-type { page-break-after: auto; }
  h1, h2, h3 { font-weight: 400; letter-spacing: 0.01em; }
  /* ATUALIZADO (28/08) — assume de propósito o enquadramento que a
     margem física de página (@page, ver numeração) já criava: em vez
     de forçar sangramento total, vira um card com acabamento — cantos
     arredondados, borda dourada, sombra sutil (pedido do usuário). */
  .capa { background: var(--dark); color: var(--offwhite); display: flex; flex-direction: column; align-items: flex-start; justify-content: center; min-height: 100vh; border-radius: 18px; border: 2px solid var(--primary); box-shadow: 0 14px 32px rgba(3,15,16,0.22); }
  /* ATUALIZADO (28/08) — capa redesenhada: logo maior no canto oposto
     (topo direito), sem texto "LIFITSEG" solto duplicando o que a
     imagem já traz. Título "Estudo de Mercado" ganha peso de título de
     verdade (30px/700) — nível interno Essencial/Executivo não aparece
     mais pro cliente. */
  .capa-topo { display: flex; justify-content: flex-end; width: 100%; margin-bottom: 30px; }
  .capa-logo { height: 50px; }
  .capa h1 { font-size: 30px; margin: 0 0 10px; font-weight: 700; line-height: 1.2; }
  .capa .tagline { font-size: 13px; color: #9fb0ad; max-width: 400px; line-height: 1.6; margin-bottom: 28px; }
  /* NOVO (28/08) — card de destaque do cliente na capa, mesmo padrão
     visual do quadro do corretor, contorno dourado. */
  /* ATUALIZADO (28/08) — capa deixa de empilhar tudo à esquerda: cliente
     e corretor viram duas colunas lado a lado, usando o espaço vazio à
     direita (achado do usuário — capa parecia "um bloco só, vazia"). */
  .capa-grid { display: flex; gap: 20px; width: 100%; flex-wrap: wrap; }
  .capa-coluna { flex: 1 1 260px; }
  .cliente-quadro { background: var(--surface); border: 1px solid rgba(255,187,68,0.35); border-radius: 12px; padding: 20px 22px; height: 100%; }
  .cliente-cnpj { font-size: 11px; color: #8fa19e; margin-top: 2px; }
  /* NOVO (28/08) — linha de stats na capa (vidas, e futuramente CNPJs/
     validade da proposta quando o dado existir) — layout já preparado
     pra receber mais itens sem redesenhar. */
  .capa-stats { display: flex; gap: 12px; margin-bottom: 22px; }
  .capa-stat { background: var(--surface); border-radius: 10px; padding: 14px 20px; text-align: center; min-width: 90px; }
  .capa-stat-valor { font-size: 20px; font-weight: 700; color: var(--offwhite); }
  .capa-stat-rotulo { font-size: 9px; font-weight: 300; text-transform: uppercase; letter-spacing: 0.08em; color: var(--primary); margin-top: 4px; }
  .cliente-rotulo { font-size: 9px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: #8fa19e; margin-bottom: 6px; }
  .cliente-nome { font-size: 22px; font-weight: 800; color: var(--offwhite); }
  .cliente-data { font-size: 11px; color: #8fa19e; margin-top: 6px; }
  /* NOVO (27/08) — quadro do Perfil do Corretor na capa, contorno
     colorido (não só texto simples, pedido explícito do usuário). */
  .corretor-quadro { border: 1px solid var(--primary); border-radius: 8px; padding: 12px 16px; height: 100%; }
  .corretor-rotulo { font-size: 9.5px; font-weight: 300; letter-spacing: 0.1em; text-transform: uppercase; color: var(--primary); margin-bottom: 5px; }
  .corretor-nome { font-size: 14px; color: var(--offwhite); font-weight: 700; margin-bottom: 2px; }
  .corretor-linha { font-size: 12px; color: #b9c4c2; line-height: 1.5; }
  /* NOVO (26/08) — cabeçalho/rodapé fino repetido por seção. */
  .cabecalho-pagina { display: flex; align-items: center; gap: 10px; font-size: 11px; color: var(--text-soft); text-transform: uppercase; letter-spacing: 0.05em; border-bottom: 1px solid #ddd6c7; padding-bottom: 12px; margin-bottom: 28px; }
  .cabecalho-pagina-logo { height: 18px; }
  .cabecalho-pagina-divisor { width: 1px; height: 14px; background: #ddd6c7; }
  .rodape-pagina { font-size: 9.5px; color: var(--text-soft); text-align: right; margin-top: 32px; padding-top: 10px; border-top: 1px solid #ddd6c7; }
  /* ATUALIZADO (27/08) — peso 300 (light), rótulo de seção não é dado. */
  /* ATUALIZADO (27/08) — trocado texto inteiro em âmbar (baixo
     contraste sobre o off-white) por barra de destaque + texto escuro,
     mesmo padrão do Essencial. */
  h2.titulo-secao { font-size: 12px; font-weight: 700; letter-spacing: 0.15em; text-transform: uppercase; color: var(--dark); margin: 0 0 24px; display: flex; align-items: center; gap: 8px; }
  h2.titulo-secao::before { content: ''; width: 5px; height: 13px; background: var(--primary); display: inline-block; border-radius: 0; }
  /* ATUALIZADO (27/08) — padding robusto (16–24px); segue caixa escura
     sólida da paleta (confirmado: KPI em fundo escuro combina com o
     resto do documento, que é claro). */
  .kpi-linha { display: flex; gap: 14px; margin: 20px 0 28px; }
  .kpi-card { flex: 1; background: var(--dark); border-radius: 8px; padding: 22px 20px; text-align: center; }
  /* NOVO (28/08) — KPI de destaque (proposta recomendada), mesmo padrão do Essencial. */
  .kpi-card.destaque { border: 2px solid var(--primary); }
  .kpi-valor { font-size: 24px; font-weight: 700; color: var(--offwhite); }
  .kpi-valor.destaque { font-size: 15px; color: var(--primary); }
  .kpi-rotulo { font-size: 10px; font-weight: 300; letter-spacing: 0.08em; text-transform: uppercase; color: var(--primary); margin-top: 6px; }
  .kpi-rotulo.destaque { color: var(--primary); }
  .resumo-destaques { display: flex; gap: 16px; margin: 24px 0; }
  .destaque-card { flex: 1; border: 1px solid #ddd6c7; border-radius: 8px; padding: 20px; background: #fff; }
  .destaque-label { display: block; font-size: 11px; font-weight: 300; color: var(--text-soft); text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 6px; }
  .destaque-card strong { font-size: 16px; font-weight: 700; color: var(--dark); }
  .faixa-precos { font-size: 15px; margin: 16px 0; color: var(--text-soft); font-weight: 500; }
  .faixa-precos strong { color: var(--dark); font-size: 20px; font-weight: 700; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  /* ATUALIZADO (27/08) — cabeçalho de tabela: peso semibold + letter-
     spacing mais aberto (diretriz "Clean Modern"), fundo escuro da
     paleta mantido (só a tipografia mudou). */
  th { text-align: left; background: var(--surface); color: var(--offwhite); padding: 10px 12px; font-size: 10px; text-transform: uppercase; letter-spacing: 0.05em; font-weight: 600; }
  /* ATUALIZADO (27/08) — peso 500 (medium) no dado de tabela. */
  td { padding: 11px 12px; border-bottom: 1px solid #e4ded1; font-weight: 500; }
  /* NOVO (26/08) — zebra striping, "tabela estilo sistema". */
  tbody tr:nth-child(even) { background: #f2ede0; }
  td.valor { text-align: right; font-variant-numeric: tabular-nums; font-weight: 700; }
  td .sub { color: var(--text-soft); font-size: 12px; font-weight: 400; }
  /* NOVO (26/08) — wrapper com cantos arredondados + sombra sutil
     ("card de sistema", não planilha) — mesmo padrão do Essencial,
     achado real reportado pelo usuário (tabela parecia Excel). */
  .tabela-comparativa-wrap { border-radius: 10px; overflow: hidden; box-shadow: 0 2px 10px rgba(8,33,36,0.10); border: 1px solid #e4ded1; margin-top: 12px; }
  .tabela-comparativa-wrap table { margin-top: 0; }
  /* REMOVIDO (27/08) — borda vertical entre colunas (td + td) tirava a
     leitura "estilo sistema" pedida na diretriz visual ("Clean
     Modern": zero linha vertical, só horizontal clara). */
  /* Logo + nome da operadora lado a lado, alinhados — antes ficavam
     soltos na mesma célula com <br/> entre texto e imagem. */
  .celula-operadora { display: flex; align-items: center; gap: 10px; }
  /* ATUALIZADO (27/08) — logo maior ("já faz a função de mostrar de
     quem é" — pedido do usuário). */
  .logo-operadora-box { background: #fff; border-radius: 6px; padding: 6px 11px; display: inline-flex; align-items: center; border: 1px solid #e4ded1; flex-shrink: 0; }
  .logo-operadora-img { height: 26px; display: block; }
  .coluna-logo-caixa { height: 40px; display: flex; align-items: center; justify-content: center; margin-bottom: 8px; }
  /* NOVO (27/08) — comparativo em grade de cards escuros sobre página
     off-white, substituindo a tabela (seção 03). Grid flexível — não
     trava em N colunas, reflui sozinho pra qualquer quantidade de
     propostas. Mesmo padrão do Essencial. */
  .comparativo-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 16px; margin-top: 14px; }
  .plano-card { background: var(--surface); border: 1px solid rgba(238,236,234,0.10); border-radius: 10px; padding: 18px 16px; position: relative; display: flex; flex-direction: column; justify-content: space-between; }
  .plano-card-nome { font-size: 12.5px; font-weight: 700; color: var(--offwhite); margin: 4px 0 8px; padding-bottom: 8px; border-bottom: 1px solid rgba(238,236,234,0.12); }
  .plano-card-nome.sub { color: #9fb0ad; font-style: italic; font-weight: 400; border-bottom: none; }
  .plano-detalhe { font-size: 10.5px; color: #b9c4c2; margin-bottom: 4px; }
  .plano-detalhe strong { color: var(--offwhite); font-weight: 500; }
  .plano-badge-papel { font-size: 9px; font-weight: 300; color: var(--primary); text-transform: uppercase; letter-spacing: 0.04em; margin-bottom: 6px; }
  .plano-preco-box { margin-top: 14px; padding-top: 10px; border-top: 1px dashed rgba(238,236,234,0.15); text-align: center; }
  .plano-preco-rotulo { font-size: 8.5px; font-weight: 300; text-transform: uppercase; letter-spacing: 0.05em; color: #8fa19e; }
  .plano-preco-valor { font-size: 17px; font-weight: 700; color: var(--offwhite); font-variant-numeric: tabular-nums; }
  .plano-preco-anual { font-size: 10px; color: #8fa19e; margin-top: 2px; }
  .plano-card .fonte-preco { color: #8fa19e; }
  .plano-card.atual { border: 1px solid var(--success); }
  .selo-atual { position: absolute; top: -9px; left: 14px; background: var(--success); color: #fff; font-size: 7.5px; font-weight: 800; text-transform: uppercase; padding: 2px 8px; border-radius: 8px; letter-spacing: 0.03em; }
  .plano-card.recomendada { border: 2px solid var(--primary); transform: translateY(-4px); box-shadow: 0 10px 24px rgba(3,15,16,0.28); }
  .plano-card.recomendada .plano-card-nome { color: #fff; font-size: 13.5px; }
  .plano-card.recomendada .plano-preco-valor { color: var(--primary); font-size: 19px; }
  .plano-card.recomendada .plano-preco-rotulo { color: var(--primary); }
  .selo-recomendada { position: absolute; top: -11px; left: 50%; transform: translateX(-50%); background: var(--primary); color: var(--dark); font-size: 8px; font-weight: 800; text-transform: uppercase; padding: 3px 11px; border-radius: 8px; white-space: nowrap; letter-spacing: 0.03em; }
  .grafico-bloco { margin: 28px 0; padding: 20px; background: #fff; border-radius: 8px; border: 1px solid #e4ded1; }
  .grafico-titulo { font-size: 12px; color: var(--text-soft); text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 12px; }
  /* NOVO (28/08) — cards de impacto financeiro, mesmo padrão do
     Essencial: economia = lima, investimento = âmbar (nunca vermelho —
     "investimento" não é tratado como perda). */
  .impacto-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: 14px; margin: 20px 0; }
  .impacto-card { background: #fff; border: 1px solid #e4ded1; border-left: 3px solid var(--text-soft); border-radius: 8px; padding: 14px 16px; }
  .impacto-card.economia { border-left-color: var(--lime); }
  .impacto-card.investimento { border-left-color: var(--primary); }
  .impacto-rotulo { font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; margin-bottom: 4px; }
  .impacto-card.economia .impacto-rotulo { color: #3B6D11; }
  .impacto-card.investimento .impacto-rotulo { color: #854F0B; }
  .impacto-valor { font-size: 16px; font-weight: 700; color: var(--dark); }
  .impacto-sub { font-size: 9.5px; color: var(--text-soft); margin-top: 2px; }
  .impacto-plano { font-size: 11px; margin-top: 8px; font-weight: 700; color: var(--dark); }
  .aviso { font-size: 12px; color: var(--text-soft); font-style: italic; background: #f0ece0; border-left: 3px solid var(--primary); padding: 10px 14px; margin: 12px 0; }
  footer.rodape { font-size: 10px; color: var(--text-soft); text-align: center; padding: 16px; }
  .fechamento { background: var(--dark); color: var(--offwhite); text-align: center; display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 60vh; border-radius: 18px; border: 2px solid var(--primary); box-shadow: 0 14px 32px rgba(3,15,16,0.22); }
  .fechamento .logo-lifitseg { height: 50px; margin-bottom: 14px; }
  /* NOVO (28/08) — chamada da tagline no fechamento (pedido do
     usuário) — a imagem do logo não traz mais essa frase embutida. */
  .fechamento-tagline { font-size: 11px; letter-spacing: 0.12em; text-transform: uppercase; color: var(--primary); margin-bottom: 26px; }
  .fechamento .mensagem { font-size: 16px; max-width: 440px; line-height: 1.7; color: #dbe3e1; }
  .fechamento .assinatura { font-size: 12px; letter-spacing: 0.18em; text-transform: uppercase; color: var(--primary); margin-top: 26px; }
  @media print {
    body { background: #fff; }
    .capa { min-height: 100vh; }
    button.no-print { display: none; }
    /* CORRIGIDO (26/08) — mesmo bug do Essencial: Chrome ignora
       background-color/background-image na impressão por padrão. */
    * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
  }
</style>
</head>
<body>
  <button class="no-print" onclick="window.print()" style="position:fixed;top:16px;right:16px;padding:10px 18px;background:#ffbb44;color:#05191b;border:none;border-radius:6px;cursor:pointer;font-weight:600;z-index:10;">🖨️ Imprimir / Salvar como PDF</button>

  <section class="capa">
    <div class="capa-topo">
      <img src="${LOGO_LIFITSEG_ESCURO}" alt="LifitSeg" class="capa-logo" />
    </div>
    <h1>Estudo de Mercado</h1>
    <p class="tagline">Uma análise técnica para encontrar o melhor equilíbrio entre investimento, cobertura e rede.</p>
    ${totalCenarioAtual.totalVidas ? `<div class="capa-stats">
      <div class="capa-stat">
        <div class="capa-stat-valor">${totalCenarioAtual.totalVidas}</div>
        <div class="capa-stat-rotulo">Vidas</div>
      </div>
    </div>` : ''}
    <div class="capa-grid">
      <div class="capa-coluna">
        <div class="cliente-quadro">
          <div class="cliente-rotulo">Estudo preparado para</div>
          <div class="cliente-nome">${escapeHtml(cliente.razao_social)}</div>
          ${cliente.cnpj ? `<div class="cliente-cnpj">CNPJ ${escapeHtml(formatarCnpj(cliente.cnpj))}</div>` : ''}
          <div class="cliente-data">Gerado em ${formatarDataBR(geradoEm.slice(0, 10))}</div>
        </div>
      </div>
      <div class="capa-coluna">
        ${blocoCorretor(corretor)}
      </div>
    </div>
  </section>

  <section>
    ${cabecalhoPagina()}
    <h2 class="titulo-secao">01 • Resumo Executivo</h2>
    <p class="faixa-precos">
      <strong>${propostasSelecionadas.length}</strong> alternativa(s) analisada(s)
      ${menorValor != null && maiorValor != null ? ` — ${formatarMoeda(menorValor)} a ${formatarMoeda(maiorValor)} por mês` : ''}
    </p>
    <div class="resumo-destaques">${blocoDestaques || '<p class="aviso">Nenhuma proposta marcada com papel de destaque ainda — defina na tela de Propostas de Mercado.</p>'}</div>
    ${rodapePagina()}
  </section>

  <section>
    ${cabecalhoPagina()}
    <h2 class="titulo-secao">02 • Cenário Atual</h2>
    ${cenarioAtual.length ? `
    ${blocoKpis([
      { valor: String(totalCenarioAtual.totalVidas), rotulo: 'Vidas' },
      { valor: formatarMoeda(totalCenarioAtual.totalMensal), rotulo: 'Custo mensal atual' },
    ])}
    <div class="tabela-comparativa-wrap"><table>
      <thead><tr><th>Operadora</th><th>Plano</th><th>Acomodação</th><th>Coparticipação</th><th>Vidas</th><th>Mensalidade</th></tr></thead>
      <tbody>${linhasCenarioAtual}</tbody>
    </table></div>
    ` : '<p class="aviso">Cenário atual não cadastrado para esta Cotação.</p>'}
    ${rodapePagina()}
  </section>

  <section>
    ${cabecalhoPagina()}
    <h2 class="titulo-secao">03 • Comparativo de Mercado</h2>
    ${propostasSelecionadas.length ? `<div class="comparativo-grid">${cardsComparativo}</div>` : '<p class="aviso">Nenhuma proposta confirmada ainda.</p>'}
    ${faixasFaltantesGeral ? '<p class="aviso">⚠️ Uma ou mais propostas têm faixa etária sem preço extraído — o valor mensal dessas propostas pode estar subestimado.</p>' : ''}
    ${rodapePagina()}
  </section>

  <section>
    ${cabecalhoPagina()}
    <h2 class="titulo-secao">04 • Financeiro</h2>
    ${blocoKpis(montarKpisFinanceiro(totalCenarioAtual, propostasSelecionadas))}
    ${graficoCusto ? `<div class="grafico-bloco"><div class="grafico-titulo">Custo mensal — atual x propostas</div>${graficoCusto}</div>` : ''}
    ${montarCardsImpacto(totalCenarioAtual, propostasSelecionadas)}
    ${rodapePagina()}
  </section>

  <section>
    ${cabecalhoPagina()}
    <h2 class="titulo-secao">05 • Rede Estratégica</h2>
    ${listaComuns}
    ${listaExclusivos || '<p class="aviso">Sem diferenças de rede identificadas entre as propostas selecionadas, ou rede ainda não processada para este lote.</p>'}
    ${legendaPendente ? '<p class="aviso">Legenda de códigos de atendimento não localizada neste documento — os códigos brutos ficam disponíveis para consulta, sem interpretação automática.</p>' : `
    <table><thead><tr><th>Código</th><th>Significado</th></tr></thead><tbody>${linhasLegenda}</tbody></table>
    `}
    ${rodapePagina()}
  </section>

  ${regrasIncluidas?.length ? `
  <section>
    ${cabecalhoPagina()}
    <h2 class="titulo-secao">06 • Regras Comerciais</h2>
    <p class="aviso">Regras de venda vigentes no momento da geração — não valem pra plano(s) que o cliente já tem ativo hoje (condições desses foram travadas na contratação original).</p>
    <table>
      <thead><tr><th>Operadora</th><th>Tipo</th><th>Descrição</th></tr></thead>
      <tbody>${regrasIncluidas.map((r) => `<tr><td>${escapeHtml(r.operadora)}</td><td>${escapeHtml(r.tipo)}</td><td>${escapeHtml(r.descricao)}</td></tr>`).join('')}</tbody>
    </table>
    ${rodapePagina()}
  </section>
  ` : ''}

  <section>
    ${cabecalhoPagina()}
    <h2 class="titulo-secao">07 • Conclusão</h2>
    <p class="faixa-precos">
      Foram comparadas ${propostasSelecionadas.length} propostas de mercado contra o cenário atual do cliente.
      ${menorValor != null ? `A opção de menor custo mensal é ${formatarMoeda(menorValor)}` : ''}
      ${maiorValor != null && menorValor != null && maiorValor !== menorValor ? `, contra ${formatarMoeda(maiorValor)} na opção de maior custo.` : '.'}
    </p>
    <p class="aviso">Esta síntese é factual, gerada a partir dos dados extraídos e confirmados. Uma leitura consultiva aprofundada (recomendação com justificativa) pode ser gerada separadamente, sob confirmação do corretor.</p>
    ${rodapePagina()}
  </section>

  <section>
    ${cabecalhoPagina()}
    <h2 class="titulo-secao">08 • Notas e Limitações</h2>
    <p class="aviso">Valores e condições são determinados pelas operadoras e podem ser alterados a qualquer momento pela seguradora — este estudo não vincula a prestação do serviço, que se dá apenas na assinatura do contrato.</p>
    <p class="aviso">A rede credenciada exibida é referencial; especialidades e coberturas devem ser confirmadas diretamente com a operadora antes da contratação.</p>
    ${rodapePagina()}
  </section>

  <section class="fechamento">
    <img src="${LOGO_LIFITSEG_ESCURO}" alt="LifitSeg" class="logo-lifitseg" />
    <div class="fechamento-tagline">Inteligência em Saúde e Seguros</div>
    <p class="mensagem">Obrigado pela confiança em construir, junto com você, a melhor decisão sobre o cuidado da sua equipe.</p>
    <div class="assinatura">LifitSeg — Corretora de Seguros</div>
  </section>
</body>
</html>`
}
