// _shared/connect/inbound/contract/inboundAdapter.ts
//
// CONNECT-004C — Inbound Adapter Contract. Mesma filosofia do
// ProviderDriver (CONNECT-004D): uma interface única, um adapter por
// provedor, nenhum "if provider === 'meta'" espalhado pelo código.
//
// Diferença de direção: ProviderDriver é pra SAÍDA (LifCore chama o
// Provider). InboundAdapter é pra ENTRADA (Provider manda evento pro
// LifCore). São dois contratos separados de propósito — a diretriz
// já definiu isso na arquitetura (Connect Center como único ponto,
// mas fluxo de saída e fluxo de entrada não são a mesma coisa).

import type { LeadInputStandard } from './leadInputStandard.ts'

export type StatusPreparacaoAdapter =
  | 'preparado' // adapter existe, nunca testado contra payload real
  | 'aguardando_credenciais' // depende de Secret Management, ainda não resolvido
  | 'configurado'
  | 'testando'
  | 'conectado' // só chega aqui com evidência técnica real — nunca setado por suposição

export type InboundAdapter = {
  /** Slug do provider — deve bater com `providers.slug` no Provider Registry. */
  provider: string

  /**
   * Estado de preparação declarado. NUNCA 'conectado' setado por um
   * Adapter sozinho — essa transição exige teste real, fora do
   * escopo desta Sprint (ver Secret Management, pendência separada).
   */
  status: StatusPreparacaoAdapter

  /**
   * Extrai o identificador de evento externo do payload bruto, se o
   * provedor fornecer um. Retorna null se o provedor não garantir
   * isso — nunca inventa um identificador falso (ver idempotency.ts).
   */
  extrairExternalEventId: (payloadBruto: unknown) => string | null

  /**
   * Traduz o payload bruto do provedor pro Lead Input Standard.
   * Único lugar do sistema que conhece o formato específico daquele
   * provedor — igual ao Driver conhece o formato SOAP/REST da
   * seguradora.
   */
  normalizar: (payloadBruto: unknown) => LeadInputStandard

  /**
   * Verifica se o payload realmente veio do provedor (assinatura,
   * verify token, etc.) — depende de segredo armazenado com
   * segurança. Enquanto o Secret Management não existir (pendência
   * registrada, fora do escopo desta Sprint), retorna sempre
   * `{ verificado: false, motivo: 'secret_management_pendente' }` —
   * nunca finge que verificou.
   */
  verificarOrigem: (payloadBruto: unknown, headers: Record<string, string>) => Promise<{ verificado: boolean; motivo?: string }>
}
