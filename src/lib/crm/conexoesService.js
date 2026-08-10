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

/**
 * Lista TODAS as conexões (qualquer módulo, incluindo as
 * organizacionais com `modulo = NULL` — BMR-002), pra tela única de
 * Conexões do Connect Center (CONNECT-004C). Não faz JOIN com
 * `providers` aqui — essa tabela vive no schema `institucional`,
 * `conexoes_operadoras` vive no `operacional`; cruzar entre schemas
 * diferentes num único `.select()` do Supabase não é garantido, então
 * quem chama isso combina com `providerRegistryService.listarProviders()`
 * no lado do componente, não aqui.
 */
export async function listarTodasConexoes({ direcao } = {}) {
  let query = operacional
    .from('conexoes_operadoras')
    .select('*')
    .order('criado_em', { ascending: false })

  if (direcao) query = query.eq('direcao', direcao)

  const { data, error } = await query
  if (error) throw new Error(`Erro ao listar conexões: ${error.message}`)
  return data ?? []
}

/**
 * Cria uma nova conexão com operadora.
 *
 * `providerId` é OBRIGATÓRIO desde o BMR-003 — mesmo a coluna
 * `provider_id` sendo nullable no banco (só pra preservar o registro
 * de teste antigo, que não tem Provider correspondente no Registry),
 * a aplicação nunca deve criar uma conexão nova sem vínculo real. É
 * validação de camada de aplicação, não de banco — decisão explícita
 * do Chief, pra não travar a evolução do schema por causa de uma
 * regra que pertence ao código.
 */
export async function criarConexaoOperadora({ organizacaoId, modulo, providerId, nomeOperadora, tipoConexao, direcao, observacoes, codigoSucursal, ambiente, configuracoesExtras }) {
  if (!providerId) {
    throw new Error('providerId é obrigatório — toda conexão nova precisa referenciar um Provider real do Provider Registry (BMR-003).')
  }

  const { data, error } = await operacional
    .from('conexoes_operadoras')
    .insert({
      organizacao_id: organizacaoId,
      modulo: modulo || null, // BMR-002: NULL = conexão organizacional, não vinculada a módulo específico
      provider_id: providerId,
      nome_operadora: nomeOperadora,
      tipo_conexao: tipoConexao,
      direcao: direcao || null,
      observacoes: observacoes || null,
      codigo_sucursal: codigoSucursal || null,
      ambiente: ambiente || 'homologacao',
      configuracoes_extras: configuracoesExtras || null,
      // estado_ativacao não é passado aqui de propósito — o banco já
      // grava 'preparado' sozinho (DEFAULT do BMR-003). Forçar o
      // valor aqui duplicaria uma regra que já vive no schema.
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
