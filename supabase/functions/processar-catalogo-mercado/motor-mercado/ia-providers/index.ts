/**
 * CONNECT CENTER (Edge Function) — Registro e seleção de provider de IA.
 * Mesmo padrão do Motor de Estudo de Mercado (`IA_PROVIDER` no
 * ambiente). Adicionar provider novo = arquivo novo aqui registrado,
 * nenhum outro módulo precisa mudar.
 *
 * v2 (18/08): adiciona validarConsistencia (usado pela validação cruzada
 * por segunda IA) e obterProviderPorNome/validarConsistenciaComIA, que
 * permitem pedir um provedor ESPECÍFICO por nome — diferente de
 * obterProviderAtivo(), que só devolve o que estiver configurado em
 * IA_PROVIDER. Necessário porque a validação cruzada sempre usa o
 * provedor secundário fixo (OpenAI, conforme diretriz), independente de
 * qual estiver ativo pra extração.
 *
 * v3 (18/08, correção de arquitetura): as 4 funções de extração agora
 * aceitam um `nomeProviderForcado` opcional — necessário pro failover por
 * bloco (diretriz do Chief §7): se o provedor ativo falhar num bloco, o
 * orquestrador tenta o secundário só naquele bloco, sem depender de trocar
 * IA_PROVIDER globalmente.
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
  validarConsistencia: (textoOriginal: string, resumoGravado: string) => Promise<unknown>
}

const PROVIDERS: Record<string, ProviderIA> = { anthropic, openai, gemini }

function nomeProviderAtivo(): string {
  return Deno.env.get('IA_PROVIDER') || 'anthropic'
}

function obterProviderAtivo(): ProviderIA {
  const nomeProvider = nomeProviderAtivo()
  const provider = PROVIDERS[nomeProvider]
  if (!provider) {
    throw new Error(`Provider de IA "${nomeProvider}" não registrado. Disponíveis: ${Object.keys(PROVIDERS).join(', ')}.`)
  }
  return provider
}

export function obterProviderPorNome(nome: string): ProviderIA {
  const provider = PROVIDERS[nome]
  if (!provider) {
    throw new Error(`Provider de IA "${nome}" não registrado. Disponíveis: ${Object.keys(PROVIDERS).join(', ')}.`)
  }
  return provider
}

/** Par fixo de failover: Anthropic é o padrão primário/OpenAI secundário (diretriz do Chief §11). Se o ativo já for outro, cai pra Anthropic como alternativa. */
export function obterNomeProviderFailover(nomeProviderQueFalhou: string): string {
  return nomeProviderQueFalhou === 'anthropic' ? 'openai' : 'anthropic'
}

function resolverProvider(nomeProviderForcado?: string): ProviderIA {
  return nomeProviderForcado ? obterProviderPorNome(nomeProviderForcado) : obterProviderAtivo()
}

export async function interpretarPlanosComIA(texto: string, operadoraNome: string, nomeProviderForcado?: string) {
  const provider = resolverProvider(nomeProviderForcado)
  const resultado = await provider.interpretarPlanos(texto, operadoraNome)
  validarSaidaPlanos(resultado, provider.nome)
  return { ...(resultado as Record<string, unknown>), providerUsado: provider.nome }
}

export async function interpretarPrecosComIA(texto: string, planosConhecidos: string[], nomeProviderForcado?: string) {
  const provider = resolverProvider(nomeProviderForcado)
  const resultado = await provider.interpretarPrecos(texto, planosConhecidos)
  validarSaidaPrecos(resultado, provider.nome)
  return { ...(resultado as Record<string, unknown>), providerUsado: provider.nome }
}

export async function interpretarRegraMercadoComIA(texto: string, dominio: string, planosConhecidos: string[], nomeProviderForcado?: string) {
  const provider = resolverProvider(nomeProviderForcado)
  const resultado = await provider.interpretarRegraMercado(texto, dominio, planosConhecidos)
  validarSaidaRegraMercado(resultado, provider.nome)
  return { ...(resultado as Record<string, unknown>), providerUsado: provider.nome }
}

export async function interpretarRedeComIA(texto: string, planosConhecidos: string[], nomeProviderForcado?: string) {
  const provider = resolverProvider(nomeProviderForcado)
  const resultado = await provider.interpretarRede(texto, planosConhecidos)
  validarSaidaRede(resultado, provider.nome)
  return { ...(resultado as Record<string, unknown>), providerUsado: provider.nome }
}

// Não passa pelo validarSaida* (contrato de extração) — validação cruzada
// tem formato de saída próprio, não é um dos 4 domínios de extração.
export async function validarConsistenciaComIA(nomeProvider: string, textoOriginal: string, resumoGravado: string) {
  const provider = obterProviderPorNome(nomeProvider)
  return provider.validarConsistencia(textoOriginal, resumoGravado)
}
