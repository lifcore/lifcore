// _shared/connect/protocol/restClient.ts
//
// CONNECT-004 REV.002 — Protocol Handler (REST).
//
// Mesmo papel do soapClient.ts, mas pra Providers que falam JSON
// puro. A própria Tokio já prova que um Provider pode ter Contracts
// SOAP e REST ao mesmo tempo — por isso os dois Protocol Handlers
// vivem lado a lado, cada um reaproveitável por qualquer Driver.

export class RestProtocolError extends Error {
  constructor(message: string, public readonly status?: number, public readonly rawResponse?: unknown) {
    super(message)
    this.name = 'RestProtocolError'
  }
}

export type RestCallParams = {
  baseUrl: string
  endpointPath: string
  metodo?: 'GET' | 'POST'
  corpo?: Record<string, unknown>
  timeoutMs?: number
}

export async function chamarRest<T = unknown>({ baseUrl, endpointPath, metodo = 'POST', corpo, timeoutMs = 15000 }: RestCallParams): Promise<T> {
  const url = `${baseUrl}${endpointPath}`
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs)

  let response: Response
  try {
    response = await fetch(url, {
      method: metodo,
      headers: { 'Content-Type': 'application/json' },
      body: metodo === 'POST' ? JSON.stringify(corpo ?? {}) : undefined,
      signal: controller.signal,
    })
  } catch (err) {
    throw new RestProtocolError(`Falha de rede/timeout ao chamar ${url}: ${err instanceof Error ? err.message : String(err)}`)
  } finally {
    clearTimeout(timeoutId)
  }

  const corpoResposta = await response.json().catch(() => null)

  if (!response.ok) {
    throw new RestProtocolError(`REST retornou status ${response.status} de ${url}`, response.status, corpoResposta)
  }

  return corpoResposta as T
}
