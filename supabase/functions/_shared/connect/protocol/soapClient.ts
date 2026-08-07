// _shared/connect/protocol/soapClient.ts
//
// CONNECT-004 REV.002 — Protocol Handler (SOAP).
//
// Responsabilidade única: montar envelope SOAP, chamar o endpoint,
// devolver o XML de resposta já parseado como objeto. NUNCA conhece
// regra de negócio de nenhum Provider — quem monta o "miolo" do
// payload (os campos de dentro do <con:metodo>) é o Driver.
//
// Reaproveitável por QUALQUER Provider que fale SOAP — não é
// específico da Tokio.

import { XMLParser, XMLBuilder } from 'https://esm.sh/fast-xml-parser@4.3.2'

const parser = new XMLParser({ ignoreAttributes: false, removeNSPrefix: true })
const builder = new XMLBuilder({ ignoreAttributes: false, format: false })

export type SoapCallParams = {
  baseUrl: string
  endpointPath: string
  /** Namespace declarado no envelope, ex: 'CotacaoWS', 'ConsultasWS' */
  namespace: string
  /** Nome do método SOAP, ex: 'cotar', 'consultarTipoVeiculo2' */
  metodo: string
  /** Corpo já no formato de objeto (vira XML automaticamente) — NUNCA string XML pronta, pra evitar erro de escaping */
  corpo: Record<string, unknown>
  timeoutMs?: number
}

export class SoapProtocolError extends Error {
  constructor(message: string, public readonly rawResponse?: string) {
    super(message)
    this.name = 'SoapProtocolError'
  }
}

/** Monta o envelope SOAP completo a partir de um corpo de objeto. */
function montarEnvelope(namespace: string, metodo: string, corpo: Record<string, unknown>): string {
  const envelope = {
    'soapenv:Envelope': {
      '@_xmlns:soapenv': 'http://schemas.xmlsoap.org/soap/envelope/',
      '@_xmlns:con': namespace,
      'soapenv:Header': {},
      'soapenv:Body': {
        [`con:${metodo}`]: corpo,
      },
    },
  }
  return builder.build(envelope)
}

/** Extrai o conteúdo de dentro de <con:metodo>...</con:metodo> do XML de resposta, já como objeto JS. */
function extrairCorpoResposta(xml: string, metodo: string): Record<string, unknown> {
  const parsed = parser.parse(xml)
  const body = parsed?.Envelope?.Body
  if (!body) {
    throw new SoapProtocolError('Resposta SOAP sem Envelope/Body reconhecível.', xml)
  }
  return body[metodo] ?? body
}

/** Faz a chamada SOAP completa: monta envelope, envia, faz parse do retorno. */
export async function chamarSoap({ baseUrl, endpointPath, namespace, metodo, corpo, timeoutMs = 15000 }: SoapCallParams): Promise<Record<string, unknown>> {
  const envelopeXml = montarEnvelope(namespace, metodo, corpo)
  const url = `${baseUrl}${endpointPath}`

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs)

  let response: Response
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/xml; charset=utf-8',
        SOAPAction: `${namespace}#${metodo}`,
      },
      body: envelopeXml,
      signal: controller.signal,
    })
  } catch (err) {
    throw new SoapProtocolError(`Falha de rede/timeout ao chamar ${url}: ${err instanceof Error ? err.message : String(err)}`)
  } finally {
    clearTimeout(timeoutId)
  }

  const textoResposta = await response.text()

  if (!response.ok) {
    throw new SoapProtocolError(`SOAP retornou status ${response.status} de ${url}`, textoResposta)
  }

  return extrairCorpoResposta(textoResposta, metodo)
}
