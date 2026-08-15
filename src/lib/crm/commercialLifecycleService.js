import { operacional } from '../supabaseSchemas'
import { WORKSPACES } from '../../workspaces'
import { registrarEventoComercial } from './eventosComerciaisService'
import { criarVendaSeElegivel } from './vendasService'

/**
 * Commercial Lifecycle Engine (Sprint 009 — CLU-001, Blocos A/B).
 * Atualizado na Fase 2 do BMR-004/CLU-002 (11/08) para o ciclo
 * comercial universal (5 valores em todos os módulos, sem exceção):
 * em_negociacao → emissao → fechada, com perdida/expirada como saídas
 * alternativas (nunca "próxima etapa" de uma lista, são disparadas por
 * ação explícita, não por avanço automático).
 *
 * `avancarEtapaCiclo` (abaixo) é o motor genérico da Sprint anterior,
 * que avança por ÍNDICE dentro de um array de etapas — funcionava bem
 * quando todas as etapas eram sequenciais. Com o ciclo universal isso
 * deixou de valer (perdida/expirada não são "a próxima depois de
 * fechada"). Por isso as novas funções (`avancarParaEmissao` e
 * `fecharCotacaoComDocumento`, abaixo) são transições NOMEADAS, não
 * genéricas por índice. `avancarEtapaCiclo` fica mantida (não removida)
 * só por segurança, caso algum componente ainda não migrado a chame —
 * mas não é mais usada por nenhuma função nova deste arquivo.
 *
 * ATUALIZADO (Sprint Vendas Central, aprovada pelo Chief): a criação
 * automática de comissão sugerida legada (`criarComissaoSugerida`, em
 * comissoesService.js) foi RETIRADA deste fluxo. `criarComissaoSugerida`
 * e a tabela `comissoes` continuam existindo, intocadas, só não são mais
 * chamadas automaticamente daqui — decisão de limpeza controlada fica
 * pra depois. No lugar, `fecharCotacaoComDocumento` agora cria a Venda
 * central (via `vendasService.criarVendaSeElegivel`), que passa a ser a
 * entrada oficial do fluxo Venda → Regra de Comissão → Comissão
 * Sugerida (DOC-COM-003), não mais o antigo caminho direto pra
 * `comissoes`.
 *
 * CORREÇÃO (teste real, apólice AZUL/01245 — Raphael, 15/08): a
 * primeira versão desta integração falhava silenciosamente (erro
 * engolido pelo try/catch, sem aparecer em lugar nenhum da UI) porque
 * `vendasService` tentava gravar `organizacao_id` — coluna que não
 * existe em `vendas` — e não preenchia `modulo`/`tipo`/`valor_base`/
 * `status`, todas obrigatórias na tabela real. Corrigido: esta função
 * agora passa `modulo`, `usuarioId` e `operadoraId` pro vendasService,
 * que busca o resto (prêmio da apólice) internamente.
 */

const MODULO_PARA_WORKSPACE_ID = {
  saude: 'lifcare',
  auto: 'auto',
  lifsure: 'lifsure',
  lishield: 'lishield',
  lifplan: 'lifplan',
}

/** Devolve a lista de etapas do ciclo comercial de um módulo, ou null se não houver nenhuma declarada */
export function obterEtapasCiclo(moduloCliente) {
  const workspaceId = MODULO_PARA_WORKSPACE_ID[moduloCliente]
  const workspace = WORKSPACES[workspaceId]
  if (!workspace?.commercialLifecycle?.enabled) return null
  return workspace.commercialLifecycle.stages
}

async function buscarModuloDoCliente(clienteProspectId) {
  const { data, error } = await operacional
    .from('clientes_prospects')
    .select('modulo')
    .eq('id', clienteProspectId)
    .single()
  if (error) throw new Error(`Erro ao buscar módulo do cliente: ${error.message}`)
  return data.modulo
}

/**
 * Avança a cotação uma etapa no ciclo comercial do Workspace dela.
 * Quando a etapa alcançada é a última da lista, executa
 * `gerarDocumentoFinal` (fornecido por quem chama — o motor nunca
 * decide sozinho o que é "documento final" de cada módulo).
 */
