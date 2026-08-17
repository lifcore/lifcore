import { institucional, operacional } from '../supabaseSchemas'
import { supabase } from '../supabaseClient'

/**
 * SPEC-001 — Motor de Estudo de Mercado, Peça 3.
 * Mesmo padrão de lotesImportacaoService.js (Motor Universal financeiro):
 * dedup por hash antes do upload, disparo automático não-bloqueante,
 * reprocessamento e homologação manual de formato.
 */

const BUCKET = 'anexos' // mesmo bucket já usado pelo Motor Universal

const EXTENSOES_ACEITAS = { pdf: 'pdf' }

function inferirTipoArquivo(nomeArquivo) {
  const ext = nomeArquivo.split('.').pop()?.toLowerCase()
  const tipo = EXTENSOES_ACEITAS[ext]
  if (!tipo) throw new Error(`Tipo de arquivo não suportado: .${ext}. O Multicálculo deve ser PDF.`)
  return tipo
}

async function calcularHashArquivo(file) {
  const buffer = await file.arrayBuffer()
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer)
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

/**
 * Upload de um Multicálculo. Verifica duplicidade pelo hash antes de
 * subir (mesma trava do Motor Universal). Dispara o processamento
 * automaticamente — se falhar (ex: função fora do ar), o lote fica em
 * "recebido" e pode ser reprocessado depois, sem travar o upload.
 */
export async function uploadMulticalculo({ file, cotacaoId, enviadoPor }) {
  if (!file) throw new Error('Selecione um arquivo.')
  if (!cotacaoId) throw new Error('Cotação não identificada — salve a Cotação antes de enviar o Multicálculo.')

  inferirTipoArquivo(file.name)
  const hash = await calcularHashArquivo(file)

  const { data: existente, error: erroExistente } = await operacional
    .from('lotes_importacao_estudo')
    .select('id, nome_arquivo_original, status')
    .eq('hash_arquivo', hash)
    .maybeSingle()
  if (erroExistente) throw new Error(`Erro ao verificar duplicidade: ${erroExistente.message}`)
  if (existente) {
    throw new Error(`Este arquivo já foi importado antes (${existente.nome_arquivo_original}, status: ${existente.status}).`)
  }

  const caminho = `estudo-mercado/${cotacaoId}/${hash}-${file.name}`
  const { error: erroUpload } = await supabase.storage.from(BUCKET).upload(caminho, file, { upsert: false })
  if (erroUpload) throw new Error(`Erro ao subir o arquivo: ${erroUpload.message}`)

  const { data: lote, error: erroLote } = await operacional
    .from('lotes_importacao_estudo')
    .insert({
      cotacao_id: cotacaoId,
      tipo_documento: 'multicalculo',
      storage_path: caminho,
      nome_arquivo_original: file.name,
      hash_arquivo: hash,
      status: 'recebido',
      criado_por: enviadoPor || null,
    })
    .select()
    .single()
  if (erroLote) throw new Error(`Erro ao registrar o lote: ${erroLote.message}`)

  try {
    await dispararProcessamentoEstudo(lote.id)
  } catch (e) {
    console.error('Processamento automático falhou, lote ficará como "recebido":', e.message)
  }

  return lote
}

/** Dispara a Edge Function processar-estudo-mercado. */
export async function dispararProcessamentoEstudo(loteId) {
  const { data, error } = await supabase.functions.invoke('processar-estudo-mercado', { body: { loteId } })
  if (error) throw new Error(`Erro ao processar o Multicálculo: ${error.message}`)
  return data
}

/**
 * Reprocessa um lote — limpa as propostas/faixas/rede/legenda geradas
 * antes (mantém o registro do lote e o arquivo original) e roda de novo.
 * Usado quando o processamento automático falhou, ou depois de qualquer
 * ajuste que justifique reler o mesmo arquivo.
 */
