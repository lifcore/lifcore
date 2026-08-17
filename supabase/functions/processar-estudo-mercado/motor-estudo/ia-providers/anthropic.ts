/**
 * MOTOR DE ESTUDO DE MERCADO (Edge Function) — Provider Anthropic
 * Mesmo padrão de processar-lote/motor-universal/ia-providers/anthropic.ts.
 * Único arquivo que sabe que "Anthropic" existe — o resto do motor só
 * conhece o contrato genérico (nome, interpretarPropostas,
 * interpretarRedeChunk).
 */

const MODELO = 'claude-sonnet-5'

const SYSTEM_PROMPT_PROPOSTAS = `Você está ajudando a extrair a tabela comparativa de planos de saúde/odonto de uma cotação (documento tipo "Multicálculo"), para um estudo de mercado real entregue a um cliente.

REGRAS ABSOLUTAS, SEM EXCEÇÃO:
- NUNCA invente valor, plano, operadora ou atributo que não esteja literalmente presente no texto.
- Se um campo não existir no documento para uma coluna, use null — nunca aproxime, nunca deduza.
- Cada coluna da tabela comparativa é um plano distinto. Planos com nomes parecidos da MESMA operadora (ex: "Bronze SP" e "Bronze SP Mais") são planos DIFERENTES — nunca junte, nunca assuma que são o mesmo.
- "coluna_chave" deve identificar a coluna de forma inequívoca, concatenando operadora + plano + variante (acomodação/modalidade) exatamente como aparecem no documento, separados por "|". Ex: "Amil|Prata|Apartamento".
- Preserve os valores de faixa etária exatamente como aparecem no documento (ex: "00 a 18"), sem normalizar para outro formato.
- Se o documento tiver um número de página visível ou inferível, inclua em pagina_origem; senão, null.

Devolva APENAS um JSON válido, sem texto antes ou depois, no formato:
{
  "propostas": [
    {
      "coluna_chave": "Operadora|Plano|Variante",
      "operadora_nome_extraido": "nome exatamente como aparece",
      "plano": "nome do plano exatamente como aparece",
      "modalidade": string ou null,
      "acomodacao": string ou null,
      "abrangencia": string ou null,
      "coparticipacao": string ou null,
      "reembolso": string ou null,
      "valor_total_mensal": number ou null,
      "faixas": [ { "faixa_etaria": "texto exatamente como no documento", "valor": number ou null } ],
      "pagina_origem": number ou null,
      "evidencia_origem": "trecho curto e literal do documento que comprova esta leitura"
    }
  ]
}`

const SYSTEM_PROMPT_REDE = `Você está ajudando a extrair um trecho (chunk) da tabela de Rede Credenciada de uma cotação de plano de saúde — prestador (hospital/laboratório/clínica) x plano x código de atendimento.

REGRAS ABSOLUTAS, SEM EXCEÇÃO:
- NUNCA interprete o significado dos códigos/siglas (H, PS, LAB, etc.) — devolva "codigo_bruto" exatamente como está no documento, sem traduzir.
- NUNCA invente prestador, região ou código que não esteja literalmente presente no texto.
- Use "coluna_chave" para identificar a qual plano cada código pertence — você recebe a lista de colunas já conhecidas desta cotação (mesma identidade usada na tabela comparativa); use exatamente uma dessas chaves, nunca invente uma nova.
- Se uma célula estiver vazia ou for "-", não gere linha para ela.
- "regiao" é o cabeçalho de região/cidade sob o qual o prestador está listado no documento, quando houver.

Colunas conhecidas desta cotação (use exatamente estas chaves em "coluna_chave"):
{{COLUNAS_CONHECIDAS}}

Devolva APENAS um JSON válido, sem texto antes ou depois, no formato:
{
  "linhas": [
    {
      "prestador": "nome exatamente como aparece",
      "regiao": string ou null,
      "tipo": "hospital" ou "laboratorio" ou "clinica",
      "coluna_chave": "uma das colunas conhecidas, exatamente",
      "codigo_bruto": "sigla exatamente como está, ex: H¹,M,PS¹",
      "pagina_origem": number ou null
    }
  ]
}`

function extrairJSON(textoResposta: string, contexto: string) {
  const textoLimpo = textoResposta
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim()
  try {
    return JSON.parse(textoLimpo)
  } catch (e) {
    throw new Error(`IA não devolveu JSON válido (${contexto}) — não vou tentar interpretar por aproximação: ${(e as Error).message}`)
  }
}

async function chamarAnthropic(systemPrompt: string, mensagemUsuario: string, contexto: string) {
  const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY')
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
      system: systemPrompt,
      messages: [{ role: 'user', content: mensagemUsuario }],
    }),
  })

  if (!resposta.ok) {
    const corpo = await resposta.text()
    throw new Error(`Erro na chamada à API da Anthropic (${contexto}): ${resposta.status} ${corpo}`)
  }

  const dados = await resposta.json()
  const textoResposta = dados.content?.find((b: { type: string }) => b.type === 'text')?.text
  if (!textoResposta) throw new Error(`Resposta da IA sem conteúdo de texto (${contexto}).`)

  return extrairJSON(textoResposta, contexto)
}

async function interpretarPropostas(textoDocumento: string) {
  const json = await chamarAnthropic(
    SYSTEM_PROMPT_PROPOSTAS,
    `Documento a interpretar (tabela comparativa de planos):\n\n${textoDocumento}`,
    'Passada 1 — Propostas'
  )

  return {
    propostas: (json.propostas || []).map((p: Record<string, unknown>) => ({
      ...p,
      valor_total_mensal: p.valor_total_mensal != null ? Number(p.valor_total_mensal) : null,
      faixas: Array.isArray(p.faixas)
        ? (p.faixas as Record<string, unknown>[]).map((f) => ({
            ...f,
            valor: f.valor != null ? Number(f.valor) : null,
          }))
        : [],
    })),
  }
}

async function interpretarRedeChunk(textoChunk: string, colunasConhecidas: string[]) {
  const promptComColunas = SYSTEM_PROMPT_REDE.replace(
    '{{COLUNAS_CONHECIDAS}}',
    colunasConhecidas.map((c) => `- ${c}`).join('\n')
  )
  const json = await chamarAnthropic(
    promptComColunas,
    `Trecho da Rede Credenciada a interpretar:\n\n${textoChunk}`,
    'Passada 2 — Rede Credenciada'
  )

  return {
    linhas: (json.linhas || []) as unknown[],
  }
}

export default { nome: 'anthropic', interpretarPropostas, interpretarRedeChunk }
