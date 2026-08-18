/**
 * CONNECT CENTER (Edge Function) — Validação cruzada por segunda IA.
 * Roda por BLOCO, não no documento inteiro — evita reintroduzir o mesmo
 * desperdício de reler o documento completo que o resto desta arquitetura
 * corrigiu. Sempre usa o provedor secundário FIXO (OpenAI, conforme
 * diretriz do Chief seção 11 — Anthropic primário, OpenAI secundário),
 * independente de qual estiver ativo em IA_PROVIDER para a extração.
 *
 * Best-effort de propósito: quem chama isso (processar-catalogo-mercado/
 * index.ts) já trata falha aqui como não-bloqueante.
 */

import { validarConsistenciaComIA } from './ia-providers/index.ts'

const PROVIDER_SECUNDARIO = 'openai'

export async function validarBlocoComSegundaIA(textoBloco: string, resumoGravado: Record<string, unknown>): Promise<unknown> {
  return validarConsistenciaComIA(PROVIDER_SECUNDARIO, textoBloco, JSON.stringify(resumoGravado))
}
