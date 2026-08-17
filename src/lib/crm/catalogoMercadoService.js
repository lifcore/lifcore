import { institucional } from '../supabaseSchemas'
import { supabase } from '../supabaseClient'

const BUCKET = 'anexos' // mesmo bucket já usado pelo Motor Universal e pelo Motor de Estudo de Mercado

const EXTENSOES_ACEITAS = { pdf: 'pdf', xlsx: 'excel', xls: 'excel', csv: 'csv', txt: 'texto' }

function inferirTipoArquivo(nomeArquivo) {
  const ext = nomeArquivo.split('.').pop()?.toLowerCase()
  const tipo = EXTENSOES_ACEITAS[ext]
  if (!tipo) throw new Error(`Tipo de arquivo não suportado: .${ext}. Use PDF, Excel, CSV ou TXT.`)
  return tipo
}

async function calcularHashArquivo(file) {
  const buffer = await file.arrayBuffer()
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer)
  return Array.from(new Uint8Array(hashBuffer)).map((b) => b.toString(16).padStart(2, '0')).join('')
}

/**
 * SPEC-002 — Connect Center, Peça 1.
 *
 * Regra fixa deste arquivo: nenhuma função aqui grava direto em
 * `planos_variantes`, `regras_precificacao`, `regras_mercado` ou
 * `rede_credenciada` a partir de importação — só via
 * `aprovarDivergencia`. Cadastro manual direto (`criarPlanoManual` etc.)
 * é a exceção deliberada: dado digitado pelo próprio corretor não passa
 * por fila de reconciliação, porque não há "existente" pra comparar.
 */

// ============================================================
// Planos / Variantes
// ============================================================

export async function listarPlanosVariantes({ operadoraId, produtoId, status = 'ativo' } = {}) {
  let query = institucional.from('planos_variantes').select('*').order('nome_plano')
  if (operadoraId) query = query.eq('operadora_id', operadoraId)
  if (produtoId) query = query.eq('produto_id', produtoId)
  if (status) query = query.eq('status', status)
  const { data, error } = await query
  if (error) throw new Error(`Erro ao listar planos/variantes: ${error.message}`)
  return data ?? []
}

/** Cadastro manual — não passa por reconciliação (não há "existente" vindo de importação pra comparar). */
export async function criarPlanoVarianteManual(dados) {
  const { data, error } = await institucional
    .from('planos_variantes')
    .insert({ ...dados, fonte: 'manual' })
    .select()
    .single()
  if (error) throw new Error(`Erro ao criar plano/variante: ${error.message}`)
  return data
}

export async function atualizarPlanoVariante(id, dados) {
  const { error } = await institucional
    .from('planos_variantes')
    .update({ ...dados, atualizado_em: new Date().toISOString() })
    .eq('id', id)
  if (error) throw new Error(`Erro ao atualizar plano/variante: ${error.message}`)
}

export async function inativarPlanoVariante(id) {
  const { error } = await institucional.from('planos_variantes').update({ status: 'inativo' }).eq('id', id)
  if (error) throw new Error(`Erro ao inativar plano/variante: ${error.message}`)
}

// ============================================================
// Regras de Precificação — nunca gravar preço solto (correção 17/08)
// ============================================================

const DIMENSOES_MINIMAS_PRECO = ['regiao', 'tipo_contratacao', 'segmento', 'faixa_vidas_min', 'faixa_etaria']

/**
 * Valida se uma regra de preço tem dimensão suficiente antes de
 * considerá-la "vigente". Não decide sozinho o que é suficiente demais
 * pra confiar — só garante o mínimo: pelo menos uma dimensão comercial
 * além do valor puro, e o valor em si presente.
 */
export function validarRegraPrecificacao(regra) {
  if (regra.valor == null) return { suficiente: false, motivo: 'Nenhum valor numérico identificado.' }
  const dimensoesPresentes = DIMENSOES_MINIMAS_PRECO.filter((d) => regra[d] != null && regra[d] !== '')
  if (dimensoesPresentes.length === 0) {
    return {
      suficiente: false,
      motivo: 'Preço identificado, mas regra comercial insuficiente para registro no catálogo — nenhuma dimensão (região, tipo de contratação, segmento, faixa de vidas, faixa etária) pôde ser determinada.',
    }
  }
  return { suficiente: true, motivo: null }
}

