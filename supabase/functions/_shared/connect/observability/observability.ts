// _shared/connect/observability/observability.ts
//
// CONNECT-004F — Observabilidade (Bloco 09) + base de dados pro
// futuro Health Dashboard (Bloco 10). Não introduz estado novo — só
// combina o que Registry, Retry Metrics, Circuit Breaker e Contract
// Validation já mantêm cada um, numa view única por Driver.
//
// Health Checks (rodar driver.health() de todo Driver registrado)
// também mora aqui — é conceitualmente parte da mesma foto do estado
// operacional, não precisa de módulo separado.

import { listarDrivers } from '../registry/driverRegistry.ts'
import * as metrics from '../resilience/retryMetrics.ts'
import * as circuitBreaker from '../resilience/circuitBreaker.ts'
import { obterValidacaoContrato, type ValidacaoContrato } from './contractValidation.ts'
import type { StatusSaudeDriver } from '../contract/providerDriver.ts'

export type PainelDriver = {
  nome: string
  provider: string
  capability: string
  contrato: string
  versao: string
  status: string
  ambiente: string
  saude: StatusSaudeDriver
  estadoCircuito: string
  metricas: metrics.MetricasDriver
  validacaoContrato: ValidacaoContrato | undefined
}

/**
 * Roda driver.health() de todo Driver registrado, em paralelo. Uma
 * Identity opcional por provider — Driver sem Identity fornecida usa
 * `undefined` (os Drivers Tokio hoje não fazem chamada real dentro de
 * health(), então isso não quebra; ver nota em cada .contract.ts).
 */
export async function obterPainelOperacional(identityPorProvider: Record<string, unknown> = {}): Promise<PainelDriver[]> {
  const drivers = listarDrivers()

  const painel = await Promise.all(
    drivers.map(async (driver) => {
      let saude: StatusSaudeDriver
      try {
        saude = await driver.health(identityPorProvider[driver.provider])
      } catch (erro) {
        saude = 'indisponivel'
      }

      return {
        nome: driver.nome,
        provider: driver.provider,
        capability: driver.capability,
        contrato: driver.contrato,
        versao: driver.versao,
        status: driver.status,
        ambiente: driver.ambiente,
        saude,
        estadoCircuito: circuitBreaker.obterEstado(driver.nome),
        metricas: metrics.obterMetricas(driver.nome),
        validacaoContrato: obterValidacaoContrato(driver.nome),
      } satisfies PainelDriver
    })
  )

  return painel
}
