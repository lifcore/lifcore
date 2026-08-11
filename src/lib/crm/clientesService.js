import { institucional, operacional } from '../supabaseSchemas'
import { supabase } from '../supabaseClient'
import { dataLocalISO } from '../utils/formatarData'
import { registrarEventoComercial } from './eventosComerciaisService'
import { criarApolice } from './apolicesService'
import { avancarEtapaCiclo, avancarParaEmissao, fecharCotacaoComDocumento } from './commercialLifecycleService'

export { fecharCotacaoComDocumento }

/** Retorna a data de hoje no formato YYYY-MM-DD, usando o horário LOCAL (não UTC) */
function dataLocalHoje(diasAFrente = 0) {
  return dataLocalISO(diasAFrente)
}

/**
 * Lista clientes/prospects — por padrão mostra uma janela de 15 dias
 * (hoje até +15 dias), sempre ordenados por data de ação mais próxima.
 * Ações atrasadas (data no passado) SEMPRE aparecem, mesmo além da
 * janela de tempo — são as mais urgentes de todas.
 * mostrarFuturas=true remove esse limite e traz tudo.
 */
export async function listarClientesProspects({ mostrarFuturas = false, modulo = 'saude', corretorId = null } = {}) {
  let query = operacional
    .from('clientes_prospects')
    .select('*, contatos(*)')
    .eq('modulo', modulo)
    .order('proxima_acao_data', { ascending: true, nullsFirst: false })

  if (corretorId) {
    query = query.eq('corretor_id', corretorId)
  }

  const { data, error } = await query

  if (error) throw new Error(`Erro ao listar clientes/prospects: ${error.message}`)

  const hoje = dataLocalHoje()
  const limiteJanela = dataLocalHoje(15)

  const semInativos = (data ?? []).filter((c) => c.status !== 'inativo')

  const listaFinal = mostrarFuturas
    ? semInativos
    : semInativos.filter((c) => !c.proxima_acao_data || c.proxima_acao_data <= limiteJanela)

  // Busca a demanda em aberto mais próxima de cada cliente, para exibir
  // o status real (Em andamento, Aguardando cliente, etc.) no card —
  // não só se está "no prazo" ou "atrasada".
  const idsClientes = listaFinal.map((c) => c.id)
  if (idsClientes.length > 0) {
    const { data: demandasAbertas } = await operacional
      .from('casos')
      .select('cliente_prospect_id, situacao, data_proxima_acao')
      .in('cliente_prospect_id', idsClientes)
      .not('situacao', 'in', '(encerrado,resolvido)')
      .order('data_proxima_acao', { ascending: true, nullsFirst: false })

    const situacaoPorCliente = {}
    for (const d of demandasAbertas ?? []) {
      if (!situacaoPorCliente[d.cliente_prospect_id]) {
        situacaoPorCliente[d.cliente_prospect_id] = d.situacao
      }
    }
    for (const cliente of listaFinal) {
      cliente.situacaoDemandaAtual = situacaoPorCliente[cliente.id] ?? null
    }
  }

  return listaFinal
}

/** Define/atualiza a próxima ação de um cliente/prospect */
export async function definirProximaAcao(id, data, descricao) {
  const { error } = await operacional
    .from('clientes_prospects')
    .update({ proxima_acao_data: data, proxima_acao_descricao: descricao, atualizado_em: new Date().toISOString() })
    .eq('id', id)
  if (error) throw new Error(`Erro ao definir próxima ação: ${error.message}`)
}

/**
 * Sprint Master Data Alignment — Operadoras: institucional.operadoras
 * não pode ser embutida diretamente no select de operacional.cotacoes
 * (mesmo problema de cross-schema já confirmado no Finance Center, em
 * comissoesService.js). Por isso buscamos os nomes à parte e anexamos
 * manualmente em JS. Cotações antigas, ainda sem operadora_id (não
 * normalizadas), voltam com `operadora: null` — quem exibe decide o
 * fallback para operadora_nome_livre.
 */
async function anexarOperadorasCotacoes(cotacoes) {
  const idsUnicos = [...new Set(cotacoes.map((c) => c.operadora_id).filter(Boolean))]
  if (idsUnicos.length === 0) return cotacoes.map((c) => ({ ...c, operadora: null }))

  const { data: operadoras, error } = await institucional
    .from('operadoras')
    .select('id, nome')
    .in('id', idsUnicos)
  if (error) throw new Error(`Erro ao buscar nomes de seguradoras: ${error.message}`)

  const nomePorId = Object.fromEntries((operadoras ?? []).map((o) => [o.id, o]))
  return cotacoes.map((c) => ({ ...c, operadora: c.operadora_id ? (nomePorId[c.operadora_id] ?? null) : null }))
}

