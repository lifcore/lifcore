// _shared/connect/drivers/mock/mockInsuranceDriver.ts
//
// CONNECT-004F — Mock Provider (Bloco 08). "Mock Insurance" — um
// Provider que não existe de verdade, só pra validar toda a
// arquitetura (Gateway + Retry + Timeout + Circuit Breaker) sem
// depender da Tokio estar liberada comercialmente.
//
// Implementa o Driver Contract normalmente — pro Gateway, ele é só
// mais um Driver (provider='mock'). A diferença é que o input tem um
// campo `cenario` que decide deterministicamente o que acontece,
// em vez de fazer uma chamada de rede de verdade.

import type { ProviderDriver } from '../../contract/providerDriver.ts'
import { RestProtocolError } from '../../protocol/restClient.ts'
import { SoapProtocolError } from '../../protocol/soapClient.ts'
import type { QuoteResponse } from '../../models/quote.ts'

export type MockIdentity = {
  // Mock não precisa de identidade real — existe só pra manter a
  // mesma forma de chamada (execute(input, identity)) que os Drivers
  // reais usam.
  ambiente?: string
}

export type CenarioMock =
  | 'ok'
  | 'timeout'
  | 'erro_soap'
  | 'xml_invalido'
  | 'erro_rest'
  | 'resposta_parcial'

export type MockQuoteInput = {
  cenario: CenarioMock
}

const CENARIOS_VALIDOS: CenarioMock[] = ['ok', 'timeout', 'erro_soap', 'xml_invalido', 'erro_rest', 'resposta_parcial']

function pausar(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function executarCenario(cenario: CenarioMock): Promise<QuoteResponse> {
  switch (cenario) {
    case 'ok':
      return {
        sucesso: true,
        numeroCalculo: 'MOCK-000001',
        dataVersao: new Date().toISOString(),
        modalidades: [
          {
            codigoModalidade: '1',
            descricao: 'Compreensiva (simulada)',
            premioLiquido: 1500,
            custoApolice: 25,
            coberturas: [
              { codigo: 'C1', descricao: 'Colisão (simulada)', valorCobertura: 50000, premioCobertura: 900 },
            ],
          },
        ],
      }

    case 'resposta_parcial':
      // Sucesso, mas incompleto — veio sem modalidades. Testa se quem
      // consome sabe lidar com "sucesso técnico, dado de negócio raso".
      return {
        sucesso: true,
        numeroCalculo: 'MOCK-000002',
        dataVersao: new Date().toISOString(),
        modalidades: [],
      }

    case 'timeout':
      // Nunca deveria terminar antes do Timeout Manager cortar —
      // duração bem maior que o timeout configurado pro Mock.
      await pausar(60000)
      throw new Error('Mock: não deveria chegar aqui — o Timeout Manager deveria ter cortado antes.')

    case 'erro_soap':
      throw new SoapProtocolError(
        'Mock: falha SOAP simulada (Provider indisponível).',
        '<soapenv:Envelope><soapenv:Body><soapenv:Fault><faultstring>Simulado</faultstring></soapenv:Fault></soapenv:Body></soapenv:Envelope>'
      )

    case 'xml_invalido':
      throw new SoapProtocolError(
        'Mock: XML de resposta malformado (parser falhou).',
        '<soapenv:Envelope><soapenv:Body><NAO_FECHOU_A_TAG'
      )

    case 'erro_rest':
      throw new RestProtocolError('Mock: REST retornou erro simulado.', 500, { erro: 'simulado' })

    default:
      throw new Error(`Mock: cenário desconhecido.`)
  }
}

export const mockInsuranceQuoteDriver: ProviderDriver<MockQuoteInput, QuoteResponse, MockIdentity> = {
  nome: 'MockInsuranceQuoteDriver',
  provider: 'mock',
  capability: 'cotacao',
  contrato: 'mock/cotacao',
  versao: '1.0',
  status: 'homologacao',
  ambiente: 'sandbox',

  async authenticate() {
    // Provider interno — sem autenticação real.
  },

  async health() {
    // Mock não depende de rede — sempre 'ok', por definição.
    return 'ok'
  },

  validate(input) {
    const erros: string[] = []
    if (!input?.cenario) erros.push('cenario é obrigatório.')
    else if (!CENARIOS_VALIDOS.includes(input.cenario)) {
      erros.push(`cenario inválido: "${input.cenario}". Válidos: ${CENARIOS_VALIDOS.join(', ')}.`)
    }
    return { valido: erros.length === 0, erros }
  },

  async execute(input) {
    return executarCenario(input.cenario)
  },

  normalize(saida) {
    return saida
  },

  capabilities() {
    return ['cotacao']
  },
}
