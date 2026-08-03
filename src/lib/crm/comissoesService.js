import { operacional, institucional } from '../supabaseSchemas'
import { listarAuditoria } from '../governanca/governancaService'

/**
 * Finance Center v3 — Livro-razão de Comissões
 *
 * Não calcula comissão automaticamente. Cada registro é lançado
 * manualmente com o valor já apurado. Ajustes financeiros são eventos
 * separados (nunca sobrescrevem o valor original), garantindo
 * rastreabilidade completa de qualquer correção.
 *
 * Sprint Apólice → Comissão v1: registros também podem nascer como
 * "sugeridos" (status_confirmacao = 'sugerida'), gerados automaticamente
 * quando uma Venda Nova é lançada num Workspace. Um registro sugerido
 * nunca tem valor de comissão definido pelo sistema — apenas sinaliza
 * que existe algo a confirmar, até um humano preencher valor/percentual
 * reais e confirmar.
 */

const CAMPOS_ORDENAVEIS = ['created_at', 'valor_comissao', 'data_prevista_recebimento', 'data_recebimento']

/** Lista comissões com filtros, busca textual, ordenação e paginação */
export async function listarComissoes({
  operadoraId,
  modulo,
  corretorId,
  apoliceId,
  statusRecebimento,
  statusRepasse,
  periodoInicio,
  periodoFim,
  busca,
  ordenarPor = 'created_at',
  ordemAscendente = false,
  pagina = 1,
  tamanhoPagina = 20,
} = {}) {
  const campoOrdenacao = CAMPOS_ORDENAVEIS.includes(ordenarPor) ? ordenarPor : 'created_at'

  let query = operacional
    .from('comissoes')
    .select(
      '*, apolice:apolices(id, produto, premio, criado_em)',
      { count: 'exact' }
    )
    .order(campoOrdenacao, { ascending: ordemAscendente })

  if (operadoraId) query = query.eq('operadora_id', operadoraId)
  if (modulo) query = query.eq('modulo', modulo)
  if (corretorId) query = query.eq('corretor_id', corretorId)
  if (apoliceId) query = query.eq('apolice_id', apoliceId)
  if (statusRecebimento) query = query.eq('status_recebimento', statusRecebimento)
  if (statusRepasse) query = query.eq('status_repasse', statusRepasse)
  if (periodoInicio) query = query.gte('created_at', periodoInicio)
  if (periodoFim) query = query.lte('created_at', `${periodoFim}T23:59:59`)
  if (busca) query = query.or(`observacoes.ilike.%${busca}%,detalhes_calculo.ilike.%${busca}%,forma_pagamento.ilike.%${busca}%`)

  const inicio = (pagina - 1) * tamanhoPagina
  const fim = inicio + tamanhoPagina - 1
  query = query.range(inicio, fim)

  const { data, error, count } = await query
  if (error) throw new Error(`Erro ao listar comissões: ${error.message}`)

  const linhas = await anexarNomesOperadoras(data ?? [])
  return { linhas, total: count ?? 0, pagina, tamanhoPagina }
}

/**
 * institucional.operadoras não pode ser embutida diretamente no select
 * de operacional.comissoes — o PostgREST não resolve relacionamento
 * entre schemas diferentes (testado e confirmado quebrado). Por isso
 * buscamos os nomes à parte e anexamos manualmente em JS.
 */
async function anexarNomesOperadoras(linhas) {
  const idsUnicos = [...new Set(linhas.map((l) => l.operadora_id).filter(Boolean))]
  if (idsUnicos.length === 0) return linhas.map((l) => ({ ...l, operadora: null }))

  const { data: operadoras, error } = await institucional
    .from('operadoras')
    .select('id, nome')
    .in('id', idsUnicos)
  if (error) throw new Error(`Erro ao buscar nomes de seguradoras: ${error.message}`)

  const nomePorId = Object.fromEntries((operadoras ?? []).map((o) => [o.id, o]))
  return linhas.map((l) => ({ ...l, operadora: l.operadora_id ? (nomePorId[l.operadora_id] ?? null) : null }))
}

