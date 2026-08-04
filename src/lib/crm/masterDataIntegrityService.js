import { operacional } from '../supabaseSchemas'
import { listarCasosConsolidado, obterCentralGargalos } from './casosService'

/**
 * Master Data Integrity Engine v1 (Sprint 004, aprovada pelo Chief com
 * reescalonamento obrigatório — v1 só valida, nunca infere).
 *
 * Este service é um AGREGADOR PURO: nunca grava, nunca corrige, nunca
 * recalcula regra de negócio de nenhum domínio (diretriz 1 do Chief).
 * Sempre que uma checagem já existe em outro service (Claims, por
 * exemplo), ela é reaproveitada aqui — nunca reimplementada.
 *
 * Escala de severidade corporativa: 'critica' | 'alta' | 'media' | 'baixa'.
 *
 * VALIDAÇÃO TRANSITÓRIA (diretriz CAT-008): INT-005 ("Comissão sem
 * apólice vinculada") é válida SOMENTE enquanto o Finance Center operar
 * no modelo atual (comissão = consequência direta da apólice). A
 * "Nota Técnica — Evolução Arquitetural do Finance Center" já registrou
 * que isso deixa de ser verdade para Saúde/Odonto/Vida no futuro
 * modelo de Expectativa de Comissão → Conciliação → Recebimento. Esta
 * regra DEVE ser revisada/substituída pela Sprint "Finance Center v3"
 * quando ela existir — não antecipar esse comportamento agora
 * (diretriz 4 do Chief).
 */

function inconsistencia({ codigo, categoria, descricao, modulo, registroId, severidade, rota }) {
  return { codigo, categoria, descricao, modulo, registroId, severidade, rota, dataAnalise: new Date().toISOString() }
}

/** INT-001 — Cotação sem cliente vinculado */
async function validarCotacaoSemCliente() {
  const { data: cotacoes, error } = await operacional
    .from('cotacoes')
    .select('id, cliente_prospect_id, operadora_nome_livre')
  if (error) throw new Error(`INT-001: ${error.message}`)

  const semCliente = (cotacoes ?? []).filter((c) => !c.cliente_prospect_id)
  return semCliente.map((c) =>
    inconsistencia({
      codigo: 'INT-001',
      categoria: 'Comercial',
      descricao: `Cotação (${c.operadora_nome_livre ?? 'sem seguradora'}) sem cliente vinculado`,
      modulo: 'Comercial',
      registroId: c.id,
      severidade: 'alta',
      rota: null,
    })
  )
}

/** INT-002 — Apólice sem corretor responsável */
async function validarApoliceSemCorretor() {
  const { data: apolices, error } = await operacional
    .from('apolices')
    .select('id, nome_cliente, corretor_id, cliente_prospect_id')
  if (error) throw new Error(`INT-002: ${error.message}`)

  const semCorretor = (apolices ?? []).filter((a) => !a.corretor_id)
  return semCorretor.map((a) =>
    inconsistencia({
      codigo: 'INT-002',
      categoria: 'Comercial',
      descricao: `Apólice de ${a.nome_cliente ?? 'cliente sem nome'} sem corretor responsável`,
      modulo: 'Apólices',
      registroId: a.id,
      severidade: 'alta',
      rota: a.cliente_prospect_id ? `/clientes/${a.cliente_prospect_id}` : null,
    })
  )
}

/** INT-003 — Cliente sem responsável (corretor) */
async function validarClienteSemResponsavel() {
  const { data: clientes, error } = await operacional
    .from('clientes_prospects')
    .select('id, razao_social, corretor_id, modulo')
    .is('corretor_id', null)
    .neq('status', 'inativo')
  if (error) throw new Error(`INT-003: ${error.message}`)

  return (clientes ?? []).map((c) =>
    inconsistencia({
      codigo: 'INT-003',
      categoria: 'Cadastro',
      descricao: `${c.razao_social} sem corretor responsável`,
      modulo: 'Clientes',
      registroId: c.id,
      severidade: 'media',
      rota: rotaCliente(c.modulo, c.id),
    })
  )
}

