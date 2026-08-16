/**
 * AI PROVIDER LAYER — Registro e seleção de provider
 *
 * Ponto único de decisão sobre qual provedor está ativo. O resto do
 * Motor Universal chama SÓ este módulo — nunca importa
 * './anthropic.cjs' nem qualquer provider específico diretamente.
 *
 * Troca de provider = mudar a variável de ambiente IA_PROVIDER.
 * Nenhum código fora desta pasta precisa mudar.
 */

const { validarSaidaProvider } = require('./contrato.cjs')
const anthropic = require('./anthropic.cjs')

// Registrados conforme forem implementados — ainda não existe OpenAI
// nem Gemini, adicionar aqui quando existir (Passo 5 da diretriz atual).
const PROVIDERS = {
  anthropic,
}

function obterProviderAtivo() {
  const nomeProvider = process.env.IA_PROVIDER || 'anthropic'
  const provider = PROVIDERS[nomeProvider]
  if (!provider) {
    throw new Error(`Provider de IA "${nomeProvider}" não está registrado. Providers disponíveis: ${Object.keys(PROVIDERS).join(', ')}.`)
  }
  return provider
}

/**
 * Único ponto de entrada que o resto do motor usa. Sempre valida a
 * saída contra o contrato antes de devolver — protege o pipeline de
 * qualquer provider (atual ou futuro) que devolva algo fora do
 * formato esperado.
 */
async function interpretar(textoDocumento) {
  const provider = obterProviderAtivo()
  const resultado = await provider.interpretar(textoDocumento)
  validarSaidaProvider(resultado, provider.nome)
  return { ...resultado, providerUsado: provider.nome }
}

module.exports = { interpretar, obterProviderAtivo }
