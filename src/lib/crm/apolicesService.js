import { operacional, institucional } from '../supabaseSchemas'
import { supabase } from '../supabaseClient'

const PRODUTOS_APOLICE = ['Auto', 'Frota', 'RC', 'Residencial', 'Vida', 'Outro']

export { PRODUTOS_APOLICE }

/** Lista o catálogo completo de operadoras/seguradoras (Saúde + demais produtos, mesma tabela) */
export async function listarCatalogoSeguradoras() {
  const { data, error } = await institucional
    .from('operadoras')
    .select('id, codigo, nome, categoria_seguro, observacoes_comissionamento, cnpj, razao_social, site, tipo_parceiro, modelo_financeiro, competencia_financeira, situacao_integracao')
    .eq('status', 'ativa')
    .order('nome')
  if (error) throw new Error(`Erro ao listar seguradoras: ${error.message}`)
  return data ?? []
}

/** Cadastra uma nova seguradora/operadora direto pela tela (sem precisar de SQL) */
export async function criarSeguradora({ nome, categoriaSeguro, observacoesComissionamento, cnpj, razaoSocial, site }) {
  const codigo = `SEG-${Date.now().toString(36).toUpperCase()}`
  const { data, error } = await institucional
    .from('operadoras')
    .insert({
      codigo,
      nome,
      categoria_seguro: categoriaSeguro || null,
      observacoes_comissionamento: observacoesComissionamento || null,
      cnpj: cnpj || null,
      razao_social: razaoSocial || null,
      site: site || null,
      status: 'ativa',
    })
    .select()
    .single()
  if (error) throw new Error(`Erro ao cadastrar seguradora: ${error.message}`)
  return data
}

/** Atualiza dados gerais de uma seguradora existente (nome, CNPJ, razão social, site) —
 * complementa atualizarObservacaoSeguradora, que cuida só do campo de comissionamento */
export async function atualizarDadosSeguradora(operadoraId, dados) {
  const { error } = await institucional.from('operadoras').update(dados).eq('id', operadoraId)
  if (error) throw new Error(`Erro ao atualizar seguradora: ${error.message}`)
}

/** Atualiza as observações de comissionamento de uma seguradora existente */
export async function atualizarObservacaoSeguradora(operadoraId, observacoesComissionamento) {
  const { error } = await institucional
    .from('operadoras')
    .update({ observacoes_comissionamento: observacoesComissionamento })
    .eq('id', operadoraId)
  if (error) throw new Error(`Erro ao atualizar seguradora: ${error.message}`)
}

/** Cria uma nova apólice — corretor_id é sempre o usuário logado, nunca escolhido manualmente */
export async function criarApolice({ corretorId, organizacaoId, dados }) {
  const { data, error } = await operacional
    .from('apolices')
    .insert({
      corretor_id: corretorId,
      organizacao_id: organizacaoId,
      ...dados,
    })
    .select()
    .single()
  if (error) throw new Error(`Erro ao lançar apólice: ${error.message}`)
  return data
}

export async function excluirApolice(id) {
  const { error } = await operacional.from('apolices').delete().eq('id', id)
  if (error) throw new Error(`Erro ao excluir apólice: ${error.message}`)
}

/** Atualiza uma apólice existente */
export async function atualizarApolice(id, dados) {
  const { error } = await operacional.from('apolices').update(dados).eq('id', id)
  if (error) throw new Error(`Erro ao atualizar apólice: ${error.message}`)
}

/**
 * Lista apólices com filtros. Corretores comuns só veem as próprias
 * (a RLS já garante isso); master/administrador podem ver de todos.
 */
export async function listarApolices({ corretorId, produto, seguradoraId, mesReferencia } = {}) {
  let query = operacional.from('apolices').select('*').order('criado_em', { ascending: false })

  if (corretorId) query = query.eq('corretor_id', corretorId)
  if (produto) query = query.eq('produto', produto)
  if (seguradoraId) query = query.eq('operadora_id', seguradoraId)
  if (mesReferencia) {
    const inicio = `${mesReferencia}-01`
    const [ano, mes] = mesReferencia.split('-').map(Number)
    const fim = new Date(ano, mes, 0).toISOString().slice(0, 10) // último dia do mês
    query = query.gte('criado_em', inicio).lte('criado_em', `${fim}T23:59:59`)
  }

  const { data, error } = await query
  if (error) throw new Error(`Erro ao listar apólices: ${error.message}`)
  return data ?? []
}

/** Lista todos os corretores cadastrados (para o filtro do Painel Master) */
export async function listarCorretores() {
  const { data, error } = await supabase
    .from('perfis')
    .select('id, nome_completo, papel')
    .in('papel', ['corretor', 'administrador', 'master'])
    .order('nome_completo')
  if (error) throw new Error(`Erro ao listar corretores: ${error.message}`)
  return data ?? []
}

/**
 * Agrupa as apólices por corretor + produto, somando o prêmio total —
 * é a "visão bruta" do Painel Master (fechamento mensal de referência).
 */
export function agruparPorCorretorEProduto(apolices, corretores) {
  const nomesPorId = Object.fromEntries(corretores.map((c) => [c.id, c.nome_completo]))
  const grupos = {}

  for (const ap of apolices) {
    const chave = `${ap.corretor_id}|${ap.produto}`
    if (!grupos[chave]) {
      grupos[chave] = {
        corretorId: ap.corretor_id,
        corretorNome: nomesPorId[ap.corretor_id] ?? 'Corretor',
        produto: ap.produto,
        totalPremio: 0,
        quantidade: 0,
      }
    }
    grupos[chave].totalPremio += Number(ap.premio) || 0
    grupos[chave].quantidade += 1
  }

  return Object.values(grupos).sort((a, b) => a.corretorNome.localeCompare(b.corretorNome))
}