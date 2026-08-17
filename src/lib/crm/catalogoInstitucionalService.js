import { institucional } from '../supabaseSchemas'

/**
 * Catálogo Institucional (Sprint 005 — Master Commercial & Financial
 * Foundation, Blocos A-D). Fundação pra Finance Center v3 e Connect
 * Center — sem implementar nenhuma integração real, nenhum cálculo
 * financeiro e sem alterar a UX do Cotador (diretriz CAT-011).
 *
 * Governança formalizada (Bloco F):
 * CAT-010 — Produto pertence ao Master. Parceiro só comercializa.
 * Nunca criar produto "dentro" de uma seguradora.
 */

const MODULOS_PRODUTO = ['saude', 'auto', 'lifsure', 'lishield', 'lifplan']
const TIPOS_PARCEIRO = ['seguradora', 'operadora_saude', 'operadora_odonto', 'administradora']
const TIPOS_CANAL = ['arquivo_producao', 'arquivo_comissao', 'portal', 'swagger', 'sandbox', 'api_oficial', 'xml', 'csv']

export { MODULOS_PRODUTO, TIPOS_PARCEIRO, TIPOS_CANAL }

// ============================================================
// BLOCO B — Product Catalog
// ============================================================

/** Lista o catálogo oficial de produtos — de todos os módulos, ou de um módulo específico */
export async function listarProdutos({ modulo, status = 'ativo' } = {}) {
  let query = institucional.from('produtos').select('*').order('modulo').order('nome')
  if (modulo) query = query.eq('modulo', modulo)
  if (status) query = query.eq('status', status)

  const { data, error } = await query
  if (error) throw new Error(`Erro ao listar produtos: ${error.message}`)
  return data ?? []
}

/** Cria um novo produto no catálogo oficial (CAT-010: produto é sempre do Master, nunca da seguradora) */
export async function criarProduto({ modulo, nome, descricao }) {
  if (!MODULOS_PRODUTO.includes(modulo)) throw new Error(`Módulo inválido: ${modulo}`)

  const { data, error } = await institucional
    .from('produtos')
    .insert({ modulo, nome, descricao: descricao || null })
    .select()
    .single()
  if (error) throw new Error(`Erro ao criar produto: ${error.message}`)
  return data
}

/** Inativa um produto (nunca exclusão física — preserva histórico de vínculos) */
export async function inativarProduto(produtoId) {
  const { error } = await institucional.from('produtos').update({ status: 'inativo' }).eq('id', produtoId)
  if (error) throw new Error(`Erro ao inativar produto: ${error.message}`)
}

// ============================================================
// BLOCO B — Vínculo Operadora × Produto (N:N)
// ============================================================

/** Lista os produtos que uma operadora tem habilitados */
export async function listarProdutosDaOperadora(operadoraId) {
  const { data, error } = await institucional
    .from('operadora_produtos')
    .select('id, produto_id, produtos(id, modulo, nome, descricao, status)')
    .eq('operadora_id', operadoraId)
  if (error) throw new Error(`Erro ao listar produtos da operadora: ${error.message}`)
  return (data ?? []).map((v) => ({ vinculoId: v.id, ...v.produtos }))
}

/** Habilita um produto pra uma operadora (a operadora "marca" que comercializa aquele produto) */
export async function habilitarProdutoNaOperadora(operadoraId, produtoId) {
  const { error } = await institucional
    .from('operadora_produtos')
    .insert({ operadora_id: operadoraId, produto_id: produtoId })
  if (error) throw new Error(`Erro ao habilitar produto na operadora: ${error.message}`)
}

/** Remove o vínculo (a operadora deixa de comercializar aquele produto) */
export async function desabilitarProdutoNaOperadora(vinculoId) {
  const { error } = await institucional.from('operadora_produtos').delete().eq('id', vinculoId)
  if (error) throw new Error(`Erro ao desabilitar produto da operadora: ${error.message}`)
}

/**
 * Habilita vários produtos de uma vez pra mesma operadora (toggle por
 * módulo) — uma query só, em vez de N chamadas sequenciais a
 * habilitarProdutoNaOperadora.
 */
export async function habilitarProdutosNaOperadora(operadoraId, produtoIds) {
  if (!produtoIds?.length) return
  const linhas = produtoIds.map((produtoId) => ({ operadora_id: operadoraId, produto_id: produtoId }))
  const { error } = await institucional.from('operadora_produtos').insert(linhas)
  if (error) throw new Error(`Erro ao habilitar produtos na operadora: ${error.message}`)
}

/** Remove vários vínculos de uma vez (toggle por módulo desabilitando todos) */
export async function desabilitarProdutosNaOperadora(vinculoIds) {
  if (!vinculoIds?.length) return
  const { error } = await institucional.from('operadora_produtos').delete().in('id', vinculoIds)
  if (error) throw new Error(`Erro ao desabilitar produtos da operadora: ${error.message}`)
}

// ============================================================
// BLOCO D — Catálogo de Canais (não é enum — múltiplos por operadora)
// ============================================================

/** Lista os canais de integração já registrados pra uma operadora */
export async function listarCanaisDaOperadora(operadoraId) {
  const { data, error } = await institucional
    .from('operadora_canais')
    .select('*')
    .eq('operadora_id', operadoraId)
    .order('criado_em', { ascending: true })
  if (error) throw new Error(`Erro ao listar canais da operadora: ${error.message}`)
  return data ?? []
}

/** Registra um novo canal (ex: Portal, CSV, Sandbox) — uma operadora pode ter vários simultaneamente */
export async function adicionarCanalOperadora(operadoraId, tipoCanal, observacoes) {
  if (!TIPOS_CANAL.includes(tipoCanal)) throw new Error(`Tipo de canal inválido: ${tipoCanal}`)

  const { data, error } = await institucional
    .from('operadora_canais')
    .insert({ operadora_id: operadoraId, tipo_canal: tipoCanal, observacoes: observacoes || null })
    .select()
    .single()
  if (error) throw new Error(`Erro ao adicionar canal: ${error.message}`)
  return data
}

/** Remove um canal registrado */
export async function removerCanalOperadora(canalId) {
  const { error } = await institucional.from('operadora_canais').delete().eq('id', canalId)
  if (error) throw new Error(`Erro ao remover canal: ${error.message}`)
}

// ============================================================
// BLOCOS A + C — Campos institucionais/preparatórios da própria operadora
// Reaproveita a mesma tabela institucional.operadoras (evolução, não
// reconstrução — Bloco A). Update genérico, mesmo padrão já usado em
// atualizarDadosSeguradora (apolicesService.js) — mantido aqui separado
// só pra deixar claro que estes campos pertencem à Sprint 005.
// ============================================================

/** Atualiza os campos institucionais/preparatórios (tipo de parceiro, modelo financeiro, competência, situação de integração) */
export async function atualizarCamposInstitucionais(operadoraId, { tipoParceiro, modeloFinanceiro, competenciaFinanceira, situacaoIntegracao }) {
  const dados = {}
  if (tipoParceiro !== undefined) dados.tipo_parceiro = tipoParceiro
  if (modeloFinanceiro !== undefined) dados.modelo_financeiro = modeloFinanceiro
  if (competenciaFinanceira !== undefined) dados.competencia_financeira = competenciaFinanceira
  if (situacaoIntegracao !== undefined) dados.situacao_integracao = situacaoIntegracao

  const { error } = await institucional.from('operadoras').update(dados).eq('id', operadoraId)
  if (error) throw new Error(`Erro ao atualizar campos institucionais: ${error.message}`)
}