export async function avancarEtapaCiclo(cotacaoId, usuarioId, { gerarDocumentoFinal } = {}) {
  const { data: cotacao, error } = await operacional.from('cotacoes').select('*').eq('id', cotacaoId).single()
  if (error) throw new Error(`Erro ao buscar cotação: ${error.message}`)

  const modulo = await buscarModuloDoCliente(cotacao.cliente_prospect_id)
  const etapas = obterEtapasCiclo(modulo)
  if (!etapas) {
    throw new Error(`O módulo "${modulo}" ainda não tem um ciclo comercial habilitado no Workspace Registry.`)
  }

  const etapaAtual = cotacao.status ?? etapas[0]
  const indiceAtual = etapas.indexOf(etapaAtual)
  if (indiceAtual === -1) {
    throw new Error(`Status atual "${etapaAtual}" não pertence ao ciclo comercial deste módulo.`)
  }

  const proximaEtapa = etapas[indiceAtual + 1]
  if (!proximaEtapa) {
    throw new Error('Esta cotação já está na última etapa do ciclo comercial.')
  }

  await operacional.from('cotacoes').update({ status: proximaEtapa }).eq('id', cotacaoId)
  await registrarEventoComercial({
    entidadeTipo: 'cotacao',
    entidadeId: cotacaoId,
    tipoEvento: proximaEtapa,
    descricao: `Avançou para a etapa: ${proximaEtapa}`,
    usuarioId,
  })

  const ehEtapaFinal = indiceAtual + 1 === etapas.length - 1
  let documentoId = null

  if (ehEtapaFinal && gerarDocumentoFinal) {
    documentoId = await gerarDocumentoFinal({ ...cotacao, status: proximaEtapa })
    await registrarEventoComercial({
      entidadeTipo: 'cotacao',
      entidadeId: cotacaoId,
      tipoEvento: 'documento_gerado',
      descricao: 'Documento final gerado ao concluir o ciclo comercial',
      usuarioId,
    })
  }

  return { proximaEtapa, ehEtapaFinal, documentoId }
}

/**
 * Marca como "perdida" automaticamente as outras cotações da mesma
 * rodada de comparação (grupo_comparacao_id).
 *
 * CORREÇÃO (Fase 2, 11/08): antes gravava status: 'recusada' — valor
 * que deixou de existir quando a constraint universal de 5 valores foi
 * aplicada na Fase 1 (em_negociacao/emissao/fechada/perdida/expirada).
 * Estava quebrando com erro de constraint toda vez que o comparativo
 * (Lifleet) era fechado. 'perdida' é o valor correto — semanticamente
 * a mesma coisa (essa opção perdeu porque outra foi escolhida).
 */
export async function recusarSiblingsDoGrupo(cotacaoId, usuarioId) {
  const { data: cotacao } = await operacional.from('cotacoes').select('grupo_comparacao_id').eq('id', cotacaoId).single()
  if (!cotacao?.grupo_comparacao_id) return

  const { data: outras } = await operacional
    .from('cotacoes')
    .select('id')
    .eq('grupo_comparacao_id', cotacao.grupo_comparacao_id)
    .neq('id', cotacaoId)

  for (const outra of outras ?? []) {
    await operacional.from('cotacoes').update({ status: 'perdida' }).eq('id', outra.id)
    await registrarEventoComercial({
      entidadeTipo: 'cotacao',
      entidadeId: outra.id,
      tipoEvento: 'perdida',
      descricao: 'Perdida automaticamente — outra opção da mesma rodada de comparação foi escolhida',
      usuarioId,
    })
  }
}

/**
 * Módulos cuja operação, hoje, é elegível para gerar comissão quando
 * fechada com uma Apólice (`apoliceId`).
 *
 * MANTIDO EXATAMENTE COMO ANTES (Sprint Vendas Central não altera quem
 * ganha comissão hoje — zero regressão). Lifcare ('saude', caminho de
 * `contratoId`) permanece fora desta lista, como já estava: gap de
 * schema conhecido (`comissoes` sem `contrato_id`), decisão de negócio
 * pendente, fora do escopo desta entrega. A taxonomia de renovação,
 * endosso, nomeação etc. também permanece fora de escopo — cada módulo
 * define isso na sua própria homologação futura.
 */
