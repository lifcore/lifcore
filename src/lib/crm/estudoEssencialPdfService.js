import { graficoBarrasVertical, graficoDivergente } from './graficosSvg'

/**
 * SPEC-003 — Estudo Essencial. Função pura, sem banco — recebe
 * exatamente o formato de `montarDadosEstudoEssencial()`.
 *
 * Regras de apresentação (§15) que este arquivo aplica na hora de
 * desenhar (a parte que depende do documento em si, não só do dado):
 *   - nunca destacar economia sem mostrar a diferença de cobertura que
 *     a acompanha (ver `blocoImpactoComCobertura`);
 *   - nunca cor sozinha como indicador (todo destaque tem símbolo/texto
 *     junto da cor);
 *   - nunca esconder o plano atual quando existir.
 */

function escapeHtml(v) {
  if (v == null) return ''
  return String(v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
}

// NOVO (26/08) — logo da LifitSeg, usado na capa e no fechamento.
// URL fixa (mesmo padrão das operadoras: pasta `public` do site vira
// raiz do domínio) — confirmada com o usuário.
const LOGO_LIFITSEG = 'https://lifitseg.com.br/logo.png'

/** NOVO (26/08) — logo de operadora, pra cabeçalho da tabela
 *  comparativa. Fundo branco fixo (não reaproveita a lógica de chip
 *  claro/escuro do app, pensada pro tema escuro da UI) — o PDF já é
 *  fundo claro (--offwhite), uma caixa branca simples atrás do logo
 *  garante contraste consistente pra qualquer logo, sem precisar saber
 *  se ele foi desenhado pra fundo claro ou escuro. Sem logo cadastrado
 *  (logoUrl null), não quebra nada — só não mostra imagem. */
function logoOperadora(logoUrl) {
  if (!logoUrl) return ''
  return `<div class="logo-operadora-box"><img src="${escapeHtml(logoUrl)}" alt="" class="logo-operadora-img" /></div>`
}

/** NOVO (26/08) — cabeçalho fino repetido no topo de cada seção, mesmo
 *  padrão já aplicado no Executivo (estudoMercadoPdfService.js) — os
 *  dois documentos devem ter a mesma linguagem visual, só o conteúdo
 *  muda. HTML normal repetido, não CSS de impressão `@page` (suporte
 *  inconsistente entre navegadores). */
function cabecalhoPagina() {
  return `<div class="cabecalho-pagina">
    <img src="${LOGO_LIFITSEG}" alt="" class="cabecalho-pagina-logo" />
    <span class="cabecalho-pagina-divisor"></span>
    <span>Estudo de Mercado • Inteligência em Saúde e Seguros</span>
  </div>`
}

/** NOVO (26/08) — rodapé fino repetido no fim de cada seção. Sem número
 *  de página: não dá pra calcular em que página física cada seção cai
 *  depois de impressa. Substitui o antigo <footer> único no fim do
 *  documento. */
function rodapePagina() {
  return `<div class="rodape-pagina">LifitSeg • Documento executivo</div>`
}

/** NOVO (26/08) — linha de KPIs em caixa escura, mesmo padrão do
 *  Executivo. `itens`: [{ valor, rotulo }]. */
function blocoKpis(itens) {
  const cards = itens
    .map((i) => `<div class="kpi-card"><div class="kpi-valor">${escapeHtml(i.valor)}</div><div class="kpi-rotulo">${escapeHtml(i.rotulo)}</div></div>`)
    .join('')
  return `<div class="kpi-linha">${cards}</div>`
}

/** NOVO (27/08) — "quadro com contorno colorido" pro Perfil do Corretor
 *  na capa, pedido explícito do usuário (não queria só texto simples).
 *  Só renderiza os campos que existem — se `corretor` vier vazio/sem
 *  nenhum campo preenchido, não desenha o quadro (evita caixa vazia). */
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
  return v == null ? 'não informado' : v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

const PAPEL_LABEL = { economica: '💰 Melhor custo-benefício', recomendada: '⭐ Recomendada', maior_aderencia: '🏥 Maior aderência', outra: null }

/** Diferença de cobertura entre a coluna Atual e uma proposta — texto curto, nunca só número. */
function diferencaCobertura(atual, proposta) {
  const diffs = []
  if (atual && proposta.acomodacao !== atual.acomodacao) diffs.push(`acomodação muda de "${atual.acomodacao}" para "${proposta.acomodacao}"`)
  if (atual && proposta.coparticipacao !== atual.coparticipacao) diffs.push(`coparticipação muda de "${atual.coparticipacao}" para "${proposta.coparticipacao}"`)
  return diffs.length > 0 ? diffs.join('; ') : 'sem mudança de acomodação ou coparticipação identificada'
}

/** NOVO (27/08) — comparativo em grade de cards, substituindo a tabela
 *  (achado do usuário: tabela "parece Excel" mesmo com zebra striping e
 *  wrapper arredondado). Grid flexível (`auto-fit`/`minmax`) — não é
 *  grid fixo de N colunas, então funciona igual com 2, 3, 5 ou mais
 *  propostas, quebrando linha sozinho. Dois níveis de destaque:
 *   - Cenário Atual: contorno fino + selo discreto (se distingue, sem
 *     competir com a recomendação);
 *   - Recomendada: "hero" forte — borda dourada 2px, leve elevação
 *     (translateY + sombra), selo maior no topo.
 *  Mantém a busca do logo de operadora (`logoOperadora`) exatamente
 *  como já funcionava na tabela — usuário confirmou manter essa
 *  referência visual. */
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
  // badge de texto (economica/maior_aderencia) só pra propostas que não são o hero recomendado
  const badgePapel = tipo !== 'atual' && papel && papel !== 'recomendada' ? PAPEL_LABEL[papel] : null

  // "só mostre o que consta preenchido" — linha some inteira se o dado não veio
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

function montarCardsComparativos(colunaAtual, colunasPropostas) {
  const cardAtual = colunaAtual
    ? montarCardPlano({
        tipo: 'atual', logoUrl: colunaAtual.logoUrl, nomePlano: colunaAtual.plano ?? colunaAtual.operadoraPlano,
        acomodacao: colunaAtual.acomodacao, coparticipacao: colunaAtual.coparticipacao, redeResumo: colunaAtual.redeResumo,
        custoMensal: colunaAtual.custoMensal, custoAnual: colunaAtual.custoAnual, fontePreco: colunaAtual.fontePreco,
      })
    : montarCardPlano({ semCadastro: true, nomePlano: 'Atual (não cadastrado)' })

  const cardsPropostas = colunasPropostas
    .map((c) => montarCardPlano({
      tipo: 'proposta', logoUrl: c.logoUrl, nomePlano: c.plano ?? c.operadoraPlano,
      acomodacao: c.acomodacao, coparticipacao: c.coparticipacao, redeResumo: c.redeResumo,
      custoMensal: c.custoMensal, custoAnual: c.custoAnual, fontePreco: c.fontePreco, papel: c.papel,
    }))
    .join('')

  return `<div class="comparativo-grid">${cardAtual}${cardsPropostas}</div>`
}

/** SPEC-003 §15 — economia/acréscimo nunca aparece sozinho, sempre com a diferença de cobertura ao lado. */
function blocoImpactoComCobertura(colunaAtual, colunasPropostas) {
  if (!colunaAtual || colunaAtual.custoMensal == null) {
    return '<p class="aviso-essencial">Cenário atual sem custo cadastrado — impacto financeiro não pode ser calculado.</p>'
  }
  return colunasPropostas
    .filter((c) => c.custoMensal != null)
    .map((c) => {
      const impactoMensal = c.custoMensal - colunaAtual.custoMensal
      const tipo = impactoMensal < 0 ? 'economia' : impactoMensal > 0 ? 'acrescimo' : 'igual'
      const simbolo = tipo === 'economia' ? '↓' : tipo === 'acrescimo' ? '↑' : '='
      const cor = tipo === 'economia' ? 'var(--success)' : 'var(--primary)'
      return `<div class="impacto-card">
        <div class="impacto-valor" style="color:${cor}">${simbolo} ${formatarMoeda(Math.abs(impactoMensal))}/mês</div>
        <div class="impacto-anual">${formatarMoeda(Math.abs(impactoMensal * 12))}/ano</div>
        <div class="impacto-plano">${escapeHtml(c.operadoraPlano)}</div>
        <div class="impacto-cobertura">${escapeHtml(diferencaCobertura(colunaAtual, c))}</div>
      </div>`
    })
    .join('')
}

function montarPontosAtencao(dados) {
  const pontos = []
  const { colunaAtual, colunasPropostas, prontidao, pontosAtencaoExtras } = dados

  if (prontidao.precisamAtencao.length > 0) {
    pontos.push(`${prontidao.precisamAtencao.length} proposta(s) confirmada(s) ficaram de fora deste Estudo por falta de vínculo com o catálogo ou regra de preço aplicável — revise na tela de Propostas antes de considerar o comparativo completo.`)
  }
  for (const c of colunasPropostas) {
    if (c.statusPrecificacao && c.statusPrecificacao !== 'aplicavel') {
      pontos.push(`${escapeHtml(c.operadoraPlano)}: ${escapeHtml(c.motivoPrecificacao)}`)
    }
    if (c.avisoVinculo) pontos.push(`${escapeHtml(c.operadoraPlano)}: ${escapeHtml(c.avisoVinculo)}`)
  }
  if (!colunaAtual) pontos.push('Cenário atual do cliente não foi cadastrado — comparação apresentada sem referência de partida.')

  // Etapa 5 (21/08) — regras comerciais, quando o corretor marcou
  // "incluir regras" na seleção do Estudo (montarDadosEstudoEssencial,
  // estudoManualDadosService.js). Sem seção própria no Essencial —
  // entram aqui, mesma área já usada pra avisos.
  if (pontosAtencaoExtras?.length) pontos.push(...pontosAtencaoExtras.map((p) => escapeHtml(p)))

  return pontos
}

function montarRecomendacao(dados) {
  const { colunasPropostas } = dados
  const recomendada = colunasPropostas.find((c) => c.papel === 'recomendada')
  const economica = colunasPropostas.find((c) => c.papel === 'economica')
  const destaque = recomendada ?? economica

  if (!destaque) {
    return '<p class="aviso-essencial">Nenhuma proposta foi marcada como recomendada ou econômica — defina o papel de cada proposta na tela de Propostas de Mercado para que a recomendação apareça aqui.</p>'
  }

  return `<p class="recomendacao-texto">A LifitSeg recomenda <strong>${escapeHtml(destaque.operadoraPlano)}</strong>
    ${destaque.custoMensal != null ? `— mensalidade de ${formatarMoeda(destaque.custoMensal)}` : ''}
    ${destaque.motivoPrecificacao ? '' : ', com regra comercial validada no Connect Center'}.</p>
    <p class="aviso-essencial">Esta é uma síntese factual a partir dos dados confirmados nesta Cotação — não substitui uma análise consultiva aprofundada.</p>`
}

export function gerarHtmlEstudoEssencial(dados) {
  const { geradoEm, cliente, corretor, colunaAtual, colunasPropostas, redePorRegiao, prontidao } = dados

  const graficoCusto = colunasPropostas.some((c) => c.custoMensal != null)
    ? graficoBarrasVertical({
        dados: [
          ...(colunaAtual ? [{ label: 'Atual', valor: colunaAtual.custoMensal ?? 0 }] : []),
          ...colunasPropostas.filter((c) => c.custoMensal != null).map((c) => ({ label: c.operadoraPlano, valor: c.custoMensal, destaque: c.papel === 'recomendada' })),
        ],
        formatarValor: formatarMoeda,
      })
    : null

  const blocoRede = redePorRegiao.regioes.length
    ? redePorRegiao.regioes
        .map(
          (r) => `<div class="regiao-bloco">
        <h4>${escapeHtml(r.regiao)}</h4>
        <table class="tabela-rede">
          <thead><tr><th>Prestador</th>${colunasPropostas.map((c) => `<th>${escapeHtml(c.operadoraPlano)}</th>`).join('')}</tr></thead>
          <tbody>
            ${r.prestadores
              .map(
                (p) => `<tr><td>${escapeHtml(p.nome)}</td>${colunasPropostas
                  .map((c) => `<td class="rede-celula">${p.porPlano[c.planoVarianteId] ? `✓ ${escapeHtml(p.porPlano[c.planoVarianteId])}` : '—'}</td>`)
                  .join('')}</tr>`
              )
              .join('')}
          </tbody>
        </table>
      </div>`
        )
        .join('')
    : '<p class="aviso-essencial">Rede não disponível para as propostas deste Estudo — importe a Rede Credenciada da operadora no Connect Center.</p>'

  const pontosAtencao = montarPontosAtencao(dados)

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8" />
<title>Estudo de Mercado — ${escapeHtml(cliente.razao_social)}</title>
<style>
  * { box-sizing: border-box; }
  /* ATUALIZADO (27/08) — paleta institucional trocada pra bater com o
     novo logo (coração laranja/ciano) — hex fornecidos pelo usuário,
     mesmos da paleta do site. Acentos coral/cyan/lime disponíveis pra
     uso pontual (assinatura visual), ainda não aplicados em nenhum
     elemento deste documento. */
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
  body { font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: var(--text); background: var(--offwhite); max-width: 900px; margin: 0 auto; padding: 0; }
  section { padding: 44px 52px; page-break-after: always; }
  section:last-of-type { page-break-after: auto; }
  .capa { background: var(--dark); color: var(--offwhite); display: flex; flex-direction: column; align-items: flex-start; justify-content: center; min-height: 100vh; }
  .capa .marca { font-size: 13px; font-weight: 300; letter-spacing: 0.24em; text-transform: uppercase; color: var(--primary); margin-bottom: 24px; }
  .capa h1 { font-size: 32px; margin: 0 0 12px; font-weight: 400; }
  .capa .tagline { font-size: 14px; color: #b9c4c2; max-width: 460px; line-height: 1.6; margin-bottom: 36px; }
  .capa .meta { font-size: 13px; color: #8fa19e; border-top: 1px solid #24403f; padding-top: 16px; }
  /* NOVO (27/08) — quadro do Perfil do Corretor na capa, contorno
     colorido (não só texto simples, pedido explícito do usuário). */
  .corretor-quadro { margin-top: 20px; border: 1px solid var(--primary); border-radius: 8px; padding: 12px 16px; max-width: 300px; }
  .corretor-rotulo { font-size: 9.5px; font-weight: 300; letter-spacing: 0.1em; text-transform: uppercase; color: var(--primary); margin-bottom: 5px; }
  .corretor-nome { font-size: 14px; color: var(--offwhite); font-weight: 700; margin-bottom: 2px; }
  .corretor-linha { font-size: 12px; color: #b9c4c2; line-height: 1.5; }
  /* ATUALIZADO (27/08) — peso 300 (light), rótulo de seção não é dado. */
  /* ATUALIZADO (27/08) — trocado texto inteiro em âmbar (baixo
     contraste sobre o off-white — achado do usuário: "títulos quase
     não dá pra ver") por barra de destaque + texto escuro, mesmo
     princípio do mockup aprovado. */
  h2.titulo-secao { font-size: 12px; letter-spacing: 0.15em; text-transform: uppercase; color: var(--dark); margin: 0 0 20px; font-weight: 700; display: flex; align-items: center; gap: 8px; }
  h2.titulo-secao::before { content: ''; width: 5px; height: 13px; background: var(--primary); display: inline-block; border-radius: 0; }
  /* NOVO (26/08) — cabeçalho/rodapé fino repetido por seção + KPIs em
     caixa, mesmo padrão do Executivo (estudoMercadoPdfService.js). */
  .cabecalho-pagina { display: flex; align-items: center; gap: 10px; font-size: 11px; color: var(--text-soft); text-transform: uppercase; letter-spacing: 0.05em; border-bottom: 1px solid #ddd6c7; padding-bottom: 12px; margin-bottom: 24px; }
  .cabecalho-pagina-logo { height: 18px; }
  .cabecalho-pagina-divisor { width: 1px; height: 14px; background: #ddd6c7; }
  .rodape-pagina { font-size: 9.5px; color: var(--text-soft); text-align: right; margin-top: 28px; padding-top: 10px; border-top: 1px solid #ddd6c7; }
  /* ATUALIZADO (27/08) — padding robusto (16–24px) pedido na diretriz
     visual; segue caixa escura sólida da paleta (confirmado: KPI em
     fundo escuro combina com o resto do documento, que é claro). */
  .kpi-linha { display: flex; gap: 14px; margin: 16px 0 24px; }
  .kpi-card { flex: 1; background: var(--dark); border-radius: 8px; padding: 20px 18px; text-align: center; }
  .kpi-valor { font-size: 22px; font-weight: 700; color: var(--offwhite); }
  .kpi-rotulo { font-size: 10px; font-weight: 300; letter-spacing: 0.08em; text-transform: uppercase; color: var(--primary); margin-top: 6px; }
  table { width: 100%; border-collapse: collapse; font-size: 12.5px; }
  /* ATUALIZADO (27/08) — cabeçalho de tabela: peso semibold + letter-
     spacing mais aberto (diretriz "Clean Modern"), mesma cor de fundo
     escura da paleta (mantida, só a tipografia mudou). */
  th { text-align: left; background: var(--surface); color: var(--offwhite); padding: 9px 10px; font-size: 10px; text-transform: uppercase; letter-spacing: 0.05em; font-weight: 600; }
  /* ATUALIZADO (27/08) — peso 500 (medium) no dado de tabela, distinto do rótulo (300) e do valor financeiro (700). */
  td { padding: 10px; border-bottom: 1px solid #e4ded1; vertical-align: top; text-align: center; font-weight: 500; }
  td.linha-rotulo { text-align: left; }
  /* NOVO (26/08) — zebra striping, "tabela estilo sistema" — mesmo padrão do Executivo. */
  tbody tr:nth-child(even) { background: #f2ede0; }
  td.vazio { color: #c9c2b0; font-weight: 300; }
  .linha-rotulo { font-weight: 700; color: var(--dark); white-space: nowrap; }
  /* ATUALIZADO (27/08) — linha de custo com leve destaque de fundo
     (mesmo princípio da linha de TOTAL/SUBTOTAL do modelo de
     referência), pra separar visualmente do restante da tabela. */
  .linha-custo td { font-weight: 700; background: rgba(201,164,90,0.10) !important; }
  .linha-custo-anual td { color: var(--text-soft); }
  td.valor { font-variant-numeric: tabular-nums; }
  .fonte-preco { font-size: 10px; color: var(--text-soft); font-weight: 400; margin-top: 2px; }
  .coluna-logo-caixa { height: 40px; display: flex; align-items: center; justify-content: center; margin-bottom: 8px; }
  /* NOVO (27/08) — comparativo em grade de cards escuros sobre página
     off-white, substituindo a tabela. Grid flexível: não trava em N
     colunas, then reflui sozinho pra 2/3/5+ propostas. */
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
  /* Cenário atual: destaque leve — se distingue do grupo sem competir com a recomendação. */
  .plano-card.atual { border: 1px solid var(--success); }
  .selo-atual { position: absolute; top: -9px; left: 14px; background: var(--success); color: #fff; font-size: 7.5px; font-weight: 800; text-transform: uppercase; padding: 2px 8px; border-radius: 8px; letter-spacing: 0.03em; }
  /* Recomendada: destaque forte — "hero card". */
  .plano-card.recomendada { border: 2px solid var(--primary); transform: translateY(-4px); box-shadow: 0 10px 24px rgba(3,15,16,0.28); }
  .plano-card.recomendada .plano-card-nome { color: #fff; font-size: 13.5px; }
  .plano-card.recomendada .plano-preco-valor { color: var(--primary); font-size: 19px; }
  .plano-card.recomendada .plano-preco-rotulo { color: var(--primary); }
  .selo-recomendada { position: absolute; top: -11px; left: 50%; transform: translateX(-50%); background: var(--primary); color: var(--dark); font-size: 8px; font-weight: 800; text-transform: uppercase; padding: 3px 11px; border-radius: 8px; white-space: nowrap; letter-spacing: 0.03em; }
  /* ATUALIZADO (27/08) — padding robusto (16–24px). */
  .impacto-card { display: inline-block; width: 30%; margin: 0 1.5% 16px; padding: 20px; background: #fff; border: 1px solid #e4ded1; border-radius: 8px; vertical-align: top; }
  .impacto-valor { font-size: 18px; font-weight: 700; }
  .impacto-anual { font-size: 12px; color: var(--text-soft); font-weight: 500; }
  .impacto-plano { font-size: 12px; margin-top: 6px; font-weight: 700; }
  .impacto-cobertura { font-size: 11px; color: var(--text-soft); margin-top: 4px; }
  /* ATUALIZADO (27/08) — mesmo efeito de cantos arredondados do
     comparativo, aqui em versão clara (fundo branco + borda verde),
     pedido explícito do usuário pra esta tabela. Peso do subtítulo de
     região aumentado (13px/700) — o usuário reportou títulos/subtítulos
     difíceis de ler. */
  .regiao-bloco { margin-bottom: 20px; border: 1px solid var(--success); border-radius: 10px; overflow: hidden; background: #fff; }
  .regiao-bloco h4 { font-size: 13px; font-weight: 700; color: var(--dark); margin: 0; padding: 12px 14px 8px; }
  .regiao-bloco table { margin: 0; }
  .tabela-rede { font-size: 11.5px; }
  .rede-celula { text-align: center; }
  .aviso-essencial { font-size: 12px; color: var(--text-soft); font-style: italic; background: #f0ece0; border-left: 3px solid var(--primary); padding: 9px 13px; margin: 10px 0; }
  .recomendacao-texto { font-size: 15px; line-height: 1.6; }
  ul.pontos-atencao { padding-left: 18px; font-size: 12.5px; line-height: 1.7; }
  /* NOVO (26/08) — logo da LifitSeg (capa + fechamento) e logo de
     operadora (cabeçalho da tabela comparativa). */
  .capa .logo-lifitseg { height: 40px; margin-bottom: 20px; }
  /* ATUALIZADO (27/08) — logo maior dentro do card ("ele já faz a
     função de mostrar de quem é" — pedido do usuário pra reduzir texto
     redundante e aumentar a imagem). */
  .logo-operadora-box { background: #fff; border-radius: 6px; padding: 6px 12px; display: inline-flex; align-items: center; }
  .logo-operadora-img { height: 28px; display: block; }
  .fechamento { background: var(--dark); color: var(--offwhite); text-align: center; display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 60vh; }
  .fechamento .logo-lifitseg { height: 44px; margin-bottom: 22px; }
  .fechamento .mensagem { font-size: 16px; max-width: 440px; line-height: 1.7; color: #dbe3e1; }
  .fechamento .assinatura { font-size: 12px; letter-spacing: 0.18em; text-transform: uppercase; color: var(--primary); margin-top: 26px; }
  @media print {
    body { background: #fff; }
    button.no-print { display: none; }
    /* CORRIGIDO (26/08) — bug conhecido "PDF sai com fundo em branco":
       o Chrome ignora background-color/background-image na impressão
       por padrão, mesmo com as cores certas na pré-visualização,
       a menos que essa propriedade force a inclusão. Resolve na
       origem, sem depender do usuário lembrar de marcar "Imprimir
       plano de fundo" nas opções do navegador. */
    * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
  }
</style>
</head>
<body>
  <button class="no-print" onclick="window.print()" style="position:fixed;top:16px;right:16px;padding:10px 18px;background:#ffbb44;color:#05191b;border:none;border-radius:6px;cursor:pointer;font-weight:600;z-index:10;">🖨️ Imprimir / Salvar como PDF</button>

  <section class="capa">
    <img src="${LOGO_LIFITSEG}" alt="LifitSeg" class="logo-lifitseg" />
    <div class="marca">LifitSeg</div>
    <h1>Estudo de Mercado — Essencial</h1>
    <p class="tagline">Uma análise objetiva para encontrar o melhor equilíbrio entre investimento, cobertura e rede.</p>
    <div class="meta">Cliente: ${escapeHtml(cliente.razao_social)}<br/>Data: ${new Date(geradoEm).toLocaleDateString('pt-BR')}</div>
    ${blocoCorretor(corretor)}
  </section>

  <section>
    ${cabecalhoPagina()}
    <h2 class="titulo-secao">01 • Resumo Executivo</h2>
    ${blocoKpis([
      { valor: String(colunasPropostas.length), rotulo: 'Propostas comparadas' },
      { valor: colunaAtual?.custoMensal != null ? formatarMoeda(colunaAtual.custoMensal) : '—', rotulo: 'Custo atual' },
    ])}
    ${montarRecomendacao(dados)}
    ${prontidao.precisamAtencao.length > 0 ? `<p class="aviso-essencial">⚠️ ${prontidao.precisamAtencao.length} proposta(s) confirmada(s) não entraram neste comparativo — ver Pontos de Atenção.</p>` : ''}
    ${rodapePagina()}
  </section>

  <section>
    ${cabecalhoPagina()}
    <h2 class="titulo-secao">02 • Comparativo</h2>
    ${montarCardsComparativos(colunaAtual, colunasPropostas)}
    ${rodapePagina()}
  </section>

  <section>
    ${cabecalhoPagina()}
    <h2 class="titulo-secao">03 • Rede Estratégica por Região</h2>
    ${blocoRede}
    <p class="aviso-essencial">${escapeHtml(redePorRegiao.notaValidacao)}</p>
    ${rodapePagina()}
  </section>

  <section>
    ${cabecalhoPagina()}
    <h2 class="titulo-secao">04 • Financeiro</h2>
    ${graficoCusto ? `<div style="margin-bottom:24px;">${graficoCusto}</div>` : ''}
    <div>${blocoImpactoComCobertura(colunaAtual, colunasPropostas)}</div>
    ${rodapePagina()}
  </section>

  <section>
    ${cabecalhoPagina()}
    <h2 class="titulo-secao">05 • Pontos de Atenção</h2>
    ${pontosAtencao.length ? `<ul class="pontos-atencao">${pontosAtencao.map((p) => `<li>${p}</li>`).join('')}</ul>` : '<p class="aviso-essencial">Nenhum ponto de atenção identificado nos dados disponíveis.</p>'}
    ${rodapePagina()}
  </section>

  <section>
    ${cabecalhoPagina()}
    <h2 class="titulo-secao">06 • Observações e Metodologia</h2>
    <p class="aviso-essencial">Valores e condições são de responsabilidade das operadoras e sujeitos a alteração — este estudo não vincula a prestação do serviço, que se dá apenas na assinatura do contrato. Preços refletem a regra comercial vigente no Connect Center no momento da geração; confirme período de vigência com a operadora antes de fechar negócio.</p>
    ${rodapePagina()}
  </section>

  <section class="fechamento">
    <img src="${LOGO_LIFITSEG}" alt="LifitSeg" class="logo-lifitseg" />
    <p class="mensagem">Obrigado pela confiança em construir, junto com você, a melhor decisão sobre o cuidado da sua equipe.</p>
    <div class="assinatura">LifitSeg — Corretora de Seguros</div>
  </section>
</body>
</html>`
}
