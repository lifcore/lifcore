import { institucional } from '../supabaseSchemas'

/**
 * Serviço de consulta à Biblioteca Institucional — EXCLUSIVO do
 * Especialista LifSure. Aponta sempre para as tabelas "_lifsure"
 * (biblioteca_lifsure, casos_lifsure), fisicamente separadas das do
 * Saúde e do Auto — mesmo princípio de isolamento dos outros dois.
 */

const PALAVRAS_IRRELEVANTES = new Set([
  'de', 'da', 'do', 'das', 'dos', 'a', 'o', 'as', 'os', 'e', 'ou', 'para', 'com', 'sem',
  'um', 'uma', 'uns', 'umas', 'no', 'na', 'nos', 'nas', 'que', 'se', 'por', 'em', 'ao', 'aos',
  'foi', 'está', 'estou', 'tem', 'ter', 'sobre', 'mais', 'como', 'quero', 'gostaria', 'preciso',
])

/** Busca documentos da biblioteca do LifSure por categoria, ordenados por relevância ao texto */
export async function buscarBibliotecaRelevanteLifsure(categoria, textoDemanda, limite = 3) {
  const { data, error } = await institucional
    .from('biblioteca_lifsure')
    .select('codigo, titulo, conteudo, categoria')
    .eq('categoria', categoria)
    .limit(50)

  if (error) throw new Error(`Erro ao consultar biblioteca LifSure (${categoria}): ${error.message}`)
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

/** Busca um documento do LifSure direto pelo código (ex: REL-001) */
export async function buscarDocumentoLifsurePorCodigo(codigo) {
  const { data, error } = await institucional
    .from('biblioteca_lifsure')
    .select('codigo, titulo, conteudo')
    .eq('codigo', codigo)
    .maybeSingle()

  if (error) {
    console.warn(`Não foi possível buscar o documento ${codigo} da biblioteca LifSure:`, error.message)
    return null
  }
  return data
}

/** Busca casos reais do LifSure por relevância (começa vazio, cresce com o uso) */
export async function buscarCasosRelevantesLifsure(textoDemanda, limite = 4) {
  const { data, error } = await institucional
    .from('casos_lifsure')
    .select('codigo, titulo, categoria, contexto, problema, resultado, licoes_aprendidas, conteudo_completo, status_validacao')
    .neq('status_validacao', 'rejeitado')
    .limit(100)

  if (error) throw new Error(`Erro ao consultar casos reais do LifSure: ${error.message}`)
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