/** Busca uma comissão específica, com seus ajustes */
export async function obterComissao(id) {
  const { data, error } = await operacional
    .from('comissoes')
    .select('*, apolice:apolices(id, produto, premio, criado_em)')
    .eq('id', id)
    .single()
  if (error) throw new Error(`Erro ao buscar comissão: ${error.message}`)

  const [comComOperadora] = await anexarNomesOperadoras([data])

  const ajustes = await listarAjustes(id)
  const valorAjustado = Number(data.valor_comissao || 0) + ajustes.reduce((s, a) => s + Number(a.valor_ajuste || 0), 0)

  return { ...comComOperadora, ajustes, valorComissaoAjustado: valorAjustado }
}

/** Lança uma nova comissão no livro-razão (registro manual) */
export async function criarComissao({
  organizacaoId,
  operadoraId,
  apoliceId,
  corretorId,
  modulo,
  valorPremio,
  valorComissao,
  formaPagamento,
  percentualAplicado,
  dataPrevistaRecebimento,
  valorRepasseCorretor,
  detalhesCalculo,
  observacoes,
}) {
  const { data, error } = await operacional
    .from('comissoes')
    .insert({
      organizacao_id: organizacaoId,
      operadora_id: operadoraId || null,
      apolice_id: apoliceId || null,
      corretor_id: corretorId || null,
      modulo,
      valor_premio: valorPremio || null,
      valor_comissao: valorComissao,
      forma_pagamento: formaPagamento || null,
      percentual_aplicado: percentualAplicado || null,
      data_prevista_recebimento: dataPrevistaRecebimento || null,
      valor_repasse_corretor: valorRepasseCorretor || null,
      status_repasse: valorRepasseCorretor ? 'pendente' : 'nao_aplicavel',
      status_confirmacao: 'confirmada',
      detalhes_calculo: detalhesCalculo || null,
      observacoes: observacoes || null,
    })
    .select()
    .single()
  if (error) throw new Error(`Erro ao lançar comissão: ${error.message}`)
  return data
}

/**
 * Gera uma comissão SUGERIDA (Sprint Apólice → Comissão v1) — chamada
 * automaticamente pelo service de cada Workspace (hoje: lifleetService)
 * quando uma apólice é lançada com origem "venda_nova". Nunca define
 * valor de comissão (fica 0, marcado como pendente de confirmação) —
 * quem decide o valor real é sempre um humano, na Fila de Confirmação.
 */
export async function criarComissaoSugerida({ organizacaoId, operadoraId, apoliceId, corretorId, modulo, valorPremio }) {
  const { data, error } = await operacional
    .from('comissoes')
    .insert({
      organizacao_id: organizacaoId,
      operadora_id: operadoraId || null,
      apolice_id: apoliceId || null,
      corretor_id: corretorId || null,
      modulo,
      valor_premio: valorPremio || null,
      valor_comissao: 0,
      status_recebimento: 'pendente',
      status_repasse: 'nao_aplicavel',
      status_confirmacao: 'sugerida',
      observacoes: 'Gerado automaticamente a partir de uma Venda Nova. Aguardando confirmação de valor e percentual.',
    })
    .select()
    .single()
  if (error) throw new Error(`Erro ao gerar sugestão de comissão: ${error.message}`)
  return data
}

/** Lista as comissões sugeridas aguardando confirmação humana (Fila de Confirmação) */
export async function listarComissoesSugeridas() {
  const { data, error } = await operacional
    .from('comissoes')
    .select('*, apolice:apolices(id, produto, premio, criado_em, numero_apolice, nome_cliente)')
    .eq('status_confirmacao', 'sugerida')
    .order('created_at', { ascending: false })
  if (error) throw new Error(`Erro ao listar comissões sugeridas: ${error.message}`)
  return anexarNomesOperadoras(data ?? [])
}

