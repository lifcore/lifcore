// _shared/connect/inbound/idempotency/idempotency.ts
//
// CONNECT-004C, item 9 da diretriz — Idempotência.
//
// Referência de unicidade lógica: provider + connection_id +
// external_event_id, exatamente como pedido.
//
// LIMITAÇÃO CONHECIDA, documentada e não escondida: este módulo
// calcula e avalia a chave, mas NÃO faz a checagem real de "esse
// evento já foi processado antes?" contra o banco. Isso porque
// `connect_log` (a tabela de auditoria já existente) não tem hoje
// nenhuma coluna indexável por `external_event_id` — teria que ou
// ganhar uma coluna nova, ou a checagem teria que varrer `payload`
// (jsonb) sem índice, o que não escala. Qualquer uma das duas opções
// é mudança de schema — e schema não muda sem BMR, como já
// combinado. Fica registrado aqui como pendência explícita: a
// checagem de duplicidade real só entra depois dessa decisão.
//
// Por ora, quem chama este módulo recebe o resultado de
// `avaliarIdempotencia()` e decide o que fazer (ex: logar como
// "idempotência não garantida" e processar mesmo assim, ou recusar) —
// isso já é decisão de política, não deste módulo.

export type ChaveIdempotencia = {
  provider: string
  connectionId: string | null // id de conexoes_operadoras, quando existir uma configurada
  externalEventId: string | null
}

export type ResultadoIdempotencia = {
  chave: string | null
  garantida: boolean
  motivo?: string
}

/**
 * Monta a chave lógica `provider:connectionId:externalEventId`.
 * Retorna null se o provedor não garantiu um externalEventId — nunca
 * inventa um identificador falso só pra ter uma chave.
 */
export function construirChaveIdempotencia({ provider, connectionId, externalEventId }: ChaveIdempotencia): string | null {
  if (!externalEventId) return null
  return `${provider}:${connectionId ?? 'sem_conexao'}:${externalEventId}`
}

/**
 * Avalia se a idempotência pode ser garantida pra este evento. Não
 * consulta banco — só decide se a chave é confiável ou não.
 */
export function avaliarIdempotencia(chave: ChaveIdempotencia): ResultadoIdempotencia {
  const chaveConstruida = construirChaveIdempotencia(chave)

  if (!chaveConstruida) {
    return {
      chave: null,
      garantida: false,
      motivo: 'Provedor não forneceu identificador externo confiável — idempotência não pode ser garantida para este evento.',
    }
  }

  return { chave: chaveConstruida, garantida: true }
}
