/**
 * CAMADA DE IA DESACOPLADA — Lifcore
 * ============================================================
 * Objetivo: nenhuma parte do sistema deve chamar um provedor de IA
 * (Anthropic, OpenAI, etc.) diretamente. Tudo passa por aqui.
 *
 * Trocar de provedor no futuro = trocar a variável VITE_AI_PROVIDER
 * no .env e, no máximo, implementar um novo "adapter" abaixo.
 * O resto do sistema (agentes, especialistas) nunca precisa mudar.
 *
 * SEGURANÇA (atualizado): a chamada NÃO vai mais direto do navegador
 * pra Anthropic. Ela passa por uma Edge Function do Supabase
 * ("especialista-ia"), que guarda a chave da Anthropic como "secret"
 * no servidor — o navegador nunca vê essa chave.
 * ============================================================
 */
import { supabase } from './supabaseClient'

const PROVIDER = import.meta.env.VITE_AI_PROVIDER || 'anthropic'

/**
 * Formato padrão de entrada, independente do provedor:
 * { systemPrompt, messages: [{ role: 'user' | 'assistant', content: string }] }
 *
 * Formato padrão de saída:
 * { text: string, raw: object }
 */

async function callAnthropic({ systemPrompt, messages, maxTokens = 1000, images = [] }) {
  const { data, error } = await supabase.functions.invoke('especialista-ia', {
    body: { systemPrompt, messages, maxTokens, images },
  })

  if (error) {
    throw new Error(`Erro na chamada da IA (Edge Function): ${error.message}`)
  }
  if (data?.error) {
    throw new Error(`Erro na API Anthropic: ${JSON.stringify(data.error)}`)
  }

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
export async function askAI({ systemPrompt, messages, maxTokens, images }) {
  const adapter = adapters[PROVIDER]

  if (!adapter) {
    throw new Error(
      `Provedor de IA "${PROVIDER}" não implementado. Verifique VITE_AI_PROVIDER.`
    )
  }

  return adapter({ systemPrompt, messages, maxTokens, images })
}

export const currentProvider = PROVIDER
