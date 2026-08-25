import { institucional, operacional } from '../supabaseSchemas'

/**
 * Etapa 5 do plano "Registro Manual + Estudo de Mercado" (21/08) —
 * núcleo de dado compartilhado pelos 2 modelos de PDF (Essencial e
 * Executivo/ex-Premium). Substitui o sistema antigo (propostas_estudo
 * extraídas de PDF importado via lotes_importacao_estudo) — agora lê
 * direto das Cotações que o corretor selecionou nos cards (criadas
 * pelo Multicálculo OU pelo Registro Manual), já com preço calculado
 * de verdade em `itens_cotacao`. Nenhuma extração automática no meio.
 *
 * Import de `institucional` e `operacional` juntos aqui de propósito —
 * `cotacoes`/`itens_cotacao`/`clientes_prospects` vivem em `operacional`,
 * a Biblioteca de Mercado (rede/regras) vive em `institucional`.
 */

/** Busca as Cotações selecionadas pelo corretor nos cards, com os
 *  itens (faixa/quantidade/valor) já embutidos. */
export async function buscarCotacoesParaEstudo(cotacaoIds) {
  if (!cotacaoIds?.length) throw new Error('Nenhuma Cotação selecionada pro Estudo.')
  const { data, error } = await operacional
    .from('cotacoes')
    .select('*, itens_cotacao(*)')
    .in('id', cotacaoIds)
  if (error) throw new Error(`Erro ao buscar Cotações selecionadas: ${error.message}`)
  if (!data?.length) throw new Error('Nenhuma das Cotações selecionadas foi encontrada — pode ter sido excluída nesse meio tempo.')
  return data
}

/** Mesmo cálculo já usado no card de Cotação (ClienteDetailPage.jsx) —
 *  soma quantidade × valor por faixa, nunca o valor unitário puro. */
export function calcularTotaisCotacao(cot) {
  const itens = cot.itens_cotacao ?? []
  const totalMensal = itens.reduce((soma, item) => soma + (item.quantidade_vidas ?? 0) * Number(item.valor ?? 0), 0)
  const totalVidas = itens.reduce((soma, item) => soma + (item.quantidade_vidas ?? 0), 0)
  return { totalMensal, totalAnual: totalMensal * 12, totalVidas }
}

/**
 * Ordem confirmada com o usuário: Cenário Atual (coluna 1) → Recomendada
 * (coluna 2) → resto por valor total crescente. Cliente com mais de 1
 * plano ativo hoje → `atuais` vem com todas as Cotações marcadas,
 * `calcularTotalCombinado` soma o total real do que ele paga hoje.
 */
export function separarAtuaisEPropostas(cotacoesSelecionadas) {
  const atuais = cotacoesSelecionadas.filter((c) => c.eh_cenario_atual)
  const propostas = cotacoesSelecionadas.filter((c) => !c.eh_cenario_atual)

  const recomendada = propostas.find((c) => c.recomendada)
  const outras = propostas
    .filter((c) => !c.recomendada)
    .sort((a, b) => calcularTotaisCotacao(a).totalMensal - calcularTotaisCotacao(b).totalMensal)

  return { atuais, propostasOrdenadas: recomendada ? [recomendada, ...outras] : outras }
}

export function calcularTotalCombinado(cotacoesAtuais) {
  return cotacoesAtuais.reduce(
    (acc, c) => {
      const t = calcularTotaisCotacao(c)
      return { totalMensal: acc.totalMensal + t.totalMensal, totalVidas: acc.totalVidas + t.totalVidas }
    },
    { totalMensal: 0, totalVidas: 0 }
  )
}

/** Rede credenciada do plano vinculado na Biblioteca de Mercado — só
 *  existe quando `plano_biblioteca_id` foi escolhido no Registro Manual
 *  (vínculo opcional, ver CotacaoForm.jsx). Mesmo padrão de consulta já
 *  usado em `montarResumoRede` (motorSmartQuoteService.js). */
