/**
 * MOTOR UNIVERSAL — Extração adaptativa (DOC-COM-002, Passo 5 / Seções 8 e 9)
 *
 * NAO TESTADO CONTRA API REAL nesta entrega — escrito e revisado, mas
 * sem chave de API disponível neste ambiente pra rodar de verdade.
 * Por sequenciamento da própria diretriz (Passo 10 só depois do Passo
 * 9 homologado), este módulo só é necessário quando formatos além da
 * Suhai entrarem em teste — não bloqueia a homologação da Suhai, que
 * usa a estratégia de código (Passo 1).
 *
 * Princípio (Seção 9): a IA nunca declara fato financeiro. Ela só
 * propõe uma interpretação — que passa pelas mesmas validações
 * determinísticas de qualquer outra extração, e só vira conhecimento
 * reutilizável depois que o Gestor confirmar na prévia.
 *
 * A IA roda UMA VEZ por formato novo, não uma vez por documento. O
 * que ela devolve inclui uma "receita de extração" — depois de
 * homologada, os próximos documentos daquele formato são processados
 * pela receita (determinístico), sem chamar IA de novo.
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

async function chamarClaude(textoDocumento) {
  if (!ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY não configurada — extração adaptativa não pode rodar sem ela.')
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

  let json
  try {
    json = JSON.parse(textoResposta)
  } catch (e) {
    throw new Error(`IA não devolveu JSON válido — não vou tentar interpretar por aproximação: ${e.message}`)
  }
  return json
}

async function extrair(textoDocumento) {
  const resultado = await chamarClaude(textoDocumento)

  const eventos = (resultado.eventos || []).map((e) => ({
    ...e,
    valor_bruto: Number(e.valor_bruto),
  }))

  return {
    nomeOrigemDocumento: resultado.seguradora_identificada ?? null,
    periodoInicio: resultado.periodo_inicio ?? null,
    periodoFim: resultado.periodo_fim ?? null,
    eventos,
    totalInformadoDocumento: resultado.total_informado_documento ?? null,
    tipoEstrutura: resultado.tipo_estrutura ?? null,
    receitaExtracao: resultado.receita_extracao ?? null,
  }
}

module.exports = { extrair }
