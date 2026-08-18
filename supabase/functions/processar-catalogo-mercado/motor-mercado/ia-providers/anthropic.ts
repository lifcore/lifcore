/**
 * CONNECT CENTER (Edge Function) — Provider Anthropic.
 * Único arquivo que sabe que "Anthropic" existe.
 *
 * SYSTEM_PROMPT_PRECOS carrega a correção arquitetural de 17/08: preço
 * nunca é extraído isolado — a IA é instruída a sempre tentar capturar
 * as dimensões comerciais (região, segmento, faixa de vidas, tipo de
 * contratação, faixa etária) junto de cada valor, e a devolver o valor
 * mesmo quando alguma dimensão não for encontrada (a decisão de
 * "insuficiente" é feita depois, em código — nunca pela IA).
 */

const MODELO = 'claude-sonnet-5'

function limparEExtrairJSON(textoResposta: string, contexto: string) {
  const textoLimpo = textoResposta.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim()
  try {
    return JSON.parse(textoLimpo)
  } catch (e) {
    const mensagemErro = (e as Error).message
    const posicaoEncontrada = mensagemErro.match(/position (\d+)/)
    let trecho = ''
    if (posicaoEncontrada) {
      const posicao = parseInt(posicaoEncontrada[1], 10)
      const inicio = Math.max(0, posicao - 150)
      const fim = Math.min(textoLimpo.length, posicao + 150)
      trecho = ` Trecho ao redor do erro: ...${textoLimpo.slice(inicio, fim)}...`
    }
    console.error(`[${contexto}] JSON inválido. ${mensagemErro}.${trecho} Tamanho total: ${textoLimpo.length} chars.`)
    throw new Error(`IA não devolveu JSON válido (${contexto}): ${mensagemErro}.${trecho}`)
  }
}

async function chamarAnthropic(systemPrompt: string, mensagemUsuario: string, contexto: string) {
  const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY')
  if (!ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY não configurada.')

  const resposta = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model: MODELO,
      max_tokens: 32000,
      thinking: { type: 'disabled' },
      system: systemPrompt,
      messages: [{ role: 'user', content: mensagemUsuario }],
    }),
  })
  if (!resposta.ok) throw new Error(`Erro na API Anthropic (${contexto}): ${resposta.status} ${await resposta.text()}`)

  const dados = await resposta.json()
  const texto = dados.content?.find((b: { type: string }) => b.type === 'text')?.text
  if (!texto) {
    const tiposBlocos = Array.isArray(dados.content) ? dados.content.map((b: { type: string }) => b.type).join(', ') : 'content ausente'
    const detalhe = `stop_reason=${dados.stop_reason ?? 'desconhecido'}, blocos=[${tiposBlocos || 'nenhum'}]`
    console.error(`[${contexto}] Resposta da IA sem bloco de texto. ${detalhe}. Corpo completo: ${JSON.stringify(dados)}`)
    throw new Error(`Resposta da IA sem texto (${contexto}). ${detalhe}`)
  }
  return limparEExtrairJSON(texto, contexto)
}

const REGRAS_ABSOLUTAS = `
REGRAS ABSOLUTAS, SEM EXCEÇÃO:
- NUNCA invente valor, nome, código ou regra que não esteja literalmente no texto.
- Campo não encontrado = null. Nunca aproximar, nunca deduzir.
- Planos com nomes parecidos podem ser produtos DIFERENTES (ex: "Bronze SP" e "Bronze SP Mais") — nunca junte, nunca assuma equivalência por semelhança de texto.`

async function interpretarPlanos(texto: string, operadoraNome: string) {
  const prompt = `Você está extraindo o catálogo de planos/variantes comerciais da operadora "${operadoraNome}", a partir de material de mercado (tabela, site ou documento).
${REGRAS_ABSOLUTAS}

Devolva APENAS JSON:
{"planos": [{"nome_plano": string, "variante": string|null, "chave_externa": string|null, "modalidade": string|null, "acomodacao": string|null, "abrangencia": string|null, "segmentacao": string|null, "tipo_contratacao": string|null, "elegibilidade": string|null}]}`
  return chamarAnthropic(prompt, `Material a interpretar:\n\n${texto}`, 'Planos/Variantes')
}

