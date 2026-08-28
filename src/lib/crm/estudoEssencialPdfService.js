import { graficoColunasComChip } from './graficosSvg'

/**
 * SPEC-003 — Estudo Essencial. Função pura, sem banco — recebe
 * exatamente o formato de `montarDadosEstudoEssencial()`.
 *
 * Regras de apresentação (§15) que este arquivo aplica na hora de
 * desenhar (a parte que depende do documento em si, não só do dado):
 *   - nunca destacar economia sem mostrar a diferença de cobertura que
 *     a acompanha (ver `montarCardsImpacto`);
 *   - nunca cor sozinha como indicador (todo destaque tem símbolo/texto
 *     junto da cor);
 *   - nunca esconder o plano atual quando existir.
 */

function escapeHtml(v) {
  if (v == null) return ''
  return String(v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
}

/** NOVO (28/08) — máscara de CNPJ. Se o valor já vier formatado do
 *  banco (ou fora do padrão de 14 dígitos), mostra como veio — nunca
 *  inventa formatação em cima de dado que não bate com o esperado. */
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
// ATUALIZADO (28/08) — nomenclatura confirmada pelo usuário: logo-esc
// = fundo escuro (capa/fechamento), logo-clr = página clara (demais
// seções) — invertido em relação à suposição anterior.
const LOGO_LIFITSEG_ESCURO = 'https://lifitseg.com.br/logo-esc.png'
const LOGO_LIFITSEG_CLARO = 'https://lifitseg.com.br/logo-clr.png'

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
    <img src="${LOGO_LIFITSEG_CLARO}" alt="" class="cabecalho-pagina-logo" />
    <span class="cabecalho-pagina-divisor"></span>
    <span>Estudo de Mercado • Inteligência em Saúde e Seguros</span>
  </div>`
}

/** NOVO (26/08) — rodapé fino repetido no fim de cada seção. Sem número
 *  de página: não dá pra calcular em que página física cada seção cai
 *  depois de impressa. Substitui o antigo <footer> único no fim do
 *  documento. */
/** ATUALIZADO (28/08) — deixou de repetir "LifitSeg • Documento
 *  executivo" em toda página de conteúdo (achado do usuário: ficava
 *  repetitivo demais com 6-8 seções). Esse texto agora só aparece no
 *  rodapé da capa e no rodapé do fechamento — aqui vira só a linha
 *  divisória fina, sem texto. */
function rodapePagina() {
  return `<div class="rodape-pagina"></div>`
}

/** NOVO (26/08) — linha de KPIs em caixa escura, mesmo padrão do
 *  Executivo. `itens`: [{ valor, rotulo }]. */
/** ATUALIZADO (28/08) — suporte a `destaque` (borda dourada), usado no
 *  KPI da proposta recomendada no Dashboard Financeiro. */
function blocoKpis(itens) {
  const cards = itens
    .map((i) => `<div class="kpi-card${i.destaque ? ' destaque' : ''}"><div class="kpi-valor${i.destaque ? ' destaque' : ''}">${escapeHtml(i.valor)}</div><div class="kpi-rotulo${i.destaque ? ' destaque' : ''}">${escapeHtml(i.rotulo)}</div></div>`)
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

/** NOVO (28/08) — KPIs do Dashboard Financeiro: custo atual, melhor
 *  economia encontrada (se houver alguma proposta mais barata) e o
 *  nome da proposta recomendada em destaque (mesmo padrão visual do
 *  KPI card com borda dourada). */
function montarKpisFinanceiro(colunaAtual, colunasPropostas) {
  const itens = []
  if (colunaAtual?.custoMensal != null) itens.push({ valor: formatarMoeda(colunaAtual.custoMensal), rotulo: 'Custo atual' })

  if (colunaAtual?.custoMensal != null) {
    const comEconomia = colunasPropostas.filter((c) => c.custoMensal != null && c.custoMensal < colunaAtual.custoMensal)
    if (comEconomia.length) {
      const melhor = comEconomia.reduce((min, c) => (c.custoMensal < min.custoMensal ? c : min))
      itens.push({ valor: `${formatarMoeda(colunaAtual.custoMensal - melhor.custoMensal)}/mês`, rotulo: 'Melhor economia' })
    }
  }

  const recomendada = colunasPropostas.find((c) => c.papel === 'recomendada')
  if (recomendada) itens.push({ valor: recomendada.plano ?? recomendada.operadoraPlano, rotulo: 'Recomendada', destaque: true })

  return itens
}

/** SPEC-003 §15 — economia/investimento nunca aparece sozinho, sempre
 *  com a diferença de cobertura ao lado. ATUALIZADO (28/08): cards em
 *  vez de blocos soltos, com percentual e linguagem que não trata
 *  valor maior como perda (ver `classificarImpacto`). */
function montarCardsImpacto(colunaAtual, colunasPropostas) {
  if (!colunaAtual || colunaAtual.custoMensal == null) {
    return '<p class="aviso-essencial">Cenário atual sem custo cadastrado — impacto financeiro não pode ser calculado.</p>'
  }
  return `<div class="impacto-grid">${colunasPropostas
    .filter((c) => c.custoMensal != null)
    .map((c) => {
      const impactoMensal = c.custoMensal - colunaAtual.custoMensal
      const tipo = classificarImpacto(impactoMensal)
      const percentual = colunaAtual.custoMensal ? (Math.abs(impactoMensal) / colunaAtual.custoMensal) * 100 : null
      const rotulo = tipo === 'economia' ? '↓ Economia' : tipo === 'investimento' ? '↑ Investimento em melhoria' : '= Mesmo valor'
      return `<div class="impacto-card ${tipo}">
        <div class="impacto-rotulo">${rotulo}</div>
        <div class="impacto-valor">${formatarMoeda(Math.abs(impactoMensal))}/mês</div>
        <div class="impacto-sub">${percentual != null ? `${percentual.toFixed(1)}% ${tipo === 'economia' ? 'mais barato' : 'acima'} · ` : ''}${formatarMoeda(Math.abs(impactoMensal * 12))}/ano</div>
        <div class="impacto-plano">${escapeHtml(c.plano ?? c.operadoraPlano)}</div>
        <div class="impacto-cobertura">${escapeHtml(diferencaCobertura(colunaAtual, c))}</div>
      </div>`
    })
    .join('')}</div>`
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

  // NOVO (28/08) — Dashboard Financeiro: gráfico de colunas com chip
  // (nome + percentual) por proposta, cor por tipo de impacto, destaque
  // pra recomendada.
  const graficoCusto = colunasPropostas.some((c) => c.custoMensal != null)
    ? graficoColunasComChip({
        dados: [
          ...(colunaAtual?.custoMensal != null ? [{ label: 'Atual', valor: colunaAtual.custoMensal, tipo: 'atual' }] : []),
          ...colunasPropostas
            .filter((c) => c.custoMensal != null)
            .map((c) => {
              const impactoMensal = colunaAtual?.custoMensal != null ? c.custoMensal - colunaAtual.custoMensal : null
              const percentual = impactoMensal != null && colunaAtual.custoMensal ? (impactoMensal / colunaAtual.custoMensal) * 100 : null
              return {
                label: c.plano ?? c.operadoraPlano,
                valor: c.custoMensal,
                percentual,
                tipo: classificarImpacto(impactoMensal),
                destaque: c.papel === 'recomendada',
              }
            }),
        ],
        formatarValor: formatarMoeda,
      })
    : null

  const blocoRede = redePorRegiao.regioes.length
    ? redePorRegiao.regioes
        .map(
          (r) => `<div class="regiao-bloco">
        <div class="regiao-titulo">${escapeHtml(r.regiao)}</div>
        <table class="tabela-rede">
          <thead>
            <tr class="linha-logos">
              <th></th>
              ${colunasPropostas.map((c) => `<th>${logoOperadora(c.logoUrl)}</th>`).join('')}
            </tr>
            <tr>
              <th class="rede-rotulo-prestador">Hospitais e Centros Médicos</th>
              ${colunasPropostas.map((c) => `<th class="rede-nome-plano${c.papel === 'recomendada' ? ' destaque' : ''}">${escapeHtml(c.plano ?? c.operadoraPlano)}</th>`).join('')}
            </tr>
          </thead>
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
  /* ATUALIZADO (28/08) — assume de propósito o enquadramento que a
     margem física de página (@page, ver numeração) já criava: em vez
     de forçar sangramento total, vira um card com acabamento — cantos
     arredondados, borda dourada, sombra sutil (pedido do usuário). */
  /* ATUALIZADO (28/08) — 'justify-content: flex-start' (era 'center'):
     título sobe pro topo em vez de ficar no meio da página, achado do
     usuário ("capa parece vazia" com tudo centralizado verticalmente). */
  .capa { background: var(--dark); color: var(--offwhite); display: flex; flex-direction: column; align-items: flex-start; justify-content: flex-start; min-height: 100vh; border-radius: 18px; border: 2px solid var(--primary); box-shadow: 0 14px 32px rgba(3,15,16,0.22); padding-top: 60px; }
  /* NOVO (28/08) — kicker pequeno acima do título ("Gestão de Saúde"),
     substitui o texto "LIFITSEG" que duplicava o logo. */
  .capa-kicker { font-size: 10px; font-weight: 700; letter-spacing: 0.2em; text-transform: uppercase; color: var(--primary); margin-bottom: 6px; }
  /* NOVO (28/08) — "raio de luz" sob o título: começa sólido e se
     dissolve em degradê até sumir (pedido do usuário). */
  .capa-titulo-linha { height: 3px; width: 280px; margin-top: 10px; border-radius: 2px; background: linear-gradient(to right, var(--primary) 0%, var(--primary) 40%, transparent 100%); }
  /* ATUALIZADO (28/08) — capa redesenhada: logo maior no canto oposto
     (topo direito), sem texto "LIFITSEG" solto duplicando o que a
     imagem já traz. Título "Estudo de Mercado" ganha peso de título de
     verdade (30px/700) em vez de rótulo pequeno — nível interno
     Essencial/Executivo não aparece mais pro cliente. */
  .capa-topo { display: flex; justify-content: flex-end; width: 100%; margin-bottom: 30px; }
  .capa-logo { height: 50px; }
  .capa h1 { font-size: 30px; margin: 0; font-weight: 700; line-height: 1.2; }
  .capa .tagline { font-size: 13px; color: #9fb0ad; max-width: 400px; line-height: 1.6; margin: 18px 0 28px; }
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
  /* ATUALIZADO (27/08) — peso 300 (light), rótulo de seção não é dado. */
  /* ATUALIZADO (27/08) — trocado texto inteiro em âmbar (baixo
     contraste sobre o off-white — achado do usuário: "títulos quase
     não dá pra ver") por barra de destaque + texto escuro, mesmo
     princípio do mockup aprovado. */
  h2.titulo-secao { font-size: 13px; letter-spacing: 0.15em; text-transform: uppercase; color: var(--dark); margin: 0 0 20px; font-weight: 700; display: flex; align-items: center; gap: 8px; }
  h2.titulo-secao::before { content: ''; width: 5px; height: 13px; background: var(--primary); display: inline-block; border-radius: 0; }
  /* NOVO (26/08) — cabeçalho/rodapé fino repetido por seção + KPIs em
     caixa, mesmo padrão do Executivo (estudoMercadoPdfService.js). */
  .cabecalho-pagina { display: flex; align-items: center; gap: 10px; font-size: 11px; color: var(--text-soft); text-transform: uppercase; letter-spacing: 0.05em; border-bottom: 1px solid #ddd6c7; padding-bottom: 12px; margin-bottom: 24px; }
  .cabecalho-pagina-logo { height: 26px; }
  .cabecalho-pagina-divisor { width: 1px; height: 14px; background: #ddd6c7; }
  .rodape-pagina { margin-top: 28px; padding-top: 10px; border-top: 1px solid #ddd6c7; }
  /* NOVO (28/08) — rodapé "LifitSeg • Documento executivo" só existe
     na capa e no fechamento agora; 'margin-top: auto' empurra pro fim
     do card flex, independente de quanto conteúdo tiver acima. */
  .capa-rodape { margin-top: auto; padding-top: 18px; font-size: 11px; color: #8fa19e; }
  .fechamento .capa-rodape { color: #8fa19e; margin-top: 22px; padding-top: 0; }
  /* ATUALIZADO (27/08) — padding robusto (16–24px) pedido na diretriz
     visual; segue caixa escura sólida da paleta (confirmado: KPI em
     fundo escuro combina com o resto do documento, que é claro). */
  .kpi-linha { display: flex; gap: 14px; margin: 16px 0 24px; }
  .kpi-card { flex: 1; background: var(--dark); border-radius: 8px; padding: 20px 18px; text-align: center; }
  /* NOVO (28/08) — KPI de destaque (proposta recomendada no Dashboard Financeiro): borda dourada, mesmo princípio do hero card. */
  .kpi-card.destaque { border: 2px solid var(--primary); }
  .kpi-valor { font-size: 22px; font-weight: 700; color: var(--offwhite); }
  .kpi-valor.destaque { font-size: 15px; color: var(--primary); }
  .kpi-rotulo { font-size: 10px; font-weight: 300; letter-spacing: 0.08em; text-transform: uppercase; color: var(--primary); margin-top: 6px; }
  .kpi-rotulo.destaque { color: var(--primary); }
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
  /* ATUALIZADO (28/08) — cards de impacto financeiro em grid flexível,
     cor por tipo (economia = lima, investimento = âmbar — nunca
     vermelho, "investimento" não é tratado como perda). */
  .impacto-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: 14px; margin-top: 14px; }
  .impacto-card { background: #fff; border: 1px solid #e4ded1; border-left: 3px solid var(--text-soft); border-radius: 8px; padding: 14px 16px; }
  .impacto-card.economia { border-left-color: var(--lime); }
  .impacto-card.investimento { border-left-color: var(--primary); }
  .impacto-rotulo { font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; margin-bottom: 4px; }
  .impacto-card.economia .impacto-rotulo { color: #3B6D11; }
  .impacto-card.investimento .impacto-rotulo { color: #854F0B; }
  .impacto-valor { font-size: 16px; font-weight: 700; color: var(--dark); }
  .impacto-sub { font-size: 9.5px; color: var(--text-soft); margin-top: 2px; }
  .impacto-plano { font-size: 11px; margin-top: 8px; font-weight: 700; color: var(--dark); }
  .impacto-cobertura { font-size: 10px; color: var(--text-soft); margin-top: 3px; }
  /* ATUALIZADO (27/08) — mesmo efeito de cantos arredondados do
     comparativo, aqui em versão clara (fundo branco + borda verde),
     pedido explícito do usuário pra esta tabela. Peso do subtítulo de
     região aumentado (13px/700) — o usuário reportou títulos/subtítulos
     difíceis de ler. */
  /* ATUALIZADO (28/08) — borda dourada (era verde), banner de cidade
     escuro com texto dourado (era h4 simples), linha extra de logos
     das operadoras, cabeçalho só com nome do plano, "Prestador" virou
     "Hospitais e Centros Médicos", destaque em verde-lima reservado
     só pra marcar a coluna do plano recomendado — dourado fica pra
     estrutura/moldura. */
  .regiao-bloco { margin-bottom: 20px; border: 1.5px solid var(--primary); border-radius: 10px; overflow: hidden; background: #fff; }
  .regiao-titulo { background: var(--surface); text-align: center; padding: 10px; font-size: 12px; font-weight: 800; letter-spacing: 0.08em; text-transform: uppercase; color: var(--primary); }
  .regiao-bloco table { margin: 0; }
  /* CORRIGIDO (28/08) — 'text-align: center' explícito (herdava
     'left' da regra genérica de th, causando o desalinhamento entre
     o logo e o nome do plano embaixo, reportado pelo usuário). */
  .linha-logos th { padding: 8px 6px 2px; text-align: center; }
  .rede-rotulo-prestador { text-align: left; }
  .rede-nome-plano { text-align: center; }
  .rede-nome-plano.destaque { color: var(--lime); }
  /* NOVO (28/08) — borda esquerda dourada em cada linha de prestador (tira a sensação de texto solto). */
  .tabela-rede tbody td:first-child { border-left: 3px solid var(--primary); }
  .tabela-rede { font-size: 11.5px; }
  .rede-celula { text-align: center; }
  .aviso-essencial { font-size: 12px; color: var(--text-soft); font-style: italic; background: #f0ece0; border-left: 3px solid var(--primary); padding: 9px 13px; margin: 10px 0; }
  .recomendacao-texto { font-size: 15px; line-height: 1.6; }
  ul.pontos-atencao { padding-left: 18px; font-size: 12.5px; line-height: 1.7; }
  /* NOVO (26/08) — logo da LifitSeg (capa + fechamento) e logo de
     operadora (cabeçalho da tabela comparativa). */
  /* REMOVIDO (28/08) — .capa .logo-lifitseg some, substituído por
     .capa-logo (posicionado no topo direito, ver bloco acima). */
  .fechamento { background: var(--dark); color: var(--offwhite); text-align: center; display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 60vh; border-radius: 18px; border: 2px solid var(--primary); box-shadow: 0 14px 32px rgba(3,15,16,0.22); }
  .fechamento .logo-lifitseg { height: 50px; margin-bottom: 14px; }
  /* NOVO (28/08) — chamada da tagline no fechamento (pedido do
     usuário) — a imagem do logo não traz mais essa frase embutida. */
  .fechamento-tagline { font-size: 11px; letter-spacing: 0.12em; text-transform: uppercase; color: var(--primary); margin-bottom: 26px; }
  .fechamento .mensagem { font-size: 16px; max-width: 440px; line-height: 1.7; color: #dbe3e1; }
  .fechamento .assinatura { font-size: 12px; letter-spacing: 0.18em; text-transform: uppercase; color: var(--primary); margin-top: 26px; }
  /* ATUALIZADO (27/08) — logo maior dentro do card ("ele já faz a
     função de mostrar de quem é" — pedido do usuário pra reduzir texto
     redundante e aumentar a imagem). */
  .logo-operadora-box { background: #fff; border-radius: 6px; padding: 6px 12px; display: inline-flex; align-items: center; }
  .logo-operadora-img { height: 28px; display: block; }
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
    <div class="capa-topo">
      <img src="${LOGO_LIFITSEG_ESCURO}" alt="LifitSeg" class="capa-logo" />
    </div>
    <div class="capa-kicker">Gestão de Saúde</div>
    <h1>Estudo de Mercado</h1>
    <div class="capa-titulo-linha"></div>
    <p class="tagline">Uma análise objetiva para encontrar o melhor equilíbrio entre investimento, cobertura e rede.</p>
    ${colunaAtual?.totalVidas ? `<div class="capa-stats">
      <div class="capa-stat">
        <div class="capa-stat-valor">${colunaAtual.totalVidas}</div>
        <div class="capa-stat-rotulo">Vidas</div>
      </div>
    </div>` : ''}
    <div class="capa-grid">
      <div class="capa-coluna">
        <div class="cliente-quadro">
          <div class="cliente-rotulo">Estudo preparado para</div>
          <div class="cliente-nome">${escapeHtml(cliente.razao_social)}</div>
          ${cliente.cnpj ? `<div class="cliente-cnpj">CNPJ ${escapeHtml(formatarCnpj(cliente.cnpj))}</div>` : ''}
          <div class="cliente-data">Gerado em ${new Date(geradoEm).toLocaleDateString('pt-BR')}</div>
        </div>
      </div>
      <div class="capa-coluna">
        ${blocoCorretor(corretor)}
      </div>
    </div>
    <div class="capa-rodape">LifitSeg • Documento executivo</div>
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
    ${blocoKpis(montarKpisFinanceiro(colunaAtual, colunasPropostas))}
    ${graficoCusto ? `<div style="margin:20px 0;">${graficoCusto}</div>` : ''}
    ${montarCardsImpacto(colunaAtual, colunasPropostas)}
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
    <img src="${LOGO_LIFITSEG_ESCURO}" alt="LifitSeg" class="logo-lifitseg" />
    <div class="fechamento-tagline">Inteligência em Saúde e Seguros</div>
    <p class="mensagem">Obrigado pela confiança em construir, junto com você, a melhor decisão sobre o cuidado da sua equipe.</p>
    <div class="assinatura">LifitSeg — Corretora de Seguros</div>
    <div class="capa-rodape">LifitSeg • Documento executivo</div>
  </section>
</body>
</html>`
}
