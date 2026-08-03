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

/**
 * Consultas por especialista — total histórico de demandas (casos) abertas
 * em cada módulo, aberta ou finalizada. É a proxy mais direta hoje de
 * "quanto cada especialista foi utilizado", sem depender de log próprio
 * de chamada de IA (que não existe ainda).
 */
export async function contarConsultasPorEspecialista() {
  const { data, error } = await operacional
    .from('casos')
    .select('clientes_prospects(modulo)')
  if (error) throw new Error(`Erro ao contar consultas por especialista: ${error.message}`)

  const porModulo = {}
  for (const m of MODULOS) porModulo[m] = 0
  for (const row of data ?? []) {
    const modulo = row.clientes_prospects?.modulo
    if (modulo && porModulo[modulo] !== undefined) porModulo[modulo]++
  }
  return porModulo
}

/**
 * Indicadores por corretor: clientes ativos (por etapa) e demandas
 * (abertas vs. resolvidas/encerradas). Base para o ranking simples do
 * Painel Executivo — sem qualquer cálculo de conversão ou receita
 * individual, que dependeria de dado financeiro por corretor ainda não
 * modelado.
 */
export async function contarIndicadoresPorCorretor() {
  const [clientesRes, demandasRes] = await Promise.all([
    operacional.from('clientes_prospects').select('corretor_id, status').neq('status', 'inativo'),
    operacional.from('casos').select('situacao, clientes_prospects(corretor_id)'),
  ])
  if (clientesRes.error) throw new Error(`Erro ao contar clientes por corretor: ${clientesRes.error.message}`)
  if (demandasRes.error) throw new Error(`Erro ao contar demandas por corretor: ${demandasRes.error.message}`)

  const porCorretor = {}

  function garantirCorretor(id) {
    if (!id) return null
    if (!porCorretor[id]) {
      porCorretor[id] = {
        clientesProspect: 0,
        clientesNegociacao: 0,
        clientesAtivos: 0,
        demandasAbertas: 0,
        demandasResolvidas: 0,
      }
    }
    return porCorretor[id]
  }

  for (const row of clientesRes.data ?? []) {
    const bucket = garantirCorretor(row.corretor_id)
    if (!bucket) continue
    if (row.status === 'prospect') bucket.clientesProspect++
    if (row.status === 'em_negociacao') bucket.clientesNegociacao++
    if (row.status === 'cliente') bucket.clientesAtivos++
  }

  for (const row of demandasRes.data ?? []) {
    const corretorId = row.clientes_prospects?.corretor_id
    const bucket = garantirCorretor(corretorId)
    if (!bucket) continue
    const finalizada = row.situacao === 'resolvido' || row.situacao === 'encerrado'
    if (finalizada) bucket.demandasResolvidas++
    else bucket.demandasAbertas++
  }

  return porCorretor
}
