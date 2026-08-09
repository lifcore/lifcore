// _shared/connect/gateway/providerGateway.ts
//
// CONNECT-004D — Provider Gateway (Bloco 01).
// CONNECT-004E — Resilience Layer aplicada por cima (Retry, Timeout,
// Circuit Breaker, Error Classification, Retry Metrics) SEM alterar a
// assinatura de executarChamada() nem o Driver Contract. Os únicos
// campos novos ficam em EventoAuditoriaGateway (opcionais, aditivos)
// — nada que já existia foi removido ou teve tipo mudado, então
// qualquer `aoRegistrarEvento` escrito na CONNECT-004D continua
// funcionando sem alteração.
//
// Ordem de decisão em cada chamada:
//   1. Circuit Breaker aberto pra este Driver? → nem tenta, erro
//      imediato (é o ponto do padrão: parar de bater numa porta que
//      já provou estar com problema).
//   2. validate() do Driver.
//   3. Loop de tentativas (Retry Policy): cada tentativa passa pelo
//      Timeout Manager; erro é classificado (recuperável/definitivo)
//      — só repete se for recuperável E ainda houver tentativa
//      disponível.
//   4. Sucesso → Circuit Breaker fecha, métricas atualizadas.
//      Falha definitiva (ou tentativas esgotadas) → Circuit Breaker
//      registra falha, métricas atualizadas.
//
// O Gateway continua NUNCA falando com banco de dados — auditoria é
// sempre via `aoRegistrarEvento`, de quem chama.

import { obterDriver } from '../registry/driverRegistry.ts'
import type { ProviderDriver } from '../contract/providerDriver.ts'
import { classificarErro } from '../resilience/errorClassification.ts'
import { obterPoliticaRetry } from '../resilience/retryPolicy.ts'
import { comTimeout, obterTimeout } from '../resilience/timeoutManager.ts'
import * as circuitBreaker from '../resilience/circuitBreaker.ts'
import * as metrics from '../resilience/retryMetrics.ts'

export type EventoAuditoriaGateway = {
  correlationId: string
  driverNome: string
  provider: string
  capability: string
  status: 'processado' | 'erro'
  entradaEm: string
  saidaEm: string
  duracaoMs: number
  erroMensagem?: string
  // --- campos novos da CONNECT-004E — opcionais, aditivos ---
  tentativas?: number
  bloqueadoPeloCircuito?: boolean
}

export type ResultadoGateway<TOutput> =
  | { sucesso: true; dados: TOutput; correlationId: string }
  | { sucesso: false; erro: string; correlationId: string }

export type OpcoesExecucaoGateway = {
  /**
   * Chamado sempre ao final de cada tentativa terminal (sucesso, erro
   * definitivo, ou bloqueio pelo Circuit Breaker) — nunca a cada
   * retry intermediário, só no desfecho. Quem implementa decide
   * se/como grava isso em `operacional.connect_log`, ex:
   *
   *   await executarChamada('tokio', 'cotacao', request, identity, {
   *     aoRegistrarEvento: (evento) => supabaseAdmin
   *       .schema('operacional')
   *       .from('connect_log')
   *       .insert({
   *         correlation_id: evento.correlationId,
   *         tipo_entrada: 'provider_gateway',
   *         entry_point: evento.driverNome,
   *         origem: 'lifcore',
   *         destino: evento.provider,
   *         status: evento.status,
   *         payload: { capability: evento.capability, tentativas: evento.tentativas },
   *         erro_mensagem: evento.erroMensagem ?? null,
   *         processado_em: evento.saidaEm,
   *       }),
   *   })
   */
  aoRegistrarEvento?: (evento: EventoAuditoriaGateway) => Promise<void> | void
}