/**
 * Confirma uma comissão sugerida: humano preenche o valor real e o
 * percentual aplicado (que varia por seguradora/produto e não é
 * calculado pelo sistema), e o registro passa a valer como um
 * lançamento normal do Ledger.
 */
export async function confirmarComissaoSugerida(id, { valorComissao, percentualAplicado, formaPagamento, dataPrevistaRecebimento, valorRepasseCorretor, detalhesCalculo }) {
  if (!valorComissao) throw new Error('Informe o valor da comissão para confirmar o lançamento.')
  await atualizarComissao(id, {
    valor_comissao: valorComissao,
    percentual_aplicado: percentualAplicado || null,
    forma_pagamento: formaPagamento || null,
    data_prevista_recebimento: dataPrevistaRecebimento || null,
    valor_repasse_corretor: valorRepasseCorretor || null,
    status_repasse: valorRepasseCorretor ? 'pendente' : 'nao_aplicavel',
    detalhes_calculo: detalhesCalculo || null,
    status_confirmacao: 'confirmada',
  })
}

/**
 * Descarta uma comissão sugerida (ex.: a apólice era renovação/endosso
 * e foi marcada errada, ou não deve mesmo gerar comissão). Reaproveita
 * a exclusão definitiva já existente — sugestão descartada não deixa
 * rastro no Ledger, diferente de uma comissão confirmada e cancelada.
 */
export async function descartarComissaoSugerida(id) {
  await excluirComissao(id)
}

/** Atualiza campos de uma comissão já lançada */
export async function atualizarComissao(id, dados) {
  const { error } = await operacional
    .from('comissoes')
    .update({ ...dados, atualizado_em: new Date().toISOString() })
    .eq('id', id)
  if (error) throw new Error(`Erro ao atualizar comissão: ${error.message}`)
}

/** Marca a comissão como recebida da seguradora, na data informada */
export async function marcarComoRecebida(id, dataRecebimento = new Date().toISOString().slice(0, 10)) {
  await atualizarComissao(id, { status_recebimento: 'recebido', data_recebimento: dataRecebimento })
}

/** Marca o repasse ao corretor como pago, na data informada */
export async function marcarRepasseComoPago(id, dataRepasse = new Date().toISOString().slice(0, 10)) {
  await atualizarComissao(id, { status_repasse: 'pago', data_repasse: dataRepasse })
}

/** Cancela o registro de uma comissão, com motivo obrigatório (rastreabilidade) */
export async function cancelarComissao(id, motivo) {
  if (!motivo?.trim()) throw new Error('Informe o motivo do cancelamento.')
  await atualizarComissao(id, { status_recebimento: 'cancelado', motivo_cancelamento: motivo })
}

/** Exclui definitivamente um lançamento (uso em fase de testes) */
export async function excluirComissao(id) {
  const { error } = await operacional.from('comissoes').delete().eq('id', id)
  if (error) throw new Error(`Erro ao excluir comissão: ${error.message}`)
}

/** Lista os ajustes financeiros de uma comissão */
export async function listarAjustes(comissaoId) {
  const { data, error } = await operacional
    .from('comissao_ajustes')
    .select('*')
    .eq('comissao_id', comissaoId)
    .order('created_at', { ascending: true })
  if (error) throw new Error(`Erro ao listar ajustes: ${error.message}`)
  return data ?? []
}

/** Lança um ajuste financeiro sobre uma comissão já existente (nunca
 * sobrescreve o valor original — evento novo, com motivo, somado no
 * momento da consulta) */
export async function lancarAjuste(comissaoId, valorAjuste, motivo) {
  if (!motivo?.trim()) throw new Error('Informe o motivo do ajuste.')
  const { data, error } = await operacional
    .from('comissao_ajustes')
    .insert({ comissao_id: comissaoId, valor_ajuste: valorAjuste, motivo })
    .select()
    .single()
  if (error) throw new Error(`Erro ao lançar ajuste: ${error.message}`)
  return data
}

