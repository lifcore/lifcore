import { operacional } from '../supabaseSchemas'
import { WORKSPACES } from '../../workspaces'
import { registrarEventoComercial } from './eventosComerciaisService'
import { criarComissaoSugerida } from './comissoesService'

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
 * Módulos cuja comissão sugerida já pode ser disparada centralizada por
 * este motor, sem risco de duplicidade.
 *
 * Lifsure/LiShield/Lifplan não têm hoje NENHUM mecanismo de comissão
 * próprio (confirmado por inspeção de lifsureService.js/
 * lishieldService.js/lifplanService.js, 11/08) — centralizar aqui é
 * puro ganho.
 *
 * Lifleet ('auto') também incluído (atualizado 11/08, após inspecionar
 * ApoliceAutoForm.jsx): o mecanismo que existe dentro de
 * `lifleetService.criarApoliceAuto` só dispara quando `origemVenda ===
 * 'venda_nova'` é passado explicitamente — e o único formulário real
 * que chama essa função (ApoliceAutoForm.jsx) NUNCA passa esse
 * parâmetro. Ou seja, esse caminho está morto na prática hoje (toda
 * apólice lançada por ali cai em 'migracao', sem gerar comissão). Sem
 * risco de duplicidade — pode centralizar.
 *
 * `modulo` aqui usa os valores de `clientes_prospects.modulo`
 * ('saude'/'auto'/'lifsure'/'lishield'/'lifplan'), mas os registros
 * existentes em `comissoes.modulo` usam 'lifleet' (não 'auto') —
 * convenção herdada do único lançamento que já existia. Mapeamos
 * abaixo pra manter consistência com o que já está no banco.
 */
const MODULOS_COM_COMISSAO_CENTRALIZADA = ['auto', 'lifsure', 'lishield', 'lifplan']
const MODULO_PARA_COMISSAO = { auto: 'lifleet', lifsure: 'lifsure', lishield: 'lishield', lifplan: 'lifplan' }

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
 * Dispara a sugestão de comissão universal (RFC-001 destravada) para
 * os módulos em MODULOS_COM_COMISSAO_CENTRALIZADA. Para o Lifcare
 * (Contrato): comissão não é disparada aqui — `comissoes` só tem
 * `apolice_id`, sem `contrato_id` (achado estrutural, decisão de
 * schema pendente pro fechamento com o Chief, fora do escopo desta
 * Fase). Não é regressão: o Lifcare já não gerava comissão nenhuma.
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

  if (apoliceId && MODULOS_COM_COMISSAO_CENTRALIZADA.includes(modulo)) {
    const { data: apolice, error: erroApolice } = await operacional
      .from('apolices')
      .select('organizacao_id, corretor_id, premio')
      .eq('id', apoliceId)
      .single()

    if (!erroApolice && apolice) {
      await criarComissaoSugerida({
        organizacaoId: apolice.organizacao_id,
        operadoraId: cotacao.operadora_id ?? null,
        apoliceId,
        corretorId: apolice.corretor_id,
        modulo: MODULO_PARA_COMISSAO[modulo] ?? modulo,
        valorPremio: apolice.premio,
      })
    }
  }

  return { fechada: true }
}