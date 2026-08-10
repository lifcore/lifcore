// _shared/connect/inbound/normalizer.ts
//
// CONNECT-004C — Normalizer. Fica entre o Provider Adapter e o Lead
// Input Standard no diagrama da diretriz. Hoje é fino de propósito —
// cada Adapter já devolve o formato certo — mas existe como peça
// própria porque é aqui (e não dentro do Gateway) que futuras regras
// de normalização *comuns a todos os provedores* deveriam entrar
// (ex: normalizar telefone pro formato E.164, decidir o que fazer
// quando nome vem vazio) — sem duplicar isso em cada Adapter.
//
// Hoje não faz nenhuma dessas normalizações extras — YAGNI: ninguém
// pediu ainda, e a diretriz não autorizou "melhorias" fora do escopo
// desta Sprint.

import type { InboundAdapter } from './contract/inboundAdapter.ts'
import type { LeadInputStandard } from './contract/leadInputStandard.ts'

export function normalizar(adapter: InboundAdapter, payloadBruto: unknown): LeadInputStandard {
  return adapter.normalizar(payloadBruto)
}