export async function buscarRedeDoPlano(planoBibliotecaId) {
  if (!planoBibliotecaId) return []
  const { data, error } = await institucional
    .from('mercado_saude_rede_cobertura')
    .select('codigo_bruto, prestador:prestador_id ( nome, municipio )')
    .eq('plano_id', planoBibliotecaId)
  if (error) throw new Error(`Erro ao buscar rede do plano: ${error.message}`)
  return data ?? []
}

/** Regras da operadora — opt-in explícito (checkbox desmarcado por
 *  padrão), porque regra de venda não vale pro plano que o cliente já
 *  tem ativo (condições dele foram travadas na contratação original,
 *  confirmado com o usuário). */
export async function buscarRegrasDaOperadora(operadoraId) {
  if (!operadoraId) return []
  const { data, error } = await institucional
    .from('mercado_saude_regras')
    .select('tipo, conteudo')
    .eq('operadora_id', operadoraId)
  if (error) throw new Error(`Erro ao buscar regras da operadora: ${error.message}`)
  return data ?? []
}

export async function buscarClienteDoEstudo(clienteProspectId) {
  const { data, error } = await operacional
    .from('clientes_prospects')
    .select('razao_social, cnpj, cpf')
    .eq('id', clienteProspectId)
    .single()
  if (error) throw new Error(`Erro ao buscar cliente: ${error.message}`)
  return data
}

/**
 * Monta `dados` no formato que `gerarHtmlEstudoEssencial` já espera
 * (estudoEssencialPdfService.js — esse arquivo não muda nada, só a
 * fonte do dado). Sem `montarDadosEstudoEssencial` antigo (vivia em
 * `estudoEssencialService.js`, não tive acesso) — reescrito do zero
 * aqui, seguindo exatamente a mesma "forma" que o gerador de HTML lê.
 *
 * Achado (21/08): o Registro Manual (CotacaoForm.jsx) não coleta mais
 * acomodação/coparticipação/reembolso/carência/abrangência como texto
 * livre (esses campos existiam no antigo CenarioAtualForm embutido,
 * removido na Etapa 2) — por isso ficam "—" quando não dá pra derivar
 * do `plano_biblioteca_id` vinculado. Só `acomodacao` dá pra puxar de
 * verdade hoje (existe na Biblioteca de Mercado); os outros ficam como
 * limitação conhecida, registrada aqui — não inventei dado nenhum pra
 * preencher isso.
 */