/** Busca um cliente/prospect específico, com contatos, contratos e cotações */
export async function buscarClienteProspectCompleto(id) {
  const { data: cliente, error: erroCliente } = await operacional
    .from('clientes_prospects')
    .select('*')
    .eq('id', id)
    .single()
  if (erroCliente) throw new Error(`Erro ao buscar cliente: ${erroCliente.message}`)

  const { data: contatos } = await operacional
    .from('contatos')
    .select('*')
    .eq('cliente_prospect_id', id)
    .order('tipo')

  const { data: contratos } = await operacional
    .from('contratos')
    .select('*, itens_contrato(*)')
    .eq('cliente_prospect_id', id)

  const { data: cotacoes } = await operacional
    .from('cotacoes')
    .select('*, itens_cotacao(*)')
    .eq('cliente_prospect_id', id)
    .order('data_cotacao', { ascending: false })

  const cotacoesComOperadora = await anexarOperadorasCotacoes(cotacoes ?? [])

  const { data: demandas } = await operacional
    .from('casos')
    .select('*')
    .eq('cliente_prospect_id', id)
    .order('criado_em', { ascending: false })

  let grupoInfo = null
  if (cliente.grupo_economico_id) {
    const { membros, totalVidas } = await buscarMembrosDoGrupo(cliente.grupo_economico_id, id)
    const { data: grupo } = await operacional
      .from('grupos_economicos')
      .select('nome_grupo')
      .eq('id', cliente.grupo_economico_id)
      .single()
    grupoInfo = { nomeGrupo: grupo?.nome_grupo, outrosMembros: membros, totalVidasGrupo: totalVidas + (cliente.numero_colaboradores ?? 0) }
  }

  return { cliente, contatos: contatos ?? [], contratos: contratos ?? [], cotacoes: cotacoesComOperadora, demandas: demandas ?? [], grupoInfo }
}

/**
 * Exclui um cliente/prospect e todo o histórico vinculado (contratos,
 * cotações, demandas/eventos).
 *
 * ATENÇÃO — MODO ATUAL: FASE DE TESTES.
 * Por decisão explícita do Raphael (fase de validação do sistema),
 * esta função exclui de verdade, sem restrição, para permitir limpar
 * cadastros de teste sem acumular lixo na base.
 *
 * ANTES DE IR PARA PRODUÇÃO REAL: reintroduzir a trava que impede
 * excluir clientes com histórico real (bloquear quando houver
 * contratos/cotações/casos, sugerindo "Marcar Inativo" em vez disso).
 * Isso preserva o princípio de rastreabilidade da Constituição.
 */
export async function excluirClienteProspect(id) {
  // Ordem importa: cotações (e seus itens, via cascade) e casos (e seus
  // eventos, via cascade) precisam sair antes do cliente, para não
  // esbarrar em restrição de chave estrangeira.
  await operacional.from('itens_cotacao').delete().in(
    'cotacao_id',
    (await operacional.from('cotacoes').select('id').eq('cliente_prospect_id', id)).data?.map((c) => c.id) ?? []
  )
  await operacional.from('cotacoes').delete().eq('cliente_prospect_id', id)
  await operacional.from('eventos').delete().in(
    'caso_id',
    (await operacional.from('casos').select('id').eq('cliente_prospect_id', id)).data?.map((c) => c.id) ?? []
  )
  await operacional.from('casos').delete().eq('cliente_prospect_id', id)
  await operacional.from('contratos').delete().eq('cliente_prospect_id', id)
  await operacional.from('contatos').delete().eq('cliente_prospect_id', id)

  const { error } = await operacional.from('clientes_prospects').delete().eq('id', id)
  if (error) throw new Error(`Erro ao excluir: ${error.message}`)
}

/** Atualiza dados cadastrais do cliente/prospect (CNPJ, segmento, vigência, etc.) */
export async function atualizarClienteProspect(id, dados) {
  const { error } = await operacional
    .from('clientes_prospects')
    .update({ ...dados, atualizado_em: new Date().toISOString() })
    .eq('id', id)
  if (error) throw new Error(`Erro ao atualizar cliente: ${error.message}`)
}

