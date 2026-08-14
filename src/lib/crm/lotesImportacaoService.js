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
