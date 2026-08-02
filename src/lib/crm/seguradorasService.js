import { operacional } from '../supabaseSchemas'

/** Lista todas as seguradoras cadastradas, com seus gestores por módulo */
export async function listarSeguradoras() {
  const { data, error } = await operacional
    .from('seguradoras')
    .select('*, seguradora_gestores(*)')
    .order('nome_fantasia', { ascending: true })
  if (error) throw new Error(`Erro ao listar seguradoras: ${error.message}`)
  return data ?? []
}

/** Busca uma seguradora específica, com seus gestores por módulo */
export async function obterSeguradora(id) {
  const { data, error } = await operacional
    .from('seguradoras')
    .select('*, seguradora_gestores(*)')
    .eq('id', id)
    .single()
  if (error) throw new Error(`Erro ao buscar seguradora: ${error.message}`)
  return data
}

/** Cria uma nova seguradora */
export async function criarSeguradora({ organizacaoId, nomeFantasia, razaoSocial, cnpj, site, observacoes }) {
  const { data, error } = await operacional
    .from('seguradoras')
    .insert({
      organizacao_id: organizacaoId,
      nome_fantasia: nomeFantasia,
      razao_social: razaoSocial || null,
      cnpj: cnpj || null,
      site: site || null,
      observacoes: observacoes || null,
    })
    .select()
    .single()
  if (error) throw new Error(`Erro ao criar seguradora: ${error.message}`)
  return data
}

/** Atualiza dados cadastrais de uma seguradora */
export async function atualizarSeguradora(id, dados) {
  const { error } = await operacional
    .from('seguradoras')
    .update({ ...dados, atualizado_em: new Date().toISOString() })
    .eq('id', id)
  if (error) throw new Error(`Erro ao atualizar seguradora: ${error.message}`)
}

/** Inativa uma seguradora (não exclui, preserva histórico de conexões vinculadas) */
export async function inativarSeguradora(id) {
  await atualizarSeguradora(id, { ativo: false })
}

/** Reativa uma seguradora */
export async function reativarSeguradora(id) {
  await atualizarSeguradora(id, { ativo: true })
}

/** Exclui definitivamente uma seguradora (uso em fase de testes — gestores
 * vinculados são removidos em cascata; falha se houver conexao_operadora
 * já vinculada a ela via seguradora_id) */
export async function excluirSeguradora(id) {
  const { error } = await operacional.from('seguradoras').delete().eq('id', id)
  if (error) throw new Error(`Erro ao excluir seguradora: ${error.message}`)
}

/** Cria ou atualiza o gestor de um módulo específico (1 por módulo, por seguradora) */
export async function upsertGestorModulo({ seguradoraId, modulo, nome, telefone, whatsapp, email, observacoes }) {
  const { data, error } = await operacional
    .from('seguradora_gestores')
    .upsert(
      {
        seguradora_id: seguradoraId,
        modulo,
        nome: nome || null,
        telefone: telefone || null,
        whatsapp: whatsapp || null,
        email: email || null,
        observacoes: observacoes || null,
        atualizado_em: new Date().toISOString(),
      },
      { onConflict: 'seguradora_id,modulo' }
    )
    .select()
    .single()
  if (error) throw new Error(`Erro ao salvar gestor: ${error.message}`)
  return data
}

/** Remove o gestor de um módulo específico */
export async function excluirGestorModulo(id) {
  const { error } = await operacional.from('seguradora_gestores').delete().eq('id', id)
  if (error) throw new Error(`Erro ao excluir gestor: ${error.message}`)
}