/**
 * CAMADA DE IA DESACOPLADA — CoreON
 * ============================================================
 * Objetivo: nenhuma parte do sistema deve chamar um provedor de IA
 * (Anthropic, OpenAI, etc.) diretamente. Tudo passa por aqui.
 *
 * Trocar de provedor no futuro = trocar a variável VITE_AI_PROVIDER
 * no .env e, no máximo, implementar um novo "adapter" abaixo.
 * O resto do sistema (agentes, especialistas) nunca precisa mudar.
 *
 * IMPORTANTE (segurança): em produção, essas chamadas devem ser feitas
 * por um backend/edge function, nunca diretamente do navegador —
 * do contrário a chave de API fica exposta ao usuário final.
 * Nesta fase inicial (desenvolvimento local), simplificamos para
 * validar a integração rapidamente.
 * ============================================================
 */

const PROVIDER = import.meta.env.VITE_AI_PROVIDER || 'anthropic'
const API_KEY = import.meta.env.VITE_AI_API_KEY

/**
 * Formato padrão de entrada, independente do provedor:
 * { systemPrompt, messages: [{ role: 'user' | 'assistant', content: string }] }
 *
 * Formato padrão de saída:
 * { text: string, raw: object }
 */

async function callAnthropic({ systemPrompt, messages, maxTokens = 1000 }) {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: maxTokens,
      system: systemPrompt,
      messages,
    }),
  })

  if (!response.ok) {
    const errorBody = await response.text()
    throw new Error(`Erro na API Anthropic: ${response.status} — ${errorBody}`)
  }

  const data = await response.json()
  const text = data.content
    ?.filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('\n')

  return { text, raw: data }
}

// Espaço reservado para futuros provedores.
// Exemplo de como ficaria adicionar outro provedor:
//
// async function callOpenAI({ systemPrompt, messages, maxTokens }) { ... }

const adapters = {
  anthropic: callAnthropic,
  // openai: callOpenAI,
}

/**
 * Função pública única que o resto do sistema deve usar.
 * Nunca importe um adapter específico diretamente fora deste arquivo.
 */
export async function askAI({ systemPrompt, messages, maxTokens }) {
  const adapter = adapters[PROVIDER]

  if (!adapter) {
    throw new Error(
      `Provedor de IA "${PROVIDER}" não implementado. Verifique VITE_AI_PROVIDER.`
    )
  }

  return adapter({ systemPrompt, messages, maxTokens })
}

export const currentProvider = PROVIDER
