import { operacional } from '../supabaseSchemas'
import { WORKSPACES } from '../../workspaces'
import { registrarEventoComercial } from './eventosComerciaisService'

/**
 * Commercial Lifecycle Engine (Sprint 009 — CLU-001, Blocos A/B).
 *
 * Domínio corporativo único do ciclo comercial. Nenhum componente
 * deve conhecer a lista de etapas de um módulo — todos consultam o
 * Workspace Registry (`workspaces.js`), nunca hardcodam status.
 *
 * `fecharCotacaoComOpcao` e `aprovarPropostaCotacao` (em
 * clientesService.js) continuam existindo com o mesmo nome e
 * comportamento externo — por dentro, agora são só wrappers finos
 * chamando este motor (diretriz do Chief: "Wrapper de Compatibilidade",
 * não reescrever, não duplicar, não quebrar o que já funciona).
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

/** Recusa automaticamente as outras cotações da mesma rodada de comparação (grupo_comparacao_id) */
export async function recusarSiblingsDoGrupo(cotacaoId, usuarioId) {
  const { data: cotacao } = await operacional.from('cotacoes').select('grupo_comparacao_id').eq('id', cotacaoId).single()
  if (!cotacao?.grupo_comparacao_id) return

  const { data: outras } = await operacional
    .from('cotacoes')
    .select('id')
    .eq('grupo_comparacao_id', cotacao.grupo_comparacao_id)
    .neq('id', cotacaoId)

  for (const outra of outras ?? []) {
    await operacional.from('cotacoes').update({ status: 'recusada' }).eq('id', outra.id)
    await registrarEventoComercial({
      entidadeTipo: 'cotacao',
      entidadeId: outra.id,
      tipoEvento: 'recusada',
      descricao: 'Recusada automaticamente — outra opção da mesma rodada de comparação foi escolhida',
      usuarioId,
    })
  }
}