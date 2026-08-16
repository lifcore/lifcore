/**
 * AI PROVIDER LAYER — Provider: Anthropic
 *
 * Único arquivo do sistema que sabe que "Anthropic" existe. Se amanhã
 * trocarmos, removermos ou adicionarmos outro provedor, nada fora
 * desta pasta muda.
 */

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY
const MODELO = 'claude-sonnet-5'

const SYSTEM_PROMPT = `Você está ajudando a extrair dados de um relatório de comissões de seguradora, para um sistema financeiro real.

REGRAS ABSOLUTAS, SEM EXCECAO:
- NUNCA invente um valor, apólice, data ou campo que não esteja literalmente presente no texto.
- Se um campo não existir no documento para uma linha, use null — nunca aproxime, nunca deduza.
- NUNCA distribua um valor agregado entre apólices que o documento não vincula explicitamente.
- Preserve valores negativos exatamente como estão (são estornos/ajustes, não erros).
- Preserve valores zero.
- Se o documento tiver um total declarado, inclua-o em total_informado_documento.

Devolva APENAS um JSON válido, sem texto antes ou depois, no formato:
{
  "seguradora_identificada": "nome exatamente como aparece no documento, ou null",
  "tipo_estrutura": "detalhado_com_apolice" ou "agregado_sem_apolice",
  "periodo_inicio": "YYYY-MM-DD ou null",
  "periodo_fim": "YYYY-MM-DD ou null",
  "total_informado_documento": number ou null,
  "eventos": [
    {
      "numero_apolice_informado": string ou null,
      "numero_recibo_informado": string ou null,
      "numero_endosso_informado": string ou null,
      "numero_parcela_informado": string ou null,
      "segurado_informado": string ou null,
      "data_evento": "YYYY-MM-DD ou null",
      "valor_bruto": number,
      "valor_inss": number,
      "valor_irrf": number,
      "valor_iss": number,
      "valor_outros_descontos": number,
      "tipo_comissao_informado": string ou null
    }
  ],
  "receita_extracao": {
    "descricao": "explicação curta e literal de como os campos foram identificados neste documento"
  }
}`

async function interpretar(textoDocumento) {
  if (!ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY não configurada — provider Anthropic não pode rodar sem ela.')
  }

  const resposta = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: MODELO,
      max_tokens: 8000,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: `Documento a interpretar:\n\n${textoDocumento}` }],
    }),
  })

  if (!resposta.ok) {
    const corpo = await resposta.text()
    throw new Error(`Erro na chamada à API da Anthropic: ${resposta.status} ${corpo}`)
  }

  const dados = await resposta.json()
  const textoResposta = dados.content?.find((b) => b.type === 'text')?.text
  if (!textoResposta) throw new Error('Resposta da IA sem conteúdo de texto.')

  // Alguns modelos envolvem o JSON em ```json ... ``` mesmo quando
  // instruídos a não fazer isso — remove essa marcação antes de
  // tentar interpretar, sem tentar "consertar" o conteúdo em si.
  const textoLimpo = textoResposta
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim()

  let json
  try {
    json = JSON.parse(textoLimpo)
  } catch (e) {
    throw new Error(`IA não devolveu JSON válido — não vou tentar interpretar por aproximação: ${e.message}`)
  }

  return {
    seguradora_identificada: json.seguradora_identificada ?? null,
    tipo_estrutura: json.tipo_estrutura ?? null,
    periodo_inicio: json.periodo_inicio ?? null,
    periodo_fim: json.periodo_fim ?? null,
    total_informado_documento: json.total_informado_documento ?? null,
    eventos: (json.eventos || []).map((e) => ({ ...e, valor_bruto: Number(e.valor_bruto) })),
    receita_extracao: json.receita_extracao ?? null,
  }
}

module.exports = { nome: 'anthropic', interpretar }
