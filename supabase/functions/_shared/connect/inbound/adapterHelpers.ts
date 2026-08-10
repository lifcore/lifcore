// _shared/connect/inbound/adapters/adapterHelpers.ts
//
// CONNECT-004C — helpers pequenos e genéricos reaproveitados pelos 5
// adapters. Nada aqui é específico de um provedor — se virar
// específico, sai daqui e vai pro adapter dele.

/** Lê um valor de um objeto por uma lista de caminhos possíveis (primeiro que existir, ganha). Nunca lança erro — payload de provedor externo nunca é confiável na forma. */
export function lerCampo(payload: unknown, caminhos: string[]): unknown {
  if (typeof payload !== 'object' || payload === null) return undefined
  for (const caminho of caminhos) {
    const partes = caminho.split('.')
    let atual: unknown = payload
    for (const parte of partes) {
      if (typeof atual !== 'object' || atual === null) {
        atual = undefined
        break
      }
      atual = (atual as Record<string, unknown>)[parte]
    }
    if (atual !== undefined && atual !== null) return atual
  }
  return undefined
}

export function comoTexto(valor: unknown): string | undefined {
  if (valor === undefined || valor === null) return undefined
  return String(valor)
}