/**
 * Lista comissões vinculadas a um conjunto de apólices — usado pelo
 * Report Center pra montar o financeiro de um cliente específico, sem
 * duplicar lógica de consulta (reaproveita o mesmo padrão de
 * anexarNomesOperadoras já usado no resto do service).
 */
export async function listarComissoesPorApolices(apoliceIds) {
  if (!apoliceIds?.length) return []
  const { data, error } = await operacional
    .from('comissoes')
    .select('*')
    .in('apolice_id', apoliceIds)
    .order('created_at', { ascending: false })
  if (error) throw new Error(`Erro ao listar comissões por apólice: ${error.message}`)
  return anexarNomesOperadoras(data ?? [])
}

/**
 * Contas a Receber — fila operacional de lançamentos individuais
 * pendentes, ordenada por urgência (mais atrasado primeiro), com
 * classificação de faixa de atraso calculada em tempo de consulta
 * (0-30 / 31-60 / 61-90 / 90+ dias). Não persiste nada novo — é
 * cálculo puro em cima do que já está no Ledger.
 *
 * Complementar à Conciliação, não redundante: a Conciliação responde
 * "está batendo por seguradora?" (visão agregada); Contas a Receber
 * responde "o que eu preciso cobrar agora, e de quem?" (fila acionável
 * por lançamento).
 */
export async function listarContasAReceber({ operadoraId, modulo } = {}) {
  let query = operacional
    .from('comissoes')
    .select('*')
    .eq('status_recebimento', 'pendente')

  if (operadoraId) query = query.eq('operadora_id', operadoraId)
  if (modulo) query = query.eq('modulo', modulo)

  const { data, error } = await query
  if (error) throw new Error(`Erro ao listar contas a receber: ${error.message}`)

  const comFaixa = calcularDiasEFaixa(data ?? [], 'data_prevista_recebimento', 'diasAtraso')
  const comOperadora = await anexarNomesOperadoras(comFaixa)

  // Urgência: mais atrasado primeiro; entre os não-atrasados, o que
  // vence mais cedo vem primeiro.
  return comOperadora.sort((a, b) => b.diasAtraso - a.diasAtraso)
}

/**
 * Helper compartilhado — calcula "dias desde uma data de referência" e
 * a faixa de atraso correspondente. Usado tanto por Contas a Receber
 * (referência: data prevista de recebimento) quanto por Repasses
 * (referência: data em que a comissão foi recebida). Centraliza aqui
 * pra não duplicar a mesma conta de dias em dois lugares.
 */
function calcularDiasEFaixa(linhas, campoData, nomeCampoDias) {
  const hoje = new Date()
  return linhas.map((l) => {
    let dias = 0
    if (l[campoData]) {
      const referencia = new Date(`${l[campoData]}T00:00:00`)
      dias = Math.floor((hoje - referencia) / (1000 * 60 * 60 * 24))
    }
    return { ...l, [nomeCampoDias]: dias, faixaAtraso: calcularFaixaAtraso(dias) }
  })
}

function calcularFaixaAtraso(diasAtraso) {
  if (diasAtraso <= 0) return null
  if (diasAtraso <= 30) return '0-30'
  if (diasAtraso <= 60) return '31-60'
  if (diasAtraso <= 90) return '61-90'
  return '90+'
}

/** Resumo por faixa de atraso — pra exibir os cards no topo da fila.
 * `campoValor` permite reaproveitar pra Contas a Receber (valor_comissao)
 * e Repasses (valor_repasse_corretor) sem duplicar a função. */