export async function montarDadosEstudoEssencial({ cotacaoIds, incluirRede = true, incluirRegras = false }) {
  const cotacoesSelecionadas = await buscarCotacoesParaEstudo(cotacaoIds)
  const cliente = await buscarClienteDoEstudo(cotacoesSelecionadas[0].cliente_prospect_id)
  const { atuais, propostasOrdenadas } = separarAtuaisEPropostas(cotacoesSelecionadas)

  async function buscarAcomodacao(planoBibliotecaId) {
    if (!planoBibliotecaId) return '—'
    const { data } = await institucional.from('mercado_saude_planos').select('acomodacao').eq('plano_id', planoBibliotecaId).maybeSingle()
    return data?.acomodacao ?? '—'
  }

  let colunaAtual = null
  if (atuais.length === 1) {
    const c = atuais[0]
    const t = calcularTotaisCotacao(c)
    colunaAtual = {
      operadoraPlano: `${c.operadora_nome_livre}${c.plano ? ' — ' + c.plano : ''}`,
      custoMensal: t.totalMensal,
      custoAnual: t.totalAnual,
      acomodacao: await buscarAcomodacao(c.plano_biblioteca_id),
      coparticipacao: '—',
      reembolso: '—',
      carencia: '—',
      abrangencia: '—',
      redeResumo: '—',
    }
  } else if (atuais.length > 1) {
    const total = calcularTotalCombinado(atuais)
    colunaAtual = {
      operadoraPlano: `${atuais.length} planos combinados (${atuais.map((c) => c.operadora_nome_livre).join(' + ')})`,
      custoMensal: total.totalMensal,
      custoAnual: total.totalMensal * 12,
      acomodacao: '—',
      coparticipacao: '—',
      reembolso: '—',
      carencia: '—',
      abrangencia: '—',
      redeResumo: '—',
    }
  }

  const colunasPropostas = []
  for (const cot of propostasOrdenadas) {
    const t = calcularTotaisCotacao(cot)
    colunasPropostas.push({
      operadoraPlano: `${cot.operadora_nome_livre}${cot.plano ? ' — ' + cot.plano : ''}`,
      papel: cot.recomendada ? 'recomendada' : 'outra',
      custoMensal: t.totalMensal,
      custoAnual: t.totalAnual,
      fontePreco: cot.plano_biblioteca_id ? 'Biblioteca de Mercado' : 'Digitado manualmente',
      acomodacao: await buscarAcomodacao(cot.plano_biblioteca_id),
      coparticipacao: '—',
      reembolso: '—',
      carencia: '—',
      abrangencia: '—',
      redeResumo: '—',
      statusPrecificacao: 'aplicavel',
      motivoPrecificacao: null,
      avisoVinculo: cot.plano_biblioteca_id
        ? null
        : 'Sem vínculo com a Biblioteca de Mercado — preço digitado manualmente, sem rede vinculada.',
      planoVarianteId: cot.plano_biblioteca_id ?? cot.id,
      operadoraId: cot.operadora_id ?? null,
    })
  }

  let redePorRegiao = { regioes: [], notaValidacao: 'Rede não incluída neste Estudo (opção desmarcada na seleção).' }
  if (incluirRede) {
    const porRegiao = {}
    let algumSemVinculo = false
    for (let i = 0; i < propostasOrdenadas.length; i++) {
      const cot = propostasOrdenadas[i]
      const coluna = colunasPropostas[i]
      if (!cot.plano_biblioteca_id) {
        algumSemVinculo = true
        continue
      }
      const rede = await buscarRedeDoPlano(cot.plano_biblioteca_id)
      for (const linha of rede) {
        const regiao = linha.prestador?.municipio ?? 'Não informado'
        const nomePrestador = linha.prestador?.nome ?? linha.codigo_bruto
        if (!porRegiao[regiao]) porRegiao[regiao] = {}
        if (!porRegiao[regiao][nomePrestador]) porRegiao[regiao][nomePrestador] = {}
        porRegiao[regiao][nomePrestador][coluna.planoVarianteId] = 'Credenciado'
      }
    }
    redePorRegiao = {
      regioes: Object.entries(porRegiao).map(([regiao, prestadoresMap]) => ({
        regiao,
        prestadores: Object.entries(prestadoresMap).map(([nome, porPlano]) => ({ nome, porPlano })),
      })),
      notaValidacao: algumSemVinculo
        ? 'Uma ou mais propostas não têm vínculo com a Biblioteca de Mercado — rede não disponível pra elas.'
        : 'Rede extraída da Biblioteca de Mercado, referencial no momento da geração — confirme especialidades e coberturas com a operadora antes da contratação.',
    }
  }

  // Regras (opt-in): sem seção própria no Essencial, entram como pontos
  // de atenção extras — reaproveita a mesma área já usada pra avisos.
  const pontosAtencaoExtras = []
  if (incluirRegras) {
    const operadoraIdsUnicos = [...new Set(colunasPropostas.map((c) => c.operadoraId).filter(Boolean))]
    for (const operadoraId of operadoraIdsUnicos) {
      const regras = await buscarRegrasDaOperadora(operadoraId)
      for (const r of regras) {
        pontosAtencaoExtras.push(`Regra (${r.tipo}): ${r.conteudo?.titulo ?? r.conteudo?.descricao ?? JSON.stringify(r.conteudo)}`)
      }
    }
  }

  return {
    geradoEm: new Date().toISOString(),
    cliente,
    colunaAtual,
    colunasPropostas,
    redePorRegiao,
    prontidao: { prontas: propostasOrdenadas, precisamAtencao: [] },
    pontosAtencaoExtras,
  }
}

