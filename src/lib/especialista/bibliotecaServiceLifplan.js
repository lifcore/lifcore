import { institucional } from '../supabaseSchemas'

/**
 * Serviço de consulta à Biblioteca Institucional — EXCLUSIVO do
 * Especialista LifPlan. Aponta sempre para as tabelas "_lifplan"
 * (biblioteca_lifplan, casos_lifplan), fisicamente separadas das dos
 * outros quatro especialistas.
 */

const PALAVRAS_IRRELEVANTES = new Set([
  'de', 'da', 'do', 'das', 'dos', 'a', 'o', 'as', 'os', 'e', 'ou', 'para', 'com', 'sem',
  'um', 'uma', 'uns', 'umas', 'no', 'na', 'nos', 'nas', 'que', 'se', 'por', 'em', 'ao', 'aos',
  'foi', 'está', 'estou', 'tem', 'ter', 'sobre', 'mais', 'como', 'quero', 'gostaria', 'preciso',
])

/** Busca documentos da biblioteca do LifPlan por categoria, ordenados por relevância ao texto */
export async function buscarBibliotecaRelevanteLifplan(categoria, textoDemanda, limite = 3) {
  const { data, error } = await institucional
    .from('biblioteca_lifplan')
    .select('codigo, titulo, conteudo, categoria')
    .eq('categoria', categoria)
    .limit(50)

  if (error) throw new Error(`Erro ao consultar biblioteca LifPlan (${categoria}): ${error.message}`)
  if (!data || data.length === 0) return []
  if (data.length <= limite) return data

  const palavrasChave = (textoDemanda || '')
    .toLowerCase()
    .replace(/[.,!?;:()"']/g, ' ')
    .split(/\s+/)
    .filter((p) => p.length > 2 && !PALAVRAS_IRRELEVANTES.has(p))

  function calcularPontuacao(doc) {
    const titulo = doc.titulo.toLowerCase()
    const conteudo = doc.conteudo.toLowerCase()
    let pontos = 0
    for (const palavra of palavrasChave) {
      if (titulo.includes(palavra)) pontos += 3
      if (conteudo.includes(palavra)) pontos += 1
    }
    return pontos
  }

  return data
    .map((doc) => ({ ...doc, _pontuacao: calcularPontuacao(doc) }))
    .sort((a, b) => b._pontuacao - a._pontuacao)
    .slice(0, limite)
}

/** Busca um documento do LifPlan direto pelo código (ex: REL-001) */
export async function buscarDocumentoLifplanPorCodigo(codigo) {
  const { data, error } = await institucional
    .from('biblioteca_lifplan')
    .select('codigo, titulo, conteudo')
    .eq('codigo', codigo)
    .maybeSingle()

  if (error) {
    console.warn(`Não foi possível buscar o documento ${codigo} da biblioteca LifPlan:`, error.message)
    return null
  }
  return data
}

/** Busca casos reais do LifPlan por relevância (começa vazio, cresce com o uso) */
export async function buscarCasosRelevantesLifplan(textoDemanda, limite = 4) {
  const { data, error } = await institucional
    .from('casos_lifplan')
    .select('codigo, titulo, categoria, contexto, problema, resultado, licoes_aprendidas, conteudo_completo, status_validacao')
    .neq('status_validacao', 'rejeitado')
    .limit(100)

  if (error) throw new Error(`Erro ao consultar casos reais do LifPlan: ${error.message}`)
  if (!data || data.length === 0) return []

  const palavrasChave = (textoDemanda || '')
    .toLowerCase()
    .replace(/[.,!?;:()"']/g, ' ')
    .split(/\s+/)
    .filter((p) => p.length > 2 && !PALAVRAS_IRRELEVANTES.has(p))

  function pontuar(caso) {
    const textoBusca = `${caso.titulo} ${caso.contexto ?? ''} ${caso.problema ?? ''} ${caso.resultado ?? ''}`.toLowerCase()
    return palavrasChave.reduce((soma, palavra) => soma + (textoBusca.includes(palavra) ? 1 : 0), 0)
  }

  return data
    .map((c) => ({ ...c, _pontuacao: pontuar(c) }))
    .filter((c) => c._pontuacao > 0)
    .sort((a, b) => b._pontuacao - a._pontuacao)
    .slice(0, limite)
}
