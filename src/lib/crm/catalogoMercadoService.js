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
 * SPEC-002 — Connect Center, Peça 1. Arquitetura v2 (18/08/2026).
 *
 * Mudança de princípio: não existe mais fila de aprovação humana
 * bloqueante. A Edge Function `processar-catalogo-mercado` grava direto
 * nas tabelas de domínio (`planos_variantes`, `regras_precificacao`,
 * `regras_mercado`, `rede_credenciada`), com sinal de confiança no
 * próprio registro (`status`) em vez de esconder o dado numa fila que
 * ninguém teria como revisar linha a linha em volume real. Cadastro
 * manual direto (`criarPlanoManual` etc.) continua a mesma exceção
 * deliberada de sempre: dado digitado pelo próprio corretor.
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

const DIMENSOES_MINIMAS_PRECO = ['regiao_tarifaria_id', 'tipo_contratacao', 'segmento', 'faixa_vidas_min', 'faixa_etaria']

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

/** Regras de mercado sem vínculo de plano confirmado — a IA citou um plano no texto e não achou correspondência. Simétrico a listarRegrasInsuficientes (Preços). */
export async function listarRegrasMercadoSemVinculo({ operadoraId, dominio } = {}) {
  let query = institucional.from('regras_mercado').select('*').eq('status', 'sem_vinculo').order('criado_em', { ascending: false })
  if (operadoraId) query = query.eq('operadora_id', operadoraId)
  if (dominio) query = query.eq('dominio', dominio)
  const { data, error } = await query
  if (error) throw new Error(`Erro ao listar regras de mercado sem vínculo: ${error.message}`)
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

/** Vínculos de rede sem plano confirmado — a IA não achou correspondência de plano pra essa linha. Simétrico a listarRegrasInsuficientes (Preços). Sem filtro por operadora aqui: prestadores_marca não tem esse campo confirmado no schema que já vi — não vou supor. */
export async function listarRedeSemVinculo() {
  const { data, error } = await institucional
    .from('rede_credenciada')
    .select('*, prestadores_unidade(*, prestadores_marca(*))')
    .eq('status', 'sem_vinculo')
  if (error) throw new Error(`Erro ao listar rede sem vínculo: ${error.message}`)
  return data ?? []
}

// ============================================================
// Lotes de importação
// ============================================================

export async function listarLotesImportacaoMercado({ dominio, operadoraId } = {}) {
  let query = institucional
    .from('lotes_importacao_mercado')
    .select('*, regioes_tarifarias(nome)')
    .order('criado_em', { ascending: false })
  if (dominio) query = query.eq('dominio', dominio)
  if (operadoraId) query = query.eq('operadora_id', operadoraId)
  const { data, error } = await query
  if (error) throw new Error(`Erro ao listar lotes de importação: ${error.message}`)
  return data ?? []
}

// ============================================================
// Reconciliação — REMOVIDO na v2 (18/08). Não existe mais fila de
// aprovação humana bloqueante: listarDivergenciasPendentes,
// aprovarDivergencia, rejeitarDivergencia e
// aprovarTodasDivergenciasDoLote foram removidas daqui porque nada mais
// escreve em divergencias_reconciliacao durante a importação automática
// (a Edge Function grava direto nas tabelas de domínio agora). Se algum
// outro arquivo ainda importar esses 4 nomes, essa importação vai
// quebrar — rode `grep -rn "aprovarDivergencia\|rejeitarDivergencia\|listarDivergenciasPendentes\|aprovarTodasDivergenciasDoLote" src/`
// antes do deploy pra confirmar que não sobrou nenhum outro chamador.
// ============================================================

// ============================================================
// Upload e disparo de processamento — Peça 2 (SPEC-002 §5)
// Mesmo padrão de lotesImportacaoService.js / estudoMercadoService.js:
// dedup por hash antes do upload, disparo automático não-bloqueante.
// ============================================================

/**
 * Upload de material de mercado (Preços, Rede Credenciada, Regras Gerais
 * ou Completo) pra uma
 * operadora. Região é sempre propriedade do arquivo inteiro — nunca
 * extraída do texto do documento (confirmado nos PDFs de referência
 * Porto Seguro SP/Jundiaí: o título já diz a região, e cada arquivo é
 * de uma tabela de venda única por praça). Dispara o processamento
 * automaticamente — se falhar, o lote fica em "recebido" e pode ser
 * reprocessado depois.
 */
export async function uploadMaterialMercado({ file, dominio, operadoraId, regiaoTarifariaId, enviadoPor }) {
  if (!file) throw new Error('Selecione um arquivo.')
  if (!dominio) throw new Error('Selecione o domínio do material (Preços, Rede Credenciada, Regras Gerais ou Completo).')
  if (!operadoraId) throw new Error('Operadora não identificada.')
  if (!regiaoTarifariaId) throw new Error('Selecione a região tarifária deste arquivo — cada tabela de preço vale para uma região só.')

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
      regiao_tarifaria_id: regiaoTarifariaId,
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

/**
 * Reprocessa um lote. v2 (18/08): não mexe mais em divergencias_reconciliacao
 * (nada escreve lá durante importação automática) — reseta o status pra
 * disparar a Edge Function de novo, que sozinha decide se é execução nova
 * (sem blocos ainda) ou retomada (blocos de uma tentativa anterior já
 * persistidos em lotes_importacao_blocos, só os pendentes/com erro rodam
 * de novo).
 */
export async function reprocessarLoteMercado(loteId) {
  const { error: erroUpdate } = await institucional
    .from('lotes_importacao_mercado')
    .update({
      status: 'recebido',
      quantidade_registros_processados: null,
      quantidade_registros_insuficientes: null,
      resumo_execucao: null,
      erro: null,
      processado_em: null,
    })
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
  { valor: 'precos', label: 'Preços / Tabelas' },
  { valor: 'rede', label: 'Rede Credenciada' },
  { valor: 'regras_gerais', label: 'Regras Gerais (Planos, Carências, Coparticipação, Reembolso, Regras Comerciais)' },
  { valor: 'completo', label: 'Completo (PDF único — ainda não implementado)' },
]
