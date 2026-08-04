import { obterCentralPendencias } from './comissoesService'
import { obterAgendaComercial } from './growthService'
import { listarPropostasPendentes } from './clientesService'
import { listarCasosConsolidado } from './casosService'

/**
 * Operational Work Queue (Sprint 003 — Fila Inteligente de Trabalho).
 *
 * Camada de agregação PURA, sem persistência própria (diretriz 1 do
 * Chief) — cada chamada consulta as fontes reais na hora, nunca
 * duplica regra de negócio de nenhum módulo (diretriz 7). Não infere
 * nenhum estado que não esteja persistido (diretriz 3) — por isso
 * "Apólice aguardando emissão" NÃO está aqui: não existe campo
 * explícito distinguindo rascunho de apólice confirmada, e inferir
 * isso pela ausência de veículo foi vetado.
 *
 * Escala de prioridade corporativa única (diretriz 2): 'critica' |
 * 'alta' | 'media' | 'baixa' — a mesma para qualquer módulo de
 * origem, definida aqui uma única vez.
 *
 * As 4 fontes (Finance, Growth, Lifleet, Claims) estão todas
 * integradas, cada uma reaproveitando 100% a função já existente do
 * módulo de origem — nenhum critério de prioridade foi recalculado,
 * só remapeado pro formato comum da fila.
 */

const PRIORIDADE_ORDEM = { critica: 0, alta: 1, media: 2, baixa: 3 }

function item({ prioridade, tipo, modulo, clienteId, clienteNome, corretorId, data, descricao, rota }) {
  return { prioridade, tipo, modulo, clienteId, clienteNome, corretorId, data, descricao, rota }
}

/** Bloco Finance — reaproveita 100% obterCentralPendencias(), só remapeia pro formato comum da fila */
async function itensFinance() {
  const pend = await obterCentralPendencias()
  const itens = []

  for (const c of pend.recebimentosVencidos) {
    itens.push(item({
      prioridade: 'critica',
      tipo: 'Recebimento vencido',
      modulo: 'Finance',
      clienteId: null,
      clienteNome: c.operadora?.nome ?? c.operadora_nome_livre ?? '—',
      corretorId: c.corretor_id,
      data: c.data_prevista_recebimento,
      descricao: `${c.diasAtraso}d em atraso`,
      rota: '/financeiro?aba=contasareceber',
    }))
  }
  for (const c of pend.comissoesSugeridas) {
    itens.push(item({
      prioridade: 'alta',
      tipo: 'Comissão sugerida',
      modulo: 'Finance',
      clienteId: null,
      clienteNome: c.operadora?.nome ?? c.operadora_nome_livre ?? '—',
      corretorId: c.corretor_id,
      data: c.created_at,
      descricao: 'Aguardando confirmação de valor e percentual',
      rota: '/financeiro?aba=pendencias',
    }))
  }
  for (const c of pend.repassesPendentesAgora) {
    itens.push(item({
      prioridade: 'alta',
      tipo: 'Repasse liberado',
      modulo: 'Finance',
      clienteId: null,
      clienteNome: c.operadora?.nome ?? c.operadora_nome_livre ?? '—',
      corretorId: c.corretor_id,
      data: c.data_recebimento,
      descricao: 'Pronto para pagamento ao corretor',
      rota: '/financeiro?aba=repasses',
    }))
  }
  for (const c of pend.recebimentosProximos) {
    itens.push(item({
      prioridade: 'media',
      tipo: 'Recebimento próximo',
      modulo: 'Finance',
      clienteId: null,
      clienteNome: c.operadora?.nome ?? c.operadora_nome_livre ?? '—',
      corretorId: c.corretor_id,
      data: c.data_prevista_recebimento,
      descricao: 'Vence nos próximos 7 dias',
      rota: '/financeiro?aba=contasareceber',
    }))
  }
  for (const c of pend.repassesAguardando) {
    itens.push(item({
      prioridade: 'media',
      tipo: 'Repasse aguardando recebimento',
      modulo: 'Finance',
      clienteId: null,
      clienteNome: c.operadora?.nome ?? c.operadora_nome_livre ?? '—',
      corretorId: c.corretor_id,
      data: null,
      descricao: 'Depende da comissão ser recebida primeiro',
      rota: '/financeiro?aba=repasses',
    }))
  }

  return itens
}

/** Bloco Growth — reaproveita obterAgendaComercial(), sem recalcular nada */
async function itensGrowth({ corretorId } = {}) {
  const agenda = await obterAgendaComercial({ corretorId })
  const itens = []

  for (const c of agenda.atrasados) {
    itens.push(item({
      prioridade: 'critica',
      tipo: 'Próxima ação vencida',
      modulo: 'Growth',
      clienteId: c.id,
      clienteNome: c.razao_social,
      corretorId: c.corretor_id,
      data: c.proxima_acao_data,
      descricao: c.proxima_acao_descricao ?? 'Sem descrição',
      rota: c.rotaCliente,
    }))
  }
  for (const c of agenda.semAcaoDefinida) {
    itens.push(item({
      prioridade: 'baixa',
      tipo: 'Cliente sem próxima ação',
      modulo: 'Growth',
      clienteId: c.id,
      clienteNome: c.razao_social,
      corretorId: c.corretor_id,
      data: null,
      descricao: `Status: ${c.status}`,
      rota: c.rotaCliente,
    }))
  }

  return itens
}

