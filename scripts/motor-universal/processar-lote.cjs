/**
 * MOTOR UNIVERSAL — CLI (DOC-COM-002)
 * Substitui extrair-normalizar-suhai.cjs por um processamento genérico
 * — a Suhai continua funcionando (agora via estratégia de código
 * dentro do motor), mas o mesmo comando serve pra qualquer formato,
 * conhecido ou não.
 *
 * Rodar: node scripts/processar-lote.cjs <lote_importacao_id>
 * Precisa de SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY. Se o documento
 * cair no caminho adaptativo (formato desconhecido), precisa também
 * de ANTHROPIC_API_KEY.
 */

const { createClient } = require('@supabase/supabase-js')
const pdfParse = require('pdf-parse')
const { processarDocumento } = require('./motor-universal/index.cjs')

const SUPABASE_URL = process.env.SUPABASE_URL
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const BUCKET = 'anexos'
const loteId = process.argv[2]

async function main() {
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    console.error('Defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY como variável de ambiente antes de rodar.')
    process.exitCode = 1
    return
  }
  if (!loteId) {
    console.error('Uso: node scripts/processar-lote.cjs <lote_importacao_id>')
    process.exitCode = 1
    return
  }

  const operacionalDb = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { db: { schema: 'operacional' } })
  const institucionalDb = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { db: { schema: 'institucional' } })

  console.log(`Processando lote ${loteId}...`)
  const { data: lote, error: erroLote } = await operacionalDb.from('lotes_importacao').select('*').eq('id', loteId).single()
  if (erroLote) throw new Error(`Erro ao buscar lote: ${erroLote.message}`)
  if (lote.status !== 'recebido') {
    throw new Error(`Lote está com status "${lote.status}", esperado "recebido". Já foi processado?`)
  }

  console.log(`Arquivo: ${lote.nome_arquivo_original}`)
  const { data: arquivoBlob, error: erroDownload } = await operacionalDb.storage.from(BUCKET).download(lote.storage_path)
  if (erroDownload) throw new Error(`Erro ao baixar arquivo do Storage: ${erroDownload.message}`)

  const buffer = Buffer.from(await arquivoBlob.arrayBuffer())
  const pdf = await pdfParse(buffer)
  const linhas = pdf.text.split('\n').map((l) => l.trim()).filter((l) => l.length > 0)

  const resultado = await processarDocumento({ linhas, operacionalDb, institucionalDb })

  console.log(`Seguradora identificada: ${resultado.seguradora?.nome ?? 'NÃO IDENTIFICADA'}`)
  console.log(`Origem da extração: ${resultado.origemExtracao}`)
  console.log(`Eventos: ${resultado.eventos.length}`)
  console.log(`Nível de confiança: ${resultado.confianca.nivel.toUpperCase()} — ${resultado.confianca.motivo}`)

  const competenciaInformada = resultado.periodoInicio ? `${resultado.periodoInicio.slice(0, 7)}-01` : null

  // Grava os eventos SEMPRE — mesmo em revisão/bloqueado, o Gestor
  // precisa ver o que foi encontrado na prévia (Seção 8/16 — nunca
  // esconder, nunca descartar silenciosamente).
  if (resultado.eventos.length > 0) {
    const eventosParaInserir = resultado.eventos.map((e) => ({ lote_importacao_id: loteId, ...e }))
    const { error: erroEventos } = await operacionalDb.from('eventos_financeiros_normalizados').insert(eventosParaInserir)
    if (erroEventos) throw new Error(`Erro ao gravar eventos: ${erroEventos.message}`)
  }

  const statusPorConfianca = {
    alta: 'aguardando_confirmacao',
    revisao: 'revisao_necessaria',
    bloqueado: 'bloqueado',
  }

  const valorBrutoTotal = resultado.eventos.reduce((s, e) => s + e.valor_bruto, 0)

  const { error: erroUpdate } = await operacionalDb
    .from('lotes_importacao')
    .update({
      seguradora_id: resultado.seguradora?.id ?? null,
      competencia_informada: competenciaInformada,
      periodo_inicio: resultado.periodoInicio,
      periodo_fim: resultado.periodoFim,
      status: statusPorConfianca[resultado.confianca.nivel],
      nivel_confianca: resultado.confianca.nivel,
      motivo_confianca: resultado.confianca.motivo,
      quantidade_linhas_extraidas: resultado.eventos.length,
      valor_bruto_total_extraido: Number(valorBrutoTotal.toFixed(2)),
      valor_liquido_total_extraido: Number(valorBrutoTotal.toFixed(2)),
      // pendências pra confirmação (Passo 8) — só relevantes quando o
      // formato ainda não é conhecido ou mudou
      assinatura_estrutural_pendente: resultado.assinatura.hash,
      origem_extracao_pendente: resultado.origemExtracao,
      estrategia_pendente: resultado.estrategiaUsada,
      receita_extracao_pendente: resultado.receitaExtracao,
    })
    .eq('id', loteId)
  if (erroUpdate) throw new Error(`Erro ao atualizar lote: ${erroUpdate.message}`)

  console.log(`\nLote ${loteId} → status: ${statusPorConfianca[resultado.confianca.nivel]}`)
  console.log('Confira a prévia na aba Financeiro → Recebimentos. Nenhum recebimento real foi criado.')
}

main().catch((e) => {
  console.error('ERRO:', e.message)
  process.exitCode = 1
})