export function resumirPorFaixaAtraso(linhas, campoValor = 'valor_comissao') {
  const faixas = ['0-30', '31-60', '61-90', '90+']
  const resumo = Object.fromEntries(faixas.map((f) => [f, { quantidade: 0, total: 0 }]))
  let semAtrasoQuantidade = 0
  let semAtrasoTotal = 0

  for (const l of linhas) {
    if (l.faixaAtraso) {
      resumo[l.faixaAtraso].quantidade += 1
      resumo[l.faixaAtraso].total += Number(l[campoValor] || 0)
    } else {
      semAtrasoQuantidade += 1
      semAtrasoTotal += Number(l[campoValor] || 0)
    }
  }

  return { porFaixa: resumo, semAtraso: { quantidade: semAtrasoQuantidade, total: semAtrasoTotal } }
}

/**
 * Repasses a Pagar — o outro lado do Ledger: dinheiro que a LifitSeg
 * deve ao corretor (não à seguradora). Mesma arquitetura de Contas a
 * Receber, espelhada: fila individual, faixas calculadas em tempo de
 * consulta, sem persistência nova.
 *
 * Urgência aqui é medida a partir de `data_recebimento` (quando a
 * comissão já foi recebida da seguradora, mas o repasse ainda não foi
 * pago) — repasse que depende de recebimento que ainda não aconteceu
 * fica marcado como "aguardando recebimento", não como atrasado.
 */
export async function listarRepassesAPagar({ corretorId, modulo } = {}) {
  let query = operacional
    .from('comissoes')
    .select('*')
    .eq('status_repasse', 'pendente')

  if (corretorId) query = query.eq('corretor_id', corretorId)
  if (modulo) query = query.eq('modulo', modulo)

  const { data, error } = await query
  if (error) throw new Error(`Erro ao listar repasses a pagar: ${error.message}`)

  const marcados = (data ?? []).map((l) => ({ ...l, aguardandoRecebimento: l.status_recebimento !== 'recebido' }))
  const acionaveis = calcularDiasEFaixa(
    marcados.filter((l) => !l.aguardandoRecebimento),
    'data_recebimento',
    'diasDesdeRecebimento'
  )
  const aguardando = marcados.filter((l) => l.aguardandoRecebimento).map((l) => ({ ...l, diasDesdeRecebimento: null, faixaAtraso: null }))

  const comOperadora = await anexarNomesOperadoras([...acionaveis, ...aguardando])

  // Aguardando recebimento vai pro fim (não é acionável ainda); entre
  // os acionáveis, mais tempo esperando o repasse vem primeiro.
  return comOperadora.sort((a, b) => {
    if (a.aguardandoRecebimento !== b.aguardandoRecebimento) return a.aguardandoRecebimento ? 1 : -1
    return (b.diasDesdeRecebimento ?? 0) - (a.diasDesdeRecebimento ?? 0)
  })
}

/**
 * Indicadores operacionais simples: Previsto, Recebido, Pendente,
 * Repassado, quantidade de lançamentos e últimos registros.
 * Sem gráficos, sem BI — só os totais pedidos.
 */
export async function indicadoresOperacionais({ modulo, operadoraId, periodoInicio, periodoFim } = {}) {
  let query = operacional
    .from('comissoes')
    .select('valor_comissao, status_recebimento, valor_repasse_corretor, status_repasse, created_at')

  if (modulo) query = query.eq('modulo', modulo)
  if (operadoraId) query = query.eq('operadora_id', operadoraId)
  if (periodoInicio) query = query.gte('created_at', periodoInicio)
  if (periodoFim) query = query.lte('created_at', `${periodoFim}T23:59:59`)

  const { data, error } = await query
  if (error) throw new Error(`Erro ao calcular indicadores: ${error.message}`)

  const linhas = data ?? []
  const naoCanceladas = linhas.filter((l) => l.status_recebimento !== 'cancelado')

  const { linhas: ultimos } = await listarComissoes({ modulo, operadoraId, periodoInicio, periodoFim, tamanhoPagina: 5 })

  return {
    totalPrevisto: naoCanceladas.reduce((s, l) => s + Number(l.valor_comissao || 0), 0),
    totalRecebido: linhas.filter((l) => l.status_recebimento === 'recebido').reduce((s, l) => s + Number(l.valor_comissao || 0), 0),
    totalPendente: linhas.filter((l) => l.status_recebimento === 'pendente').reduce((s, l) => s + Number(l.valor_comissao || 0), 0),
    totalRepassado: linhas.filter((l) => l.status_repasse === 'pago').reduce((s, l) => s + Number(l.valor_repasse_corretor || 0), 0),
    quantidadeLancamentos: linhas.length,
    ultimosRegistros: ultimos,
  }
}