/**
 * Transferência individual de titularidade — diferente de
 * `transferirCarteira` (perfisService.js), que move TODOS os clientes
 * de um corretor de uma vez (uso administrativo, saída de corretor).
 * Esta função transfere UM cliente específico. Preserva o estágio do
 * ciclo comercial (só troca o responsável, nunca o status/etapa) e
 * sempre deixa rastro em `eventos_comerciais` — sem isso, a mudança de
 * dono do cliente vira exatamente o tipo de conhecimento que o LifCore
 * existe para não deixar se perder.
 */
export async function transferirClienteIndividual({
  clienteId,
  corretorDestinoId,
  usuarioId,
  nomeCorretorOrigem,
  nomeCorretorDestino,
}) {
  await atualizarClienteProspect(clienteId, { corretor_id: corretorDestinoId })

  await registrarEventoComercial({
    entidadeTipo: 'cliente',
    entidadeId: clienteId,
    tipoEvento: 'transferencia_titularidade',
    descricao: `Transferido de ${nomeCorretorOrigem ?? 'sem responsável definido'} para ${nomeCorretorDestino}`,
    usuarioId,
  })
}

/** Lista todos os grupos econômicos cadastrados (para sugestão/autocomplete) */
export async function listarGruposEconomicos() {
  const { data, error } = await operacional
    .from('grupos_economicos')
    .select('*')
    .order('nome_grupo')
  if (error) throw new Error(`Erro ao listar grupos econômicos: ${error.message}`)
  return data ?? []
}

/** Busca um grupo pelo nome, ou cria um novo se não existir (evita duplicar) */
export async function buscarOuCriarGrupoEconomico(nomeGrupo, organizacaoId) {
  const { data: existente } = await operacional
    .from('grupos_economicos')
    .select('*')
    .ilike('nome_grupo', nomeGrupo.trim())
    .maybeSingle()

  if (existente) return existente

  const { data: novoGrupo, error } = await operacional
    .from('grupos_economicos')
    .insert({ nome_grupo: nomeGrupo.trim(), organizacao_id: organizacaoId })
    .select()
    .single()
  if (error) throw new Error(`Erro ao criar grupo econômico: ${error.message}`)
  return novoGrupo
}

/** Busca todos os CNPJs/clientes de um grupo econômico, com total de vidas somado */
export async function buscarMembrosDoGrupo(grupoEconomicoId, excluirClienteId = null) {
  const { data, error } = await operacional
    .from('clientes_prospects')
    .select('id, razao_social, cnpj, numero_colaboradores, porte, status')
    .eq('grupo_economico_id', grupoEconomicoId)
  if (error) throw new Error(`Erro ao buscar membros do grupo: ${error.message}`)

  const membros = data ?? []
  const totalVidas = membros.reduce((soma, m) => soma + (m.numero_colaboradores ?? 0), 0)
  const outros = excluirClienteId ? membros.filter((m) => m.id !== excluirClienteId) : membros

  return { membros: outros, totalVidas }
}

/** Cria um novo cliente/prospect */
export async function criarClienteProspect(dados) {
  const { data, error } = await operacional
    .from('clientes_prospects')
    .insert(dados)
    .select()
    .single()
  if (error) throw new Error(`Erro ao criar cliente/prospect: ${error.message}`)
  return data
}

/** Atualiza status (usado pelo Kanban ao arrastar entre colunas) */
export async function atualizarStatusClienteProspect(id, status) {
  const { error } = await operacional
    .from('clientes_prospects')
    .update({ status, atualizado_em: new Date().toISOString() })
    .eq('id', id)
  if (error) throw new Error(`Erro ao atualizar status: ${error.message}`)
}

/** Salva (cria ou atualiza) um contato primário/secundário */
export async function salvarContato(clienteProspectId, tipo, dados) {
  const { data: existente } = await operacional
    .from('contatos')
    .select('id')
    .eq('cliente_prospect_id', clienteProspectId)
    .eq('tipo', tipo)
    .maybeSingle()

  if (existente) {
    const { error } = await operacional
      .from('contatos')
      .update({ ...dados, atualizado_em: new Date().toISOString() })
      .eq('id', existente.id)
    if (error) throw new Error(`Erro ao atualizar contato: ${error.message}`)
  } else {
    const { error } = await operacional
      .from('contatos')
      .insert({ cliente_prospect_id: clienteProspectId, tipo, ...dados })
    if (error) throw new Error(`Erro ao criar contato: ${error.message}`)
  }
}

