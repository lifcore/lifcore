// _shared/connect/inbound/adapters/googleAdsAdapter.ts
//
// CONNECT-004C — Adapter do Google Ads (Lead Form Extensions / Google
// Lead Forms). Status: PREPARADO — mesma ressalva do Meta: extração
// baseada na estrutura pública documentada (lead_id, user_column_data
// com column_id/string_value), nunca testada contra payload real.
//
// `verificarOrigem` depende de credencial de conta de serviço do
// Google — Secret Management, pendência separada.

import type { InboundAdapter } from '../contract/inboundAdapter.ts'
import type { LeadInputStandard } from '../contract/leadInputStandard.ts'
import { comoTexto, lerCampo } from './adapterHelpers.ts'

function extrairColuna(userColumnData: unknown, coluna: string): string | undefined {
  if (!Array.isArray(userColumnData)) return undefined
  const item = userColumnData.find((c) => c?.column_id === coluna || c?.column_name === coluna)
  return item?.string_value
}

export const googleAdsAdapter: InboundAdapter = {
  provider: 'google_ads',
  status: 'preparado',

  extrairExternalEventId(payloadBruto) {
    const id = lerCampo(payloadBruto, ['lead_id', 'gcl_id', 'id'])
    return comoTexto(id) ?? null
  },

  normalizar(payloadBruto): LeadInputStandard {
    const userColumnData = lerCampo(payloadBruto, ['user_column_data'])

    return {
      origem: 'google_ads',
      fonte: comoTexto(lerCampo(payloadBruto, ['form_id'])) ? 'lead_form' : 'webhook_generico',
      campanha: comoTexto(lerCampo(payloadBruto, ['campaign_id', 'campaign_name'])),
      conjunto: comoTexto(lerCampo(payloadBruto, ['adgroup_id', 'ad_group_id'])),
      criativo: comoTexto(lerCampo(payloadBruto, ['creative_id'])),
      externalEventId: googleAdsAdapter.extrairExternalEventId(payloadBruto),
      nome: extrairColuna(userColumnData, 'FULL_NAME') ?? comoTexto(lerCampo(payloadBruto, ['nome'])),
      email: extrairColuna(userColumnData, 'EMAIL') ?? comoTexto(lerCampo(payloadBruto, ['email'])),
      telefone: extrairColuna(userColumnData, 'PHONE_NUMBER') ?? comoTexto(lerCampo(payloadBruto, ['telefone'])),
      dadosExternos: (typeof payloadBruto === 'object' && payloadBruto !== null ? (payloadBruto as Record<string, unknown>) : {}),
    }
  },

  async verificarOrigem() {
    return { verificado: false, motivo: 'secret_management_pendente' }
  },
}
