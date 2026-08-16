/**
 * MOTOR UNIVERSAL (Edge Function) — Registro e seleção de provider
 * Porte de scripts/motor-universal/ia-providers/index.cjs.
 */

import { validarSaidaProvider } from './contrato.ts'
import anthropic from './anthropic.ts'

const PROVIDERS: Record<string, { nome: string; interpretar: (texto: string) => Promise<unknown> }> = {
  anthropic,
}

function obterProviderAtivo() {
  const nomeProvider = Deno.env.get('IA_PROVIDER') || 'anthropic'
  const provider = PROVIDERS[nomeProvider]
  if (!provider) {
    throw new Error(`Provider de IA "${nomeProvider}" não está registrado. Providers disponíveis: ${Object.keys(PROVIDERS).join(', ')}.`)
  }
  return provider
}

export async function interpretar(textoDocumento: string) {
  const provider = obterProviderAtivo()
  const resultado = await provider.interpretar(textoDocumento)
  validarSaidaProvider(resultado as { eventos?: unknown }, provider.nome)
  return { ...(resultado as Record<string, unknown>), providerUsado: provider.nome }
}