/** Calcula o porte automaticamente a partir do número de vidas (regra da LifitSeg) */
export function calcularPorte(numeroVidas) {
  if (numeroVidas >= 2 && numeroVidas <= 29) return 'PME1'
  if (numeroVidas >= 30 && numeroVidas <= 99) return 'PME2'
  if (numeroVidas >= 100) return 'Negociado'
  return null
}

/**
 * Interpreta um valor digitado em formato brasileiro (vírgula OU ponto
 * como decimal) — evita perder valores quando o campo aceita texto livre
 * em vez de <input type="number">, que rejeita vírgula silenciosamente.
 */
export function parseValorBR(texto) {
  if (texto === '' || texto === null || texto === undefined) return 0
  const normalizado = String(texto).trim().replace(',', '.')
  const valor = parseFloat(normalizado)
  return isNaN(valor) ? 0 : valor
}

/** Lista o catálogo institucional de operadoras (para sugestão/autocomplete, reduz erro de digitação)
 * NOTA (Sprint Master Data Alignment): esta função e `listarCatalogoSeguradoras`, em
 * apolicesService.js, fazem a mesma consulta. É um débito arquitetural já
 * conhecido (duas fontes de acesso ao mesmo catálogo) — registrado aqui,
 * não resolvido nesta Sprint para não ampliar o escopo. */
export async function listarCatalogoOperadoras() {
  const { data, error } = await institucional
    .from('operadoras')
    .select('codigo, nome')
    .eq('status', 'ativa')
    .order('nome')
  if (error) throw new Error(`Erro ao listar operadoras: ${error.message}`)
  return data ?? []
}

/** Cria um novo contrato, com itens por faixa etária e sincroniza a vigência do cliente */
export async function criarContrato(clienteProspectId, dados, itens = []) {
  const { data: contrato, error } = await operacional
    .from('contratos')
    .insert({ cliente_prospect_id: clienteProspectId, ...dados })
    .select()
    .single()
  if (error) throw new Error(`Erro ao criar contrato: ${error.message}`)

  if (itens.length) {
    const itensComId = itens.map((item) => ({ ...item, contrato_id: contrato.id }))
    const { error: erroItens } = await operacional.from('itens_contrato').insert(itensComId)
    if (erroItens) throw new Error(`Erro ao salvar itens do contrato: ${erroItens.message}`)
  }

  // A vigência do cliente reflete sempre o contrato ativo mais recente —
  // evita ter que atualizar o mesmo dado em dois lugares manualmente.
  if (dados.vigencia_fim) {
    await atualizarClienteProspect(clienteProspectId, { data_vigencia: dados.vigencia_fim })
  }

  // Um contrato ativo significa que o prospect virou cliente de verdade —
  // move automaticamente para a coluna "Cliente Ativo" do pipeline.
  if (dados.status === 'ativo') {
    await atualizarStatusClienteProspect(clienteProspectId, 'cliente')
  }

  return contrato
}

/** Atualiza um contrato existente, incluindo re-sincronizar itens por faixa e vigência do cliente */
export async function atualizarContrato(contratoId, dados, itens = null) {
  const { data: contratoAtualizado, error } = await operacional
    .from('contratos')
    .update(dados)
    .eq('id', contratoId)
    .select()
    .single()
  if (error) throw new Error(`Erro ao atualizar contrato: ${error.message}`)

  if (itens !== null) {
    await operacional.from('itens_contrato').delete().eq('contrato_id', contratoId)
    if (itens.length) {
      const itensComId = itens.map((item) => ({ ...item, contrato_id: contratoId }))
      const { error: erroItens } = await operacional.from('itens_contrato').insert(itensComId)
      if (erroItens) throw new Error(`Erro ao salvar itens do contrato: ${erroItens.message}`)
    }
  }

  if (dados.vigencia_fim && contratoAtualizado.cliente_prospect_id) {
    await atualizarClienteProspect(contratoAtualizado.cliente_prospect_id, { data_vigencia: dados.vigencia_fim })
  }

  if (dados.status === 'ativo' && contratoAtualizado.cliente_prospect_id) {
    await atualizarStatusClienteProspect(contratoAtualizado.cliente_prospect_id, 'cliente')
  }

  return contratoAtualizado
}

