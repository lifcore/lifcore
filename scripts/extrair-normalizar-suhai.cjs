/**
 * ETAPA 3 — Extração + Normalização (DOC-COM-001.1)
 * PRIMEIRO TIJOLO: só Suhai. Não tenta resolver os outros 6 formatos.
 *
 * Testado contra o PDF real da Suhai antes de entregar: 43 eventos
 * extraídos, soma da comissão bate exatamente com o TOTAL do
 * documento (R$ 1.340,02).
 *
 * IMPORTANTE — achado técnico: pdf-parse extrai o texto com 1 valor
 * por linha (célula por célula), não em colunas alinhadas na mesma
 * linha como o pdftotext -layout usado na análise anterior. O parser
 * abaixo foi desenhado e testado em cima do formato real do pdf-parse,
 * não do formato usado só pra leitura humana antes.
 *
 * O que este script faz:
 *   1. Baixa o arquivo do lote (bucket 'anexos', já enviado pela UI)
 *   2. Extrai o texto do PDF
 *   3. Identifica a origem pelo CONTEÚDO (token "EMPRESA" seguido do
 *      nome) — nunca pelo nome do arquivo
 *   4. Lê cada bloco de 12 tokens como 1 linha de dado (apólice,
 *      parcela, recibo, comissão — inclusive negativa)
 *   5. Normaliza e grava em eventos_financeiros_normalizados
 *   6. Marca o lote como 'aguardando_confirmacao' — pronto pra prévia
 *      do Gestor. NÃO cria recebimento real. NÃO faz confronto.
 *
 * Rodar: node scripts/extrair-normalizar-suhai.js <lote_importacao_id>
 * Precisa de SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY como variável de
 * ambiente, e de `pdf-parse` instalado (`npm install pdf-parse@1.1.1`
 * — fixado na v1 porque a v2 mudou completamente a API).
 */

const { createClient } = require('@supabase/supabase-js')
const pdfParse = require('pdf-parse')

const SUPABASE_URL = process.env.SUPABASE_URL
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const BUCKET = 'anexos'
const loteId = process.argv[2]

function paraNumero(texto) {
  return Number(texto.replace(/\./g, '').replace(',', '.'))
}

function paraDataISO(dataBR) {
  const [d, m, a] = dataBR.split('/')
  return `${a}-${m}-${d}`
}

function identificarSeguradoraNoTexto(linhas) {
  const idx = linhas.findIndex((l) => l.toUpperCase() === 'EMPRESA')
  return idx >= 0 && linhas[idx + 1] ? linhas[idx + 1].trim() : null
}

function identificarPeriodo(linhas) {
  const idx = linhas.findIndex((l) => l.toUpperCase().startsWith('PER'))
  if (idx < 0 || !linhas[idx + 1]) return { periodoInicio: null, periodoFim: null }
  const m = linhas[idx + 1].match(/(\d{2}\/\d{2}\/\d{4})\s+A\s+(\d{2}\/\d{2}\/\d{4})/)
  if (!m) return { periodoInicio: null, periodoFim: null }
  return { periodoInicio: paraDataISO(m[1]), periodoFim: paraDataISO(m[2]) }
}

function parsearLinhasSuhai(linhas) {
  const eventos = []
  for (let i = 0; i < linhas.length; i++) {
    if (!linhas[i].startsWith('LIFITSEG')) continue
    const bloco = linhas.slice(i, i + 12)
    if (bloco.length < 12) {
      console.warn(`Bloco incompleto no índice ${i} — ignorando, não inventando valor.`)
      continue
    }
    const [, recibo, , apolice, endosso, parcela, data, tipo, , , , comissao] = bloco
    eventos.push({
      linha_original_ref: String(i),
      numero_apolice_informado: apolice,
      numero_recibo_informado: recibo,
      numero_endosso_informado: endosso,
      numero_parcela_informado: parcela,
      segurado_informado: null,
      data_evento: paraDataISO(data),
      valor_bruto: paraNumero(comissao),
      valor_inss: 0,
      valor_irrf: 0,
      valor_iss: 0,
      valor_outros_descontos: 0,
      tipo_comissao_informado: tipo,
    })
    i += 11
  }
  return eventos
}

function classificar(valorBruto) {
  if (valorBruto > 0) return 'recebimento'
  if (valorBruto < 0) return 'ajuste_estorno'
  return 'zero_sem_recebimento'
}

