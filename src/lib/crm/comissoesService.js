import { operacional, institucional } from '../supabaseSchemas'

/**
 * Finance Center v3 — Livro-razão de Comissões
 *
 * Não calcula comissão automaticamente. Cada registro é lançado
 * manualmente com o valor já apurado. Ajustes financeiros são eventos
 * separados (nunca sobrescrevem o valor original), garantindo
 * rastreabilidade completa de qualquer correção.
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
      detalhes_calculo: detalhesCalculo || null,
      observacoes: observacoes || null,
    })
    .select()
    .single()
  if (error) throw new Error(`Erro ao lançar comissão: ${error.message}`)
  return data
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