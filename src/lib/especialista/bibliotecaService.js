import { institucional } from '../supabaseSchemas'

/**
 * Serviço de consulta à Biblioteca Institucional.
 * Implementa a Etapa 4 do ENG-003: "Consulta à Biblioteca".
 * Nenhuma resposta do Especialista deve ser produzida sem
 * passar por essas consultas primeiro.
 */

/** Busca documentos da biblioteca por categoria (ex: 'ANS', 'Operadoras') */
export async function buscarBibliotecaPorCategoria(categoria, limite = 5) {
  const { data, error } = await institucional
    .from('biblioteca')
    .select('codigo, titulo, conteudo, categoria')
    .eq('categoria', categoria)
    .limit(limite)

  if (error) throw new Error(`Erro ao consultar biblioteca (${categoria}): ${error.message}`)
  return data ?? []
}

const PALAVRAS_IRRELEVANTES = new Set([
  'de', 'da', 'do', 'das', 'dos', 'a', 'o', 'as', 'os', 'e', 'ou', 'para', 'com', 'sem',
  'um', 'uma', 'uns', 'umas', 'no', 'na', 'nos', 'nas', 'que', 'se', 'por', 'em', 'ao', 'aos',
  'foi', 'está', 'estou', 'tem', 'ter', 'sobre', 'mais', 'como', 'quero', 'gostaria', 'preciso',
])

/**
 * Busca documentos da biblioteca por categoria, ORDENADOS POR RELEVÂNCIA
 * em relação ao texto da demanda — em vez de pegar os primeiros N
 * registros de forma arbitrária. Importante à medida que a Biblioteca
 * cresce (ex: 24 documentos na categoria ANS): sem isso, o documento
 * realmente relevante para a pergunta pode nunca ser consultado.
 */
export async function buscarBibliotecaRelevante(categoria, textoDemanda, limite = 5) {
  const { data, error } = await institucional
    .from('biblioteca')
    .select('codigo, titulo, conteudo, categoria')
    .eq('categoria', categoria)
    .limit(50) // teto de segurança; categorias hoje têm no máximo ~24 documentos

  if (error) throw new Error(`Erro ao consultar biblioteca (${categoria}): ${error.message}`)
  if (!data || data.length === 0) return []
  if (data.length <= limite) return data // poucos documentos: não precisa nem ranquear

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
      if (titulo.includes(palavra)) pontos += 3 // título pesa mais
      if (conteudo.includes(palavra)) pontos += 1
    }
    return pontos
  }

  return data
    .map((doc) => ({ ...doc, _pontuacao: calcularPontuacao(doc) }))
    .sort((a, b) => b._pontuacao - a._pontuacao)
    .slice(0, limite)
}

/** Busca um modelo de raciocínio (REASON) específico pelo código */
export async function buscarModeloRaciocinio(codigo) {
  const { data, error } = await institucional
    .from('modelos_raciocinio')
    .select('*')
    .eq('codigo', codigo)
    .single()

  if (error) {
    console.warn(`Modelo de raciocínio ${codigo} não encontrado:`, error.message)
    return null
  }
  return data
}

/** Busca vários modelos de raciocínio de uma vez (um playbook pode usar mais de um) */
export async function buscarModelosRaciocinio(codigos) {
  const { data, error } = await institucional
    .from('modelos_raciocinio')
    .select('*')
    .in('codigo', codigos)

  if (error) throw new Error(`Erro ao consultar modelos de raciocínio: ${error.message}`)
  return data ?? []
}

/** Busca um playbook ativo pelo código (ex: 'PB-002') */
export async function buscarPlaybook(codigo) {
  const { data, error } = await institucional
    .from('playbooks')
    .select('*')
    .eq('codigo', codigo)
    .eq('status', 'ativo')
    .single()

  if (error) {
    console.warn(`Playbook ${codigo} não encontrado ou inativo:`, error.message)
    return null
  }
  return data
}

/** Lista todos os playbooks ativos (usado pelo classificador para escolher qual acionar) */
export async function listarPlaybooksAtivos() {
  const { data, error } = await institucional
    .from('playbooks')
    .select('codigo, nome, categoria, gatilhos, objetivo, informacoes_obrigatorias')
    .eq('status', 'ativo')

  if (error) throw new Error(`Erro ao listar playbooks: ${error.message}`)
  return data ?? []
}

/** Busca casos fundamentais específicos pelo código (ex: para o REASON-017 citar CASO-SAU-045 a 060) */
export async function buscarCasosFundamentais(codigos) {
  const { data, error } = await institucional
    .from('casos_fundamentais')
    .select('codigo, titulo, categoria, contexto, problema, analise, resultado, licoes_aprendidas, conteudo_completo, status_validacao')
    .in('codigo', codigos)
    .neq('status_validacao', 'rejeitado')

  if (error) throw new Error(`Erro ao consultar casos fundamentais: ${error.message}`)
  return data ?? []
}

/**
 * Busca casos fundamentais por RELEVÂNCIA ao texto da demanda, direto —
 * sem depender de uma lista fixa pré-associada a um Playbook. Usado
 * pelo motor de raciocínio único (substitui a arquitetura de Playbooks
 * como portão de decisão).
 */
export async function buscarCasosRelevantes(textoDemanda, limite = 4) {
  const { data, error } = await institucional
    .from('casos_fundamentais')
    .select('codigo, titulo, categoria, contexto, problema, resultado, licoes_aprendidas, conteudo_completo, status_validacao')
    .neq('status_validacao', 'rejeitado')
    .limit(100)

  if (error) throw new Error(`Erro ao consultar casos relevantes: ${error.message}`)
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

/** Lista compacta de todos os Modelos de Raciocínio (usada como "menu" de referência, não como checklist obrigatório) */
export async function buscarReasonCompactos() {
  const { data, error } = await institucional
    .from('modelos_raciocinio')
    .select('codigo, titulo, objetivo')
    .eq('status', 'oficial')
    .order('codigo')

  if (error) throw new Error(`Erro ao listar modelos de raciocínio: ${error.message}`)
  return data ?? []
}

/** Mapeia o porte do cliente (já calculado no cadastro) para o REG correspondente */
const REG_POR_PORTE = {
  PME1: 'REG-003',
  PME2: 'REG-004',
  Negociado: 'REG-005',
}

/** Busca a regulamentação (REG) aplicável ao porte do cliente, se houver */
export async function buscarRegulamentacaoPorPorte(porte) {
  const codigo = REG_POR_PORTE[porte]
  if (!codigo) return null
  return buscarRegulamentacaoPorCodigo(codigo)
}

/** Busca uma regulamentação (REG) diretamente pelo código — usado, por exemplo, quando o tipo de contratante é Pessoa Física (REG-001) */
export async function buscarRegulamentacaoPorCodigo(codigo) {
  const { data, error } = await institucional
    .from('biblioteca')
    .select('codigo, titulo, conteudo')
    .eq('codigo', codigo)
    .maybeSingle()

  if (error) {
    console.warn(`Não foi possível buscar regulamentação ${codigo}:`, error.message)
    return null
  }
  return data
}

/** Busca operadora pelo nome (busca aproximada) */
export async function buscarOperadoraPorNome(nome) {
  const { data, error } = await institucional
    .from('operadoras')
    .select('codigo, nome, registro_ans, modalidades, abrangencia')
    .ilike('nome', `%${nome}%`)
    .limit(1)

  if (error) throw new Error(`Erro ao consultar operadora: ${error.message}`)
  return data?.[0] ?? null
}
