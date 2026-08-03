import { operacional } from '../supabaseSchemas'

/**
 * Growth Center v1 — Customer Journey & Pipeline Hub.
 *
 * Fortalece 2 Engines constitucionais (CRM & Customer Journey, Pipeline
 * Management) reaproveitando exclusivamente `clientes_prospects`, que
 * já é compartilhada pelos 5 Workspaces. Zero tabela nova.
 *
 * LIMITAÇÃO ASSUMIDA CONSCIENTEMENTE (decisão do Chief, registrada):
 * métricas que dependem de HISTÓRICO de transição de status (tempo
 * médio por etapa, conversão Prospect→Cliente, Timeline comercial de
 * múltiplos estágios) NÃO são calculadas aqui — a plataforma hoje só
 * guarda o status ATUAL de cada cliente, não guarda quando ele mudou
 * de etapa. Calcular isso exigiria um histórico que ainda não existe
 * (futuro "Commercial Event History", fora desta Sprint por decisão
 * consciente — não criar tabela só pra alimentar dashboard).
 */

const MODULOS = ['saude', 'auto', 'lifsure', 'lishield', 'lifplan']

const MODULO_ROTA_CLIENTE = {
  saude: '/clientes', auto: '/lifleet/clientes', lifsure: '/lifsure/clientes',
  lishield: '/lishield/clientes', lifplan: '/lifplan/clientes',
}
const MODULO_ROTA_PIPELINE = {
  saude: '/', auto: '/lifleet', lifsure: '/lifsure', lishield: '/lishield', lifplan: '/lifplan',
}

/**
 * Carteira consolidada — todos os clientes/prospects ativos (exclui
 * inativos), com sinalizadores derivados do estado atual: próxima ação
 * atrasada, sem próxima ação definida, rota de origem.
 */
export async function listarCarteiraConsolidada({ corretorId, modulo, status } = {}) {
  let query = operacional.from('clientes_prospects').select('*').neq('status', 'inativo')
  if (corretorId) query = query.eq('corretor_id', corretorId)
  if (modulo) query = query.eq('modulo', modulo)
  if (status) query = query.eq('status', status)

  const { data, error } = await query
  if (error) throw new Error(`Erro ao listar carteira: ${error.message}`)

  const hoje = new Date().toISOString().slice(0, 10)
  return (data ?? []).map((c) => ({
    ...c,
    proximaAcaoAtrasada: c.proxima_acao_data ? c.proxima_acao_data < hoje : false,
    semProximaAcao: !c.proxima_acao_data,
    rotaCliente: `${MODULO_ROTA_CLIENTE[c.modulo] ?? '/clientes'}/${c.id}`,
    rotaPipeline: MODULO_ROTA_PIPELINE[c.modulo] ?? '/',
  }))
}

/**
 * Agenda Comercial — agrupa por urgência da próxima ação (não por
 * histórico, só pela data já cadastrada em cada cliente): atrasados,
 * hoje, esta semana, próximos 30 dias, sem ação definida.
 */
export async function obterAgendaComercial({ corretorId } = {}) {
  const carteira = await listarCarteiraConsolidada({ corretorId })

  const hoje = new Date()
  const hojeStr = hoje.toISOString().slice(0, 10)
  const em7dias = new Date(hoje.getTime() + 7 * 86400000).toISOString().slice(0, 10)
  const em30dias = new Date(hoje.getTime() + 30 * 86400000).toISOString().slice(0, 10)

  const comAcao = carteira.filter((c) => c.proxima_acao_data)

  return {
    atrasados: comAcao.filter((c) => c.proxima_acao_data < hojeStr),
    hoje: comAcao.filter((c) => c.proxima_acao_data === hojeStr),
    estaSemana: comAcao.filter((c) => c.proxima_acao_data > hojeStr && c.proxima_acao_data <= em7dias),
    proximos30Dias: comAcao.filter((c) => c.proxima_acao_data > em7dias && c.proxima_acao_data <= em30dias),
    semAcaoDefinida: carteira.filter((c) => c.semProximaAcao),
  }
}

/**
 * Indicadores comerciais — todos deriváveis do estado ATUAL da
 * carteira (Grupo A, conforme decisão do Chief). Não inclui conversão
 * por etapa nem tempo médio — ver nota no topo do arquivo.
 */
export async function obterIndicadoresComerciais({ modulo } = {}) {
  const carteira = await listarCarteiraConsolidada({ modulo })

  const porStatus = { prospect: 0, em_negociacao: 0, cliente: 0 }
  const porModulo = Object.fromEntries(MODULOS.map((m) => [m, 0]))
  let semCorretor = 0
  let semProximaAcao = 0
  let atrasados = 0

  for (const c of carteira) {
    if (porStatus[c.status] !== undefined) porStatus[c.status]++
    if (porModulo[c.modulo] !== undefined) porModulo[c.modulo]++
    if (!c.corretor_id) semCorretor++
    if (c.semProximaAcao) semProximaAcao++
    if (c.proximaAcaoAtrasada) atrasados++
  }

  const { count: totalInativos, error: erroInativos } = await operacional
    .from('clientes_prospects')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'inativo')
  if (erroInativos) throw new Error(`Erro ao contar inativos: ${erroInativos.message}`)

  return {
    porStatus,
    porModulo,
    totalAtivos: carteira.length,
    semCorretor,
    semProximaAcao,
    atrasados,
    totalInativos: totalInativos ?? 0,
  }
}

/** Painel do Corretor — carteira, pendências e próximas ações de um corretor específico */
export async function obterPainelCorretor(corretorId) {
  const [carteira, agenda] = await Promise.all([
    listarCarteiraConsolidada({ corretorId }),
    obterAgendaComercial({ corretorId }),
  ])

  return {
    totalCarteira: carteira.length,
    porStatus: {
      prospect: carteira.filter((c) => c.status === 'prospect').length,
      em_negociacao: carteira.filter((c) => c.status === 'em_negociacao').length,
      cliente: carteira.filter((c) => c.status === 'cliente').length,
    },
    agenda,
    negociacoesCriticas: carteira.filter((c) => c.status === 'em_negociacao' && c.proximaAcaoAtrasada),
  }
}