/** Exclui um contrato (sem histórico próprio vinculado além de beneficiários, que ficam órfãos — atenção) */
export async function excluirContrato(contratoId) {
  const { error } = await operacional.from('contratos').delete().eq('id', contratoId)
  if (error) throw new Error(`Erro ao excluir contrato: ${error.message}`)
}

/** Cria (ou atualiza status/registro) um novo Corretor — perfil já deve existir no Supabase Auth */
export async function cadastrarCorretor({ email, nomeCompleto, papel }) {
  const { data, error } = await supabase.rpc('criar_perfil_por_email', {
    p_email: email,
    p_nome: nomeCompleto,
    p_papel: papel,
  })
  if (error) throw new Error(`Erro ao cadastrar corretor: ${error.message}`)
  return data
}

/**
 * Cria uma cotação. `dados` é passado adiante como veio — pode conter
 * `operadora_id` (Sprint Master Data Alignment, preferido) e/ou
 * `operadora_nome_livre` (legado). A descrição da próxima ação tenta
 * usar o nome livre primeiro (mais rápido, já vem pronto); se só houver
 * operadora_id, busca o nome oficial no catálogo institucional.
 */
export async function criarCotacao({ clienteProspectId, casoId, dados, itens }) {
  // CORREÇÃO (11/08): não basta um default — se `dados.status` vier
  // preenchido com um valor antigo (ex: 'em_analise', que não existe
  // mais na constraint), ele sobrescrevia a defesa anterior via
  // spread. Uma cotação SEMPRE nasce em negociação — nenhum
  // formulário deveria decidir outro status na criação, então
  // ignoramos qualquer `status` vindo de fora, sem exceção.
  const { status: _statusIgnoradoNaCriacao, ...dadosSemStatus } = dados
  const { data: cotacao, error } = await operacional
    .from('cotacoes')
    .insert({
      cliente_prospect_id: clienteProspectId,
      caso_id: casoId ?? null,
      ...dadosSemStatus,
      status: 'em_negociacao',
    })
    .select()
    .single()

  if (error) throw new Error(`Erro ao criar cotação: ${error.message}`)

  if (itens?.length) {
    const itensComId = itens.map((item) => ({ ...item, cotacao_id: cotacao.id }))
    const { error: erroItens } = await operacional.from('itens_cotacao').insert(itensComId)
    if (erroItens) throw new Error(`Erro ao salvar itens da cotação: ${erroItens.message}`)
  }

  // Toda cotação gerada agenda automaticamente uma próxima ação — usa o
  // prazo de validade da própria cotação, se informado (faz mais sentido
  // retomar exatamente quando a proposta vence); cai para +7 dias como
  // padrão caso a validade não tenha sido preenchida. O status só avança
  // para "Em Negociação" se o cliente ainda for um prospect novo — nunca
  // REBAIXA quem já é "Cliente Ativo" (ex: cotação de renovação).
  let nomeOperadoraDescricao = dados.operadora_nome_livre ?? null
  if (!nomeOperadoraDescricao && dados.operadora_id) {
    const { data: operadora } = await institucional
      .from('operadoras')
      .select('nome')
      .eq('id', dados.operadora_id)
      .maybeSingle()
    nomeOperadoraDescricao = operadora?.nome ?? null
  }

  const { data: clienteAtual } = await operacional
    .from('clientes_prospects')
    .select('status')
    .eq('id', clienteProspectId)
    .maybeSingle()

  const patchCliente = {
    proxima_acao_data: dados.validade || dataLocalISO(7),
    proxima_acao_descricao: `Retomar cotação (${nomeOperadoraDescricao ?? 'operadora'})`,
    atualizado_em: new Date().toISOString(),
  }
  if (clienteAtual?.status === 'prospect') {
    patchCliente.status = 'em_negociacao'
  }

  await operacional.from('clientes_prospects').update(patchCliente).eq('id', clienteProspectId)

  return cotacao
}

/** Atualiza uma cotação existente, substituindo os itens por faixa etária */
export async function atualizarCotacao(cotacaoId, dados, itens = null) {
  const { error } = await operacional.from('cotacoes').update(dados).eq('id', cotacaoId)
  if (error) throw new Error(`Erro ao atualizar cotação: ${error.message}`)

  if (itens !== null) {
    await operacional.from('itens_cotacao').delete().eq('cotacao_id', cotacaoId)
    if (itens.length) {
      const itensComId = itens.map((item) => ({ ...item, cotacao_id: cotacaoId }))
      const { error: erroItens } = await operacional.from('itens_cotacao').insert(itensComId)
      if (erroItens) throw new Error(`Erro ao salvar itens da cotação: ${erroItens.message}`)
    }
  }
}