export async function reprocessarLoteEstudo(loteId) {
  const { error: erroPropostas } = await operacional.from('propostas_estudo').delete().eq('lote_importacao_estudo_id', loteId)
  if (erroPropostas) throw new Error(`Erro ao limpar propostas anteriores: ${erroPropostas.message}`)

  const { error: erroRede } = await operacional.from('propostas_rede_credenciada').delete().eq('lote_importacao_estudo_id', loteId)
  if (erroRede) throw new Error(`Erro ao limpar rede credenciada anterior: ${erroRede.message}`)

  const { error: erroLegenda } = await operacional.from('legendas_documento_estudo').delete().eq('lote_importacao_estudo_id', loteId)
  if (erroLegenda) throw new Error(`Erro ao limpar legenda anterior: ${erroLegenda.message}`)

  const { error: erroUpdate } = await operacional
    .from('lotes_importacao_estudo')
    .update({
      status: 'recebido',
      nivel_confianca: null,
      motivo_confianca: null,
      origem_extracao: null,
      assinatura_estrutural: null,
      quantidade_propostas_extraidas: null,
      quantidade_linhas_rede_extraidas: null,
      receita_extracao: null,
      erro: null,
      processado_em: null,
    })
    .eq('id', loteId)
  if (erroUpdate) throw new Error(`Erro ao reiniciar o lote: ${erroUpdate.message}`)

  return dispararProcessamentoEstudo(loteId)
}

export async function listarLotesEstudoPorCotacao(cotacaoId) {
  const { data, error } = await operacional
    .from('lotes_importacao_estudo')
    .select('*')
    .eq('cotacao_id', cotacaoId)
    .order('criado_em', { ascending: false })
  if (error) throw new Error(`Erro ao listar lotes do estudo: ${error.message}`)
  return data ?? []
}

/**
 * Prévia editável — propostas extraídas de um lote, com faixas e nome
 * de operadora já resolvido (quando confirmada). Leitura pura.
 */
export async function listarPropostasPorLote(loteId) {
  const { data: propostas, error } = await operacional
    .from('propostas_estudo')
    .select('*, propostas_estudo_faixas(*)')
    .eq('lote_importacao_estudo_id', loteId)
    .order('criado_em', { ascending: true })
  if (error) throw new Error(`Erro ao listar propostas do lote: ${error.message}`)

  const idsOperadoras = [...new Set((propostas ?? []).map((p) => p.operadora_id).filter(Boolean))]
  let nomePorOperadora = {}
  if (idsOperadoras.length > 0) {
    const { data: operadoras, error: erroOperadoras } = await institucional
      .from('operadoras')
      .select('id, nome')
      .in('id', idsOperadoras)
    if (erroOperadoras) throw new Error(`Erro ao buscar nomes de operadoras: ${erroOperadoras.message}`)
    nomePorOperadora = Object.fromEntries((operadoras ?? []).map((o) => [o.id, o.nome]))
  }

  return (propostas ?? [])
    .map((p) => ({
      ...p,
      operadora_nome: p.operadora_id ? nomePorOperadora[p.operadora_id] ?? null : null,
      faixas: p.propostas_estudo_faixas ?? [],
    }))
    .sort((a, b) => (a.ordem_apresentacao ?? 999) - (b.ordem_apresentacao ?? 999))
}

export async function listarRedePorLote(loteId) {
  const { data, error } = await operacional
    .from('propostas_rede_credenciada')
    .select('*')
    .eq('lote_importacao_estudo_id', loteId)
  if (error) throw new Error(`Erro ao listar rede credenciada do lote: ${error.message}`)
  return data ?? []
}

export async function listarLegendaPorLote(loteId) {
  const { data, error } = await operacional
    .from('legendas_documento_estudo')
    .select('*')
    .eq('lote_importacao_estudo_id', loteId)
  if (error) throw new Error(`Erro ao listar legenda do lote: ${error.message}`)
  return data ?? []
}

/**
 * Confirma a qual operadora do catálogo institucional uma proposta
 * pertence. Nunca decide isso sozinho por semelhança de texto — só
 * grava a escolha humana (mesmo padrão de `normalizarOperadoraCotacao`
 * em clientesService.js).
 */
export async function confirmarOperadoraProposta(propostaId, operadoraId) {
  const { error } = await operacional
    .from('propostas_estudo')
    .update({ operadora_id: operadoraId })
    .eq('id', propostaId)
  if (error) throw new Error(`Erro ao confirmar operadora da proposta: ${error.message}`)
}

