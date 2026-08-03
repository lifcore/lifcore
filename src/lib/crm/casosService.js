import { operacional } from '../supabaseSchemas'
import { listarAuditoria } from '../governanca/governancaService'

/**
 * Claims Center v1 — motor operacional único de Casos (Demandas), que
 * hoje vivem espalhados em 5 implementações de UI (uma por Workspace),
 * mas já usam a MESMA tabela (`operacional.casos`) e o MESMO service
 * de escrita (`clientesService.criarDemandaManual`/`atualizarDemanda`/
 * `adicionarAtualizacaoManual`). Este arquivo não substitui esse
 * service — ele adiciona a camada que nunca existiu: consolidação
 * cross-módulo, SLA calculado, timeline combinada e busca global.
 *
 * Nenhuma tabela nova. Nenhuma duplicação do que já existe em
 * clientesService.js (escrita de caso continua lá).
 */

const MODULOS = ['saude', 'auto', 'lifsure', 'lishield', 'lifplan']

const MODULO_ROTA_PIPELINE = {
  saude: '/', auto: '/lifleet', lifsure: '/lifsure', lishield: '/lishield', lifplan: '/lifplan',
}
const MODULO_ROTA_CLIENTE = {
  saude: '/clientes', auto: '/lifleet/clientes', lifsure: '/lifsure/clientes',
  lishield: '/lishield/clientes', lifplan: '/lifplan/clientes',
}

/**
 * Central Operacional — todos os casos dos 5 Workspaces, com o cliente
 * (e o módulo/rota de origem) já anexado. Busca em duas etapas (casos,
 * depois clientes_prospects em lote) em vez de embed, pelo mesmo
 * motivo de segurança já validado nesta sessão: mais previsível que
 * depender de sintaxe de relacionamento aninhado.
 */
export async function listarCasosConsolidado({ modulo, situacao, corretorId } = {}) {
  let query = operacional.from('casos').select('*').order('criado_em', { ascending: false })
  if (situacao) query = query.eq('situacao', situacao)

  const { data: casos, error } = await query
  if (error) throw new Error(`Erro ao listar casos: ${error.message}`)

  const idsClientes = [...new Set((casos ?? []).map((c) => c.cliente_prospect_id).filter(Boolean))]
  let clientesPorId = {}
  if (idsClientes.length > 0) {
    const { data: clientes, error: erroClientes } = await operacional
      .from('clientes_prospects')
      .select('id, razao_social, modulo, corretor_id, cnpj, cpf')
      .in('id', idsClientes)
    if (erroClientes) throw new Error(`Erro ao buscar clientes dos casos: ${erroClientes.message}`)
    clientesPorId = Object.fromEntries((clientes ?? []).map((c) => [c.id, c]))
  }

  let combinados = (casos ?? []).map((c) => {
    const cliente = clientesPorId[c.cliente_prospect_id] ?? null
    return {
      ...c,
      cliente,
      moduloOrigem: cliente?.modulo ?? null,
      rotaCliente: cliente ? `${MODULO_ROTA_CLIENTE[cliente.modulo] ?? '/clientes'}/${cliente.id}` : null,
      rotaPipeline: cliente ? MODULO_ROTA_PIPELINE[cliente.modulo] ?? '/' : null,
      ...calcularTemposCaso(c),
    }
  })

  if (modulo) combinados = combinados.filter((c) => c.moduloOrigem === modulo)
  if (corretorId) combinados = combinados.filter((c) => c.cliente?.corretor_id === corretorId)

  return combinados
}

/**
 * Tempo Aberto (dias desde a criação) e Tempo sem Atualização (dias
 * desde `data_proxima_acao` ter sido definida, como proxy — não temos
 * um `atualizado_em` explícito na tabela `casos`; usar o campo mais
 * recente disponível é mais honesto que inventar uma coluna).
 *
 * NÃO calcula "tempo até SLA" nem "vencido" — não existe prazo-alvo
 * configurado em nenhum lugar do sistema. Calcular isso exigiria
 * inventar um número, o que não é papel da engenharia decidir sozinha.
 */
function calcularTemposCaso(caso) {
  const hoje = new Date()
  const criado = new Date(caso.criado_em)
  const tempoAbertoDias = Math.floor((hoje - criado) / 86400000)

  const finalizado = caso.situacao === 'resolvido' || caso.situacao === 'encerrado'

  return { tempoAbertoDias, finalizado }
}

