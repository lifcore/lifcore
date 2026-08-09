// _shared/connect/resilience/retryPolicy.ts
//
// CONNECT-004E — Retry Policy (Bloco 04). Configuração por Driver,
// com um padrão pra quem ainda não tem policy própria registrada.

export type PoliticaRetry = {
  maxTentativas: number // inclui a 1ª tentativa — maxTentativas=3 = até 2 retries
  tempoEntreTentativasMs: number
}

const POLITICA_PADRAO: PoliticaRetry = {
  maxTentativas: 3,
  tempoEntreTentativasMs: 1000,
}

/**
 * Valores por Driver — ponto de partida conservador, não medição
 * real. Ainda não temos dado de latência/comportamento real da Tokio
 * (bloqueio comercial da API) pra calibrar isso com precisão; ajustar
 * quando o Test Harness (CONNECT-004F) tiver métricas de verdade.
 */
const POLITICAS_POR_DRIVER: Record<string, PoliticaRetry> = {
  TokioQuoteDriver: { maxTentativas: 2, tempoEntreTentativasMs: 2000 }, // SOAP — mais caro, menos tentativas
}

export function obterPoliticaRetry(driverNome: string): PoliticaRetry {
  return POLITICAS_POR_DRIVER[driverNome] ?? POLITICA_PADRAO
}
