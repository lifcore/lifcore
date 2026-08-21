import { operacional } from '../supabaseSchemas'

/**
 * Rascunho persistido do Multicálculo (Sprint 3, Fase 1).
 *
 * Sobrevive a F5 e navegação entre telas. Guarda só o contexto (região
 * + composição de vidas) e as escolhas do corretor (plano_id + texto
 * da segmentação escolhida) — NUNCA preço, nome de plano, rede ou
 * regra. Ao reabrir, quem consome isso busca os planos de novo no
 * motor (`montarCotacaoEstruturada`) e só usa o rascunho pra marcar o
 * que já estava selecionado — evita preço desatualizado e não duplica
 * nenhum dado que o motor já calcula.
 *
 * 1 rascunho por cliente: `cliente_prospect_id` é chave primária,
 * salvar sempre sobrescreve, nunca acumula histórico. Some sozinho
 * quando `criarCotacoesDoMulticalculo` cria as Cotações de verdade.
 *
 * `salvarContextoRascunho` e `salvarSelecoesRascunho` são separadas de
 * propósito — cada uma toca só a própria coluna, nunca sobrescreve a
 * outra. Isso evita que salvar o Passo 1 (contexto) apague seleções já
 * feitas no Passo 2, e vice-versa.
 */

/** Passo 1 — região + composição de vidas. Upsert: cria o rascunho na
 *  primeira vez, atualiza só `contexto` nas seguintes (`selecoes` fica
 *  com o valor já existente, ou o DEFAULT '[]' na criação). */
export async function salvarContextoRascunho({ clienteProspectId, contexto }) {
  if (!clienteProspectId) throw new Error('clienteProspectId é obrigatório para salvar o rascunho.')
  const { error } = await operacional.from('multicalculo_rascunhos').upsert(
    {
      cliente_prospect_id: clienteProspectId,
      contexto,
      atualizado_em: new Date().toISOString(),
    },
    { onConflict: 'cliente_prospect_id' }
  )
  if (error) throw new Error(`Erro ao salvar contexto do rascunho: ${error.message}`)
}

/** Passo 2 — planos e segmentações escolhidas. Sempre `update` (nunca
 *  upsert) — a essa altura o rascunho já existe, criado no Passo 1;
 *  se não existir, é sinal de fluxo quebrado, não deveria inventar
 *  linha nova aqui. */
export async function salvarSelecoesRascunho({ clienteProspectId, selecoes }) {
  if (!clienteProspectId) throw new Error('clienteProspectId é obrigatório para salvar o rascunho.')
  const { error } = await operacional
    .from('multicalculo_rascunhos')
    .update({ selecoes, atualizado_em: new Date().toISOString() })
    .eq('cliente_prospect_id', clienteProspectId)
  if (error) throw new Error(`Erro ao salvar seleções do rascunho: ${error.message}`)
}

/** Busca o rascunho do cliente, se existir. Retorna null se nunca
 *  houve rascunho — não é erro, é o caso normal de cliente novo. */
export async function buscarRascunhoMulticalculo(clienteProspectId) {
  if (!clienteProspectId) return null
  const { data, error } = await operacional
    .from('multicalculo_rascunhos')
    .select('contexto, selecoes, atualizado_em')
    .eq('cliente_prospect_id', clienteProspectId)
    .maybeSingle()
  if (error) throw new Error(`Erro ao buscar rascunho do Multicálculo: ${error.message}`)
  return data
}

/** Apaga o rascunho — chamado só em 1 lugar: logo depois que
 *  `criarCotacoesDoMulticalculo` cria as Cotações de verdade. Nunca
 *  falha alto (rascunho já cumpriu a função nesse ponto; um erro aqui
 *  não deve impedir o corretor de seguir com a Cotação já criada). */
export async function excluirRascunhoMulticalculo(clienteProspectId) {
  if (!clienteProspectId) return
  const { error } = await operacional.from('multicalculo_rascunhos').delete().eq('cliente_prospect_id', clienteProspectId)
  if (error) console.error(`Erro ao excluir rascunho do Multicálculo (não bloqueante): ${error.message}`)
}
