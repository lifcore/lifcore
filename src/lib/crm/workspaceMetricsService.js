import { operacional } from '../supabaseSchemas'
import { WORKSPACES } from '../../workspaces'
import { obterFilaOperacional } from './operationalQueueService'

/**
 * Workspace Metrics Service (Sprint 010 — WIE-002, Bloco G).
 *
 * Agrega Leads, etapas do Commercial Lifecycle e Pendências por
 * Workspace — nunca persiste, nunca calcula regra nova. Reaproveita
 * `obterFilaOperacional` (Operational Queue) pra pendências: como os
 * itens de Finance não têm `clienteId` (são por seguradora, não por
 * cliente), o filtro por Workspace já exclui Finance automaticamente
 * — exatamente a diretriz do Bloco C ("Finance continua fora"), sem
 * precisar de caso especial nenhum.
 */

const WORKSPACE_ID_PARA_MODULO = {
  lifcare: 'saude',
  auto: 'auto',
  lifsure: 'lifsure',
  lishield: 'lishield',
  lifplan: 'lifplan',
}

export async function obterMetricasWorkspace(workspaceId, { corretorId } = {}) {
  const modulo = WORKSPACE_ID_PARA_MODULO[workspaceId]
  const workspace = WORKSPACES[workspaceId]
  if (!modulo || !workspace) throw new Error(`Workspace desconhecido: ${workspaceId}`)

  let queryClientes = operacional
    .from('clientes_prospects')
    .select('id, status')
    .eq('modulo', modulo)
    .neq('status', 'inativo')
  if (corretorId) queryClientes = queryClientes.eq('corretor_id', corretorId)

  const { data: clientes, error } = await queryClientes
  if (error) throw new Error(`Erro ao buscar clientes do Workspace: ${error.message}`)

  const leads = clientes.filter((c) => c.status === 'prospect').length
  const emNegociacao = clientes.filter((c) => c.status === 'em_negociacao').length
  const carteiraAtiva = clientes.filter((c) => c.status === 'cliente').length

  // Cotações por etapa do ciclo comercial — só se o Workspace tiver
  // Commercial Lifecycle habilitado (Bloco B: "pergunta ao Lifecycle
  // quais etapas este Workspace possui", nunca lista fixa).
  const idsClientes = clientes.map((c) => c.id)
  const porEtapa = {}
  if (workspace.commercialLifecycle?.enabled && idsClientes.length > 0) {
    for (const etapa of workspace.commercialLifecycle.stages) porEtapa[etapa] = 0

    const { data: cotacoes, error: erroCotacoes } = await operacional
      .from('cotacoes')
      .select('status')
      .in('cliente_prospect_id', idsClientes)
    if (erroCotacoes) throw new Error(`Erro ao buscar cotações do Workspace: ${erroCotacoes.message}`)

    for (const c of cotacoes ?? []) {
      const etapa = c.status ?? workspace.commercialLifecycle.stages[0]
      if (porEtapa[etapa] !== undefined) porEtapa[etapa]++
    }
  }

  // Pendências — reaproveita a Fila Operacional, filtrando só os itens
  // cujo cliente pertence a este Workspace.
  const fila = await obterFilaOperacional({ corretorId })
  const idsClientesSet = new Set(idsClientes)
  const pendencias = fila.filter((i) => i.clienteId && idsClientesSet.has(i.clienteId))

  return {
    leads,
    emNegociacao,
    carteiraAtiva,
    porEtapa,
    pendencias: pendencias.length,
    itensPendencia: pendencias,
  }
}