/** Exclui uma cotação (e seus itens, via cascade) */
export async function excluirCotacao(cotacaoId) {
  const { error } = await operacional.from('cotacoes').delete().eq('id', cotacaoId)
  if (error) throw new Error(`Erro ao excluir cotação: ${error.message}`)
}

/**
 * Fila de Normalização (Sprint Master Data Alignment — Operadoras):
 * lista cotações que ainda têm apenas o nome da seguradora em texto
 * livre, sem vínculo com o catálogo institucional. Escopo restrito ao
 * Lifleet, por decisão do Chief Systems Analyst — identificamos essas
 * cotações pelos campos que só o Cotador Auto/Comparativo preenche
 * (`contexto_veiculo` ou `grupo_comparacao_id`), sem mexer em cotações
 * de outros módulos.
 */
export async function listarCotacoesParaNormalizar() {
  const { data, error } = await operacional
    .from('cotacoes')
    .select('*')
    .is('operadora_id', null)
    .not('operadora_nome_livre', 'is', null)
    .or('contexto_veiculo.not.is.null,grupo_comparacao_id.not.is.null')
    .order('data_cotacao', { ascending: false })
  if (error) throw new Error(`Erro ao listar cotações para normalizar: ${error.message}`)
  return data ?? []
}

/**
 * Confirma manualmente qual seguradora do catálogo institucional
 * corresponde a uma cotação com nome livre. Nunca decide isso sozinho
 * (sem heurística de similaridade de texto) — só grava a escolha
 * humana. `operadora_nome_livre` é preservado como está, servindo de
 * referência histórica do texto original digitado.
 */
export async function normalizarOperadoraCotacao(cotacaoId, operadoraId) {
  if (!operadoraId) throw new Error('Selecione a seguradora oficial correspondente.')
  await atualizarCotacao(cotacaoId, { operadora_id: operadoraId })
}

/**
 * Sprint Ciclo de Fechamento Comercial — Cotação → Proposta → Apólice.
 *
 * ATUALIZADO (BMR-004/CLU-002, Fase 2 — 11/08): virou wrapper fino
 * sobre `avancarParaEmissao` (o novo motor do ciclo universal), no
 * lugar do `avancarEtapaCiclo` genérico por índice. Mesmo nome, mesma
 * assinatura, mesmo comportamento externo — Lifleet/Lifsure/LiShield/
 * Lifplan continuam chamando essa função sem precisar mudar nada.
 * Corrige de quebra o bug do status 'recusada' inválido (ver
 * commercialLifecycleService.js).
 */
export async function fecharCotacaoComOpcao(cotacaoId, usuarioId) {
  await avancarParaEmissao(cotacaoId, usuarioId)
}

/**
 * ⚠️ PENDENTE DE MIGRAÇÃO (BMR-004/CLU-002, Fase 2 — 11/08): esta
 * função ainda autogera uma Apólice com dado mínimo (`premio`,
 * `operadora`) ao "aprovar" — exatamente o comportamento que o Chief
 * travou como proibido ("emissão nunca autogera documento"). Mantida
 * funcionando por enquanto (ainda em uso por Lifleet/Lifsure/LiShield)
 * para não quebrar os botões existentes, mas precisa ser SUBSTITUÍDA
 * pelo fluxo novo: navegar pro formulário real de Apólice, corretor
 * preenche, o Salvar chama `fecharCotacaoComDocumento`. Depende dos
 * componentes de UI (PipelinePage.jsx e formulários de Apólice de cada
 * módulo) — próximo incremento da Fase 2, ainda não iniciado.
 */
