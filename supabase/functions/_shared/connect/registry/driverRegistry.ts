// _shared/connect/registry/driverRegistry.ts
//
// CONNECT-004D — Driver Registry (Bloco 02 do documento REV.001).
//
// O documento original pede "registro automático". Isso não é
// possível em Edge Functions Deno sem scan de filesystem em runtime
// (cada function é isolada e implantada separadamente) — então o
// registro aqui é explícito: todo Driver novo precisa ser importado
// e adicionado no array DRIVERS. É a mesma limitação que já vale pra
// qualquer registry deste tipo em ambiente serverless; documentando
// em vez de fingir automação que não existe.

import type { ProviderDriver } from '../contract/providerDriver.ts'
import { tokioQuoteDriver } from '../drivers/tokio/tokioQuoteDriver.contract.ts'
import {
  tokioMarketValueDriver,
  tokioProductListDriver,
  tokioVehicleSearchDriver,
} from '../drivers/tokio/tokioVehicleDriver.contract.ts'
import { mockInsuranceQuoteDriver } from '../drivers/mock/mockInsuranceDriver.ts'

const DRIVERS: ProviderDriver<any, any, any>[] = [
  tokioQuoteDriver,
  tokioProductListDriver,
  tokioVehicleSearchDriver,
  tokioMarketValueDriver,
  mockInsuranceQuoteDriver, // CONNECT-004F — Mock Provider, pro Test Harness
]

/** Ponto único de lookup que o Provider Gateway usa — não importar os Drivers direto em outro lugar. */
export function obterDriver(provider: string, capability: string): ProviderDriver<any, any, any> | undefined {
  return DRIVERS.find((driver) => driver.provider === provider && driver.capability === capability)
}

export function listarDrivers(): ProviderDriver<any, any, any>[] {
  return DRIVERS
}

export function listarDriversPorProvider(provider: string): ProviderDriver<any, any, any>[] {
  return DRIVERS.filter((driver) => driver.provider === provider)
}