/**
 * Conciliação simples: para cada seguradora, compara o total lançado
 * com o total já confirmado como recebido, e sinaliza o que está
 * pendente além da data prevista (a divergência real de atenção).
 * Compara só o que já está no próprio ledger — não importa nenhum
 * dado externo (extrato bancário, etc.), por isso fica 100% interno.
 */
export async function obterConciliacao({ periodoInicio, periodoFim, operadoraId } = {}) {
  let query = operacional
    .from('comissoes')
    .select('operadora_id, valor_comissao, status_recebimento, data_prevista_recebimento, data_recebimento')
    .neq('status_recebimento', 'cancelado')

  if (operadoraId) query = query.eq('operadora_id', operadoraId)
  if (periodoInicio) query = query.gte('created_at', periodoInicio)
  if (periodoFim) query = query.lte('created_at', `${periodoFim}T23:59:59`)

  const { data, error } = await query
  if (error) throw new Error(`Erro ao gerar conciliação: ${error.message}`)

  const hoje = new Date().toISOString().slice(0, 10)
  const linhas = data ?? []
  const porOperadora = {}

  for (const l of linhas) {
    const chave = l.operadora_id ?? 'sem_seguradora'
    if (!porOperadora[chave]) {
      porOperadora[chave] = { operadoraId: l.operadora_id, totalLancado: 0, totalRecebido: 0, totalAtrasado: 0, qtdAtrasados: 0 }
    }
    const bucket = porOperadora[chave]
    bucket.totalLancado += Number(l.valor_comissao || 0)
    if (l.status_recebimento === 'recebido') {
      bucket.totalRecebido += Number(l.valor_comissao || 0)
    } else if (l.status_recebimento === 'pendente' && l.data_prevista_recebimento && l.data_prevista_recebimento < hoje) {
      // Pendente com previsão já vencida — é a divergência real que
      // merece atenção (não é só "ainda não chegou o prazo").
      bucket.totalAtrasado += Number(l.valor_comissao || 0)
      bucket.qtdAtrasados += 1
    }
  }

  const linhasComOperadora = await anexarNomesOperadoras(
    Object.values(porOperadora).map((b) => ({ operadora_id: b.operadoraId, ...b }))
  )

  return linhasComOperadora
    .map((l) => ({ ...l, totalPendenteGeral: l.totalLancado - l.totalRecebido }))
    .sort((a, b) => b.totalAtrasado - a.totalAtrasado)
}

/**
 * Fluxo de caixa previsto: soma direta do que já está cadastrado
 * (data_prevista_recebimento), agrupado por mês, para os próximos N
 * meses. Sem projeção estatística, sem IA — só soma o que já existe.
 */
