// _shared/connect/resilience/timeoutManager.ts
//
// CONNECT-004E — Timeout Manager (Bloco 05).
//
// LIMITAÇÃO CONHECIDA, documentada em vez de escondida: os Protocol
// Handlers (soapClient.ts, restClient.ts) já têm timeout próprio via
// AbortController (15s default), interno à chamada fetch(). Este
// Timeout Manager NÃO substitui isso — ele adiciona um teto por cima,
// na camada do Gateway, via Promise.race. Se esse teto estourar antes
// do fetch interno, o Gateway para de esperar e devolve erro de
// timeout — mas a chamada de rede em si pode continuar rodando em
// segundo plano até o AbortController interno cortar. Cancelamento de
// verdade exigiria os Protocol Handlers aceitarem um timeoutMs vindo
// de fora (mudança nos arquivos originais) — fora do escopo desta
// Sprint, registrado como pendência.

export type TimeoutConfig = {
  timeoutMs: number
}

const TIMEOUT_PADRAO: TimeoutConfig = { timeoutMs: 15000 }

// Valores do próprio documento REV.001 (Bloco 05): Tokio SOAP 60s, REST 20s.
const TIMEOUTS_POR_DRIVER: Record<string, TimeoutConfig> = {
  TokioQuoteDriver: { timeoutMs: 60000 }, // SOAP
  TokioProductListDriver: { timeoutMs: 20000 }, // REST
  TokioVehicleSearchDriver: { timeoutMs: 20000 }, // REST
  TokioMarketValueDriver: { timeoutMs: 20000 }, // REST
  MockInsuranceQuoteDriver: { timeoutMs: 3000 }, // curto de propósito — o cenário 'timeout' do Mock espera 60s, então estoura aqui antes
}

export function obterTimeout(driverNome: string): TimeoutConfig {
  return TIMEOUTS_POR_DRIVER[driverNome] ?? TIMEOUT_PADRAO
}

export class TimeoutGatewayError extends Error {
  constructor(driverNome: string, timeoutMs: number) {
    super(`${driverNome}: Gateway parou de esperar após ${timeoutMs}ms (teto do Timeout Manager).`)
    this.name = 'TimeoutGatewayError'
  }
}

/** Corrida entre a promise real e um limite de tempo — ver limitação no topo do arquivo. */
export function comTimeout<T>(promise: Promise<T>, driverNome: string, timeoutMs: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new TimeoutGatewayError(driverNome, timeoutMs)), timeoutMs)
    promise
      .then((valor) => {
        clearTimeout(timer)
        resolve(valor)
      })
      .catch((erro) => {
        clearTimeout(timer)
        reject(erro)
      })
  })
}