const MODULOS_COM_COMISSAO_CENTRALIZADA = ['auto', 'lifsure', 'lishield', 'lifplan']

/**
 * Avança a cotação de "em_negociacao" para "emissao" — o corretor
 * escolheu esta opção, formalização começa a andar. Marca as demais
 * opções da mesma rodada de comparação como "perdida".
 *
 * Substitui, com o mesmo comportamento externo, o antigo
 * `fecharCotacaoComOpcao` (clientesService.js) — que agora é só um
 * wrapper fino chamando esta função.
 */
export async function avancarParaEmissao(cotacaoId, usuarioId) {
  const { data: cotacao, error } = await operacional.from('cotacoes').select('status').eq('id', cotacaoId).single()
  if (error) throw new Error(`Erro ao buscar cotação: ${error.message}`)

  if (cotacao.status !== 'em_negociacao') {
    throw new Error('Só é possível avançar para Emissão uma cotação que esteja em negociação.')
  }

  await operacional.from('cotacoes').update({ status: 'emissao' }).eq('id', cotacaoId)
  await registrarEventoComercial({
    entidadeTipo: 'cotacao',
    entidadeId: cotacaoId,
    tipoEvento: 'emissao',
    descricao: 'Cliente escolheu esta opção — formalização em andamento',
    usuarioId,
  })

  await recusarSiblingsDoGrupo(cotacaoId, usuarioId)
}

/**
 * Fecha definitivamente a cotação: "emissao" → "fechada". Só deve ser
 * chamada depois que o corretor já SALVOU o documento real (Apólice ou
 * Contrato) no formulário próprio do módulo — esta função nunca gera
 * documento sozinha, só recebe o ID de quem já foi criado e grava o
 * vínculo (regra crítica travada pelo Chief no BMR-004: "emissão nunca
 * autogera documento com dado mínimo").
 *
 * ATUALIZADO (Sprint Vendas Central): o ponto de decisão comercial
 * `geraComissao` é calculado aqui, com o MESMO critério de antes
 * (apólice + módulo em MODULOS_COM_COMISSAO_CENTRALIZADA — zero
 * regressão). Quando `geraComissao` é true, cria a Venda central via
 * `vendasService.criarVendaSeElegivel`, que passa a ser a entrada
 * oficial pro Finance Center (Venda → Regra de Comissão → Comissão
 * Sugerida). A chamada antiga a `criarComissaoSugerida` (comissoesService,
 * tabela `comissoes`) foi retirada deste fluxo — a função e a tabela
 * continuam existindo, só não são mais chamadas automaticamente daqui.
 *
 * ATENÇÃO — MUDANÇA NO FORMATO DO RETORNO: antes esta função devolvia
 * `{ fechada, comissaoGerada, erroComissao }`. Agora devolve
 * `{ fechada, vendaCriada, vendaId, erroVenda }`. Se algum componente de
 * UI lê `resultado.comissaoGerada`, isso vai virar `undefined`
 * silenciosamente — confirmar antes do deploy se algum ClienteDetail*Page
 * depende desse campo.
 */