export async function obterFluxoCaixaPrevisto({ mesesAFrente = 3 } = {}) {
  const hoje = new Date()
  const limite = new Date(hoje.getFullYear(), hoje.getMonth() + mesesAFrente, 1)

  const { data, error } = await operacional
    .from('comissoes')
    .select('valor_comissao, status_recebimento, data_prevista_recebimento')
    .neq('status_recebimento', 'cancelado')
    .not('data_prevista_recebimento', 'is', null)
    .gte('data_prevista_recebimento', hoje.toISOString().slice(0, 10))
    .lt('data_prevista_recebimento', limite.toISOString().slice(0, 10))

  if (error) throw new Error(`Erro ao gerar fluxo de caixa: ${error.message}`)

  const porMes = {}
  for (const l of data ?? []) {
    const mes = l.data_prevista_recebimento.slice(0, 7) // 'YYYY-MM'
    if (!porMes[mes]) porMes[mes] = { mes, totalPrevisto: 0, totalRecebido: 0, totalPendente: 0 }
    const valor = Number(l.valor_comissao || 0)
    porMes[mes].totalPrevisto += valor
    if (l.status_recebimento === 'recebido') porMes[mes].totalRecebido += valor
    else porMes[mes].totalPendente += valor
  }

  return Object.values(porMes).sort((a, b) => a.mes.localeCompare(b.mes))
}

/**
 * Timeline Financeira — histórico completo e rastreável de um
 * lançamento específico, combinando exclusivamente o que já existe:
 * Ajustes (comissao_ajustes) e Auditoria (operacional.auditoria,
 * quando o lançamento já sofreu alguma operação crítica via
 * Governança Master). Nenhum histórico paralelo é criado — é leitura
 * combinada de duas fontes já existentes, ordenada no tempo.
 */
export async function obterHistoricoLancamento(comissaoId) {
  const [ajustes, auditoria] = await Promise.all([
    listarAjustes(comissaoId),
    listarAuditoria({ tabelaAfetada: 'operacional.comissoes', registroId: comissaoId, limite: 50 }),
  ])

  const eventos = [
    ...ajustes.map((a) => ({
      tipo: 'ajuste',
      data: a.created_at,
      descricao: `Ajuste de ${Number(a.valor_ajuste) >= 0 ? '+' : ''}${a.valor_ajuste}`,
      motivo: a.motivo,
    })),
    ...auditoria.map((a) => ({
      tipo: 'auditoria',
      data: a.created_at,
      descricao: `${a.acao} (${a.usuario_papel ?? 'usuário'})`,
      motivo: a.motivo,
    })),
  ]

  return eventos.sort((a, b) => new Date(a.data) - new Date(b.data))
}

/**
 * Pesquisa Global Financeira — localiza lançamentos por Corretor,
 * Seguradora, Apólice (via número), Status, Período ou Valor.
 *
 * LIMITAÇÃO ASSUMIDA E REGISTRADA: busca por "Cliente" e por
 * "Contrato" não está implementada aqui. Motivo: `comissoes` não
 * possui referência direta a cliente (só a apólice, e apólice a
 * corretor/operadora — não confirmei se `apolices` tem
 * `cliente_prospect_id` sem ver o schema real), e não possui
 * `contrato_id` (decisão em espera, já registrada anteriormente —
 * Finance Center só vincula via `apolice_id` por enquanto). Implementar
 * isso às cegas seria arriscar quebrar a busca com suposição de coluna
 * que talvez não exista.
 */
export async function buscarComissoesGlobal({
  corretorId,
  operadoraId,
  numeroApolice,
  statusRecebimento,
  statusRepasse,
  periodoInicio,
  periodoFim,
  valorMinimo,
  valorMaximo,
} = {}) {
  let apoliceIds = null
  if (numeroApolice) {
    const { data: apolicesEncontradas, error: erroApolices } = await operacional
      .from('apolices')
      .select('id')
      .ilike('numero_apolice', `%${numeroApolice}%`)
    if (erroApolices) throw new Error(`Erro ao buscar apólice: ${erroApolices.message}`)
    apoliceIds = (apolicesEncontradas ?? []).map((a) => a.id)
    if (apoliceIds.length === 0) return [] // nenhuma apólice bate, não adianta continuar
  }

  let query = operacional.from('comissoes').select('*').order('created_at', { ascending: false }).limit(100)

  if (corretorId) query = query.eq('corretor_id', corretorId)
  if (operadoraId) query = query.eq('operadora_id', operadoraId)
  if (apoliceIds) query = query.in('apolice_id', apoliceIds)
  if (statusRecebimento) query = query.eq('status_recebimento', statusRecebimento)
  if (statusRepasse) query = query.eq('status_repasse', statusRepasse)
  if (periodoInicio) query = query.gte('created_at', periodoInicio)
  if (periodoFim) query = query.lte('created_at', `${periodoFim}T23:59:59`)
  if (valorMinimo) query = query.gte('valor_comissao', valorMinimo)
  if (valorMaximo) query = query.lte('valor_comissao', valorMaximo)

  const { data, error } = await query
  if (error) throw new Error(`Erro na pesquisa global: ${error.message}`)
  return anexarNomesOperadoras(data ?? [])
}

