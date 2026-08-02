import { operacional } from '../supabaseSchemas'

/**
 * Finance Center v1 — Livro-razão de Comissões
 *
 * Este service NÃO calcula comissão automaticamente. Cada registro é
 * lançado manualmente com o valor já apurado (a apuração em si varia
 * demais hoje, por seguradora/produto/forma de pagamento, pra travar
 * numa fórmula única — decisão consciente de registrar antes de
 * automatizar).
 */

/** Lista comissões, com filtros opcionais (seguradora, módulo, status de
 * recebimento, status de repasse, período de lançamento) */
export async function listarComissoes({
  modulo,
  statusRecebimento,
  statusRepasse,
  seguradoraId,
  corretorId,
  periodoInicio,
  periodoFim,
} = {}) {
  let query = operacional
    .from('comissoes')
    .select('*, seguradoras(nome_fantasia), apolices(numero_apolice), perfis(nome)')
    .order('created_at', { ascending: false })

  if (modulo) query = query.eq('modulo', modulo)
  if (statusRecebimento) query = query.eq('status_recebimento', statusRecebimento)
  if (statusRepasse) query = query.eq('status_repasse', statusRepasse)
  if (seguradoraId) query = query.eq('seguradora_id', seguradoraId)
  if (corretorId) query = query.eq('corretor_id', corretorId)
  if (periodoInicio) query = query.gte('created_at', periodoInicio)
  if (periodoFim) query = query.lte('created_at', `${periodoFim}T23:59:59`)

  const { data, error } = await query
  if (error) throw new Error(`Erro ao listar comissões: ${error.message}`)
  return data ?? []
}

/** Busca uma comissão específica */
export async function obterComissao(id) {
  const { data, error } = await operacional
    .from('comissoes')
    .select('*, seguradoras(nome_fantasia), apolices(numero_apolice), perfis(nome)')
    .eq('id', id)
    .single()
  if (error) throw new Error(`Erro ao buscar comissão: ${error.message}`)
  return data
}

/** Lança uma nova comissão no livro-razão (registro manual) */
export async function criarComissao({
  organizacaoId,
  seguradoraId,
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
      seguradora_id: seguradoraId || null,
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

/** Cancela o registro de uma comissão (ex: apólice cancelada, comissão estornada) */
export async function cancelarComissao(id) {
  await atualizarComissao(id, { status_recebimento: 'cancelado' })
}

/** Exclui definitivamente um lançamento (uso em fase de testes) */
export async function excluirComissao(id) {
  const { error } = await operacional.from('comissoes').delete().eq('id', id)
  if (error) throw new Error(`Erro ao excluir comissão: ${error.message}`)
}

/**
 * Visão operacional simples do Finance Center v1:
 * - Comissão Prevista: soma de tudo que não foi cancelado (recebido + pendente)
 * - Comissão Recebida: soma do que já foi recebido da seguradora
 * - Comissão Pendente: soma do que ainda não foi recebido
 * - Comissão Repassada: soma do repasse já pago ao corretor
 */
export async function resumoComissoes({ modulo, seguradoraId, periodoInicio, periodoFim } = {}) {
  let query = operacional
    .from('comissoes')
    .select('valor_comissao, status_recebimento, valor_repasse_corretor, status_repasse')

  if (modulo) query = query.eq('modulo', modulo)
  if (seguradoraId) query = query.eq('seguradora_id', seguradoraId)
  if (periodoInicio) query = query.gte('created_at', periodoInicio)
  if (periodoFim) query = query.lte('created_at', `${periodoFim}T23:59:59`)

  const { data, error } = await query
  if (error) throw new Error(`Erro ao calcular resumo: ${error.message}`)

  const linhas = data ?? []
  const naoCanceladas = linhas.filter((l) => l.status_recebimento !== 'cancelado')

  return {
    comissaoPrevista: naoCanceladas.reduce((s, l) => s + Number(l.valor_comissao || 0), 0),
    comissaoRecebida: linhas.filter((l) => l.status_recebimento === 'recebido').reduce((s, l) => s + Number(l.valor_comissao || 0), 0),
    comissaoPendente: linhas.filter((l) => l.status_recebimento === 'pendente').reduce((s, l) => s + Number(l.valor_comissao || 0), 0),
    comissaoRepassada: linhas.filter((l) => l.status_repasse === 'pago').reduce((s, l) => s + Number(l.valor_repasse_corretor || 0), 0),
  }
}