import { operacional } from '../supabaseSchemas'

/**
 * Gestor de relacionamento por módulo, por seguradora (Master Center).
 *
 * O CADASTRO da seguradora em si (nome, CNPJ, razão social, site) NÃO
 * mora aqui — vive em `institucional.operadoras`, já usada de verdade
 * pelas Apólices, e é acessada via `apolicesService.js`
 * (listarCatalogoSeguradoras, criarSeguradora, atualizarDadosSeguradora).
 * Este service cuida exclusivamente do gestor por módulo, que é o
 * conceito novo do Master Center — evita duplicar o catálogo de
 * seguradoras num segundo lugar.
 */

/** Lista os gestores de uma seguradora (uma linha por módulo já definido) */
export async function listarGestoresPorOperadora(operadoraId) {
  const { data, error } = await operacional
    .from('seguradora_gestores')
    .select('*')
    .eq('operadora_id', operadoraId)
  if (error) throw new Error(`Erro ao listar gestores: ${error.message}`)
  return data ?? []
}

/** Cria ou atualiza o gestor de um módulo específico (1 por módulo, por seguradora) */
export async function upsertGestorModulo({ operadoraId, modulo, nome, telefone, whatsapp, email, observacoes }) {
  const { data, error } = await operacional
    .from('seguradora_gestores')
    .upsert(
      {
        operadora_id: operadoraId,
        modulo,
        nome: nome || null,
        telefone: telefone || null,
        whatsapp: whatsapp || null,
        email: email || null,
        observacoes: observacoes || null,
        atualizado_em: new Date().toISOString(),
      },
      { onConflict: 'operadora_id,modulo' }
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