/**
 * Central de Pendências — consolida, num único lugar, tudo que exige
 * atenção administrativa: recebimentos vencidos/próximos, repasses
 * pendentes/aguardando, lançamentos com dado cadastral incompleto
 * (sem corretor, sem seguradora), e — desde a Sprint Apólice → Comissão
 * v1 — comissões sugeridas automaticamente que aguardam confirmação
 * humana. "Sem gestor" depende do Master Center de Seguradoras
 * (`seguradora_gestores`) — feito como consulta best-effort; se a
 * tabela de gestores não puder ser lida por algum motivo, essa checagem
 * específica é pulada sem quebrar o resto.
 */
export async function obterCentralPendencias({ diasProximos = 7 } = {}) {
  const [contasAReceber, repasses, comissoesSugeridas] = await Promise.all([
    listarContasAReceber(),
    listarRepassesAPagar(),
    listarComissoesSugeridas(),
  ])

  const recebimentosVencidos = contasAReceber.filter((c) => c.faixaAtraso)
  const hoje = new Date().toISOString().slice(0, 10)
  const limiteProximo = new Date(Date.now() + diasProximos * 86400000).toISOString().slice(0, 10)
  const recebimentosProximos = contasAReceber.filter(
    (c) => !c.faixaAtraso && c.data_prevista_recebimento && c.data_prevista_recebimento >= hoje && c.data_prevista_recebimento <= limiteProximo
  )

  const repassesPendentesAgora = repasses.filter((r) => !r.aguardandoRecebimento)
  const repassesAguardando = repasses.filter((r) => r.aguardandoRecebimento)

  const { data: semCorretorData } = await operacional
    .from('comissoes')
    .select('id, valor_comissao')
    .is('corretor_id', null)
    .neq('status_recebimento', 'cancelado')

  const { data: semSeguradoraData } = await operacional
    .from('comissoes')
    .select('id, valor_comissao')
    .is('operadora_id', null)
    .neq('status_recebimento', 'cancelado')

  let semGestor = []
  try {
    const { listarGestoresPorOperadora } = await import('./seguradorasService')
    const paresUnicos = new Map()
    for (const c of [...contasAReceber, ...repasses]) {
      if (c.operadora_id) paresUnicos.set(`${c.operadora_id}|${c.modulo}`, { operadoraId: c.operadora_id, modulo: c.modulo, nomeOperadora: c.operadora?.nome })
    }
    for (const par of paresUnicos.values()) {
      const gestores = await listarGestoresPorOperadora(par.operadoraId)
      const temGestor = gestores.some((g) => g.modulo === par.modulo && (g.whatsapp || g.telefone))
      if (!temGestor) semGestor.push(par)
    }
  } catch {
    // Best-effort: se a checagem de gestor falhar por qualquer motivo,
    // a Central de Pendências continua funcionando sem essa parte.
    semGestor = []
  }

  return {
    recebimentosVencidos,
    recebimentosProximos,
    repassesPendentesAgora,
    repassesAguardando,
    semCorretor: semCorretorData ?? [],
    semSeguradora: semSeguradoraData ?? [],
    semGestor,
    comissoesSugeridas,
  }
}