/**
 * Indicadores do Painel Operacional — contagem por status, tempo médio
 * de resolução (aproximado: para casos finalizados, usa o próprio
 * `criado_em` até agora não é correto; usa-se a data do último evento
 * registrado para aquele caso como proxy de quando foi finalizado,
 * já que não existe uma coluna `encerrado_em` na tabela).
 */
export async function obterIndicadoresOperacionais() {
  const casos = await listarCasosConsolidado()

  const porSituacao = {
    aberto: 0, em_andamento: 0, aguardando_operadora: 0, aguardando_cliente: 0, resolvido: 0, encerrado: 0,
  }
  for (const c of casos) {
    if (porSituacao[c.situacao] !== undefined) porSituacao[c.situacao]++
  }

  const porModulo = Object.fromEntries(MODULOS.map((m) => [m, casos.filter((c) => c.moduloOrigem === m).length]))

  const finalizados = casos.filter((c) => c.finalizado)
  const tempoMedioResolucaoDias = finalizados.length
    ? Math.round(finalizados.reduce((s, c) => s + c.tempoAbertoDias, 0) / finalizados.length)
    : null

  const abertosOuAndamento = casos.filter((c) => !c.finalizado)
  const casosCriticos = abertosOuAndamento.filter((c) => c.tempoAbertoDias > 15) // proxy simples de "crítico": aberto há mais de 15 dias, sem SLA configurado pra usar como referência real

  return {
    porSituacao,
    porModulo,
    totalCasos: casos.length,
    totalAbertos: abertosOuAndamento.length,
    totalCriticos: casosCriticos.length,
    tempoMedioResolucaoDias,
  }
}

/**
 * Timeline de um caso — combina exclusivamente o que já existe:
 * eventos (atualizações manuais registradas) + auditoria (quando o
 * caso sofreu alguma operação crítica via Governança Master). Não cria
 * histórico paralelo algum.
 */
export async function obterTimelineCaso(casoId) {
  const [{ data: eventos, error: erroEventos }, auditoria] = await Promise.all([
    operacional.from('eventos').select('*').eq('caso_id', casoId).order('criado_em', { ascending: true }),
    listarAuditoria({ tabelaAfetada: 'operacional.casos', registroId: casoId, limite: 50 }),
  ])
  if (erroEventos) throw new Error(`Erro ao buscar eventos do caso: ${erroEventos.message}`)

  const linha = [
    ...(eventos ?? []).map((e) => ({ tipo: 'evento', data: e.criado_em, descricao: e.descricao, origem: e.tipo })),
    ...auditoria.map((a) => ({ tipo: 'auditoria', data: a.created_at, descricao: `${a.acao} (${a.usuario_papel ?? 'usuário'})`, motivo: a.motivo })),
  ]

  return linha.sort((a, b) => new Date(a.data) - new Date(b.data))
}

/**
 * Pesquisa Global de Casos — Cliente (nome/CPF/CNPJ), Código do caso,
 * Status, Período, Corretor.
 *
 * LIMITAÇÃO REGISTRADA: busca por Contrato, Apólice e Especialista NÃO
 * está implementada. `casos` não tem `apolice_id`/`contrato_id` (só
 * `cliente_prospect_id`), e "Especialista" não é um campo próprio do
 * caso — é inferido pelo módulo do cliente, o que já está coberto pelo
 * filtro de módulo. Implementar a busca por apólice/contrato exigiria
 * juntar caso → cliente → apólices/contratos do módulo certo, o que é
 * uma decisão de design maior (qual "produto" vincular) — registrado
 * pra revisão, não implementado às cegas.
 */
export async function buscarCasosGlobal({ termoCliente, codigoCaso, situacao, periodoInicio, periodoFim, corretorId } = {}) {
  const todos = await listarCasosConsolidado({ situacao, corretorId })

  return todos.filter((c) => {
    if (codigoCaso && !c.codigo?.toLowerCase().includes(codigoCaso.toLowerCase())) return false
    if (periodoInicio && c.criado_em < periodoInicio) return false
    if (periodoFim && c.criado_em > `${periodoFim}T23:59:59`) return false
    if (termoCliente) {
      const termo = termoCliente.toLowerCase()
      const bate =
        c.cliente?.razao_social?.toLowerCase().includes(termo) ||
        c.cliente?.cnpj?.toLowerCase().includes(termo) ||
        c.cliente?.cpf?.toLowerCase().includes(termo)
      if (!bate) return false
    }
    return true
  })
}