/** Bloco Lifleet — propostas emitidas aguardando aprovação (Ciclo de Fechamento Comercial) */
async function itensLifleet({ corretorId } = {}) {
  const propostas = await listarPropostasPendentes({ corretorId })

  return propostas.map((p) =>
    item({
      prioridade: 'alta',
      tipo: 'Proposta aguardando aprovação',
      modulo: 'Lifleet',
      clienteId: p.cliente_prospect_id,
      clienteNome: p.cliente?.razao_social ?? '—',
      corretorId: p.cliente?.corretor_id,
      data: p.data_cotacao,
      descricao: `${p.operadora_nome_livre ?? 'Seguradora'} — R$ ${Number(p.valor_total ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`,
      rota: `/lifleet/clientes/${p.cliente_prospect_id}`,
    })
  )
}

/**
 * Bloco Claims — reaproveita listarCasosConsolidado() e o MESMO
 * critério de "crítico" já usado no Claims Center (tempoAbertoDias >
 * 15, comentado lá como proxy assumido sem SLA configurado — não
 * recalculado aqui, só reaplicado). Um caso pode teoricamente bater em
 * mais de uma condição (crítico E aguardando cliente); pra não listar
 * o mesmo caso duas vezes na fila, prioriza crítico primeiro.
 */
async function itensClaims({ corretorId } = {}) {
  const casos = await listarCasosConsolidado({ corretorId })
  const abertos = casos.filter((c) => !c.finalizado)
  const itens = []

  for (const c of abertos) {
    let prioridade = null
    let tipo = null

    if (c.tempoAbertoDias > 15) {
      prioridade = 'critica'
      tipo = 'Caso crítico (15+ dias)'
    } else if (c.situacao === 'aguardando_cliente') {
      prioridade = 'media'
      tipo = 'Caso aguardando cliente'
    } else if (c.situacao === 'aguardando_operadora') {
      prioridade = 'media'
      tipo = 'Caso aguardando seguradora'
    }

    if (!prioridade) continue

    itens.push(item({
      prioridade,
      tipo,
      modulo: 'Claims',
      clienteId: c.cliente_prospect_id,
      clienteNome: c.cliente?.razao_social ?? '—',
      corretorId: c.cliente?.corretor_id,
      data: c.criado_em,
      descricao: `${c.tempoAbertoDias}d aberto${c.codigo ? ` — ${c.codigo}` : ''}`,
      rota: c.rotaCliente ?? '/claims',
    }))
  }

  return itens
}

/**
 * Consolida todas as fontes numa fila única, ordenada por prioridade
 * (crítica → baixa) e, dentro da prioridade, mais antigo primeiro.
 * `corretorId` filtra "Meu trabalho"; omitido, traz tudo (visão Equipe).
 */
export async function obterFilaOperacional({ corretorId } = {}) {
  const [finance, growth, lifleet, claims] = await Promise.all([
    itensFinance(),
    itensGrowth({ corretorId }),
    itensLifleet({ corretorId }),
    itensClaims({ corretorId }),
  ])

  let todos = [...finance, ...growth, ...lifleet, ...claims]

  // Finance ainda não filtra por corretor internamente (obterCentralPendencias
  // não aceita esse parâmetro) — filtra aqui, sem duplicar a consulta.
  if (corretorId) {
    todos = todos.filter((i) => i.modulo !== 'Finance' || i.corretorId === corretorId)
  }

  todos.sort((a, b) => {
    const diffPrioridade = PRIORIDADE_ORDEM[a.prioridade] - PRIORIDADE_ORDEM[b.prioridade]
    if (diffPrioridade !== 0) return diffPrioridade
    if (!a.data && !b.data) return 0
    if (!a.data) return 1
    if (!b.data) return -1
    return a.data.localeCompare(b.data)
  })

  return todos
}

/**
 * Resumo pros KPIs da seção. "Resolvidas hoje" e "Tempo médio em fila"
 * têm limitações honestas registradas — ver comentário em cada campo.
 */
export async function obterResumoFilaOperacional({ corretorId } = {}) {
  const fila = await obterFilaOperacional({ corretorId })

  const criticas = fila.filter((i) => i.prioridade === 'critica').length
  const altas = fila.filter((i) => i.prioridade === 'alta').length

  // Métrica experimental (diretriz 5 do Chief): só os itens com `data`
  // real entram na média, e para itens do Growth essa data é o
  // PRAZO da ação (não o momento em que ela venceu) — então o número
  // tende a subestimar o tempo real de espera, não superestimar.
  const comData = fila.filter((i) => i.data)
  const hoje = new Date()
  const tempoMedioDias = comData.length
    ? Math.round(
        comData.reduce((soma, i) => soma + Math.max(0, (hoje - new Date(i.data)) / 86400000), 0) / comData.length
      )
    : null

  return {
    total: fila.length,
    criticas,
    altas,
    // "Resolvidas hoje" exigiria histórico de quando cada pendência
    // deixou de existir — a fila não persiste nada (diretriz 1), então
    // esse número não é calculável hoje. Indisponível de propósito,
    // não fingido.
    resolvidasHoje: null,
    tempoMedioDias,
  }
}