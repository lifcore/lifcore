// _shared/connect/inbound/adapters/microsoftAdsAdapter.ts
//
// CONNECT-004C — Adapter do Microsoft Ads (Lead Form Extensions).
// Status: PREPARADO — Microsoft Ads Lead Form segue estrutura muito
// parecida com a do Google (mesma família de produto de anúncios de
// busca), mas isso é inferência de proximidade, não confirmação —
// nunca testado contra payload real.
//
// `verificarOrigem` depende de credencial OAuth da Microsoft — Secret
// Management, pendência separada.

import type { InboundAdapter } from '../contract/inboundAdapter.ts'
import type { LeadInputStandard } from '../contract/leadInputStandard.ts'
import { comoTexto, lerCampo } from './adapterHelpers.ts'

export const microsoftAdsAdapter: InboundAdapter = {
  provider: 'microsoft_ads',
  status: 'preparado',

  extrairExternalEventId(payloadBruto) {
    const id = lerCampo(payloadBruto, ['leadId', 'lead_id', 'id'])
    return comoTexto(id) ?? null
  },

  normalizar(payloadBruto): LeadInputStandard {
    return {
      origem: 'microsoft_ads',
      fonte: 'lead_form',
      campanha: comoTexto(lerCampo(payloadBruto, ['campaignId', 'campaignName'])),
      conjunto: comoTexto(lerCampo(payloadBruto, ['adGroupId'])),
      criativo: comoTexto(lerCampo(payloadBruto, ['adId'])),
      externalEventId: microsoftAdsAdapter.extrairExternalEventId(payloadBruto),
      nome: comoTexto(lerCampo(payloadBruto, ['fullName', 'nome'])),
      email: comoTexto(lerCampo(payloadBruto, ['email'])),
      telefone: comoTexto(lerCampo(payloadBruto, ['phoneNumber', 'telefone'])),
      dadosExternos: (typeof payloadBruto === 'object' && payloadBruto !== null ? (payloadBruto as Record<string, unknown>) : {}),
    }
  },

  async verificarOrigem() {
    return { verificado: false, motivo: 'secret_management_pendente' }
  },
}