/** INT-004 — Cliente duplicado (mesmo CNPJ ou CPF) */
async function validarClienteDuplicado() {
  const { data: clientes, error } = await operacional
    .from('clientes_prospects')
    .select('id, razao_social, cnpj, cpf, modulo')
    .neq('status', 'inativo')
  if (error) throw new Error(`INT-004: ${error.message}`)

  const itens = []
  for (const campo of ['cnpj', 'cpf']) {
    const grupos = {}
    for (const c of clientes ?? []) {
      const valor = c[campo]?.replace(/\D/g, '')
      if (!valor) continue
      if (!grupos[valor]) grupos[valor] = []
      grupos[valor].push(c)
    }
    for (const grupo of Object.values(grupos)) {
      if (grupo.length > 1) {
        for (const c of grupo) {
          itens.push(
            inconsistencia({
              codigo: 'INT-004',
              categoria: 'Cadastro',
              descricao: `${campo.toUpperCase()} duplicado entre ${grupo.length} cadastros — ${c.razao_social}`,
              modulo: 'Clientes',
              registroId: c.id,
              severidade: 'alta',
              rota: rotaCliente(c.modulo, c.id),
            })
          )
        }
      }
    }
  }
  return itens
}

/** INT-005 — Comissão sem apólice vinculada (VALIDAÇÃO TRANSITÓRIA — ver nota no topo do arquivo) */
async function validarComissaoSemApolice() {
  const { data: comissoes, error } = await operacional
    .from('comissoes')
    .select('id, apolice_id, modulo, valor_comissao')
    .is('apolice_id', null)
  if (error) throw new Error(`INT-005: ${error.message}`)

  return (comissoes ?? []).map((c) =>
    inconsistencia({
      codigo: 'INT-005',
      categoria: 'Financeiro',
      descricao: `Comissão (${c.modulo}) sem apólice vinculada — R$ ${Number(c.valor_comissao ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })} [validação transitória, ver CAT-008]`,
      modulo: 'Finance',
      registroId: c.id,
      severidade: 'baixa',
      rota: '/financeiro',
    })
  )
}

/** INT-006 — Comissão duplicada para a mesma apólice */
async function validarComissaoDuplicada() {
  const { data: comissoes, error } = await operacional
    .from('comissoes')
    .select('id, apolice_id, valor_comissao')
    .not('apolice_id', 'is', null)
    .neq('status_recebimento', 'cancelado')
  if (error) throw new Error(`INT-006: ${error.message}`)

  const grupos = {}
  for (const c of comissoes ?? []) {
    if (!grupos[c.apolice_id]) grupos[c.apolice_id] = []
    grupos[c.apolice_id].push(c)
  }

  const itens = []
  for (const [apoliceId, grupo] of Object.entries(grupos)) {
    if (grupo.length > 1) {
      for (const c of grupo) {
        itens.push(
          inconsistencia({
            codigo: 'INT-006',
            categoria: 'Financeiro',
            descricao: `${grupo.length} lançamentos de comissão para a mesma apólice`,
            modulo: 'Finance',
            registroId: c.id,
            severidade: 'critica',
            rota: '/financeiro',
          })
        )
      }
    }
  }
  return itens
}