export async function aprovarPropostaCotacao(cotacaoId, usuarioId) {
  const { data: cotacaoAntes, error } = await operacional.from('cotacoes').select('status').eq('id', cotacaoId).single()
  if (error) throw new Error(`Erro ao buscar cotação: ${error.message}`)
  if (cotacaoAntes.status !== 'proposta_emitida') {
    throw new Error('Só é possível aprovar uma cotação que já esteja como Proposta Emitida.')
  }

  const { documentoId } = await avancarEtapaCiclo(cotacaoId, usuarioId, {
    gerarDocumentoFinal: async (cotacao) => {
      const { data: cliente } = await operacional
        .from('clientes_prospects')
        .select('razao_social')
        .eq('id', cotacao.cliente_prospect_id)
        .single()
      const { data: org } = await operacional.from('organizacoes').select('id').limit(1).single()

      const apolice = await criarApolice({
        corretorId: usuarioId,
        organizacaoId: org?.id,
        dados: {
          cliente_prospect_id: cotacao.cliente_prospect_id,
          nome_cliente: cliente?.razao_social ?? null,
          operadora_id: cotacao.operadora_id ?? null,
          operadora_nome_livre: cotacao.operadora_nome_livre ?? null,
          premio: cotacao.valor_total ?? null,
          produto: cotacao.contexto_veiculo ? 'Auto' : null,
          origem_venda: 'venda_nova',
        },
      })

      await atualizarCotacao(cotacaoId, { apolice_id: apolice.id })
      return apolice.id
    },
  })

  return { apoliceId: documentoId }
}

/**
 * ⚠️ PENDENTE DE MIGRAÇÃO (BMR-004/CLU-002, Fase 2 — 11/08): esta é a
 * função separada do Lifcare que o Chief determinou ser absorvida pelo
 * motor único, sem exceção. Hoje ainda autogera um Contrato com dado
 * mínimo (`status: 'ativo'` direto, sem gatilho de comissão) — mesmo
 * problema de `aprovarPropostaCotacao`, mesma trava do Chief. Mantida
 * funcionando por enquanto (Lifcare depende dela) até o formulário real
 * de Contrato ser conectado a `fecharCotacaoComDocumento`. Também usa
 * `avancarEtapaCiclo` (motor antigo por índice), que segue funcionando
 * para módulos que ainda não migraram, mas não é mais chamado por
 * nenhuma função nova.
 */
export async function avancarEtapaComercial(cotacaoId, usuarioId) {
  const { data: cotacaoAntes, error } = await operacional
    .from('cotacoes')
    .select('cliente_prospect_id')
    .eq('id', cotacaoId)
    .single()
  if (error) throw new Error(`Erro ao buscar cotação: ${error.message}`)

  const { data: cliente } = await operacional
    .from('clientes_prospects')
    .select('modulo, razao_social')
    .eq('id', cotacaoAntes.cliente_prospect_id)
    .single()

  return avancarEtapaCiclo(cotacaoId, usuarioId, {
    gerarDocumentoFinal: async (cotacao) => {
      if (cliente?.modulo === 'saude') {
        const contrato = await criarContrato(cotacao.cliente_prospect_id, {
          operadora_id: cotacao.operadora_id ?? null,
          operadora_nome_livre: cotacao.operadora_nome_livre ?? null,
          status: 'ativo',
        })
        await atualizarCotacao(cotacaoId, { contrato_id: contrato.id })
        return contrato.id
      }
      // Outros módulos com ciclo de mais de 3 etapas entram aqui
      // quando existirem — nenhum documento gerado às cegas.
      return null
    },
  })
}

/** Abre uma demanda manual (sem passar pelo Especialista) — usado no botão "Nova Demanda" da aba Demandas */
export async function criarDemandaManual({ clienteProspectId, organizacaoId, descricao, dataProximaAcao, codigoRpc = 'gerar_codigo_demanda_saude' }) {
  const { data: codigo } = await operacional.rpc(codigoRpc)

  const { data, error } = await operacional
    .from('casos')
    .insert({
      codigo,
      organizacao_id: organizacaoId,
      cliente_prospect_id: clienteProspectId,
      demanda_original: descricao,
      situacao: 'aberto',
      data_proxima_acao: dataProximaAcao || null,
    })
    .select()
    .single()

  if (error) throw new Error(`Erro ao abrir demanda: ${error.message}`)

  // Também atualiza a próxima ação do cliente, se informada
  if (dataProximaAcao) {
    await definirProximaAcao(clienteProspectId, dataProximaAcao, descricao)
  }

  return data
}

/** Registra uma atualização manual (nota do corretor, sem IA) na linha do tempo da demanda */
export async function adicionarAtualizacaoManual(casoId, texto, usuarioId) {
  const { error } = await operacional.from('eventos').insert({
    caso_id: casoId,
    tipo: 'atualizacao_manual',
    descricao: texto,
    usuario_responsavel: usuarioId,
  })
  if (error) throw new Error(`Erro ao registrar atualização: ${error.message}`)
}

