/**
 * MOTOR UNIVERSAL DE EXTRAÇÃO E NORMALIZAÇÃO (DOC-COM-002, Passo 2)
 *
 * Fluxo (Seção 2 da diretriz):
 *   Documento → Identificação → formato homologado? → extração
 *   conhecida OU adaptativa → normalização → validação → confiança →
 *   prévia (sempre) → confirmação inicial (só formato novo) → memória
 *
 * Este módulo não sabe nada sobre PDF/OCR/Excel especificamente — só
 * orquestra. A extração de texto bruto do arquivo continua sendo
 * responsabilidade de quem chama (mesmo padrão já usado: pdf-parse
 * pra PDF textual).
 */

const { calcularAssinaturaEstrutural, estrategiaCompativel } = require('./identificacao.cjs')
const { validarTudo } = require('./validacao.cjs')
const { detectarAlteracao, calcularConfianca, NIVEIS } = require('./confianca.cjs')
const estrategiaSuhai = require('./estrategias/suhai.cjs')
const extracaoAdaptativa = require('./extracao-adaptativa.cjs')

// Registro de estratégias de código conhecidas (Passo 1 é a primeira
// entrada). Novas estratégias de código (se algum formato "formar" e
// vale a pena virar código dedicado) se registram aqui.
const ESTRATEGIAS_CONHECIDAS = [estrategiaSuhai]

/**
 * Tenta achar uma seguradora do catálogo institucional cujo nome
 * apareça no texto do documento — genérico, não assume vocabulário de
 * nenhuma seguradora específica (identificação pelo CONTEÚDO, nunca
 * pelo nome do arquivo).
 */
async function identificarSeguradoraPorCatalogo(linhas, institucionalDb) {
  const { data: operadoras, error } = await institucionalDb.from('operadoras').select('id, nome')
  if (error) throw new Error(`Erro ao buscar catálogo de operadoras: ${error.message}`)

  const textoCompleto = linhas.join(' ').toUpperCase()
  for (const op of operadoras ?? []) {
    const nomeOperadora = op.nome.toUpperCase().trim()
    if (textoCompleto.includes(nomeOperadora)) {
      return { id: op.id, nome: op.nome }
    }
    // Também tenta pela primeira palavra significativa do nome
    // cadastrado (ex: "HDI" de "HDI Seguros S.A.") — resolve o caso
    // do documento não repetir a razão social completa cadastrada.
    const primeiraPalavra = nomeOperadora.split(/\s+/)[0]
    if (primeiraPalavra.length >= 3 && textoCompleto.includes(primeiraPalavra)) {
      return { id: op.id, nome: op.nome }
    }
  }
  return null
}

/**
 * Busca formato homologado — chave é seguradora + tipo_documento
 * (Seção 5). tipoDocumento é fixo como 'comissoes' por enquanto, já
 * que é o único tipo de relatório que processamos.
 */
