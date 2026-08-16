/**
 * MOTOR UNIVERSAL (Edge Function) — Orquestrador
 * Porte de scripts/motor-universal/index.cjs — mesma lógica de
 * decisão (formato conhecido / alterado / novo), só adaptada pro
 * runtime Deno e tipado.
 *
 * CORREÇÃO 1 (15/08 — causa raiz do erro 500 confirmado pela resposta
 * exata da Edge Function): quando `formatoHomologado.estrategia ===
 * 'ia_aprendida'`, o código antigo travava com "Reaplicação de receita
 * aprendida por IA ainda não implementada" — caminho deixado
 * incompleto de propósito. O que fica salvo em `receita_extracao` é só
 * uma DESCRIÇÃO EM TEXTO de como os campos foram identificados da
 * última vez, não um parser reaplicável. Até um motor de "replay" de
 * verdade existir, a correção honesta é chamar a IA de novo — mesmo
 * caminho de um formato nunca visto.
 *
 * CORREÇÃO 2 (15/08 — decisão arquitetural do Raphael): removida a
 * estratégia Suhai hardcoded (`estrategias/suhai.ts`) do orquestrador.
 * Motivo: um parser fixo, amarrado a colunas exatas do relatório de
 * hoje, quebra silenciosamente (ou pior, extrai dado errado sem
 * travar) se a seguradora mudar o layout — exigindo código novo toda
 * vez. Isso contraria o propósito do Motor Universal, que deveria
 * absorver mudança de formato sem precisar de deploy novo. A partir
 * de agora, TODA seguradora passa pelo caminho de IA (adaptativo) —
 * o arquivo `suhai.ts` continua existindo em disco (histórico), só não
 * é mais importado nem usado aqui.
 */

// deno-lint-ignore-file no-explicit-any
import { calcularAssinaturaEstrutural } from './identificacao.ts'
import { validarTudo } from './validacao.ts'
import { detectarAlteracao, calcularConfianca } from './confianca.ts'
import * as extracaoAdaptativa from './extracao-adaptativa.ts'

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

  // Nenhuma estratégia de código fixo registrada mais — só IA por
  // token (ver Correção 2 acima). Todo caminho que antes tentava
  // achar um parser de código cai direto na IA — não existe mais
  // ramificação por "estratégia registrada". Homologado ou não,
  // alterado ou não: sempre IA. O `formatoHomologado` continua sendo
  // consultado (e influencia o nível de confiança abaixo), só não
  // decide mais QUAL parser rodar.
  const resultadoExtracao = (await extracaoAdaptativa.extrair(linhas.join('\n'))) as any
  const origemExtracao = formatoHomologado && !alterado ? 'conhecida_ia_reaplicada' : formatoHomologado && alterado ? 'conhecida_alterada_ia' : 'adaptativa'
  const estrategiaUsada = 'ia_aprendida'

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