/** Confirma ou rejeita uma proposta extraída, após revisão humana. */
export async function definirStatusRevisaoProposta(propostaId, status) {
  if (!['pendente', 'confirmada', 'rejeitada'].includes(status)) {
    throw new Error(`Status de revisão inválido: ${status}`)
  }
  const { error } = await operacional.from('propostas_estudo').update({ status_revisao: status }).eq('id', propostaId)
  if (error) throw new Error(`Erro ao atualizar status de revisão: ${error.message}`)
}

/**
 * Marca o papel de uma proposta no Estudo (econômica/recomendada/maior
 * aderência/outra) — decisão do corretor (SPEC-001 §11), nunca
 * calculada automaticamente. `null` limpa a marcação.
 */
export async function definirPapelSelecao(propostaId, papel) {
  const validos = ['economica', 'recomendada', 'maior_aderencia', 'outra', null]
  if (!validos.includes(papel)) throw new Error(`Papel de seleção inválido: ${papel}`)
  const { error } = await operacional.from('propostas_estudo').update({ papel_selecao: papel }).eq('id', propostaId)
  if (error) throw new Error(`Erro ao definir papel da proposta: ${error.message}`)
}

/** Reordena as propostas confirmadas — ordem de apresentação no PDF final, editável pelo corretor. */
export async function reordenarPropostas(ordemDeIds) {
  for (let i = 0; i < ordemDeIds.length; i++) {
    const { error } = await operacional
      .from('propostas_estudo')
      .update({ ordem_apresentacao: i })
      .eq('id', ordemDeIds[i])
    if (error) throw new Error(`Erro ao reordenar proposta: ${error.message}`)
  }
}

/**
 * Confirma manualmente que a interpretação de um layout novo/alterado
 * está correta — memoriza a assinatura estrutural pra próximos
 * documentos do mesmo tipo virem direto pelo parser determinístico.
 * Mesmo padrão de `confirmarFormatoHomologado` (Motor Universal).
 */
export async function confirmarFormatoHomologadoEstudo(loteId, usuarioId) {
  const { data: lote, error: erroLote } = await operacional
    .from('lotes_importacao_estudo')
    .select('*')
    .eq('id', loteId)
    .single()
  if (erroLote) throw new Error(`Erro ao buscar lote: ${erroLote.message}`)
  if (lote.status !== 'revisao_necessaria') {
    throw new Error(`Só é possível confirmar formato de um lote em revisão. Status atual: ${lote.status}.`)
  }

  const { data: formato, error: erroFormato } = await operacional
    .from('formatos_homologados_estudo')
    .upsert(
      {
        tipo_documento: lote.tipo_documento,
        assinatura_estrutural: lote.assinatura_estrutural,
        status: 'homologado',
        homologado_por: usuarioId,
      },
      { onConflict: 'tipo_documento,assinatura_estrutural' }
    )
    .select()
    .single()
  if (erroFormato) throw new Error(`Erro ao gravar formato homologado: ${erroFormato.message}`)

  const { error: erroUpdate } = await operacional
    .from('lotes_importacao_estudo')
    .update({
      status: 'aguardando_confirmacao',
      nivel_confianca: 'alta',
      motivo_confianca: 'Formato confirmado manualmente pelo corretor — memorizado para os próximos documentos.',
    })
    .eq('id', loteId)
  if (erroUpdate) throw new Error(`Erro ao atualizar status do lote: ${erroUpdate.message}`)

  return formato
}

/** Exclui um lote (upload errado). Remove propostas/rede/legenda em cascata (FK), o registro e o arquivo do Storage (best-effort). */
export async function excluirLoteEstudo(loteId) {
  const { data: lote, error: erroLote } = await operacional
    .from('lotes_importacao_estudo')
    .select('storage_path')
    .eq('id', loteId)
    .single()
  if (erroLote) throw new Error(`Erro ao buscar lote: ${erroLote.message}`)

  const { error: erroDelete } = await operacional.from('lotes_importacao_estudo').delete().eq('id', loteId)
  if (erroDelete) throw new Error(`Erro ao excluir lote: ${erroDelete.message}`)

  if (lote?.storage_path) {
    await supabase.storage.from(BUCKET).remove([lote.storage_path]).catch(() => {})
  }
}
