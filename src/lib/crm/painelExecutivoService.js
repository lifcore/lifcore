import { operacional } from '../supabaseSchemas'
import { listarContasAReceber, listarRepassesAPagar, obterConciliacao } from './comissoesService'
import { obterIndicadoresOperacionais as obterIndicadoresCasos } from './casosService'

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

/**
 * Saúde Financeira — bloco do Painel Executivo v2. Não cria nenhuma
 * consulta nova ao banco: só reaproveita e agrega o que o Finance
 * Center já expõe (Contas a Receber, Repasses, Conciliação). Zero
 * Service novo, conforme escopo da Sprint.
 */
export async function obterSaudeFinanceira() {
  const [contasAReceber, repasses, conciliacao] = await Promise.all([
    listarContasAReceber(),
    listarRepassesAPagar(),
    obterConciliacao(),
  ])

  const totalAReceber = contasAReceber.reduce((s, c) => s + Number(c.valor_comissao || 0), 0)
  const emAtraso = contasAReceber.filter((c) => c.faixaAtraso)
  const totalEmAtraso = emAtraso.reduce((s, c) => s + Number(c.valor_comissao || 0), 0)
  const faixaCritica90 = contasAReceber.filter((c) => c.faixaAtraso === '90+')
  const totalFaixaCritica90 = faixaCritica90.reduce((s, c) => s + Number(c.valor_comissao || 0), 0)

  const repassesPendentes = repasses.filter((r) => !r.aguardandoRecebimento)
  const totalRepassesPendentes = repassesPendentes.reduce((s, r) => s + Number(r.valor_repasse_corretor || 0), 0)

  const totalLancadoGeral = conciliacao.reduce((s, c) => s + c.totalLancado, 0)
  const totalRecebidoGeral = conciliacao.reduce((s, c) => s + c.totalRecebido, 0)

  const percentualEmAtraso = totalAReceber > 0 ? (totalEmAtraso / totalAReceber) * 100 : 0
  const percentualConciliado = totalLancadoGeral > 0 ? (totalRecebidoGeral / totalLancadoGeral) * 100 : 0

  return {
    totalAReceber,
    totalEmAtraso,
    totalFaixaCritica90,
    totalRepassesPendentes,
    totalConciliado: totalRecebidoGeral,
    percentualEmAtraso,
    percentualConciliado,
    volumeAguardandoAcao: totalAReceber + totalRepassesPendentes,
    quantidadeEmAtraso: emAtraso.length,
    quantidadeFaixaCritica90: faixaCritica90.length,
  }
}

/**
 * Saúde Operacional — bloco do Painel Executivo, reaproveitando
 * exclusivamente `casosService.obterIndicadoresOperacionais()` já
 * existente (Claims Center). Zero Service novo, zero consulta nova.
 */
export async function obterSaudeOperacional() {
  return obterIndicadoresCasos()
}