/** INT-007 — Comissão vinculada a apólice de cliente inexistente */
async function validarComissaoApoliceClienteInexistente() {
  const { data: comissoes, error } = await operacional
    .from('comissoes')
    .select('id, apolice_id, modulo')
    .not('apolice_id', 'is', null)
  if (error) throw new Error(`INT-007: ${error.message}`)
  if (!comissoes?.length) return []

  const idsApolice = [...new Set(comissoes.map((c) => c.apolice_id))]
  const { data: apolices, error: erroApolices } = await operacional
    .from('apolices')
    .select('id, cliente_prospect_id')
    .in('id', idsApolice)
  if (erroApolices) throw new Error(`INT-007: ${erroApolices.message}`)

  const apolicePorId = Object.fromEntries((apolices ?? []).map((a) => [a.id, a]))
  const idsClientes = [...new Set((apolices ?? []).map((a) => a.cliente_prospect_id).filter(Boolean))]
  const { data: clientes, error: erroClientes } = await operacional
    .from('clientes_prospects')
    .select('id')
    .in('id', idsClientes.length ? idsClientes : ['00000000-0000-0000-0000-000000000000'])
  if (erroClientes) throw new Error(`INT-007: ${erroClientes.message}`)

  const idsClientesExistentes = new Set((clientes ?? []).map((c) => c.id))

  const itens = []
  for (const c of comissoes) {
    const apolice = apolicePorId[c.apolice_id]
    if (!apolice) {
      itens.push(
        inconsistencia({
          codigo: 'INT-007',
          categoria: 'Financeiro',
          descricao: `Comissão (${c.modulo}) referencia apólice que não existe mais`,
          modulo: 'Finance',
          registroId: c.id,
          severidade: 'critica',
          rota: '/financeiro',
        })
      )
    } else if (apolice.cliente_prospect_id && !idsClientesExistentes.has(apolice.cliente_prospect_id)) {
      itens.push(
        inconsistencia({
          codigo: 'INT-007',
          categoria: 'Financeiro',
          descricao: `Comissão (${c.modulo}) vinculada a apólice cujo cliente não existe mais`,
          modulo: 'Finance',
          registroId: c.id,
          severidade: 'critica',
          rota: '/financeiro',
        })
      )
    }
  }
  return itens
}

/** INT-008 — Repasse pendente sem valor definido */
async function validarRepassePendenteSemValor() {
  const { data: comissoes, error } = await operacional
    .from('comissoes')
    .select('id, modulo, valor_repasse_corretor')
    .eq('status_repasse', 'pendente')
  if (error) throw new Error(`INT-008: ${error.message}`)

  const semValor = (comissoes ?? []).filter((c) => !c.valor_repasse_corretor || Number(c.valor_repasse_corretor) <= 0)
  return semValor.map((c) =>
    inconsistencia({
      codigo: 'INT-008',
      categoria: 'Financeiro',
      descricao: `Repasse pendente (${c.modulo}) sem valor definido`,
      modulo: 'Finance',
      registroId: c.id,
      severidade: 'alta',
      rota: '/financeiro?aba=repasses',
    })
  )
}

/** INT-009 — Caso (Demanda) vinculado a cliente inexistente. Reaproveita listarCasosConsolidado do casosService.js. */
async function validarCasoClienteInexistente() {
  const casos = await listarCasosConsolidado()
  const orfaos = casos.filter((c) => c.cliente_prospect_id && !c.cliente)

  return orfaos.map((c) =>
    inconsistencia({
      codigo: 'INT-009',
      categoria: 'Claims',
      descricao: `Caso ${c.codigo} referencia cliente que não existe mais`,
      modulo: 'Claims',
      registroId: c.id,
      severidade: 'critica',
      rota: '/claims',
    })
  )
}

/** INT-010 — Caso crítico sem responsável. Reaproveita obterCentralGargalos do casosService.js. */
async function validarCasoCriticoSemResponsavel() {
  const gargalos = await obterCentralGargalos()
  const idsSemResponsavel = new Set(gargalos.semResponsavel.map((c) => c.id))
  const criticosSemResponsavel = gargalos.antigos.filter((c) => idsSemResponsavel.has(c.id))

  return criticosSemResponsavel.map((c) =>
    inconsistencia({
      codigo: 'INT-010',
      categoria: 'Claims',
      descricao: `Caso crítico ${c.codigo} (${c.tempoAbertoDias} dias aberto) sem corretor responsável`,
      modulo: 'Claims',
      registroId: c.id,
      severidade: 'alta',
      rota: c.rotaCliente ?? '/claims',
    })
  )
}

