/**
 * EDGE FUNCTION: processar-catalogo-mercado
 * SPEC-002 — Connect Center, Peça 1. Disparada após upload de material
 * de mercado em `institucional.lotes_importacao_mercado` (status
 * inicial "recebido"). Suporta PDF, Excel, CSV e TXT — mesmo padrão de
 * detecção por extensão do Motor Universal (`EXTENSOES_TIPO`).
 *
 * IMPORTANTE (mesma transparência dos outros motores): escrita e
 * revisada com cuidado, sem runtime Deno disponível neste processo
 * para teste ao vivo. Teste real só após deploy.
 *
 * Resultado do processamento NUNCA é gravado direto nas tabelas de
 * domínio — sempre em `divergencias_reconciliacao`, aguardando
 * aprovação humana (SPEC-002 §5).
 */

import { createClient } from 'npm:@supabase/supabase-js@2'
import pdfParseModule from 'npm:pdf-parse@1.1.1'
import * as XLSX from 'npm:xlsx@0.18.5'
import {
  processarDominioPlanos,
  processarDominioPrecos,
  processarDominioRegraMercado,
  processarDominioRede,
  calcularAssinaturaEstrutural,
} from './motor-mercado/index.ts'

const pdfParse = pdfParseModule as (buffer: Uint8Array) => Promise<{ text: string }>

const BUCKET = 'anexos'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function extensaoDoArquivo(caminho: string): string {
  return caminho.split('.').pop()?.toLowerCase() ?? ''
}

async function extrairTexto(buffer: Uint8Array, extensao: string): Promise<string> {
  if (extensao === 'pdf') {
    const pdf = await pdfParse(buffer)
    return pdf.text
  }
  if (extensao === 'xlsx' || extensao === 'xls') {
    const workbook = XLSX.read(buffer, { type: 'array' })
    return workbook.SheetNames.map((nome: string) => XLSX.utils.sheet_to_csv(workbook.Sheets[nome])).join('\n\n')
  }
  // csv / txt — texto puro, sem biblioteca
  return new TextDecoder('utf-8').decode(buffer)
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const { loteId } = await req.json()
    if (!loteId) {
      return new Response(JSON.stringify({ ok: false, error: 'loteId é obrigatório' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
    const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const institucionalDb = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { db: { schema: 'institucional' } })

    const { data: lote, error: erroLote } = await institucionalDb.from('lotes_importacao_mercado').select('*').eq('id', loteId).single()
    if (erroLote) throw new Error(`Erro ao buscar lote: ${erroLote.message}`)

    if (lote.status !== 'recebido') {
      return new Response(JSON.stringify({ ok: false, motivo: `Lote com status "${lote.status}", esperado "recebido". Não reprocessado.` }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { data: arquivoBlob, error: erroDownload } = await institucionalDb.storage.from(BUCKET).download(lote.storage_path)
    if (erroDownload) throw new Error(`Erro ao baixar arquivo: ${erroDownload.message}`)

    const buffer = new Uint8Array(await arquivoBlob.arrayBuffer())
    const extensao = extensaoDoArquivo(lote.storage_path)
    const texto = await extrairTexto(buffer, extensao)
    const linhas = texto.split('\n').map((l: string) => l.trim()).filter((l: string) => l.length > 0)

    const assinatura = await calcularAssinaturaEstrutural(linhas)

    let divergencias: Array<Record<string, unknown>> = []

    if (lote.dominio === 'planos') {
      const { data: operadora } = await institucionalDb.from('operadoras').select('razao_social').eq('id', lote.operadora_id).single()
      const { data: produtoPadrao } = await institucionalDb.from('produtos').select('id').eq('modulo', 'saude').limit(1).maybeSingle()
      if (!produtoPadrao) throw new Error('Nenhum produto cadastrado no catálogo institucional para o módulo saúde — cadastre ao menos um Produto antes de importar Planos.')
      divergencias = await processarDominioPlanos(texto, lote.operadora_id, operadora?.razao_social ?? '', produtoPadrao.id, institucionalDb)
    } else if (lote.dominio === 'precos') {
      divergencias = await processarDominioPrecos(texto, lote.operadora_id, institucionalDb, lote.regiao_tarifaria_id)
      // Passo 3 (Documento Mestre) — região é propriedade do lote inteiro
      // (confirmado nos PDFs de referência Porto Seguro SP/Jundiaí: o
      // título já diz a região, nunca precisa extrair do texto). Carimba
      // aqui, na saída, como rede de segurança: garante
      // regiao_tarifaria_id correto em toda regras_precificacao mesmo
      // que motor-mercado/index.ts ainda não use o parâmetro novo
      // internamente (arquivo ainda não revisado nesta sessão). A
      // decisão de status (vigente/regra_insuficiente) continua sendo
      // do motor-mercado — se ele ainda validar pela chave antiga
      // 'regiao' (texto), vai marcar regra_insuficiente até ser
      // atualizado. Isso é seguro (nunca vira vigente por engano), só
      // não fecha o Passo 3 por completo.
      divergencias = divergencias.map((d) =>
        d.tabela_afetada === 'regras_precificacao'
          ? { ...d, dado_novo: { ...(d.dado_novo as Record<string, unknown>), regiao_tarifaria_id: lote.regiao_tarifaria_id } }
          : d
      )
    } else if (['carencia', 'coparticipacao', 'reembolso', 'regra_comercial'].includes(lote.dominio)) {
      divergencias = await processarDominioRegraMercado(texto, lote.dominio, lote.operadora_id, institucionalDb)
    } else if (lote.dominio === 'rede') {
      // prestadores_unidade é criado por get-or-create dentro de
      // processarDominioRede, antes de qualquer divergência voltar pra
      // cá — não dá pra corrigir região por fora, só editando
      // motor-mercado/index.ts diretamente (pendente, arquivo não
      // recebido ainda). Parâmetro passado já, forward-compatible, sem
      // efeito até lá.
      divergencias = await processarDominioRede(texto, lote.operadora_id, institucionalDb, lote.regiao_tarifaria_id)
    } else {
      throw new Error(`Domínio desconhecido: ${lote.dominio}`)
    }

    if (divergencias.length > 0) {
      const paraInserir = divergencias.map((d) => ({ ...d, lote_importacao_id: loteId }))
      const { error: erroDivergencias } = await institucionalDb.from('divergencias_reconciliacao').insert(paraInserir)
      if (erroDivergencias) throw new Error(`Erro ao gravar divergências: ${erroDivergencias.message}`)
    }

    const quantidadeInsuficientes = divergencias.filter(
      (d) => d.tabela_afetada === 'regras_precificacao' && (d.dado_novo as Record<string, unknown>)?.status === 'regra_insuficiente'
    ).length

    const { error: erroUpdate } = await institucionalDb
      .from('lotes_importacao_mercado')
      .update({
        status: divergencias.length > 0 ? 'aguardando_aprovacao' : 'aprovado',
        quantidade_registros_processados: divergencias.length,
        quantidade_registros_insuficientes: quantidadeInsuficientes,
        receita_extracao: { assinatura_estrutural: assinatura.hash },
        processado_em: new Date().toISOString(),
      })
      .eq('id', loteId)
    if (erroUpdate) throw new Error(`Erro ao atualizar lote: ${erroUpdate.message}`)

    return new Response(
      JSON.stringify({ ok: true, divergenciasGeradas: divergencias.length, registrosInsuficientes: quantidadeInsuficientes }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: (e as Error).message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
})