export async function listarRegrasPrecificacao({ planoVarianteId, status = 'vigente' } = {}) {
  let query = institucional.from('regras_precificacao').select('*').order('criado_em', { ascending: false })
  if (planoVarianteId) query = query.eq('plano_variante_id', planoVarianteId)
  if (status) query = query.eq('status', status)
  const { data, error } = await query
  if (error) throw new Error(`Erro ao listar regras de precificação: ${error.message}`)
  return data ?? []
}

/** Cadastro manual de regra de preço — valida dimensão mínima antes de gravar como vigente. */
export async function criarRegraPrecificacaoManual(dados) {
  const validacao = validarRegraPrecificacao(dados)
  const { data, error } = await institucional
    .from('regras_precificacao')
    .insert({
      ...dados,
      fonte: 'planilha',
      status: validacao.suficiente ? 'vigente' : 'regra_insuficiente',
      motivo_insuficiencia: validacao.motivo,
    })
    .select()
    .single()
  if (error) throw new Error(`Erro ao criar regra de precificação: ${error.message}`)
  return data
}

/** Regras marcadas como insuficientes — fila de revisão, nunca aparecem em consulta do Smart Quote. */
export async function listarRegrasInsuficientes(planoVarianteId = null) {
  let query = institucional
    .from('regras_precificacao')
    .select('*')
    .eq('status', 'regra_insuficiente')
    .order('criado_em', { ascending: false })
  if (planoVarianteId) query = query.eq('plano_variante_id', planoVarianteId)
  const { data, error } = await query
  if (error) throw new Error(`Erro ao listar regras insuficientes: ${error.message}`)
  return data ?? []
}

// ============================================================
// Regras de Mercado (carência / coparticipação / reembolso / regra comercial)
// ============================================================

export async function listarRegrasMercado({ planoVarianteId, operadoraId, dominio } = {}) {
  let query = institucional.from('regras_mercado').select('*').eq('status', 'vigente')
  if (planoVarianteId) query = query.eq('plano_variante_id', planoVarianteId)
  if (operadoraId) query = query.eq('operadora_id', operadoraId)
  if (dominio) query = query.eq('dominio', dominio)
  const { data, error } = await query
  if (error) throw new Error(`Erro ao listar regras de mercado: ${error.message}`)
  return data ?? []
}

export async function criarRegraMercadoManual(dados) {
  const { data, error } = await institucional
    .from('regras_mercado')
    .insert({ ...dados, fonte: 'planilha' })
    .select()
    .single()
  if (error) throw new Error(`Erro ao criar regra de mercado: ${error.message}`)
  return data
}

// ============================================================
// Rede Credenciada — marca × unidade física
// ============================================================

export async function listarOuCriarMarca(nome, tipo = 'hospital') {
  const { data: existente, error: erroExistente } = await institucional
    .from('prestadores_marca')
    .select('*')
    .eq('nome', nome)
    .eq('tipo', tipo)
    .maybeSingle()
  if (erroExistente) throw new Error(`Erro ao buscar marca: ${erroExistente.message}`)
  if (existente) return existente

  const { data, error } = await institucional.from('prestadores_marca').insert({ nome, tipo }).select().single()
  if (error) throw new Error(`Erro ao criar marca: ${error.message}`)
  return data
}

/** Unidade física — identidade determinística por (nome, município). Nunca fuzzy-match (SPEC-002 §4). */
export async function listarOuCriarUnidade({ marcaId, nome, municipio, regiao, identificadorExterno }) {
  const { data: existente, error: erroExistente } = await institucional
    .from('prestadores_unidade')
    .select('*')
    .eq('nome', nome)
    .eq('municipio', municipio ?? null)
    .maybeSingle()
  if (erroExistente) throw new Error(`Erro ao buscar unidade: ${erroExistente.message}`)
  if (existente) return existente

  const { data, error } = await institucional
    .from('prestadores_unidade')
    .insert({ marca_id: marcaId ?? null, nome, municipio: municipio ?? null, regiao: regiao ?? null, identificador_externo: identificadorExterno ?? null })
    .select()
    .single()
  if (error) throw new Error(`Erro ao criar unidade: ${error.message}`)
  return data
}

export async function listarRedeCredenciada({ planoVarianteId, regiao } = {}) {
  let query = institucional
    .from('rede_credenciada')
    .select('*, prestadores_unidade(*, prestadores_marca(*))')
    .eq('plano_variante_id', planoVarianteId)
  const { data, error } = await query
  if (error) throw new Error(`Erro ao listar rede credenciada: ${error.message}`)
  let resultado = data ?? []
  if (regiao) resultado = resultado.filter((r) => r.prestadores_unidade?.regiao === regiao)
  return resultado
}

