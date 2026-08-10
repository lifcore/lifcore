// _shared/connect/inbound/contract/leadInputStandard.ts
//
// CONNECT-004C — Lead Input Standard. É o modelo interno único que
// qualquer canal de aquisição (Meta, Google, LinkedIn, TikTok,
// Microsoft, futuros) precisa produzir antes de chegar ao Lead
// Management/CRM. Ninguém além do Adapter de cada provedor conhece o
// formato bruto do payload externo — depois do Normalizer, só existe
// este formato.
//
// Regra da diretriz: não obrigar todos os provedores a fornecerem os
// mesmos campos — campos comuns ficam tipados, o resto vai em
// `dadosExternos`, sem forçar shape.

export type UtmParams = {
  source?: string
  medium?: string
  campaign?: string
  content?: string
  term?: string
}

export type LeadInputStandard = {
  // De onde veio — sempre presente, é o adapter que preenche.
  origem: string // slug do provider, ex: 'meta_ads', 'google_ads' — bate com providers.slug
  fonte: string // ex: 'lead_ads', 'lead_form', 'webhook_generico'

  // Atribuição de campanha — nem todo provedor manda tudo isso.
  campanha?: string
  conjunto?: string
  criativo?: string

  // Identificador do evento no provedor — usado pra idempotência.
  // Nem todo provedor garante isso; quando ausente, fica null (nunca
  // inventado — ver idempotency.ts).
  externalEventId: string | null

  // Dados de contato — nem todo provedor manda os 3.
  nome?: string
  email?: string
  telefone?: string

  utm?: UtmParams
  landingPage?: string

  // Tudo que o provedor manda e não tem campo comum — nunca perdido,
  // nunca forçado num campo que não é dele.
  dadosExternos: Record<string, unknown>
}
