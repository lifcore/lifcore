// _shared/connect/drivers/tokio/tokioQuoteDriver.ts
//
// CONNECT-004 REV.002 — Driver por Capability: SÓ Cotação.
// É este arquivo — e nenhum outro do sistema — que sabe que a Tokio
// fala SOAP e que o campo se chama "CGC_CPF". O resto do LifCore
// nunca vê isso (REV.002, Diretriz 4).

import { chamarSoap } from '../../protocol/soapClient.ts'
import type { QuoteRequest, QuoteResponse } from '../../models/quote.ts'
import type { TokioIdentity } from './tokioVehicleDriver.ts'

const NAMESPACE = 'CotacaoWS'
const METODO = 'cotar'

/** Traduz o modelo interno (QuoteRequest) pro formato de payload que a Tokio exige. */
function montarPayloadTokio(request: QuoteRequest, identity: TokioIdentity) {
  return {
    codigoCorretor: identity.codigoCorretor,
    codigoUsuario: identity.codigoUsuario,
    codigoOperadora: identity.codigoOperadora,
    xmlEnvio: {
      Calculo: {
        CpfEmissor: identity.codigoUsuario, // NOTA: confirmar se é o mesmo valor ou um CPF distinto do emissor da venda
        Segurado: {
          NomeSegurado: request.segurado.nome,
          CGC_CPF: request.segurado.cpfCnpj,
          TelefoneSegurado: request.segurado.telefone ?? '',
          EmailSegurado: request.segurado.email ?? '',
        },
        Item: {
          IdVeiculo: request.veiculo.idVeiculo,
          AnoModelo: request.veiculo.anoModelo,
          ZeroKm: request.veiculo.zeroKm ? 'S' : 'N',
          Placa: request.veiculo.placa ?? '',
          Chassi: request.veiculo.chassi ?? '',
          CodigoFranquia: request.cobertura.codigoFranquia ?? '',
          ClasseBonus: request.cobertura.classeBonus ?? '',
          InicioVigencia: formatarDataBR(request.vigencia.inicio),
          FinalVigencia: formatarDataBR(request.vigencia.fim),
          CoberturasAdicionais: request.cobertura.codigosCoberturaSelecionados.map((codigo) => ({ CodigoCobertura: codigo })),
        },
      },
    },
  }
}

/** Traduz a resposta bruta da Tokio (já parseada de XML pra objeto) pro modelo interno normalizado. */
function normalizarResposta(bruto: Record<string, unknown>): QuoteResponse {
  const retorno = bruto?.['Retorno'] as Record<string, unknown> | undefined

  const erros = retorno?.['Erros'] as { Mensagem?: string | string[] } | undefined
  if (erros?.Mensagem) {
    const mensagens = Array.isArray(erros.Mensagem) ? erros.Mensagem : [erros.Mensagem]
    return { sucesso: false, erros: mensagens }
  }

  const calculo = retorno?.['Calculo'] as Record<string, unknown> | undefined
  if (!calculo) {
    return { sucesso: false, erros: ['Resposta da Tokio sem Calculo nem Erros — formato inesperado.'] }
  }

  const itens = calculo['Itens'] as Record<string, unknown> | undefined
  const item = itens?.['Item'] as Record<string, unknown> | undefined
  const modalidadesRaw = item?.['Modalidades'] as { Modalidade?: unknown } | undefined
  const listaModalidades = modalidadesRaw?.Modalidade ? (Array.isArray(modalidadesRaw.Modalidade) ? modalidadesRaw.Modalidade : [modalidadesRaw.Modalidade]) : []

  return {
    sucesso: true,
    numeroCalculo: String(calculo['NumeroCalculo'] ?? ''),
    dataVersao: String(calculo['DataVersao'] ?? ''),
    modalidades: (listaModalidades as Array<Record<string, unknown>>).map((m) => ({
      codigoModalidade: String(m['CodigoModalidade'] ?? ''),
      descricao: String(m['DescricaoModalidade'] ?? ''),
      premioLiquido: parseFloat(String(m['PremioLiquido'] ?? '0')),
      custoApolice: parseFloat(String(m['CustoApolice'] ?? '0')),
      coberturas: normalizarCoberturas(m['Coberturas']),
    })),
  }
}

function normalizarCoberturas(bruto: unknown): Array<{ codigo: string; descricao: string; valorCobertura: number; premioCobertura: number }> {
  const coberturasObj = bruto as { Cobertura?: unknown } | undefined
  if (!coberturasObj?.Cobertura) return []
  const lista = Array.isArray(coberturasObj.Cobertura) ? coberturasObj.Cobertura : [coberturasObj.Cobertura]
  return (lista as Array<Record<string, unknown>>).map((c) => ({
    codigo: String(c['CodigoCobertura'] ?? ''),
    descricao: String(c['DescricaoCobertura'] ?? ''),
    valorCobertura: parseFloat(String(c['ValorCobertura'] ?? '0')),
    premioCobertura: parseFloat(String(c['PremioCobertura'] ?? '0')),
  }))
}

function formatarDataBR(isoDate: string): string {
  const [ano, mes, dia] = isoDate.split('-')
  return `${dia}/${mes}/${ano}`
}

/** Ponto de entrada único deste Driver — é só isso que o Provider Gateway chama. */
export async function cotar(request: QuoteRequest, identity: TokioIdentity): Promise<QuoteResponse> {
  const payload = montarPayloadTokio(request, identity)

  const respostaBruta = await chamarSoap({
    baseUrl: identity.baseUrl,
    endpointPath: '/TmsWS/Auto/Cotacao',
    namespace: NAMESPACE,
    metodo: METODO,
    corpo: payload,
  })

  return normalizarResposta(respostaBruta)
}
