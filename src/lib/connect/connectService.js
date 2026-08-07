import { supabase } from '../supabaseClient'

const SCHEMA = 'operacional'

function db() {
  return supabase.schema(SCHEMA)
}

/**
 * Fila operacional do Connect Center (CONNECT-004B).
 *
 * Lê exclusivamente a view `vw_connect_inbox` (leads e candidatos
 * ainda sem responsável atribuído). Nenhuma regra de negócio nova —
 * só leitura e filtro sobre o que a view já entrega.
 */
export async function listarFilaOperacional({ origem, produto, dataInicio, dataFim, busca } = {}) {
  let query = db()
    .from('vw_connect_inbox')
    .select('*')
    .order('criado_em', { ascending: false })

  if (origem) query = query.eq('origem_lead', origem)
  if (produto) query = query.eq('produto_interesse', produto)
  if (dataInicio) query = query.gte('criado_em', dataInicio)
  if (dataFim) query = query.lte('criado_em', dataFim)
  if (busca) query = query.ilike('nome', `%${busca}%`)

  const { data, error } = await query
  if (error) throw error
  return data ?? []
}

/**
 * Log de eventos do Connect Center — trilha de auditoria/observabilidade.
 * Lê exclusivamente `connect_log`. Limitado a 200 registros mais
 * recentes por página (fila de auditoria, não relatório histórico).
 */
export async function listarEventosConnect({ status, dataInicio, dataFim, busca } = {}) {
  let query = db()
    .from('connect_log')
    .select('*')
    .order('criado_em', { ascending: false })
    .limit(200)

  if (status) query = query.eq('status', status)
  if (dataInicio) query = query.gte('criado_em', dataInicio)
  if (dataFim) query = query.lte('criado_em', dataFim)
  if (busca) {
    query = query.or(
      `entry_point.ilike.%${busca}%,origem.ilike.%${busca}%,destino.ilike.%${busca}%,tipo_entrada.ilike.%${busca}%`
    )
  }

  const { data, error } = await query
  if (error) throw error
  return data ?? []
}

/**
 * 5 KPIs operacionais homologados pelo Chief para CONNECT-004B.
 * Cada contagem é uma query isolada e enxuta (count exact/head) —
 * nada de trazer linhas pra somar no cliente.
 */
export async function obterKpisConnect({ dataInicio, dataFim } = {}) {
  const comPeriodo = (query) => {
    let q = query
    if (dataInicio) q = q.gte('criado_em', dataInicio)
    if (dataFim) q = q.lte('criado_em', dataFim)
    return q
  }

  const [entradas, aguardando, processadas, comErro, semResponsavel] = await Promise.all([
    comPeriodo(db().from('connect_log').select('id', { count: 'exact', head: true })),
    comPeriodo(db().from('connect_log').select('id', { count: 'exact', head: true }).eq('status', 'recebido')),
    comPeriodo(db().from('connect_log').select('id', { count: 'exact', head: true }).eq('status', 'processado')),
    comPeriodo(db().from('connect_log').select('id', { count: 'exact', head: true }).eq('status', 'erro')),
    db().from('vw_connect_inbox').select('id', { count: 'exact', head: true }),
  ])

  const resultados = { entradas, aguardando, processadas, comErro, semResponsavel }
  const chaveComErro = Object.keys(resultados).find((k) => resultados[k].error)
  if (chaveComErro) throw resultados[chaveComErro].error

  return {
    entradasRecebidas: entradas.count ?? 0,
    aguardandoProcessamento: aguardando.count ?? 0,
    processadas: processadas.count ?? 0,
    comErro: comErro.count ?? 0,
    semResponsavel: semResponsavel.count ?? 0,
  }
}
