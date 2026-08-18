/**
 * CONNECT CENTER (Edge Function) — Provider OpenAI.
 * Mesmo contrato de anthropic.ts — só troca a mecânica de chamada de API.
 * Prompts mantidos IDÊNTICOS de propósito: evita deriva de comportamento
 * entre provedores diferentes escolhendo o mesmo domínio de extração.
 */

const MODELO = 'gpt-5.6' // alias do GPT-5.6 Sol (flagship, GA jul/2026). Variantes mais baratas: gpt-5.6-terra, gpt-5.6-luna.

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

async function chamarOpenAI(systemPrompt: string, mensagemUsuario: string, contexto: string, tentativa = 1): Promise<unknown> {
  const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY')
  if (!OPENAI_API_KEY) throw new Error('OPENAI_API_KEY não configurada.')

  const MAX_TENTATIVAS = 3

  const resposta = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${OPENAI_API_KEY}` },
    body: JSON.stringify({
      model: MODELO,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: mensagemUsuario },
      ],
    }),
  })

  if (!resposta.ok) {
    const corpoErro = await resposta.text()
    // 5xx = problema do lado do servidor/infra — vale tentar de novo automaticamente.
    // 4xx = erro do próprio pedido (auth, formato) — repetir não muda o resultado.
    const ehTransitorio = resposta.status >= 500
    if (ehTransitorio && tentativa < MAX_TENTATIVAS) {
      const esperaMs = 2000 * tentativa
      console.error(`[${contexto}] Erro ${resposta.status} da API OpenAI (tentativa ${tentativa}/${MAX_TENTATIVAS}) — tentando de novo em ${esperaMs}ms.`)
      await new Promise((resolve) => setTimeout(resolve, esperaMs))
      return chamarOpenAI(systemPrompt, mensagemUsuario, contexto, tentativa + 1)
    }
    throw new Error(`Erro na API OpenAI (${contexto}): ${resposta.status} ${corpoErro}`)
  }

  const dados = await resposta.json()
  const texto = dados.choices?.[0]?.message?.content
  if (!texto) {
    const finishReason = dados.choices?.[0]?.finish_reason ?? 'desconhecido'
    console.error(`[${contexto}] Resposta da IA sem texto. finish_reason=${finishReason}. Corpo completo: ${JSON.stringify(dados)}`)
    throw new Error(`Resposta da IA sem texto (${contexto}). finish_reason=${finishReason}`)
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
  return chamarOpenAI(prompt, `Material a interpretar:\n\n${texto}`, 'Planos/Variantes')
}

async function interpretarPrecos(texto: string, planosConhecidos: string[]) {
  const prompt = `Você está extraindo regras de precificação de material comercial de uma operadora de saúde.

REGRA ARQUITETURAL CRÍTICA: preço NUNCA existe isolado — é sempre consequência de uma regra comercial (região, tipo de contratação, segmento como MEI/ME/PME, faixa de quantidade de vidas, faixa etária). Para cada valor encontrado, tente capturar o MÁXIMO de dimensões que o texto permitir. Se uma dimensão não for identificável, devolva null nela — mas ainda assim devolva o valor e as dimensões que você conseguiu capturar. Não descarte um preço só porque uma dimensão está ausente; a decisão de suficiência é feita depois, fora da sua resposta.
${REGRAS_ABSOLUTAS}

Planos conhecidos desta operadora (associe cada regra a um destes quando possível, usando o texto exato): ${planosConhecidos.join(', ') || '(nenhum ainda — inclua o nome do plano em "plano_texto" para associação posterior)'}

Devolva APENAS JSON:
{"regras": [{"plano_texto": string, "regiao": string|null, "tipo_contratacao": string|null, "segmento": string|null, "faixa_vidas_min": number|null, "faixa_vidas_max": number|null, "faixa_etaria": string|null, "valor": number|null, "vigencia_inicio": string|null}]}`
  return chamarOpenAI(prompt, `Material a interpretar:\n\n${texto}`, 'Regras de Precificação')
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
  return chamarOpenAI(prompt, `Material a interpretar:\n\n${texto}`, `Regra de mercado (${dominio})`)
}

async function interpretarRede(texto: string, planosConhecidos: string[]) {
  const prompt = `Você está extraindo um trecho da tabela de Rede Credenciada — prestador (hospital/laboratório/clínica) x plano x código de atendimento.
${REGRAS_ABSOLUTAS}
- NUNCA interprete o significado dos códigos (H, PS, LAB etc.) — devolva "codigo_bruto" exatamente como está.

Planos conhecidos (use exatamente um destes em "plano_texto"): ${planosConhecidos.join(', ')}

Devolva APENAS JSON:
{"linhas": [{"prestador": string, "municipio": string|null, "regiao": string|null, "tipo": "hospital"|"laboratorio"|"clinica", "plano_texto": string, "codigo_bruto": string|null}]}`
  return chamarOpenAI(prompt, `Trecho a interpretar:\n\n${texto}`, 'Rede Credenciada')
}

async function validarConsistencia(textoOriginal: string, resumoGravado: string) {
  const prompt = `Você está validando se dados extraídos de um trecho de documento fonte foram gravados corretamente no banco de dados.
${REGRAS_ABSOLUTAS}

Compare o texto original com o resumo do que foi gravado. Aponte SOMENTE discrepâncias reais de conteúdo — valores que deveriam ter sido extraídos e não aparecem no resumo, contagem visivelmente incompatível com o que o texto contém, ou sinal de que algo relevante foi ignorado. Não aponte diferença de formatação ou reorganização.

Devolva APENAS JSON:
{"discrepancias": [{"descricao": string}], "conclusao": "consistente"|"discrepancias_encontradas"}`
  return chamarOpenAI(prompt, `TEXTO ORIGINAL DO BLOCO:\n\n${textoOriginal}\n\n---\n\nRESUMO DO QUE FOI GRAVADO NO BANCO PARA ESSE BLOCO:\n\n${resumoGravado}`, 'Validação Cruzada')
}

export default { nome: 'openai', interpretarPlanos, interpretarPrecos, interpretarRegraMercado, interpretarRede, validarConsistencia }
