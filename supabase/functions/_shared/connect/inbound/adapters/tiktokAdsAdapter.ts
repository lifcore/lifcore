// _shared/connect/inbound/adapters/tiktokAdsAdapter.ts
//
// CONNECT-004C — Adapter do TikTok Ads (Lead Generation). Status:
// PREPARADO — extração baseada na estrutura pública documentada da
// TikTok Leads API (lead_id, field_name/field_value), nunca testada
// contra payload real.
//
// `verificarOrigem` depende de credencial de app do TikTok — Secret
// Management, pendência separada.

import type { InboundAdapter } from '../contract/inboundAdapter.ts'
import type { LeadInputStandard } from '../contract/leadInputStandard.ts'
import { comoTexto, lerCampo } from './adapterHelpers.ts'

function extrairCampo(campos: unknown, nomeAlvo: string): string | undefined {
  if (!Array.isArray(campos)) return undefined
  const item = campos.find((c) => c?.field_name === nomeAlvo)
  return item?.field_value
}

export const tiktokAdsAdapter: InboundAdapter = {
  provider: 'tiktok_ads',
  status: 'preparado',

  extrairExternalEventId(payloadBruto) {
    const id = lerCampo(payloadBruto, ['lead_id', 'id'])
    return comoTexto(id) ?? null
  },

  normalizar(payloadBruto): LeadInputStandard {
    const campos = lerCampo(payloadBruto, ['field_data', 'fields'])

    return {
      origem: 'tiktok_ads',
      fonte: 'lead_generation',
      campanha: comoTexto(lerCampo(payloadBruto, ['campaign_id', 'campaign_name'])),
      conjunto: comoTexto(lerCampo(payloadBruto, ['adgroup_id'])),
      criativo: comoTexto(lerCampo(payloadBruto, ['ad_id'])),
      externalEventId: tiktokAdsAdapter.extrairExternalEventId(payloadBruto),
      nome: extrairCampo(campos, 'name'),
      email: extrairCampo(campos, 'email'),
      telefone: extrairCampo(campos, 'phone_number'),
      dadosExternos: (typeof payloadBruto === 'object' && payloadBruto !== null ? (payloadBruto as Record<string, unknown>) : {}),
    }
  },

  async verificarOrigem() {
    return { verificado: false, motivo: 'secret_management_pendente' }
  },
}
