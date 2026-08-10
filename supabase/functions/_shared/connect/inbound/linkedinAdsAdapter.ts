// _shared/connect/inbound/adapters/linkedinAdsAdapter.ts
//
// CONNECT-004C — Adapter do LinkedIn Ads (Lead Gen Forms). Status:
// PREPARADO — extração baseada na estrutura pública documentada do
// LinkedIn Lead Sync API (formResponse com answers[].questionId/
// answer), nunca testada contra payload real.
//
// `verificarOrigem` depende de credencial OAuth do LinkedIn — Secret
// Management, pendência separada.

import type { InboundAdapter } from '../contract/inboundAdapter.ts'
import type { LeadInputStandard } from '../contract/leadInputStandard.ts'
import { comoTexto, lerCampo } from './adapterHelpers.ts'

function extrairResposta(answers: unknown, pergunta: string): string | undefined {
  if (!Array.isArray(answers)) return undefined
  const item = answers.find((a) => a?.questionId === pergunta || a?.question === pergunta)
  return item?.answer
}

export const linkedinAdsAdapter: InboundAdapter = {
  provider: 'linkedin_ads',
  status: 'preparado',

  extrairExternalEventId(payloadBruto) {
    const id = lerCampo(payloadBruto, ['leadId', 'id'])
    return comoTexto(id) ?? null
  },

  normalizar(payloadBruto): LeadInputStandard {
    const answers = lerCampo(payloadBruto, ['formResponse.answers', 'answers'])

    return {
      origem: 'linkedin_ads',
      fonte: 'lead_gen_form',
      campanha: comoTexto(lerCampo(payloadBruto, ['campaignId', 'campaignName'])),
      conjunto: comoTexto(lerCampo(payloadBruto, ['creativeId'])),
      criativo: undefined,
      externalEventId: linkedinAdsAdapter.extrairExternalEventId(payloadBruto),
      nome: extrairResposta(answers, 'FIRST_NAME'),
      email: extrairResposta(answers, 'EMAIL') ?? comoTexto(lerCampo(payloadBruto, ['email'])),
      telefone: extrairResposta(answers, 'PHONE_NUMBER'),
      dadosExternos: (typeof payloadBruto === 'object' && payloadBruto !== null ? (payloadBruto as Record<string, unknown>) : {}),
    }
  },

  async verificarOrigem() {
    return { verificado: false, motivo: 'secret_management_pendente' }
  },
}