// ============================================================
// Lotes de importação
// ============================================================

export async function listarLotesImportacaoMercado({ dominio, operadoraId } = {}) {
  let query = institucional.from('lotes_importacao_mercado').select('*').order('criado_em', { ascending: false })
  if (dominio) query = query.eq('dominio', dominio)
  if (operadoraId) query = query.eq('operadora_id', operadoraId)
  const { data, error } = await query
  if (error) throw new Error(`Erro ao listar lotes de importação: ${error.message}`)
  return data ?? []
}

// ============================================================
// Reconciliação — SPEC-002 §5: nada vira vigente sem aprovação humana
// ============================================================

export async function listarDivergenciasPendentes(loteImportacaoId = null) {
  let query = institucional
    .from('divergencias_reconciliacao')
    .select('*')
    .eq('status', 'pendente')
    .order('criado_em', { ascending: true })
  if (loteImportacaoId) query = query.eq('lote_importacao_id', loteImportacaoId)
  const { data, error } = await query
  if (error) throw new Error(`Erro ao listar divergências pendentes: ${error.message}`)
  return data ?? []
}

const TABELA_POR_NOME = {
  planos_variantes: 'planos_variantes',
  regras_precificacao: 'regras_precificacao',
  regras_mercado: 'regras_mercado',
  rede_credenciada: 'rede_credenciada',
}

/**
 * Aprova uma divergência — só aqui os dados de importação entram de
 * fato nas tabelas de domínio. Se `registro_existente_id` estiver
 * presente, faz update; senão, insert.
 */
export async function aprovarDivergencia(divergenciaId, usuarioId) {
  const { data: divergencia, error: erroDivergencia } = await institucional
    .from('divergencias_reconciliacao')
    .select('*')
    .eq('id', divergenciaId)
    .single()
  if (erroDivergencia) throw new Error(`Erro ao buscar divergência: ${erroDivergencia.message}`)
  if (divergencia.status !== 'pendente') {
    throw new Error(`Divergência já foi ${divergencia.status === 'aprovado' ? 'aprovada' : 'rejeitada'} antes.`)
  }

  const tabela = TABELA_POR_NOME[divergencia.tabela_afetada]
  if (!tabela) throw new Error(`Tabela afetada desconhecida: ${divergencia.tabela_afetada}`)

  if (divergencia.registro_existente_id) {
    const { error } = await institucional.from(tabela).update(divergencia.dado_novo).eq('id', divergencia.registro_existente_id)
    if (error) throw new Error(`Erro ao aplicar atualização em ${tabela}: ${error.message}`)
  } else {
    const { error } = await institucional.from(tabela).insert(divergencia.dado_novo)
    if (error) throw new Error(`Erro ao aplicar inserção em ${tabela}: ${error.message}`)
  }

  const { error: erroUpdate } = await institucional
    .from('divergencias_reconciliacao')
    .update({ status: 'aprovado', aprovado_por: usuarioId, aprovado_em: new Date().toISOString() })
    .eq('id', divergenciaId)
  if (erroUpdate) throw new Error(`Erro ao marcar divergência como aprovada: ${erroUpdate.message}`)
}

export async function rejeitarDivergencia(divergenciaId, usuarioId) {
  const { error } = await institucional
    .from('divergencias_reconciliacao')
    .update({ status: 'rejeitado', aprovado_por: usuarioId, aprovado_em: new Date().toISOString() })
    .eq('id', divergenciaId)
  if (error) throw new Error(`Erro ao rejeitar divergência: ${error.message}`)
}

/** Aprova em lote — mesmo cuidado de nunca aplicar direto, só via aprovarDivergencia individual (mantém rastreabilidade por item). */
export async function aprovarTodasDivergenciasDoLote(loteImportacaoId, usuarioId) {
  const pendentes = await listarDivergenciasPendentes(loteImportacaoId)
  const resultados = { aprovadas: 0, comErro: 0, erros: [] }
  for (const d of pendentes) {
    try {
      await aprovarDivergencia(d.id, usuarioId)
      resultados.aprovadas++
    } catch (e) {
      resultados.comErro++
      resultados.erros.push(e.message)
    }
  }
  return resultados
}

