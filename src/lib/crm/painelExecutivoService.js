import { operacional } from '../supabaseSchemas'

/**
 * Painel Executivo — agrega dados que já existem em outras tabelas
 * (clientes_prospects, casos) numa visão só. Não duplica nenhuma
 * fonte de dado, só consulta e conta.
 */

const MODULOS = ['saude', 'auto', 'lifsure', 'lishield', 'lifplan']

/** Conta clientes/prospects por módulo e status (exclui inativos) */
export async function contarClientesPorModulo() {
  const { data, error } = await operacional
    .from('clientes_prospects')
    .select('modulo, status')
    .neq('status', 'inativo')
  if (error) throw new Error(`Erro ao contar clientes: ${error.message}`)

  const resultado = {}
  for (const m of MODULOS) resultado[m] = { prospect: 0, em_negociacao: 0, cliente: 0 }
  for (const row of data ?? []) {
    if (resultado[row.modulo] && resultado[row.modulo][row.status] !== undefined) {
      resultado[row.modulo][row.status]++
    }
  }
  return resultado
}

/** Conta demandas (casos) ainda em aberto, no total e por módulo */
export async function contarDemandasAbertas() {
  const { data, error } = await operacional
    .from('casos')
    .select('cliente_prospect_id, clientes_prospects(modulo)')
    .not('situacao', 'in', '(encerrado,resolvido)')
  if (error) throw new Error(`Erro ao contar demandas: ${error.message}`)

  const porModulo = {}
  for (const m of MODULOS) porModulo[m] = 0
  for (const row of data ?? []) {
    const modulo = row.clientes_prospects?.modulo
    if (modulo && porModulo[modulo] !== undefined) porModulo[modulo]++
  }

  return { total: (data ?? []).length, porModulo }
}
