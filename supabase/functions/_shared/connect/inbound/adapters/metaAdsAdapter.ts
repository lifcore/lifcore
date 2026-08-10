// _shared/connect/inbound/adapters/metaAdsAdapter.ts
//
// CONNECT-004C — Adapter do Meta Ads (Lead Ads). Status: PREPARADO.
//
// IMPORTANTE, honestidade obrigatória (diretriz do Chief): este
// adapter nunca recebeu um payload real do Meta — a extração de
// campos abaixo segue a estrutura pública documentada do webhook de
// Lead Ads (entry[].changes[].value com leadgen_id/field_data), mas
// não foi validada contra uma chamada de verdade. Se o formato real
// divergir, ajustar aqui — nunca no Normalizer ou no Gateway (o
// resto do sistema não deveria precisar saber que isso mudou).
//
// `verificarOrigem` depende do App Secret do Meta pra validar a
// assinatura X-Hub-Signature-256 — isso é Secret Management,
// pendência separada, fora do escopo desta Sprint.

import type { InboundAdapter } from '../contract/inboundAdapter.ts'
import type { LeadInputStandard } from '../contract/leadInputStandard.ts'
import { comoTexto, lerCampo } from './adapterHelpers.ts'

export const metaAdsAdapter: InboundAdapter = {
  provider: 'meta_ads',
  status: 'preparado',

  extrairExternalEventId(payloadBruto) {
    const id = lerCampo(payloadBruto, ['entry.0.changes.0.value.leadgen_id', 'leadgen_id', 'id'])
    return comoTexto(id) ?? null
  },

  normalizar(payloadBruto): LeadInputStandard {
    const valor = lerCampo(payloadBruto, ['entry.0.changes.0.value']) ?? payloadBruto

    return {
      origem: 'meta_ads',
      fonte: 'lead_ads',
      campanha: comoTexto(lerCampo(valor, ['campaign_name', 'campaign_id'])),
      conjunto: comoTexto(lerCampo(valor, ['adset_name', 'adset_id'])),
      criativo: comoTexto(lerCampo(valor, ['ad_name', 'ad_id'])),
      externalEventId: metaAdsAdapter.extrairExternalEventId(payloadBruto),
      nome: comoTexto(lerCampo(valor, ['field_data.full_name', 'field_data.nome'])),
      email: comoTexto(lerCampo(valor, ['field_data.email'])),
      telefone: comoTexto(lerCampo(valor, ['field_data.phone_number', 'field_data.telefone'])),
      dadosExternos: (typeof valor === 'object' && valor !== null ? (valor as Record<string, unknown>) : { payloadBruto }),
    }
  },

  async verificarOrigem() {
    return { verificado: false, motivo: 'secret_management_pendente' }
  },
}