/** Atualiza o status (situação) e/ou a data de próxima ação de uma demanda existente */
export async function atualizarDemanda(casoId, { situacao, dataProximaAcao }) {
  const patch = {}
  if (situacao) patch.situacao = situacao
  if (dataProximaAcao !== undefined) patch.data_proxima_acao = dataProximaAcao || null

  const { data: casoAtualizado, error } = await operacional
    .from('casos')
    .update(patch)
    .eq('id', casoId)
    .select('cliente_prospect_id')
    .single()
  if (error) throw new Error(`Erro ao atualizar demanda: ${error.message}`)

  // Sempre que o status muda (finalizar, reabrir, etc.), recalcula a
  // próxima ação do cliente a partir das demandas que ainda estão
  // abertas — evita "ação fantasma" de uma demanda já encerrada.
  if (situacao && casoAtualizado?.cliente_prospect_id) {
    await recalcularProximaAcaoCliente(casoAtualizado.cliente_prospect_id)
  }
}

/**
 * Recalcula a próxima ação de um cliente com base nas demandas ainda
 * em aberto (a mais próxima "vence"). Se não houver nenhuma demanda
 * aberta com data marcada, limpa o campo (sem deixar ação fantasma).
 */
export async function recalcularProximaAcaoCliente(clienteProspectId) {
  const { data: demandasAbertas } = await operacional
    .from('casos')
    .select('data_proxima_acao, demanda_original')
    .eq('cliente_prospect_id', clienteProspectId)
    .not('situacao', 'in', '(encerrado,resolvido)')
    .not('data_proxima_acao', 'is', null)
    .order('data_proxima_acao', { ascending: true })
    .limit(1)

  const proxima = demandasAbertas?.[0]

  await operacional
    .from('clientes_prospects')
    .update({
      proxima_acao_data: proxima?.data_proxima_acao ?? null,
      proxima_acao_descricao: proxima?.demanda_original ?? null,
      atualizado_em: new Date().toISOString(),
    })
    .eq('id', clienteProspectId)
}

export async function listarVigenciasProximas(diasLimite = 90, modulo = 'saude', corretorId = null) {
  let query = operacional
    .from('clientes_prospects')
    .select('id, razao_social, status, data_vigencia')
    .eq('modulo', modulo)
    .not('data_vigencia', 'is', null)
    .lte('data_vigencia', dataLocalISO(diasLimite))
    .gte('data_vigencia', dataLocalISO())
    .order('data_vigencia')

  if (corretorId) {
    query = query.eq('corretor_id', corretorId)
  }

  const { data, error } = await query

  if (error) throw new Error(`Erro ao consultar vigências: ${error.message}`)
  return data ?? []
}

/**
 * Propostas emitidas aguardando aprovação — estado real, persistido
 * (cotacoes.status = 'proposta_emitida'), usado pela Operational Work
 * Queue (Sprint 003). Nunca infere nada: só lê o status que o Ciclo de
 * Fechamento Comercial já grava.
 */
export async function listarPropostasPendentes({ corretorId } = {}) {
  let query = operacional
    .from('cotacoes')
    .select('id, cliente_prospect_id, operadora_nome_livre, valor_total, data_cotacao')
    .eq('status', 'proposta_emitida')
    .order('data_cotacao', { ascending: true })

  const { data: cotacoes, error } = await query
  if (error) throw new Error(`Erro ao listar propostas pendentes: ${error.message}`)
  if (!cotacoes?.length) return []

  const idsClientes = [...new Set(cotacoes.map((c) => c.cliente_prospect_id))]
  let clientesQuery = operacional
    .from('clientes_prospects')
    .select('id, razao_social, corretor_id, modulo')
    .in('id', idsClientes)
  if (corretorId) clientesQuery = clientesQuery.eq('corretor_id', corretorId)

  const { data: clientes, error: erroClientes } = await clientesQuery
  if (erroClientes) throw new Error(`Erro ao buscar clientes das propostas: ${erroClientes.message}`)

  const clientePorId = Object.fromEntries((clientes ?? []).map((c) => [c.id, c]))

  return cotacoes
    .filter((c) => clientePorId[c.cliente_prospect_id])
    .map((c) => ({ ...c, cliente: clientePorId[c.cliente_prospect_id] }))
}