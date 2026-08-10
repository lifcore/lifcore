// _shared/connect/inbound/gateway/inboundGateway.ts
//
// CONNECT-004C, Bloco 6/8/9 da diretriz — Inbound Gateway.
//
// Único ponto de entrada pra qualquer evento externo de aquisição de
// lead. Mesma filosofia do Provider Gateway (CONNECT-004D): seleciona
// o Adapter certo, orquestra as etapas, nunca conhece o formato
// específico de nenhum provedor, nunca toca em banco de dados —
// auditoria é sempre via callback de quem chama, exatamente como o
// providerGateway.ts já faz pro sentido de saída.
//
// Fluxo: Adapter → verificação de origem → idempotência → Normalizer
// → Lead Input Standard.
//
// O que este Gateway NÃO faz, por design:
//   - Não persiste nada (nem o lead, nem o log) — devolve o resultado
//     pra quem chamou decidir.
//   - Não bloqueia o processamento quando a origem não pôde ser
//     verificada (Secret Management pendente) — ainda não existe
//     nenhum endpoint público exposto usando isso; quando existir,
//     a decisão de bloquear ou não é de quem expõe o endpoint, não
//     deste módulo. O resultado sempre informa `origemVerificada`,
//     nunca esconde que não foi possível confirmar.
//   - Não garante idempotência sozinho — calcula a chave e informa se
//     é confiável (`idempotenciaGarantida`), mas a checagem de
//     duplicidade real contra o banco depende de decisão de schema
//     ainda pendente (ver idempotency.ts).

import { obterAdapter } from '../registry/inboundAdapterRegistry.ts'
import { normalizar } from '../normalizer.ts'
import { avaliarIdempotencia } from '../idempotency/idempotency.ts'
import type { LeadInputStandard } from '../contract/leadInputStandard.ts'

export type EventoAuditoriaInbound = {
  correlationId: string
  provider: string
  status: 'processado' | 'erro'
  entradaEm: string
  saidaEm: string
  duracaoMs: number
  externalEventId: string | null
  idempotenciaGarantida: boolean
  origemVerificada: boolean
  origemMotivo?: string
  erroMensagem?: string
}

export type ResultadoInbound =
  | {
      sucesso: true
      lead: LeadInputStandard
      correlationId: string
      idempotenciaGarantida: boolean
      origemVerificada: boolean
    }
  | { sucesso: false; erro: string; correlationId: string }

export type OpcoesInbound = {
  /** id de `conexoes_operadoras`, quando já existir uma conexão configurada pra este provider — usado só pra compor a chave de idempotência. */
  connectionId?: string | null
  headers?: Record<string, string>
  /**
   * Chamado sempre ao final, com o desfecho — quem implementa decide
   * se/como grava isso em `connect_log` (mesmo padrão do
   * `aoRegistrarEvento` do providerGateway.ts).
   */
  aoRegistrarEvento?: (evento: EventoAuditoriaInbound) => Promise<void> | void
}

export async function receberEventoInbound(
  provider: string,
  payloadBruto: unknown,
  opcoes: OpcoesInbound = {}
): Promise<ResultadoInbound> {
  const correlationId = crypto.randomUUID()
  const entradaEm = new Date()

  const adapter = obterAdapter(provider)
  if (!adapter) {
    const erro = `Nenhum Inbound Adapter registrado para provider="${provider}".`
    await registrarEAvisar(
      { correlationId, provider, status: 'erro', entradaEm, externalEventId: null, idempotenciaGarantida: false, origemVerificada: false, erroMensagem: erro },
      opcoes
    )
    return { sucesso: false, erro, correlationId }
  }

  const origem = await adapter.verificarOrigem(payloadBruto, opcoes.headers ?? {})
  const externalEventId = adapter.extrairExternalEventId(payloadBruto)
  const idempotencia = avaliarIdempotencia({
    provider,
    connectionId: opcoes.connectionId ?? null,
    externalEventId,
  })

  try {
    const lead = normalizar(adapter, payloadBruto)

    await registrarEAvisar(
      {
        correlationId,
        provider,
        status: 'processado',
        entradaEm,
        externalEventId,
        idempotenciaGarantida: idempotencia.garantida,
        origemVerificada: origem.verificado,
        origemMotivo: origem.motivo,
      },
      opcoes
    )

    return { sucesso: true, lead, correlationId, idempotenciaGarantida: idempotencia.garantida, origemVerificada: origem.verificado }
  } catch (erroOriginal) {
    const mensagem = erroOriginal instanceof Error ? erroOriginal.message : String(erroOriginal)
    await registrarEAvisar(
      {
        correlationId,
        provider,
        status: 'erro',
        entradaEm,
        externalEventId,
        idempotenciaGarantida: idempotencia.garantida,
        origemVerificada: origem.verificado,
        origemMotivo: origem.motivo,
        erroMensagem: mensagem,
      },
      opcoes
    )
    return { sucesso: false, erro: mensagem, correlationId }
  }
}

async function registrarEAvisar(
  parcial: {
    correlationId: string
    provider: string
    status: 'processado' | 'erro'
    entradaEm: Date
    externalEventId: string | null
    idempotenciaGarantida: boolean
    origemVerificada: boolean
    origemMotivo?: string
    erroMensagem?: string
  },
  opcoes: OpcoesInbound
): Promise<void> {
  const saidaEm = new Date()
  await opcoes.aoRegistrarEvento?.({
    correlationId: parcial.correlationId,
    provider: parcial.provider,
    status: parcial.status,
    entradaEm: parcial.entradaEm.toISOString(),
    saidaEm: saidaEm.toISOString(),
    duracaoMs: saidaEm.getTime() - parcial.entradaEm.getTime(),
    externalEventId: parcial.externalEventId,
    idempotenciaGarantida: parcial.idempotenciaGarantida,
    origemVerificada: parcial.origemVerificada,
    origemMotivo: parcial.origemMotivo,
    erroMensagem: parcial.erroMensagem,
  })
}
