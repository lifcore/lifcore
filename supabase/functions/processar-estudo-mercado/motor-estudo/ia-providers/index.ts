/**
 * MOTOR DE ESTUDO DE MERCADO (Edge Function) — Registro e seleção de
 * provider de IA. Mesmo padrão do Motor Universal
 * (processar-lote/motor-universal/ia-providers/index.ts): troca de
 * provider é `IA_PROVIDER` no ambiente, nunca precisa mexer no motor.
 *
 * Para adicionar uma nova IA (OpenAI, Gemini, etc.): criar um arquivo
 * novo neste diretório no mesmo formato de anthropic.ts (exportando
 * `{ nome, interpretarPropostas, interpretarRedeChunk }`) e registrar
 * aqui em PROVIDERS. Nenhum outro arquivo do motor precisa saber que o
 * provider novo existe.
 */

import { validarSaidaPropostas, validarSaidaRedeChunk } from './contrato.ts'
import anthropic from './anthropic.ts'

interface ProviderIA {
  nome: string
  interpretarPropostas: (textoDocumento: string) => Promise<unknown>
  interpretarRedeChunk: (textoChunk: string, colunasConhecidas: string[]) => Promise<unknown>
}

const PROVIDERS: Record<string, ProviderIA> = {
  anthropic,
}

function obterProviderAtivo(): ProviderIA {
  const nomeProvider = Deno.env.get('IA_PROVIDER') || 'anthropic'
  const provider = PROVIDERS[nomeProvider]
  if (!provider) {
    throw new Error(`Provider de IA "${nomeProvider}" não está registrado. Providers disponíveis: ${Object.keys(PROVIDERS).join(', ')}.`)
  }
  return provider
}

export async function interpretarPropostasComIA(textoDocumento: string) {
  const provider = obterProviderAtivo()
  const resultado = await provider.interpretarPropostas(textoDocumento)
  validarSaidaPropostas(resultado as { propostas?: unknown }, provider.nome)
  return { ...(resultado as Record<string, unknown>), providerUsado: provider.nome }
}

export async function interpretarRedeChunkComIA(textoChunk: string, colunasConhecidas: string[]) {
  const provider = obterProviderAtivo()
  const resultado = await provider.interpretarRedeChunk(textoChunk, colunasConhecidas)
  validarSaidaRedeChunk(resultado as { linhas?: unknown }, provider.nome)
  return { ...(resultado as Record<string, unknown>), providerUsado: provider.nome }
}
