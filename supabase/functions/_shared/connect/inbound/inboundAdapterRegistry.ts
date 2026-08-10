// _shared/connect/inbound/registry/inboundAdapterRegistry.ts
//
// CONNECT-004C — registro central dos Inbound Adapters. Mesmo
// princípio do driverRegistry.ts (CONNECT-004D): registro explícito,
// não "automático" — Edge Functions Deno não fazem scan de diretório
// em runtime, então cada adapter novo precisa ser importado e
// adicionado aqui.

import type { InboundAdapter } from '../contract/inboundAdapter.ts'
import { metaAdsAdapter } from '../adapters/metaAdsAdapter.ts'
import { googleAdsAdapter } from '../adapters/googleAdsAdapter.ts'
import { linkedinAdsAdapter } from '../adapters/linkedinAdsAdapter.ts'
import { tiktokAdsAdapter } from '../adapters/tiktokAdsAdapter.ts'
import { microsoftAdsAdapter } from '../adapters/microsoftAdsAdapter.ts'

const ADAPTERS: InboundAdapter[] = [
  metaAdsAdapter,
  googleAdsAdapter,
  linkedinAdsAdapter,
  tiktokAdsAdapter,
  microsoftAdsAdapter,
]

export function obterAdapter(provider: string): InboundAdapter | undefined {
  return ADAPTERS.find((a) => a.provider === provider)
}

export function listarAdapters(): InboundAdapter[] {
  return ADAPTERS
}