function pausar(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export async function executarChamada<TInput, TOutput, TIdentity = unknown>(
  provider: string,
  capability: string,
  input: TInput,
  identity: TIdentity,
  opcoes: OpcoesExecucaoGateway = {}
): Promise<ResultadoGateway<TOutput>> {
  const correlationId = crypto.randomUUID()
  const entradaEm = new Date()

  const driver = obterDriver(provider, capability) as ProviderDriver<TInput, TOutput, TIdentity> | undefined

  if (!driver) {
    const erro = `Nenhum Driver registrado para provider="${provider}" capability="${capability}".`
    await registrarEAvisar(
      { correlationId, driverNome: '(nenhum)', provider, capability, status: 'erro', entradaEm, erroMensagem: erro },
      opcoes
    )
    return { sucesso: false, erro, correlationId }
  }

  if (!circuitBreaker.podeExecutar(driver.nome)) {
    metrics.registrarCircuitoAberto(driver.nome)
    const erro = `${driver.nome}: circuito aberto (falhas consecutivas recentes) — chamada bloqueada sem tentar o Provider.`
    await registrarEAvisar(
      { correlationId, driverNome: driver.nome, provider, capability, status: 'erro', entradaEm, erroMensagem: erro, bloqueadoPeloCircuito: true },
      opcoes
    )
    return { sucesso: false, erro, correlationId }
  }

  const validacao = driver.validate(input)
  if (!validacao.valido) {
    const erro = validacao.erros.join('; ')
    await registrarEAvisar(
      { correlationId, driverNome: driver.nome, provider, capability, status: 'erro', entradaEm, erroMensagem: erro },
      opcoes
    )
    return { sucesso: false, erro, correlationId }
  }

  metrics.registrarChamada(driver.nome)
  const politica = obterPoliticaRetry(driver.nome)
  const { timeoutMs } = obterTimeout(driver.nome)

  for (let tentativa = 1; tentativa <= politica.maxTentativas; tentativa += 1) {
    try {
      const saidaBruta = await comTimeout(driver.execute(input, identity), driver.nome, timeoutMs)
      const dados = driver.normalize(saidaBruta)
      const duracaoMs = Date.now() - entradaEm.getTime()

      circuitBreaker.registrarSucesso(driver.nome)
      metrics.registrarSucesso(driver.nome, duracaoMs)
      await registrarEAvisar(
        { correlationId, driverNome: driver.nome, provider, capability, status: 'processado', entradaEm, tentativas: tentativa },
        opcoes
      )
      return { sucesso: true, dados, correlationId }
    } catch (erroOriginal) {
      const mensagem = erroOriginal instanceof Error ? erroOriginal.message : String(erroOriginal)
      const ehTimeout = erroOriginal instanceof Error && erroOriginal.name === 'TimeoutGatewayError'
      if (ehTimeout) metrics.registrarTimeout(driver.nome)

      const classe = classificarErro(erroOriginal)
      const aindaTemTentativa = tentativa < politica.maxTentativas

      if (classe === 'recuperavel' && aindaTemTentativa) {
        metrics.registrarRetry(driver.nome)
        await pausar(politica.tempoEntreTentativasMs)
        continue
      }

      const duracaoMs = Date.now() - entradaEm.getTime()
      circuitBreaker.registrarFalha(driver.nome)
      metrics.registrarErro(driver.nome, mensagem, duracaoMs)
      await registrarEAvisar(
        { correlationId, driverNome: driver.nome, provider, capability, status: 'erro', entradaEm, erroMensagem: mensagem, tentativas: tentativa },
        opcoes
      )
      return { sucesso: false, erro: mensagem, correlationId }
    }
  }

  // Inalcançável em teoria (o loop sempre retorna dentro do try/catch) — só salvaguarda de tipo.
  return { sucesso: false, erro: 'Falha desconhecida no Provider Gateway.', correlationId }
}

async function registrarEAvisar(
  parcial: {
    correlationId: string
    driverNome: string
    provider: string
    capability: string
    status: 'processado' | 'erro'
    entradaEm: Date
    erroMensagem?: string
    tentativas?: number
    bloqueadoPeloCircuito?: boolean
  },
  opcoes: OpcoesExecucaoGateway
): Promise<void> {
  const saidaEm = new Date()
  await opcoes.aoRegistrarEvento?.({
    correlationId: parcial.correlationId,
    driverNome: parcial.driverNome,
    provider: parcial.provider,
    capability: parcial.capability,
    status: parcial.status,
    entradaEm: parcial.entradaEm.toISOString(),
    saidaEm: saidaEm.toISOString(),
    duracaoMs: saidaEm.getTime() - parcial.entradaEm.getTime(),
    erroMensagem: parcial.erroMensagem,
    tentativas: parcial.tentativas,
    bloqueadoPeloCircuito: parcial.bloqueadoPeloCircuito,
  })
}
