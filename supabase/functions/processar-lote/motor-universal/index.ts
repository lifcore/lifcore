/**
 * MOTOR UNIVERSAL (Edge Function) — Orquestrador
 * Porte de scripts/motor-universal/index.cjs — mesma lógica de
 * decisão (formato conhecido / alterado / novo), só adaptada pro
 * runtime Deno e tipado.
 *
 * CORREÇÃO (15/08 — Raphael/Claude, causa raiz do erro 500 real em
 * produção, confirmado pela resposta exata da Edge Function):
 * quando `formatoHomologado.estrategia === 'ia_aprendida'`, o código
 * antigo travava com "Reaplicação de receita aprendida por IA ainda
 * não implementada" — não era bug escondido, era um caminho deixado
 * incompleto de propósito. O que fica salvo em `receita_extracao` é só
 * uma DESCRIÇÃO EM TEXTO de como os campos foram identificados da
 * última vez — não é um parser determinístico reaplicável (diferente
 * da estratégia Suhai, que é código puro). Construir um motor que
 * transforma essa descrição em texto num parser de verdade é feature
 * própria, maior, ainda não construída.
 *
 * Até esse motor de "replay" existir, a correção honesta é: quando o
 * formato foi aprendido por IA, chama a IA de novo — exatamente o
 * mesmo caminho usado pra formato nunca visto. Custa uma chamada de
 * API a mais por documento desse tipo (não é grátis como Suhai), mas
 * funciona corretamente, sem inventar nenhuma "receita" que não existe
 * de verdade.
 */

// deno-lint-ignore-file no-explicit-any
import { calcularAssinaturaEstrutural, estrategiaCompativel } from './identificacao.ts'
import { validarTudo } from './validacao.ts'
import { detectarAlteracao, calcularConfianca } from './confianca.ts'
import estrategiaSuhai from './estrategias/suhai.ts'
import * as extracaoAdaptativa from './extracao-adaptativa.ts'

const ESTRATEGIAS_CONHECIDAS = [estrategiaSuhai]

async function identificarSeguradoraPorCatalogo(linhas: string[], institucionalDb: any) {
  const { data: operadoras, error } = await institucionalDb.from('operadoras').select('id, nome')
  if (error) throw new Error(`Erro ao buscar catálogo de operadoras: ${error.message}`)

  const textoCompleto = linhas.join(' ').toUpperCase()
  for (const op of operadoras ?? []) {
    const nomeOperadora = op.nome.toUpperCase().trim()
    if (textoCompleto.includes(nomeOperadora)) {
      return { id: op.id, nome: op.nome }
    }
    const primeiraPalavra = nomeOperadora.split(/\s+/)[0]
    if (primeiraPalavra.length >= 3 && textoCompleto.includes(primeiraPalavra)) {
      return { id: op.id, nome: op.nome }
    }
  }
  return null
}

async function buscarFormatoHomologado(seguradoraId: string | null, tipoDocumento: string, operacionalDb: any) {
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

function encontrarEstrategiaPorNome(nome: string) {
  return ESTRATEGIAS_CONHECIDAS.find((e) => e.nome === nome) ?? null
}

function classificar(valorBruto: number) {
  if (valorBruto > 0) return 'recebimento'
  if (valorBruto < 0) return 'ajuste_estorno'
  return 'zero_sem_recebimento'
}

export async function processarDocumento({
  linhas,
  tipoDocumento = 'comissoes',
  operacionalDb,
  institucionalDb,
  seguradoraIdForcada = null,
}: {
  linhas: string[]
  tipoDocumento?: string
  operacionalDb: any
  institucionalDb: any
  seguradoraIdForcada?: string | null
}) {
  const assinatura = await calcularAssinaturaEstrutural(linhas)

  let seguradora: { id: string; nome: string } | null = null
  if (seguradoraIdForcada) {
    const { data, error } = await institucionalDb.from('operadoras').select('id, nome').eq('id', seguradoraIdForcada).single()
    if (error) throw new Error(`Seguradora informada não encontrada no catálogo: ${error.message}`)
    seguradora = data
  } else {
    seguradora = await identificarSeguradoraPorCatalogo(linhas, institucionalDb)
  }

  const formatoHomologado = await buscarFormatoHomologado(seguradora?.id ?? null, tipoDocumento, operacionalDb)
  const { alterado } = detectarAlteracao(formatoHomologado, assinatura)

  let resultadoExtracao: any
  let origemExtracao: string
  let estrategiaUsada: string | null

  if (formatoHomologado && !alterado && formatoHomologado.estrategia === 'ia_aprendida') {
    // Formato homologado, mas a estratégia salva foi aprendida por IA
    // — não existe motor de "replay" de receita ainda (ver comentário
    // do topo do arquivo). Chama a IA de novo, mesmo caminho de um
    // formato nunca visto.
    resultadoExtracao = await extracaoAdaptativa.extrair(linhas.join('\n'))
    origemExtracao = 'conhecida_ia_reaplicada'
    estrategiaUsada = 'ia_aprendida'
  } else if (formatoHomologado && !alterado) {
    const estrategia = encontrarEstrategiaPorNome(formatoHomologado.estrategia)
    if (!estrategia) throw new Error(`Formato homologado aponta pra estratégia "${formatoHomologado.estrategia}", que não está registrada.`)
    resultadoExtracao = estrategia.extrair(linhas)
    origemExtracao = 'conhecida'
    estrategiaUsada = estrategia.nome
  } else if (formatoHomologado && alterado) {
    const estrategia = encontrarEstrategiaPorNome(formatoHomologado.estrategia)
    resultadoExtracao = estrategia
      ? estrategia.extrair(linhas)
      : { eventos: [], nomeOrigemDocumento: seguradora?.nome, periodoInicio: null, periodoFim: null, totalInformadoDocumento: null }
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

  const eventosClassificados = resultadoExtracao.eventos.map((e: any) => ({
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
