/**
 * ETAPA 3 (DOC-COM-001.1) — Financeiro → Recebimentos
 *
 * PRIMEIRA ENTREGA FUNCIONAL, deliberadamente mínima (decisão do
 * Chief): Upload → armazenar arquivo → criar lote → mostrar recebido.
 *
 * NÃO faz parte desta entrega: extração de texto, OCR, normalização,
 * prévia, confronto com comissao_sugerida. Isso vem depois, como
 * etapa própria, testada separadamente.
 */

async function obterClienteStorage() {
  const { supabase } = await import('../supabaseClient')
  return supabase
}

async function obterClientePadrao() {
  const { operacional } = await import('../supabaseSchemas')
  return operacional
}

const BUCKET = 'anexos' // já existente, reaproveitado — nenhum bucket novo criado

const EXTENSOES_TIPO = {
  pdf: 'pdf_textual', // provisório — extração futura corrige pra pdf_imagem se detectar que é raster
  png: 'imagem',
  jpg: 'imagem',
  jpeg: 'imagem',
  xlsx: 'excel',
  xls: 'excel',
  csv: 'csv',
}

function inferirTipoDocumento(nomeArquivo) {
  const ext = nomeArquivo.split('.').pop()?.toLowerCase()
  const tipo = EXTENSOES_TIPO[ext]
  if (!tipo) throw new Error(`Tipo de arquivo não suportado: .${ext}. Use PDF, imagem (PNG/JPG), Excel ou CSV.`)
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
 * Upload de um relatório real. Verifica duplicidade pelo hash ANTES de
 * subir o arquivo (evita gastar storage com reimportação do mesmo
 * arquivo — idempotência exigida desde a Sprint de arquitetura).
 */
export async function uploadLoteImportacao({ file, enviadoPor }, clienteDb = null, clienteStorage = null) {
  const db = clienteDb || (await obterClientePadrao())
  const storage = clienteStorage || (await obterClienteStorage())

  if (!file) throw new Error('Selecione um arquivo.')
  const tipoDocumento = inferirTipoDocumento(file.name)
  const hash = await calcularHashArquivo(file)

  const { data: existente, error: erroExistente } = await db
    .from('lotes_importacao')
    .select('id, nome_arquivo_original, status')
    .eq('hash_arquivo', hash)
    .maybeSingle()
  if (erroExistente) throw new Error(`Erro ao verificar duplicidade: ${erroExistente.message}`)
  if (existente) {
    throw new Error(`Este arquivo já foi importado antes (${existente.nome_arquivo_original}, status: ${existente.status}).`)
  }

  const caminho = `recebimentos/${hash}-${file.name}`
  const { error: erroUpload } = await storage.storage.from(BUCKET).upload(caminho, file, { upsert: false })
  if (erroUpload) throw new Error(`Erro ao subir o arquivo: ${erroUpload.message}`)

  const { data: lote, error: erroLote } = await db
    .from('lotes_importacao')
    .insert({
      nome_arquivo_original: file.name,
      storage_path: caminho,
      hash_arquivo: hash,
      tipo_documento: tipoDocumento,
      status: 'recebido',
      enviado_por: enviadoPor || null,
    })
    .select()
    .single()

  if (erroLote) throw new Error(`Erro ao registrar o lote: ${erroLote.message}`)
  return lote
}

export async function listarLotesImportacao(cliente = null) {
  const db = cliente || (await obterClientePadrao())
  const { data, error } = await db.from('lotes_importacao').select('*').order('enviado_em', { ascending: false })
  if (error) throw new Error(`Erro ao listar lotes: ${error.message}`)
  return data ?? []
}

/**
 * Prévia — lista os eventos que a extração/normalização encontrou num
 * lote, pro Gestor conferir antes de qualquer confirmação. Leitura
 * pura, não altera nada.
 */
export async function listarEventosPorLote(loteId, cliente = null) {
  const db = cliente || (await obterClientePadrao())
  const { data, error } = await db
    .from('eventos_financeiros_normalizados')
    .select('*')
    .eq('lote_importacao_id', loteId)
    .order('linha_original_ref', { ascending: true })
  if (error) throw new Error(`Erro ao listar eventos do lote: ${error.message}`)
  return data ?? []
}

/**
 * PASSO 8 (DOC-COM-002) — Gestor confirma que a interpretação de um
 * formato novo/alterado está correta. Isso grava (ou atualiza) a
 * memória do Motor Universal — os próximos documentos com a mesma
 * assinatura passam a ser processados automaticamente, sem passar de
 * novo por aqui.
 *
 * Só faz sentido pra lotes com status 'revisao_necessaria' — não
 * existe confirmação de formato pra lote 'bloqueado' (inconsistência
 * matemática não se resolve confirmando, se resolve corrigindo).
 */
export async function confirmarFormatoHomologado(loteId, usuarioId, cliente = null) {
  const db = cliente || (await obterClientePadrao())

  const { data: lote, error: erroLote } = await db.from('lotes_importacao').select('*').eq('id', loteId).single()
  if (erroLote) throw new Error(`Erro ao buscar lote: ${erroLote.message}`)
  if (lote.status !== 'revisao_necessaria') {
    throw new Error(`Só é possível confirmar formato de um lote em revisão. Status atual: ${lote.status}.`)
  }
  if (!lote.seguradora_id) {
    throw new Error('Lote sem seguradora identificada — não é possível memorizar o formato sem saber de quem ele é.')
  }

  const { data: formato, error: erroFormato } = await db
    .from('formatos_homologados')
    .upsert(
      {
        seguradora_id: lote.seguradora_id,
        tipo_documento: 'comissoes',
        assinatura_estrutural: lote.assinatura_estrutural_pendente,
        estrategia: lote.estrategia_pendente,
        receita_extracao: lote.receita_extracao_pendente,
        status: 'homologado',
        homologado_por: usuarioId,
        homologado_em: new Date().toISOString(),
      },
      { onConflict: 'seguradora_id,tipo_documento,assinatura_estrutural' }
    )
    .select()
    .single()
  if (erroFormato) throw new Error(`Erro ao gravar formato homologado: ${erroFormato.message}`)

  const { error: erroUpdateLote } = await db
    .from('lotes_importacao')
    .update({
      status: 'aguardando_confirmacao',
      nivel_confianca: 'alta',
      motivo_confianca: 'Formato confirmado manualmente pelo Gestor — memorizado pra próximos documentos.',
    })
    .eq('id', loteId)
  if (erroUpdateLote) throw new Error(`Erro ao atualizar status do lote: ${erroUpdateLote.message}`)

  return formato
}

/**
 * Exclusão de lote — pra corrigir upload errado. Remove os eventos
 * normalizados, o registro do lote, e o arquivo original do Storage.
 * NÃO mexe em formatos_homologados — se o formato já foi memorizado,
 * essa memória continua valendo (apagar um upload errado não deveria
 * apagar conhecimento correto aprendido a partir dele).
 */
export async function excluirLote(loteId, cliente = null, clienteStorage = null) {
  const db = cliente || (await obterClientePadrao())
  const storage = clienteStorage || (await obterClienteStorage())

  const { data: lote, error: erroLote } = await db.from('lotes_importacao').select('storage_path').eq('id', loteId).single()
  if (erroLote) throw new Error(`Erro ao buscar lote: ${erroLote.message}`)

  const { error: erroEventos } = await db.from('eventos_financeiros_normalizados').delete().eq('lote_importacao_id', loteId)
  if (erroEventos) throw new Error(`Erro ao excluir eventos do lote: ${erroEventos.message}`)

  const { error: erroDelete } = await db.from('lotes_importacao').delete().eq('id', loteId)
  if (erroDelete) throw new Error(`Erro ao excluir lote: ${erroDelete.message}`)

  if (lote?.storage_path) {
    // best-effort — se falhar em apagar o arquivo do Storage, o
    // registro já foi removido do banco, não trava o usuário por isso
    await storage.storage.from(BUCKET).remove([lote.storage_path]).catch(() => {})
  }
}
