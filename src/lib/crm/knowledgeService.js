import { operacional } from '../supabaseSchemas'
import { listarTodosTemplates } from './templatesService'

/**
 * Knowledge Center v1 — Rule Registry & Template Governance.
 *
 * Esta v1 é EXCLUSIVAMENTE registro e consulta. Nenhuma regra aqui
 * cadastrada é executada por nenhum outro Center — isso é
 * explicitamente o Rule Engine, fora de escopo desta Sprint.
 */

const CATEGORIAS = ['Finance', 'Growth', 'Claims', 'Report', 'SCI', 'Smart Quote', 'Infrastructure', 'Workspaces']

export { CATEGORIAS }

/** Lista regras corporativas, com filtros opcionais */
export async function listarRegras({ categoria, centerResponsavel, status, busca } = {}) {
  let query = operacional.from('regras_corporativas').select('*').order('nome')
  if (categoria) query = query.eq('categoria', categoria)
  if (centerResponsavel) query = query.eq('center_responsavel', centerResponsavel)
  if (status) query = query.eq('status', status)

  const { data, error } = await query
  if (error) throw new Error(`Erro ao listar regras: ${error.message}`)

  const linhas = data ?? []
  if (!busca) return linhas
  const termo = busca.toLowerCase()
  return linhas.filter((r) => r.nome?.toLowerCase().includes(termo) || r.descricao?.toLowerCase().includes(termo))
}

export async function obterRegra(id) {
  const { data, error } = await operacional.from('regras_corporativas').select('*').eq('id', id).single()
  if (error) throw new Error(`Erro ao buscar regra: ${error.message}`)
  return data
}

/** Cadastra uma nova regra no catálogo (só registro, não executa nada) */
export async function criarRegra({
  organizacaoId, nome, categoria, centerResponsavel, workspaceRelacionado,
  descricao, consumidores, usuarioId,
}) {
  const { data, error } = await operacional
    .from('regras_corporativas')
    .insert({
      organizacao_id: organizacaoId,
      nome,
      categoria,
      center_responsavel: centerResponsavel,
      workspace_relacionado: workspaceRelacionado || null,
      descricao: descricao || null,
      consumidores: consumidores?.length ? consumidores : null,
      criado_por: usuarioId || null,
      data_ultima_revisao: new Date().toISOString().slice(0, 10),
    })
    .select()
    .single()
  if (error) throw new Error(`Erro ao criar regra: ${error.message}`)
  return data
}

/** Atualiza uma regra existente, incrementando a versão automaticamente */
export async function atualizarRegra(id, dados) {
  const { data: atual, error: erroAtual } = await operacional
    .from('regras_corporativas')
    .select('versao')
    .eq('id', id)
    .single()
  if (erroAtual) throw new Error(`Erro ao buscar regra: ${erroAtual.message}`)

  const { error } = await operacional
    .from('regras_corporativas')
    .update({
      ...dados,
      versao: (atual.versao ?? 1) + 1,
      data_ultima_revisao: new Date().toISOString().slice(0, 10),
      atualizado_em: new Date().toISOString(),
    })
    .eq('id', id)
  if (error) throw new Error(`Erro ao atualizar regra: ${error.message}`)
}

export async function inativarRegra(id) {
  const { error } = await operacional.from('regras_corporativas').update({ status: 'inativo' }).eq('id', id)
  if (error) throw new Error(`Erro ao inativar regra: ${error.message}`)
}

export async function reativarRegra(id) {
  const { error } = await operacional.from('regras_corporativas').update({ status: 'ativo' }).eq('id', id)
  if (error) throw new Error(`Erro ao reativar regra: ${error.message}`)
}

/**
 * Busca Global do Knowledge Center — pesquisa simples (sem IA, sem
 * embeddings, conforme escopo) combinando Regras e Templates num só
 * resultado, cada item identificado por tipo.
 */
export async function buscarConhecimentoGlobal(termo) {
  const [regras, templates] = await Promise.all([
    listarRegras({ busca: termo }),
    listarTodosTemplates({ busca: termo }),
  ])

  return [
    ...regras.map((r) => ({ tipo: 'regra', id: r.id, titulo: r.nome, categoria: r.categoria, status: r.status, versao: r.versao })),
    ...templates.map((t) => ({ tipo: 'template', id: t.id, titulo: t.titulo, categoria: t.categoria ?? t.modulo, status: t.status, versao: t.versao })),
  ]
}