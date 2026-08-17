import { operacional } from '../supabaseSchemas'

/**
 * "Botão de promover pro Cliente" (Raphael, 17/08): alguns clientes
 * estratégicos valem guardar uma cópia de referência do plano fora da
 * Cotação específica que o gerou. Não é a fonte de verdade — a
 * Cotação continua sendo — é uma promoção pontual e explícita.
 */

export async function promoverPropostaParaCliente({ clienteProspectId, propostaEstudo, cotacaoId, observacao, usuarioId }) {
  if (!clienteProspectId) throw new Error('Cliente não identificado.')
  if (!propostaEstudo) throw new Error('Proposta não identificada.')

  const { data, error } = await operacional
    .from('cliente_planos_referencia')
    .insert({
      cliente_prospect_id: clienteProspectId,
      proposta_estudo_id: propostaEstudo.id,
      cotacao_id: cotacaoId ?? null,
      operadora_nome: propostaEstudo.operadora_nome ?? propostaEstudo.operadora_nome_extraido ?? null,
      plano: propostaEstudo.plano ?? null,
      valor_mensal: propostaEstudo.valorMensalCalculado ?? propostaEstudo.valor_total_mensal ?? null,
      observacao: observacao || null,
      promovido_por: usuarioId ?? null,
    })
    .select()
    .single()
  if (error) throw new Error(`Erro ao promover plano para o cliente: ${error.message}`)
  return data
}

export async function listarPlanosReferenciaDoCliente(clienteProspectId) {
  const { data, error } = await operacional
    .from('cliente_planos_referencia')
    .select('*')
    .eq('cliente_prospect_id', clienteProspectId)
    .order('criado_em', { ascending: false })
  if (error) throw new Error(`Erro ao listar planos de referência do cliente: ${error.message}`)
  return data ?? []
}

export async function removerPlanoReferencia(id) {
  const { error } = await operacional.from('cliente_planos_referencia').delete().eq('id', id)
  if (error) throw new Error(`Erro ao remover plano de referência: ${error.message}`)
}