/**
 * Monta `dados` no formato que `gerarHtmlEstudoMercado` já espera
 * (estudoMercadoPdfService.js). Mesma ideia do Essencial acima — só a
 * fonte do dado muda, o HTML/visual não é tocado (exceto o texto
 * "Premium" → "Executivo", feito à parte nesse arquivo).
 */
export async function montarDadosEstudoExecutivo({ cotacaoIds, incluirRede = true, incluirRegras = false }) {
  const cotacoesSelecionadas = await buscarCotacoesParaEstudo(cotacaoIds)
  const cliente = await buscarClienteDoEstudo(cotacoesSelecionadas[0].cliente_prospect_id)
  const { atuais, propostasOrdenadas } = separarAtuaisEPropostas(cotacoesSelecionadas)
  const totalCenarioAtual = calcularTotalCombinado(atuais)

  const cenarioAtual = atuais.map((c) => {
    const t = calcularTotaisCotacao(c)
    return {
      operadora_nome: c.operadora_nome_livre,
      operadora_nome_livre: c.operadora_nome_livre,
      plano: c.plano,
      quantidade_vidas_informada: t.totalVidas,
      mensalidade_informada: t.totalMensal,
    }
  })

  const propostasSelecionadas = propostasOrdenadas.map((cot) => {
    const t = calcularTotaisCotacao(cot)
    const impactoMensal = totalCenarioAtual.totalMensal > 0 ? t.totalMensal - totalCenarioAtual.totalMensal : null
    return {
      id: cot.id,
      plano: cot.plano ?? cot.operadora_nome_livre,
      operadora_nome: cot.operadora_nome_livre,
      papel_selecao: cot.recomendada ? 'recomendada' : null,
      valorMensalCalculado: t.totalMensal,
      comparativo: {
        impactoMensal,
        impactoAnual: impactoMensal != null ? impactoMensal * 12 : null,
        tipo: impactoMensal == null ? null : impactoMensal < 0 ? 'economia' : 'acrescimo',
      },
      custoPorVida: t.totalVidas > 0 ? t.totalMensal / t.totalVidas : null,
      faixasFaltantes: [], // Cotação já criada sempre tem preço completo — nunca falta faixa aqui
      planoBibliotecaId: cot.plano_biblioteca_id ?? null,
      operadoraId: cot.operadora_id ?? null,
    }
  })

  let rede = []
  if (incluirRede) {
    for (const p of propostasSelecionadas) {
      if (!p.planoBibliotecaId) continue
      const linhas = await buscarRedeDoPlano(p.planoBibliotecaId)
      for (const linha of linhas) {
        rede.push({ prestador: linha.prestador?.nome ?? linha.codigo_bruto, proposta_estudo_id: p.id })
      }
    }
  }

  // Regras (opt-in) — seção própria no Executivo, ver nota em
  // estudoMercadoPdfService.js (não existia antes, adicionada agora
  // porque o checkbox de regras precisa aparecer em algum lugar real).
  let regrasIncluidas = []
  if (incluirRegras) {
    const operadoraIdsUnicos = [...new Set(propostasSelecionadas.map((p) => p.operadoraId).filter(Boolean))]
    for (const operadoraId of operadoraIdsUnicos) {
      const nomeOperadora = propostasSelecionadas.find((p) => p.operadoraId === operadoraId)?.operadora_nome ?? '—'
      const regras = await buscarRegrasDaOperadora(operadoraId)
      for (const r of regras) {
        regrasIncluidas.push({ operadora: nomeOperadora, tipo: r.tipo, descricao: r.conteudo?.titulo ?? r.conteudo?.descricao ?? JSON.stringify(r.conteudo) })
      }
    }
  }

  return {
    geradoEm: new Date().toISOString(),
    cliente,
    cenarioAtual,
    totalCenarioAtual,
    propostasSelecionadas,
    rede,
    legenda: [], // "legenda de códigos de rede" — sem fonte pra isso no modelo novo, fica vazio (mensagem existente do template já cobre isso com honestidade)
    regrasIncluidas,
  }
}
