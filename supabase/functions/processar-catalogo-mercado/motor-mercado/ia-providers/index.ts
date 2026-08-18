/**
 * CONNECT CENTER (Edge Function) — Registro e seleção de provider de IA.
 * Mesmo padrão do Motor de Estudo de Mercado (`IA_PROVIDER` no
 * ambiente). Adicionar provider novo = arquivo novo aqui registrado,
 * nenhum outro módulo precisa mudar.
 */

import { validarSaidaPlanos, validarSaidaPrecos, validarSaidaRegraMercado, validarSaidaRede } from './contrato.ts'
import anthropic from './anthropic.ts'
import openai from './openai.ts'
import gemini from './gemini.ts'

interface ProviderIA {
  nome: string
  interpretarPlanos: (texto: string, operadoraNome: string) => Promise<unknown>
  interpretarPrecos: (texto: string, planosConhecidos: string[]) => Promise<unknown>
  interpretarRegraMercado: (texto: string, dominio: string, planosConhecidos: string[]) => Promise<unknown>
  interpretarRede: (texto: string, planosConhecidos: string[]) => Promise<unknown>
}

const PROVIDERS: Record<string, ProviderIA> = { anthropic, openai, gemini }

function obterProviderAtivo(): ProviderIA {
  const nomeProvider = Deno.env.get('IA_PROVIDER') || 'anthropic'
  const provider = PROVIDERS[nomeProvider]
  if (!provider) {
    throw new Error(`Provider de IA "${nomeProvider}" não registrado. Disponíveis: ${Object.keys(PROVIDERS).join(', ')}.`)
  }
  return provider
}

export async function interpretarPlanosComIA(texto: string, operadoraNome: string) {
  const provider = obterProviderAtivo()
  const resultado = await provider.interpretarPlanos(texto, operadoraNome)
  validarSaidaPlanos(resultado, provider.nome)
  return { ...(resultado as Record<string, unknown>), providerUsado: provider.nome }
}

export async function interpretarPrecosComIA(texto: string, planosConhecidos: string[]) {
  const provider = obterProviderAtivo()
  const resultado = await provider.interpretarPrecos(texto, planosConhecidos)
  validarSaidaPrecos(resultado, provider.nome)
  return { ...(resultado as Record<string, unknown>), providerUsado: provider.nome }
}

export async function interpretarRegraMercadoComIA(texto: string, dominio: string, planosConhecidos: string[]) {
  const provider = obterProviderAtivo()
  const resultado = await provider.interpretarRegraMercado(texto, dominio, planosConhecidos)
  validarSaidaRegraMercado(resultado, provider.nome)
  return { ...(resultado as Record<string, unknown>), providerUsado: provider.nome }
}

export async function interpretarRedeComIA(texto: string, planosConhecidos: string[]) {
  const provider = obterProviderAtivo()
  const resultado = await provider.interpretarRede(texto, planosConhecidos)
  validarSaidaRede(resultado, provider.nome)
  return { ...(resultado as Record<string, unknown>), providerUsado: provider.nome }
}