async function main() {
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    console.error('Defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY como variável de ambiente antes de rodar.')
    process.exitCode = 1
    return
  }
  if (!loteId) {
    console.error('Uso: node scripts/extrair-normalizar-suhai.js <lote_importacao_id>')
    process.exitCode = 1
    return
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { db: { schema: 'operacional' } })

  console.log(`Processando lote ${loteId}...`)

  const { data: lote, error: erroLote } = await supabase.from('lotes_importacao').select('*').eq('id', loteId).single()
  if (erroLote) throw new Error(`Erro ao buscar lote: ${erroLote.message}`)
  if (lote.status !== 'recebido') {
    throw new Error(`Lote está com status "${lote.status}", esperado "recebido". Já foi processado?`)
  }

  console.log(`Arquivo: ${lote.nome_arquivo_original} (${lote.storage_path})`)
  const { data: arquivoBlob, error: erroDownload } = await supabase.storage.from(BUCKET).download(lote.storage_path)
  if (erroDownload) throw new Error(`Erro ao baixar arquivo do Storage: ${erroDownload.message}`)

  const buffer = Buffer.from(await arquivoBlob.arrayBuffer())
  const pdf = await pdfParse(buffer)
  const linhas = pdf.text.split('\n').map((l) => l.trim()).filter((l) => l.length > 0)

  const nomeOrigemDocumento = identificarSeguradoraNoTexto(linhas)
  console.log(`Origem identificada no conteúdo: "${nomeOrigemDocumento}"`)
  if (!nomeOrigemDocumento || !nomeOrigemDocumento.toUpperCase().includes('SUHAI')) {
    throw new Error(
      `Este script só processa extratos da Suhai. Origem encontrada no documento: "${nomeOrigemDocumento}". Parando — não vou tentar adivinhar outro formato.`
    )
  }

  const { data: seguradoras, error: erroSeguradoras } = await supabase
    .schema('institucional')
    .from('operadoras')
    .select('id, nome')
    .ilike('nome', '%suhai%')
  if (erroSeguradoras) throw new Error(`Erro ao buscar seguradora no catálogo: ${erroSeguradoras.message}`)
  if (!seguradoras?.length) {
    throw new Error('Nenhuma operadora com "Suhai" no nome encontrada em institucional.operadoras. Cadastre em Configurações → Seguradoras antes de continuar.')
  }
  const seguradoraId = seguradoras[0].id
  console.log(`Seguradora no catálogo: ${seguradoras[0].nome} (${seguradoraId})`)

  const { periodoInicio, periodoFim } = identificarPeriodo(linhas)
  const competenciaInformada = periodoInicio ? `${periodoInicio.slice(0, 7)}-01` : null
  console.log(`Período: ${periodoInicio} a ${periodoFim} — competência: ${competenciaInformada}`)

  const eventosBrutos = parsearLinhasSuhai(linhas)
  console.log(`${eventosBrutos.length} linhas de dado extraídas.`)

  const eventosParaInserir = eventosBrutos.map((e) => ({
    lote_importacao_id: loteId,
    ...e,
    classificacao: classificar(e.valor_bruto),
  }))

  const { data: eventosInseridos, error: erroEventos } = await supabase
    .from('eventos_financeiros_normalizados')
    .insert(eventosParaInserir)
    .select()
  if (erroEventos) throw new Error(`Erro ao gravar eventos normalizados: ${erroEventos.message}`)

  const valorBrutoTotal = eventosBrutos.reduce((soma, e) => soma + e.valor_bruto, 0)
  const positivos = eventosBrutos.filter((e) => e.valor_bruto > 0).length
  const negativos = eventosBrutos.filter((e) => e.valor_bruto < 0).length
  const zeros = eventosBrutos.filter((e) => e.valor_bruto === 0).length

  const { error: erroUpdateLote } = await supabase
    .from('lotes_importacao')
    .update({
      seguradora_id: seguradoraId,
      competencia_informada: competenciaInformada,
      periodo_inicio: periodoInicio,
      periodo_fim: periodoFim,
      status: 'aguardando_confirmacao',
      quantidade_linhas_extraidas: eventosBrutos.length,
      valor_bruto_total_extraido: Number(valorBrutoTotal.toFixed(2)),
      valor_liquido_total_extraido: Number(valorBrutoTotal.toFixed(2)),
    })
    .eq('id', loteId)
  if (erroUpdateLote) throw new Error(`Erro ao atualizar status do lote: ${erroUpdateLote.message}`)

  console.log('\n=== RESUMO ===')
  console.log(`Eventos gravados: ${eventosInseridos.length}`)
  console.log(`  Positivos (recebimento): ${positivos}`)
  console.log(`  Negativos (ajuste_estorno): ${negativos}`)
  console.log(`  Zero: ${zeros}`)
  console.log(`Total bruto: R$ ${valorBrutoTotal.toFixed(2)}`)
  console.log(`Lote ${loteId} → status: aguardando_confirmacao`)
  console.log('\nNenhum recebimento real foi criado. Confira a prévia na aba Financeiro → Recebimentos.')
}

main().catch((e) => {
  console.error('ERRO:', e.message)
  process.exitCode = 1
})
