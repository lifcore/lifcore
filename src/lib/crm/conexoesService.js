import { operacional } from '../supabaseSchemas'

/** Lista as conexões com operadoras de um módulo específico */
export async function listarConexoesOperadoras(modulo) {
  const { data, error } = await operacional
    .from('conexoes_operadoras')
    .select('*')
    .eq('modulo', modulo)
    .order('nome_operadora', { ascending: true })
  if (error) throw new Error(`Erro ao listar conexões: ${error.message}`)
  return data ?? []
}

/** Cria uma nova conexão com operadora */
export async function criarConexaoOperadora({ organizacaoId, modulo, nomeOperadora, tipoConexao, observacoes }) {
  const { data, error } = await operacional
    .from('conexoes_operadoras')
    .insert({
      organizacao_id: organizacaoId,
      modulo,
      nome_operadora: nomeOperadora,
      tipo_conexao: tipoConexao,
      observacoes: observacoes || null,
    })
    .select()
    .single()
  if (error) throw new Error(`Erro ao criar conexão: ${error.message}`)
  return data
}

/** Atualiza uma conexão existente (status, tipo, observações, marca sincronização) */
export async function atualizarConexaoOperadora(id, dados) {
  const { error } = await operacional
    .from('conexoes_operadoras')
    .update({ ...dados, atualizado_em: new Date().toISOString() })
    .eq('id', id)
  if (error) throw new Error(`Erro ao atualizar conexão: ${error.message}`)
}

/** Marca a conexão como sincronizada agora (uso manual, ao atualizar uma tabela importada) */
export async function marcarSincronizada(id) {
  await atualizarConexaoOperadora(id, { ultima_sincronizacao: new Date().toISOString() })
}

/** Exclui uma conexão */
export async function excluirConexaoOperadora(id) {
  const { error } = await operacional.from('conexoes_operadoras').delete().eq('id', id)
  if (error) throw new Error(`Erro ao excluir conexão: ${error.message}`)
}