async function buscarFormatoHomologado(seguradoraId, tipoDocumento, operacionalDb) {
  if (!seguradoraId) return null
  const { data, error } = await operacionalDb
    .from('formatos_homologados')
    .select('*')
    .eq('seguradora_id', seguradoraId)
    .eq('tipo_documento', tipoDocumento)
    .eq('status', 'homologado')
    .order('versao', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw new Error(`Erro ao buscar formato homologado: ${error.message}`)
  return data
}

function encontrarEstrategiaPorNome(nome) {
  return ESTRATEGIAS_CONHECIDAS.find((e) => e.nome === nome) ?? null
}

function classificar(valorBruto) {
  if (valorBruto > 0) return 'recebimento'
  if (valorBruto < 0) return 'ajuste_estorno'
  return 'zero_sem_recebimento'
}

/**
 * Processa um documento já extraído em texto (linhas). Não toca em
 * banco — devolve um resultado estruturado; quem chama decide o que
 * gravar (mantém este módulo testável sem depender de conexão real).
 */
async function processarDocumento({ linhas, tipoDocumento = 'comissoes', operacionalDb, institucionalDb, seguradoraIdForcada = null }) {
  const assinatura = calcularAssinaturaEstrutural(linhas)

  // Se o Gestor já escolheu a seguradora no upload, respeita essa
  // escolha — não tenta adivinhar de novo por conteúdo. Só cai na
  // identificação automática quando ninguém informou nada.
  let seguradora = null
  if (seguradoraIdForcada) {
    const { data, error } = await institucionalDb.from('operadoras').select('id, nome').eq('id', seguradoraIdForcada).single()
    if (error) throw new Error(`Seguradora informada no upload não encontrada no catálogo: ${error.message}`)
    seguradora = data
  } else {
    seguradora = await identificarSeguradoraPorCatalogo(linhas, institucionalDb)
  }

  const formatoHomologado = await buscarFormatoHomologado(seguradora?.id, tipoDocumento, operacionalDb)
  const { alterado } = detectarAlteracao(formatoHomologado, assinatura)

  let resultadoExtracao
  let origemExtracao
  let estrategiaUsada

  if (formatoHomologado && !alterado) {
    if (formatoHomologado.estrategia === 'ia_aprendida') {
      throw new Error('Reaplicação de receita aprendida por IA ainda não implementada — necessário só a partir do Passo 10.')
    }
    const estrategia = encontrarEstrategiaPorNome(formatoHomologado.estrategia)
    if (!estrategia) throw new Error(`Formato homologado aponta pra estratégia "${formatoHomologado.estrategia}", que não está registrada no motor.`)
    resultadoExtracao = estrategia.extrair(linhas)
    origemExtracao = 'conhecida'
    estrategiaUsada = estrategia.nome
  } else if (formatoHomologado && alterado) {
    const estrategia = encontrarEstrategiaPorNome(formatoHomologado.estrategia)
    resultadoExtracao = estrategia ? estrategia.extrair(linhas) : { eventos: [], nomeOrigemDocumento: seguradora?.nome, periodoInicio: null, periodoFim: null, totalInformadoDocumento: null }
    origemExtracao = 'conhecida_alterada'
    estrategiaUsada = estrategia?.nome ?? null
  } else {
    const estrategiaCompativelEncontrada = ESTRATEGIAS_CONHECIDAS.find((e) => estrategiaCompativel(e, assinatura.camposDetectados))
    if (estrategiaCompativelEncontrada) {
      resultadoExtracao = estrategiaCompativelEncontrada.extrair(linhas)
      origemExtracao = 'conhecida_sem_homologacao_formal'
      estrategiaUsada = estrategiaCompativelEncontrada.nome
    } else {
      resultadoExtracao = await extracaoAdaptativa.extrair(linhas.join('\n'))
      origemExtracao = 'adaptativa'
      estrategiaUsada = 'ia_aprendida'
    }
  }

  const eventosClassificados = resultadoExtracao.eventos.map((e) => ({
    ...e,
    classificacao: classificar(e.valor_bruto),
  }))

  const validacao = validarTudo(eventosClassificados, resultadoExtracao.totalInformadoDocumento)
  const confianca = calcularConfianca({
    formatoEncontrado: !!formatoHomologado,
    alteracaoDetectada: alterado,
    origemExtracao,
    validacao,
  })

  return {
    seguradora,
    assinatura,
    origemExtracao,
    estrategiaUsada,
    eventos: eventosClassificados,
    nomeOrigemDocumento: resultadoExtracao.nomeOrigemDocumento,
    periodoInicio: resultadoExtracao.periodoInicio,
    periodoFim: resultadoExtracao.periodoFim,
    totalInformadoDocumento: resultadoExtracao.totalInformadoDocumento,
    receitaExtracao: resultadoExtracao.receitaExtracao ?? null,
    validacao,
    confianca,
  }
}

module.exports = { processarDocumento, NIVEIS }