/** INT-011 — Grupo de comparação com mais de uma proposta aprovada simultaneamente */
async function validarGrupoComMultiplasAprovadas() {
  const { data: cotacoes, error } = await operacional
    .from('cotacoes')
    .select('id, grupo_comparacao_id, status, operadora_nome_livre, cliente_prospect_id')
    .eq('status', 'aprovada')
    .not('grupo_comparacao_id', 'is', null)
  if (error) throw new Error(`INT-011: ${error.message}`)

  const grupos = {}
  for (const c of cotacoes ?? []) {
    if (!grupos[c.grupo_comparacao_id]) grupos[c.grupo_comparacao_id] = []
    grupos[c.grupo_comparacao_id].push(c)
  }

  const itens = []
  for (const grupo of Object.values(grupos)) {
    if (grupo.length > 1) {
      for (const c of grupo) {
        itens.push(
          inconsistencia({
            codigo: 'INT-011',
            categoria: 'Comercial',
            descricao: `${grupo.length} propostas aprovadas na mesma rodada de comparação (${c.operadora_nome_livre ?? 'seguradora'})`,
            modulo: 'Lifleet',
            registroId: c.id,
            severidade: 'critica',
            rota: c.cliente_prospect_id ? `/lifleet/clientes/${c.cliente_prospect_id}` : null,
          })
        )
      }
    }
  }
  return itens
}

/** INT-012 — Cotação aprovada sem apólice gerada */
async function validarCotacaoAprovadaSemApolice() {
  const { data: cotacoes, error } = await operacional
    .from('cotacoes')
    .select('id, operadora_nome_livre, cliente_prospect_id')
    .eq('status', 'aprovada')
    .is('apolice_id', null)
  if (error) throw new Error(`INT-012: ${error.message}`)

  return (cotacoes ?? []).map((c) =>
    inconsistencia({
      codigo: 'INT-012',
      categoria: 'Comercial',
      descricao: `Proposta aprovada (${c.operadora_nome_livre ?? 'seguradora'}) sem apólice gerada`,
      modulo: 'Lifleet',
      registroId: c.id,
      severidade: 'alta',
      rota: c.cliente_prospect_id ? `/lifleet/clientes/${c.cliente_prospect_id}` : null,
    })
  )
}

const MODULO_ROTA_CLIENTE = {
  saude: '/clientes', auto: '/lifleet/clientes', lifsure: '/lifsure/clientes',
  lishield: '/lishield/clientes', lifplan: '/lifplan/clientes',
}
function rotaCliente(modulo, id) {
  return `${MODULO_ROTA_CLIENTE[modulo] ?? '/clientes'}/${id}`
}

/**
 * Executa as 12 validações do v1 em paralelo e consolida num catálogo
 * único, ordenado por severidade (crítica → baixa).
 */
export async function executarValidacaoIntegridade() {
  const resultados = await Promise.all([
    validarCotacaoSemCliente(),
    validarApoliceSemCorretor(),
    validarClienteSemResponsavel(),
    validarClienteDuplicado(),
    validarComissaoSemApolice(),
    validarComissaoDuplicada(),
    validarComissaoApoliceClienteInexistente(),
    validarRepassePendenteSemValor(),
    validarCasoClienteInexistente(),
    validarCasoCriticoSemResponsavel(),
    validarGrupoComMultiplasAprovadas(),
    validarCotacaoAprovadaSemApolice(),
  ])

  const ORDEM_SEVERIDADE = { critica: 0, alta: 1, media: 2, baixa: 3 }
  const todas = resultados.flat()
  todas.sort((a, b) => ORDEM_SEVERIDADE[a.severidade] - ORDEM_SEVERIDADE[b.severidade])
  return todas
}

/** Resumo pros KPIs da aba "Integridade dos Dados" */
export async function obterResumoIntegridade() {
  const inconsistencias = await executarValidacaoIntegridade()

  const porModulo = {}
  for (const i of inconsistencias) {
    porModulo[i.modulo] = (porModulo[i.modulo] ?? 0) + 1
  }

  return {
    total: inconsistencias.length,
    criticas: inconsistencias.filter((i) => i.severidade === 'critica').length,
    altas: inconsistencias.filter((i) => i.severidade === 'alta').length,
    medias: inconsistencias.filter((i) => i.severidade === 'media').length,
    baixas: inconsistencias.filter((i) => i.severidade === 'baixa').length,
    porModulo,
  }
}