export async function fecharCotacaoComDocumento(cotacaoId, usuarioId, { apoliceId = null, contratoId = null } = {}) {
  const { data: cotacao, error } = await operacional
    .from('cotacoes')
    .select('status, cliente_prospect_id, operadora_id')
    .eq('id', cotacaoId)
    .single()
  if (error) throw new Error(`Erro ao buscar cotação: ${error.message}`)

  if (cotacao.status !== 'emissao') {
    throw new Error('Só é possível fechar uma cotação que esteja em Emissão.')
  }
  if (!apoliceId && !contratoId) {
    throw new Error('É necessário informar o documento formalizado (apólice ou contrato) para fechar a cotação.')
  }

  const modulo = await buscarModuloDoCliente(cotacao.cliente_prospect_id)

  await operacional
    .from('cotacoes')
    .update({ status: 'fechada', apolice_id: apoliceId, contrato_id: contratoId })
    .eq('id', cotacaoId)

  await registrarEventoComercial({
    entidadeTipo: 'cotacao',
    entidadeId: cotacaoId,
    tipoEvento: 'fechada',
    descricao: 'Cotação fechada — documento formalizado',
    usuarioId,
  })

  const geraComissao = Boolean(apoliceId) && MODULOS_COM_COMISSAO_CENTRALIZADA.includes(modulo)
  let vendaCriada = null

  if (apoliceId || contratoId) {
    // Efeito colateral, não o fechamento em si — a cotação e o
    // documento já estão salvos de verdade nesse ponto. Uma falha aqui
    // (schema divergente, constraint, etc.) NUNCA pode fazer parecer
    // que o fechamento inteiro falhou; só registra o problema separado,
    // sem interromper o retorno de sucesso.
    try {
      vendaCriada = await criarVendaSeElegivel({
        clienteProspectId: cotacao.cliente_prospect_id,
        apoliceId,
        contratoId,
        cotacaoId,
        modulo,
        operadoraId: cotacao.operadora_id ?? null,
        usuarioId,
        geraComissao,
      })
    } catch (erroVenda) {
      return { fechada: true, vendaCriada: false, erroVenda: erroVenda.message }
    }
  }

  return { fechada: true, vendaCriada: Boolean(vendaCriada), vendaId: vendaCriada?.id ?? null }
}

/**
 * Cenário 6 (Desistência) — ação explícita do corretor, nunca
 * automática. Só permitida a partir de em_negociacao ou emissao (não
 * faz sentido desistir de algo já fechado/perdido/expirado).
 */
export async function marcarCotacaoPerdida(cotacaoId, usuarioId, motivo) {
  const { data: cotacao, error } = await operacional.from('cotacoes').select('status').eq('id', cotacaoId).single()
  if (error) throw new Error(`Erro ao buscar cotação: ${error.message}`)
  if (!['em_negociacao', 'emissao'].includes(cotacao.status)) {
    throw new Error('Só é possível marcar como perdida uma cotação que esteja em negociação ou emissão.')
  }

  await operacional.from('cotacoes').update({ status: 'perdida' }).eq('id', cotacaoId)
  await registrarEventoComercial({
    entidadeTipo: 'cotacao',
    entidadeId: cotacaoId,
    tipoEvento: 'perdida',
    descricao: motivo?.trim() ? `Cliente desistiu — ${motivo.trim()}` : 'Cliente desistiu',
    usuarioId,
  })
}

/**
 * Cenário 7 (Expiração) — também ação explícita do corretor por
 * enquanto (não automática — não há confirmação de agendamento no
 * Supabase pra rodar isso sozinho em background). Só permitida quando
 * a validade já passou, pra evitar expirar cotação por engano.
 */
export async function marcarCotacaoExpirada(cotacaoId, usuarioId) {
  const { data: cotacao, error } = await operacional.from('cotacoes').select('status, validade').eq('id', cotacaoId).single()
  if (error) throw new Error(`Erro ao buscar cotação: ${error.message}`)
  if (!['em_negociacao', 'emissao'].includes(cotacao.status)) {
    throw new Error('Só é possível marcar como expirada uma cotação que esteja em negociação ou emissão.')
  }
  const hoje = new Date().toISOString().slice(0, 10)
  if (!cotacao.validade || cotacao.validade >= hoje) {
    throw new Error('Só é possível marcar como expirada uma cotação cuja validade já passou.')
  }

  await operacional.from('cotacoes').update({ status: 'expirada' }).eq('id', cotacaoId)
  await registrarEventoComercial({
    entidadeTipo: 'cotacao',
    entidadeId: cotacaoId,
    tipoEvento: 'expirada',
    descricao: 'Prazo de validade vencido sem decisão do cliente',
    usuarioId,
  })
}
