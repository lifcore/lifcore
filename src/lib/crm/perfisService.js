import { supabase } from '../supabaseClient'
import { operacional } from '../supabaseSchemas'

/** Lista todos os perfis cadastrados (para a tela de gestão em Configurações) */
export async function listarPerfis() {
  const { data, error } = await supabase
    .from('perfis')
    .select('*')
    .order('nome_completo')
  if (error) throw new Error(`Erro ao listar corretores: ${error.message}`)
  return data ?? []
}

/** Atualiza nome/papel/e-mail de exibição de um perfil */
export async function atualizarPerfil(id, dados) {
  const { error } = await supabase
    .from('perfis')
    .update({ ...dados, atualizado_em: new Date().toISOString() })
    .eq('id', id)
  if (error) throw new Error(`Erro ao atualizar corretor: ${error.message}`)
}

/** Desativa o acesso de um corretor — bloqueia login imediatamente, preserva todo o histórico */
export async function desativarPerfil(id) {
  await atualizarPerfil(id, { ativo: false })
}

/** Reativa o acesso de um corretor */
export async function reativarPerfil(id) {
  await atualizarPerfil(id, { ativo: true })
}

/**
 * Transfere em lote TODOS os clientes/prospects de um corretor para
 * outro — usado quando alguém sai da empresa e um novo corretor assume
 * a carteira. Funciona igual para Lifcare e Lifleet (é a mesma tabela).
 */
export async function transferirCarteira(corretorOrigemId, corretorDestinoId) {
  const { data, error } = await operacional
    .from('clientes_prospects')
    .update({ corretor_id: corretorDestinoId })
    .eq('corretor_id', corretorOrigemId)
    .select('id')
  if (error) throw new Error(`Erro ao transferir carteira: ${error.message}`)
  return data?.length ?? 0
}
