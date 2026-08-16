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

/**
 * CORREÇÃO (15/08 — Raphael/Claude, causa raiz do problema de
 * CSV/Excel/TXT nunca terem sido processados de verdade): esse mapa
 * já classificava o tipo certo desde sempre, mas a Edge Function nunca
 * lia esse dado — sempre tentava ler tudo como PDF. Corrigido junto
 * (ver `supabase/functions/processar-lote/index.ts`).
 *
 * `txt` adicionado (mesmo tratamento de `csv` — texto puro, sem
 * biblioteca nenhuma, é o formato mais simples e confiável de todos).
 *
 * `png`/`jpg`/`jpeg` REMOVIDOS de propósito (decisão do Raphael): o
 * Motor Universal nunca teve OCR de verdade implementado, e mesmo se
 * tivesse, o risco de má leitura por distorção/qualidade de imagem
 * não compensa — melhor recusar com mensagem clara do que arriscar
 * extrair errado silenciosamente. Se alguém tentar subir uma imagem,
 * `inferirTipoDocumento` abaixo já rejeita antes de qualquer upload.
 */
const EXTENSOES_TIPO = {
  pdf: 'pdf_textual', // provisório — extração futura corrige pra pdf_imagem se detectar que é raster
  xlsx: 'excel',
  xls: 'excel',
  csv: 'csv',
  txt: 'texto',
}

function inferirTipoDocumento(nomeArquivo) {
  const ext = nomeArquivo.split('.').pop()?.toLowerCase()
  const tipo = EXTENSOES_TIPO[ext]
  if (!tipo) throw new Error(`Tipo de arquivo não suportado: .${ext}. Use PDF, Excel, CSV ou TXT.`)
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
export async function uploadLoteImportacao({ file, enviadoPor, seguradoraId = null }, clienteDb = null, clienteStorage = null) {
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
      // Seleção manual do Gestor — reforço/fallback pra quando a
      // identificação automática por conteúdo não encontrar a
      // seguradora no catálogo. O motor, ao processar, respeita essa
      // escolha em vez de tentar adivinhar de novo.
      seguradora_id: seguradoraId || null,
    })
    .select()
    .single()

  if (erroLote) throw new Error(`Erro ao registrar o lote: ${erroLote.message}`)

  // DOC-COM-002 (encerramento) — o upload dispara o processamento
  // automaticamente. Não é mais necessário rodar script manual. Se a
  // função falhar (ex: fora do ar), o lote fica em 'recebido' — não
  // trava o usuário, só significa que precisa ser reprocessado depois
  // (via botão de reprocessar, ou de novo automaticamente se
  // reenviarmos o gatilho).
  try {
    await dispararProcessamento(lote.id, enviadoPor, storage)
  } catch (e) {
    console.error('Processamento automático falhou, lote ficará como "recebido":', e.message)
  }

  return lote
}

/**
 * Dispara a Edge Function que faz a extração/normalização. Chamada
 * automaticamente pelo upload — pode também ser chamada de novo
 * manualmente (ex: depois de atribuir seguradora na prévia).
 */
/**
 * Dispara a Edge Function que faz a extração/normalização. Chamada
 * automaticamente pelo upload — pode também ser chamada de novo
 * manualmente (ex: depois de atribuir seguradora na prévia).
 *
 * CORREÇÃO (achado do Raphael, 16/08): depois que a Edge Function
 * processa com sucesso, se a confiança vier ALTA, dispara a ponte
 * (`criarRecebimentosEConciliarAutomatico`) — cria os recebimentos de
 * verdade e tenta conciliar automaticamente cada um, sem precisar de
 * clique manual nenhum. REVISÃO/BLOQUEADO nunca disparam isso — ficam
 * esperando o Gestor revisar na prévia, como sempre.
 */
export async function dispararProcessamento(loteId, usuarioId = null, clienteStorage = null) {
  const storage = clienteStorage || (await obterClienteStorage())
  const { data, error } = await storage.functions.invoke('processar-lote', { body: { loteId } })
  if (error) throw new Error(`Erro ao processar o lote: ${error.message}`)

  if (data?.ok && data?.nivelConfianca === 'alta') {
    try {
      const { criarRecebimentosEConciliarAutomatico } = await import('./comissionamentoService')
      const resumoPonte = await criarRecebimentosEConciliarAutomatico(loteId, usuarioId)
      return { ...data, ponte: resumoPonte }
    } catch (erroPonte) {
      // Não derruba o processamento (que já teve sucesso) por causa da
      // ponte — o lote fica processado normalmente, só sem os
      // recebimentos automáticos; dá pra rodar a ponte de novo depois.
      console.error('Ponte pra recebimentos falhou, lote processado normalmente mesmo assim:', erroPonte.message)
      return data
    }
  }

  return data
}

/**
 * Catálogo de seguradoras pro seletor do upload.
 */
export async function listarSeguradorasCatalogo(cliente = null) {
  const { institucional } = await import('../supabaseSchemas')
  const db = cliente || institucional
  const { data, error } = await db.from('operadoras').select('id, nome').order('nome')
  if (error) throw new Error(`Erro ao listar seguradoras: ${error.message}`)
  return data ?? []
}

/**
 * Atribuir seguradora manualmente (usado quando a identificação
 * automática não encontrou) + reprocessar. Substitui o que antes
 * exigia rodar SQL manual — agora é um botão na prévia.
 */
export async function atribuirSeguradoraEReprocessar(loteId, seguradoraId, usuarioId = null, cliente = null, clienteStorage = null) {
  const db = cliente || (await obterClientePadrao())
  const storage = clienteStorage || (await obterClienteStorage())

  if (!seguradoraId) throw new Error('Selecione uma seguradora.')

  // Limpa o processamento anterior (se houve) e volta o lote pro
  // início da fila, com a seguradora já definida.
  const { error: erroEventos } = await db.from('eventos_financeiros_normalizados').delete().eq('lote_importacao_id', loteId)
  if (erroEventos) throw new Error(`Erro ao limpar eventos anteriores: ${erroEventos.message}`)

  const { error: erroUpdate } = await db
    .from('lotes_importacao')
    .update({
      seguradora_id: seguradoraId,
      status: 'recebido',
      competencia_informada: null,
      periodo_inicio: null,
      periodo_fim: null,
      quantidade_linhas_extraidas: null,
      valor_bruto_total_extraido: null,
      valor_liquido_total_extraido: null,
      nivel_confianca: null,
      motivo_confianca: null,
      assinatura_estrutural_pendente: null,
      origem_extracao_pendente: null,
      estrategia_pendente: null,
      receita_extracao_pendente: null,
    })
    .eq('id', loteId)
  if (erroUpdate) throw new Error(`Erro ao atualizar lote: ${erroUpdate.message}`)

  return dispararProcessamento(loteId, usuarioId, storage)
}

/**
 * Reprocessar um lote que ficou em 'recebido' porque o disparo
 * automático falhou (ex: instabilidade momentânea) — sem precisar
 * mexer em nada além de chamar de novo.
 */
export async function reprocessarLote(loteId, usuarioId = null, clienteStorage = null) {
  const storage = clienteStorage || (await obterClienteStorage())
  return dispararProcessamento(loteId, usuarioId, storage)
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
