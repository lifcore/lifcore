/**
 * EDGE FUNCTION: processar-lote
 * DOC-COM-002 — dispara automaticamente logo após o upload de um
 * relatório (chamada por src/lib/crm/lotesImportacaoService.js via
 * supabase.functions.invoke('processar-lote', { body: { loteId } })).
 *
 * IMPORTANTE (transparência): esta função foi escrita e revisada com
 * cuidado, mas não pôde ser testada ao vivo neste processo — o
 * ambiente de desenvolvimento usado não tem runtime Deno disponível.
 * O teste real só acontece após o deploy (`supabase functions deploy
 * processar-lote`) e uma primeira chamada real.
 *
 * CORREÇÃO (15/08 — Raphael/Claude): antes, esta função SEMPRE tentava
 * ler o arquivo como PDF (`pdfParse`), não importa o tipo real —
 * `lotesImportacaoService.js` já classificava corretamente
 * `tipo_documento` (pdf_textual/csv/excel/imagem) na hora do upload,
 * mas esse dado nunca era usado aqui. CSV, TXT e Excel quebravam (ou
 * nunca foram testados). Agora lê `lote.tipo_documento` e ramifica:
 * PDF continua com `pdf-parse`; CSV/TXT são decodificados como texto
 * puro (mais simples e mais confiável que PDF); Excel usa a
 * biblioteca `xlsx` (SheetJS) pra virar linhas de texto, célula a
 * célula. Imagem (PNG/JPG) foi removida do catálogo de tipos aceitos
 * em `lotesImportacaoService.js` (decisão do Raphael — risco de OCR
 * malinterpretar por distorção/qualidade não vale o ganho).
 */

import { createClient } from 'npm:@supabase/supabase-js@2'
// deno-lint-ignore no-explicit-any
import pdfParseModule from 'npm:pdf-parse@1.1.1'
import * as XLSX from 'npm:xlsx@0.18.5'
import { processarDocumento } from './motor-universal/index.ts'

const pdfParse = pdfParseModule as (buffer: Uint8Array) => Promise<{ text: string }>

const BUCKET = 'anexos'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

/** PDF, já existia — texto corrido, split por linha. */
function linhasDePdf(texto: string): string[] {
  return texto
    .split('\n')
    .map((l: string) => l.trim())
    .filter((l: string) => l.length > 0)
}

/** CSV e TXT são o caso mais simples — decodifica como texto puro, sem nenhuma biblioteca. */
function linhasDeTexto(buffer: Uint8Array): string[] {
  const texto = new TextDecoder('utf-8').decode(buffer)
  return texto
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
}

/**
 * Excel — usa SheetJS pra ler a primeira aba, célula por célula, e
 * transforma cada linha da planilha numa string só (células separadas
 * por " | "), pra caber no mesmo formato `linhas: string[]` que todo
 * o resto do motor (identificação, estratégias, IA) já espera. Só a
 * primeira aba é lida — se o relatório vier em múltiplas abas, isso
 * é uma limitação conhecida, não silenciosa (fica registrado aqui).
 */
function linhasDeExcel(buffer: Uint8Array): string[] {
  const planilha = XLSX.read(buffer, { type: 'array' })
  const nomePrimeiraAba = planilha.SheetNames[0]
  if (!nomePrimeiraAba) return []
  const aba = planilha.Sheets[nomePrimeiraAba]
  const linhasComoArrays = XLSX.utils.sheet_to_json(aba, { header: 1, raw: false, defval: '' }) as unknown[][]
  return linhasComoArrays
    .map((linha) => linha.map((celula) => String(celula ?? '').trim()).join(' | '))
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
}

async function extrairLinhas(tipoDocumento: string, buffer: Uint8Array): Promise<string[]> {
  switch (tipoDocumento) {
    case 'pdf_textual': {
      const pdf = await pdfParse(buffer)
      return linhasDePdf(pdf.text)
    }
    case 'csv':
    case 'texto':
      return linhasDeTexto(buffer)
    case 'excel':
      return linhasDeExcel(buffer)
    default:
      throw new Error(`Tipo de documento "${tipoDocumento}" não tem leitor implementado.`)
  }
}

Deno.serve(async (req: Request) => {
  // Navegador manda uma requisição OPTIONS antes da de verdade
  // (preflight) — sem responder isso corretamente, o navegador nunca
  // chega a mandar a chamada real.
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { loteId } = await req.json()
    if (!loteId) {
      return new Response(JSON.stringify({ ok: false, error: 'loteId é obrigatório' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
    const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const operacionalDb = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { db: { schema: 'operacional' } })
    const institucionalDb = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { db: { schema: 'institucional' } })

    const { data: lote, error: erroLote } = await operacionalDb.from('lotes_importacao').select('*').eq('id', loteId).single()
    if (erroLote) throw new Error(`Erro ao buscar lote: ${erroLote.message}`)
    if (lote.status !== 'recebido') {
      // Não é erro fatal — pode acontecer de a função ser chamada 2x
      // por engano (ex: retry de rede). Não reprocessa silenciosamente.
      return new Response(
        JSON.stringify({ ok: false, motivo: `Lote com status "${lote.status}", esperado "recebido". Não reprocessado.` }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const { data: arquivoBlob, error: erroDownload } = await operacionalDb.storage.from(BUCKET).download(lote.storage_path)
    if (erroDownload) throw new Error(`Erro ao baixar arquivo do Storage: ${erroDownload.message}`)

    const buffer = new Uint8Array(await arquivoBlob.arrayBuffer())
    const linhas = await extrairLinhas(lote.tipo_documento, buffer)

    const resultado = await processarDocumento({ linhas, operacionalDb, institucionalDb, seguradoraIdForcada: lote.seguradora_id })

    const competenciaInformada = resultado.periodoInicio ? `${resultado.periodoInicio.slice(0, 7)}-01` : null

    if (resultado.eventos.length > 0) {
      const eventosParaInserir = resultado.eventos.map((e: Record<string, unknown>) => ({ lote_importacao_id: loteId, ...e }))
      const { error: erroEventos } = await operacionalDb.from('eventos_financeiros_normalizados').insert(eventosParaInserir)
      if (erroEventos) throw new Error(`Erro ao gravar eventos: ${erroEventos.message}`)
    }

    const statusPorConfianca: Record<string, string> = {
      alta: 'aguardando_confirmacao',
      revisao: 'revisao_necessaria',
      bloqueado: 'bloqueado',
    }

    const valorBrutoTotal = resultado.eventos.reduce((s: number, e: { valor_bruto: number }) => s + e.valor_bruto, 0)

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
        assinatura_estrutural_pendente: resultado.assinatura.hash,
        origem_extracao_pendente: resultado.origemExtracao,
        estrategia_pendente: resultado.estrategiaUsada,
        receita_extracao_pendente: resultado.receitaExtracao,
      })
      .eq('id', loteId)
    if (erroUpdate) throw new Error(`Erro ao atualizar lote: ${erroUpdate.message}`)

    return new Response(
      JSON.stringify({
        ok: true,
        seguradora: resultado.seguradora?.nome ?? null,
        origemExtracao: resultado.origemExtracao,
        eventos: resultado.eventos.length,
        nivelConfianca: resultado.confianca.nivel,
        motivoConfianca: resultado.confianca.motivo,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
