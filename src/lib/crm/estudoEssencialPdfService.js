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

function linhaComparativa(rotulo, campo, colunaAtual, colunasPropostas) {
  const celulaAtual = colunaAtual ? escapeHtml(colunaAtual[campo]) : '—'
  const celulasPropostas = colunasPropostas.map((c) => `<td>${escapeHtml(c[campo])}</td>`).join('')
  return `<tr><td class="linha-rotulo">${rotulo}</td><td>${celulaAtual}</td>${celulasPropostas}</tr>`
}

function montarTabelaComparativa(colunaAtual, colunasPropostas) {
  const cabecalhoAtual = colunaAtual
    ? `<th>${logoOperadora(colunaAtual.logoUrl)}<div class="papel-badge">Cenário Atual</div>${escapeHtml(colunaAtual.operadoraPlano)}</th>`
    : `<th class="sub">Atual (não cadastrado)</th>`
  const cabecalhoPropostas = colunasPropostas
    .map((c, i) => {
      const papel = PAPEL_LABEL[c.papel]
      return `<th>${logoOperadora(c.logoUrl)}${papel ? `<div class="papel-badge">${papel}</div>` : ''}${escapeHtml(c.operadoraPlano)}</th>`
    })
    .join('')

  const linhaCusto = `<tr class="linha-custo">
    <td class="linha-rotulo">Custo mensal</td>
    <td>${colunaAtual ? formatarMoeda(colunaAtual.custoMensal) : '—'}</td>
    ${colunasPropostas.map((c) => `<td>${formatarMoeda(c.custoMensal)}${c.fontePreco ? `<div class="fonte-preco">${escapeHtml(c.fontePreco)}</div>` : ''}</td>`).join('')}
  </tr>`

  const linhaCustoAnual = `<tr>
    <td class="linha-rotulo">Custo anual</td>
    <td>${colunaAtual ? formatarMoeda(colunaAtual.custoAnual) : '—'}</td>
    ${colunasPropostas.map((c) => `<td>${formatarMoeda(c.custoAnual)}</td>`).join('')}
  </tr>`

  return `<table class="tabela-comparativa">
    <thead><tr><th></th>${cabecalhoAtual}${cabecalhoPropostas}</tr></thead>
    <tbody>
      ${linhaComparativa('Acomodação', 'acomodacao', colunaAtual, colunasPropostas)}
      ${linhaComparativa('Coparticipação', 'coparticipacao', colunaAtual, colunasPropostas)}
      ${linhaComparativa('Reembolso', 'reembolso', colunaAtual, colunasPropostas)}
      ${linhaComparativa('Carência', 'carencia', colunaAtual, colunasPropostas)}
      ${linhaComparativa('Abrangência', 'abrangencia', colunaAtual, colunasPropostas)}
      ${linhaComparativa('Rede por região', 'redeResumo', colunaAtual, colunasPropostas)}
      ${linhaCusto}
      ${linhaCustoAnual}
    </tbody>
  </table>`
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
  const { geradoEm, cliente, colunaAtual, colunasPropostas, redePorRegiao, prontidao } = dados

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
  :root {
    --dark: #082124; --dark-deep: #041416; --surface: #102D2F;
    --primary: #C9A45A; --offwhite: #F7F4EF;
    --text: #293A38; --text-soft: #687673; --success: #4A9589;
  }
  body { font-family: 'Georgia', 'Times New Roman', serif; color: var(--text); background: var(--offwhite); max-width: 900px; margin: 0 auto; padding: 0; }
  section { padding: 44px 52px; page-break-after: always; }
  section:last-of-type { page-break-after: auto; }
  .capa { background: var(--dark); color: var(--offwhite); display: flex; flex-direction: column; justify-content: center; min-height: 100vh; }
  .capa .marca { font-size: 13px; letter-spacing: 0.24em; text-transform: uppercase; color: var(--primary); margin-bottom: 24px; }
  .capa h1 { font-size: 32px; margin: 0 0 12px; font-weight: 400; }
  .capa .tagline { font-size: 14px; color: #b9c4c2; max-width: 460px; line-height: 1.6; margin-bottom: 36px; }
  .capa .meta { font-size: 13px; color: #8fa19e; border-top: 1px solid #24403f; padding-top: 16px; }
  h2.titulo-secao { font-size: 12px; letter-spacing: 0.2em; text-transform: uppercase; color: var(--primary); margin: 0 0 20px; font-weight: 400; }
  table { width: 100%; border-collapse: collapse; font-size: 12.5px; }
  th { text-align: left; background: var(--surface); color: var(--offwhite); padding: 9px 10px; font-size: 10px; text-transform: uppercase; font-weight: 400; }
  td { padding: 9px 10px; border-bottom: 1px solid #e4ded1; vertical-align: top; }
  .linha-rotulo { font-weight: 700; color: var(--dark); white-space: nowrap; }
  .linha-custo td { font-weight: 700; }
  .fonte-preco { font-size: 10px; color: var(--text-soft); font-weight: 400; margin-top: 2px; }
  .papel-badge { font-size: 10px; color: var(--primary); margin-bottom: 3px; }
  .impacto-card { display: inline-block; width: 30%; margin: 0 1.5% 16px; padding: 14px; background: #fff; border: 1px solid #e4ded1; border-radius: 8px; vertical-align: top; }
  .impacto-valor { font-size: 18px; font-weight: 700; }
  .impacto-anual { font-size: 12px; color: var(--text-soft); }
  .impacto-plano { font-size: 12px; margin-top: 6px; font-weight: 700; }
  .impacto-cobertura { font-size: 11px; color: var(--text-soft); margin-top: 4px; }
  .regiao-bloco { margin-bottom: 20px; }
  .regiao-bloco h4 { font-size: 13px; color: var(--dark); margin: 0 0 8px; }
  .tabela-rede { font-size: 11.5px; }
  .rede-celula { text-align: center; }
  .aviso-essencial { font-size: 12px; color: var(--text-soft); font-style: italic; background: #f0ece0; border-left: 3px solid var(--primary); padding: 9px 13px; margin: 10px 0; }
  .recomendacao-texto { font-size: 15px; line-height: 1.6; }
  ul.pontos-atencao { padding-left: 18px; font-size: 12.5px; line-height: 1.7; }
  footer.rodape { font-size: 10px; color: var(--text-soft); text-align: center; padding: 16px; }
  /* NOVO (26/08) — logo da LifitSeg (capa + fechamento) e logo de
     operadora (cabeçalho da tabela comparativa). */
  .capa .logo-lifitseg { height: 40px; margin-bottom: 20px; }
  .logo-operadora-box { background: #fff; border-radius: 6px; padding: 6px 10px; display: inline-block; margin-bottom: 6px; }
  .logo-operadora-img { height: 22px; display: block; }
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
  <button class="no-print" onclick="window.print()" style="position:fixed;top:16px;right:16px;padding:10px 18px;background:#C9A45A;color:#082124;border:none;border-radius:6px;cursor:pointer;font-weight:600;z-index:10;">🖨️ Imprimir / Salvar como PDF</button>

  <section class="capa">
    <img src="${LOGO_LIFITSEG}" alt="LifitSeg" class="logo-lifitseg" />
    <div class="marca">LifitSeg</div>
    <h1>Estudo de Mercado — Essencial</h1>
    <p class="tagline">Uma análise objetiva para encontrar o melhor equilíbrio entre investimento, cobertura e rede.</p>
    <div class="meta">Cliente: ${escapeHtml(cliente.razao_social)}<br/>Data: ${new Date(geradoEm).toLocaleDateString('pt-BR')}</div>
  </section>

  <section>
    <h2 class="titulo-secao">Resumo Executivo</h2>
    ${montarRecomendacao(dados)}
    ${prontidao.precisamAtencao.length > 0 ? `<p class="aviso-essencial">⚠️ ${prontidao.precisamAtencao.length} proposta(s) confirmada(s) não entraram neste comparativo — ver Pontos de Atenção.</p>` : ''}
  </section>

  <section>
    <h2 class="titulo-secao">Comparativo</h2>
    ${montarTabelaComparativa(colunaAtual, colunasPropostas)}
  </section>

  <section>
    <h2 class="titulo-secao">Rede Estratégica por Região</h2>
    ${blocoRede}
    <p class="aviso-essencial">${escapeHtml(redePorRegiao.notaValidacao)}</p>
  </section>

  <section>
    <h2 class="titulo-secao">Financeiro</h2>
    ${graficoCusto ? `<div style="margin-bottom:24px;">${graficoCusto}</div>` : ''}
    <div>${blocoImpactoComCobertura(colunaAtual, colunasPropostas)}</div>
  </section>

  <section>
    <h2 class="titulo-secao">Pontos de Atenção</h2>
    ${pontosAtencao.length ? `<ul class="pontos-atencao">${pontosAtencao.map((p) => `<li>${p}</li>`).join('')}</ul>` : '<p class="aviso-essencial">Nenhum ponto de atenção identificado nos dados disponíveis.</p>'}
  </section>

  <section>
    <h2 class="titulo-secao">Observações e Metodologia</h2>
    <p class="aviso-essencial">Valores e condições são de responsabilidade das operadoras e sujeitos a alteração — este estudo não vincula a prestação do serviço, que se dá apenas na assinatura do contrato. Preços refletem a regra comercial vigente no Connect Center no momento da geração; confirme período de vigência com a operadora antes de fechar negócio.</p>
  </section>

  <section class="fechamento">
    <img src="${LOGO_LIFITSEG}" alt="LifitSeg" class="logo-lifitseg" />
    <p class="mensagem">Obrigado pela confiança em construir, junto com você, a melhor decisão sobre o cuidado da sua equipe.</p>
    <div class="assinatura">LifitSeg — Corretora de Seguros</div>
  </section>

  <footer class="rodape">LifitSeg — Estudo de Mercado (Essencial) gerado em ${new Date(geradoEm).toLocaleDateString('pt-BR')}, a partir de dados confirmados pelo corretor responsável.</footer>
</body>
</html>`
}