// ============================================================
// Upload e disparo de processamento — Peça 2 (SPEC-002 §5)
// Mesmo padrão de lotesImportacaoService.js / estudoMercadoService.js:
// dedup por hash antes do upload, disparo automático não-bloqueante.
// ============================================================

/**
 * Upload de material de mercado (Planos, Preços, Carência,
 * Coparticipação, Reembolso, Regra Comercial ou Rede) pra uma
 * operadora. Dispara o processamento automaticamente — se falhar, o
 * lote fica em "recebido" e pode ser reprocessado depois.
 */
export async function uploadMaterialMercado({ file, dominio, operadoraId, enviadoPor }) {
  if (!file) throw new Error('Selecione um arquivo.')
  if (!dominio) throw new Error('Selecione o domínio do material (Planos, Preços, Carência...).')
  if (!operadoraId) throw new Error('Operadora não identificada.')

  inferirTipoArquivo(file.name)
  const hash = await calcularHashArquivo(file)

  const { data: existente, error: erroExistente } = await institucional
    .from('lotes_importacao_mercado')
    .select('id, nome_arquivo_original, status')
    .eq('hash_arquivo', hash)
    .maybeSingle()
  if (erroExistente) throw new Error(`Erro ao verificar duplicidade: ${erroExistente.message}`)
  if (existente) {
    throw new Error(`Este arquivo já foi importado antes (${existente.nome_arquivo_original}, status: ${existente.status}).`)
  }

  const caminho = `connect-center/${dominio}/${operadoraId}/${hash}-${file.name}`
  const { error: erroUpload } = await supabase.storage.from(BUCKET).upload(caminho, file, { upsert: false })
  if (erroUpload) throw new Error(`Erro ao subir o arquivo: ${erroUpload.message}`)

  const { data: lote, error: erroLote } = await institucional
    .from('lotes_importacao_mercado')
    .insert({
      dominio,
      operadora_id: operadoraId,
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
    await dispararProcessamentoMercado(lote.id)
  } catch (e) {
    console.error('Processamento automático falhou, lote ficará como "recebido":', e.message)
  }

  return lote
}

export async function dispararProcessamentoMercado(loteId) {
  const { data, error } = await supabase.functions.invoke('processar-catalogo-mercado', { body: { loteId } })
  if (error) throw new Error(`Erro ao processar o material: ${error.message}`)
  return data
}

/** Reprocessa um lote — apaga as divergências pendentes geradas antes (nunca mexe no que já foi aprovado/rejeitado) e roda de novo. */
export async function reprocessarLoteMercado(loteId) {
  const { error: erroDivergencias } = await institucional
    .from('divergencias_reconciliacao')
    .delete()
    .eq('lote_importacao_id', loteId)
    .eq('status', 'pendente')
  if (erroDivergencias) throw new Error(`Erro ao limpar divergências pendentes anteriores: ${erroDivergencias.message}`)

  const { error: erroUpdate } = await institucional
    .from('lotes_importacao_mercado')
    .update({ status: 'recebido', quantidade_registros_processados: null, quantidade_registros_insuficientes: null, receita_extracao: null, erro: null, processado_em: null })
    .eq('id', loteId)
  if (erroUpdate) throw new Error(`Erro ao reiniciar o lote: ${erroUpdate.message}`)

  return dispararProcessamentoMercado(loteId)
}

export async function excluirLoteMercado(loteId) {
  const { data: lote, error: erroLote } = await institucional.from('lotes_importacao_mercado').select('storage_path').eq('id', loteId).single()
  if (erroLote) throw new Error(`Erro ao buscar lote: ${erroLote.message}`)

  const { error: erroDelete } = await institucional.from('lotes_importacao_mercado').delete().eq('id', loteId)
  if (erroDelete) throw new Error(`Erro ao excluir lote: ${erroDelete.message}`)

  if (lote?.storage_path) {
    await supabase.storage.from(BUCKET).remove([lote.storage_path]).catch(() => {})
  }
}

export const DOMINIOS_MERCADO = [
  { valor: 'planos', label: 'Planos / Variantes' },
  { valor: 'precos', label: 'Preços / Tabelas' },
  { valor: 'carencia', label: 'Carências' },
  { valor: 'coparticipacao', label: 'Coparticipação' },
  { valor: 'reembolso', label: 'Reembolso' },
  { valor: 'regra_comercial', label: 'Regras Comerciais' },
  { valor: 'rede', label: 'Rede Credenciada' },
]