async function interpretarPrecos(texto: string, planosConhecidos: string[]) {
  const prompt = `Você está extraindo regras de precificação de material comercial de uma operadora de saúde.

REGRA ARQUITETURAL CRÍTICA: preço NUNCA existe isolado — é sempre consequência de uma regra comercial (região, tipo de contratação, segmento como MEI/ME/PME, faixa de quantidade de vidas, faixa etária). Para cada valor encontrado, tente capturar o MÁXIMO de dimensões que o texto permitir. Se uma dimensão não for identificável, devolva null nela — mas ainda assim devolva o valor e as dimensões que você conseguiu capturar. Não descarte um preço só porque uma dimensão está ausente; a decisão de suficiência é feita depois, fora da sua resposta.
${REGRAS_ABSOLUTAS}

Planos conhecidos desta operadora (associe cada regra a um destes quando possível, usando o texto exato): ${planosConhecidos.join(', ') || '(nenhum ainda — inclua o nome do plano em "plano_texto" para associação posterior)'}

Devolva APENAS JSON:
{"regras": [{"plano_texto": string, "regiao": string|null, "tipo_contratacao": string|null, "segmento": string|null, "faixa_vidas_min": number|null, "faixa_vidas_max": number|null, "faixa_etaria": string|null, "valor": number|null, "vigencia_inicio": string|null}]}`
  return chamarAnthropic(prompt, `Material a interpretar:\n\n${texto}`, 'Regras de Precificação')
}

async function interpretarRegraMercado(texto: string, dominio: string, planosConhecidos: string[]) {
  const rotuloDominio: Record<string, string> = {
    carencia: 'carências (prazos de carência por procedimento/situação)',
    coparticipacao: 'coparticipação (percentuais e limites por procedimento)',
    reembolso: 'reembolso (valores de referência por procedimento)',
    regra_comercial: 'regras comerciais (composição, elegibilidade, tipo de contratação)',
  }
  const prompt = `Você está extraindo regras de ${rotuloDominio[dominio] ?? dominio} de material comercial de uma operadora de saúde.
${REGRAS_ABSOLUTAS}

Planos conhecidos: ${planosConhecidos.join(', ') || '(associe pelo texto exato em "plano_texto")'}

Devolva APENAS JSON:
{"regras": [{"plano_texto": string|null, "chave": string, "conteudo": object, "vigencia_inicio": string|null}]}
Onde "chave" identifica a regra dentro do domínio (ex: "internacao_clinica", "consulta_eletiva") e "conteudo" é um objeto livre com os campos relevantes encontrados no texto (nunca invente campos não presentes).`
  return chamarAnthropic(prompt, `Material a interpretar:\n\n${texto}`, `Regra de mercado (${dominio})`)
}

async function interpretarRede(texto: string, planosConhecidos: string[]) {
  const prompt = `Você está extraindo um trecho da tabela de Rede Credenciada — prestador (hospital/laboratório/clínica) x plano x código de atendimento.
${REGRAS_ABSOLUTAS}
- NUNCA interprete o significado dos códigos (H, PS, LAB etc.) — devolva "codigo_bruto" exatamente como está.

Planos conhecidos (use exatamente um destes em "plano_texto"): ${planosConhecidos.join(', ')}

Devolva APENAS JSON:
{"linhas": [{"prestador": string, "municipio": string|null, "regiao": string|null, "tipo": "hospital"|"laboratorio"|"clinica", "plano_texto": string, "codigo_bruto": string|null}]}`
  return chamarAnthropic(prompt, `Trecho a interpretar:\n\n${texto}`, 'Rede Credenciada')
}

export default { nome: 'anthropic', interpretarPlanos, interpretarPrecos, interpretarRegraMercado, interpretarRede }
