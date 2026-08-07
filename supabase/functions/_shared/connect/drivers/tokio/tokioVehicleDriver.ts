// _shared/connect/drivers/tokio/tokioVehicleDriver.ts
//
// CONNECT-004 REV.002 — Driver por Capability.
// Este Driver conhece SÓ o serviço "Modelos" (REST) da Tokio.
// Não sabe nada sobre Cotação, Documentos, ou qualquer outra
// Capability — cada uma tem seu próprio Driver.

import { chamarRest } from '../../protocol/restClient.ts'
import type { VeiculoConsultado } from '../../models/quote.ts'

export type TokioIdentity = {
  baseUrl: string
  codigoCorretor: string
  codigoUsuario: string
  codigoOperadora: string
}

type TokioProdutoRestResponse = {
  produtos: Array<{ codigo: number; descricao: string }>
  erros?: { mensagens?: string }
}

/** Lista os produtos disponíveis pra cotação de Auto — é daqui que vem o codigoProduto certo. */
export async function listarProdutos(identity: TokioIdentity): Promise<Array<{ codigo: number; descricao: string }>> {
  const resposta = await chamarRest<TokioProdutoRestResponse>({
    baseUrl: identity.baseUrl,
    endpointPath: '/TmsWS/Auto/consultas/codigoProduto',
    corpo: {
      codigoCorretor: identity.codigoCorretor,
      codigoUsuario: identity.codigoUsuario,
      codigoOperadora: identity.codigoOperadora,
    },
  })

  if (resposta.erros?.mensagens) {
    throw new Error(`Tokio (código produto): ${resposta.erros.mensagens}`)
  }

  return resposta.produtos ?? []
}

type TokioModeloRestResponse = {
  veiculos: Array<{
    idVeiculo: string
    codigoFipe?: string
    codigoMolicar?: string
    descricaoFabricante: string
    descricaoModelo: string
    tipoCombustivel?: string
  }>
  erros?: { mensagens?: string }
}

/**
 * Busca veículos por descrição livre (nome do modelo). A Tokio exige
 * enviar SOMENTE um dos filtros (codigoFipe OU codigoMolicar OU
 * descricao) — este Driver expõe as 3 opções, mas nunca mistura.
 *
 * AJUSTE (confirmado contra o sandbox real): mesmo a doc marcando
 * codigoProduto e inicioVigencia como não-obrigatórios, a API recusa
 * a chamada sem os dois (idMsg=302 e idMsg=306). Viraram parâmetros
 * obrigatórios aqui.
 */
export async function buscarVeiculosPorDescricao(
  identity: TokioIdentity,
  descricao: string,
  codigoProduto: string,
  inicioVigencia: string, // formato DD/MM/AAAA
  anoModelo?: string
): Promise<VeiculoConsultado[]> {
  const resposta = await chamarRest<TokioModeloRestResponse>({
    baseUrl: identity.baseUrl,
    endpointPath: '/TmsWS/Auto/consultas/modelos',
    corpo: {
      codigoCorretor: identity.codigoCorretor,
      codigoUsuario: identity.codigoUsuario,
      codigoOperadora: identity.codigoOperadora,
      codigoProduto,
      anoModelo: anoModelo ?? null,
      codigoFIPE: null,
      tipoCombustivel: null,
      inicioVigencia,
      descricao,
    },
  })

  if (resposta.erros?.mensagens) {
    throw new Error(`Tokio (consulta de veículo): ${resposta.erros.mensagens}`)
  }

  return (resposta.veiculos ?? []).map((v) => ({
    idVeiculo: v.idVeiculo,
    descricaoFabricante: v.descricaoFabricante,
    descricaoModelo: v.descricaoModelo,
    codigoFipe: v.codigoFipe,
    tipoCombustivel: v.tipoCombustivel,
  }))
}

/**
 * Consulta o valor de mercado de um veículo já identificado —
 * Capability separada da busca (são Contracts diferentes, mesma
 * lógica de "um Driver por Capability" do REV.002 se aplicaria a um
 * Driver próprio se isso crescer; por ora, mantido aqui por ser
 * pequeno e do mesmo domínio "veículo").
 */
export async function consultarValorMercado(identity: TokioIdentity, idVeiculo: string, anoModelo: string, zeroKm: boolean): Promise<number> {
  const resposta = await chamarRest<{ valorMercado?: { valor?: string }; erros?: { mensagens?: string } }>({
    baseUrl: identity.baseUrl,
    endpointPath: '/TmsWS/Auto/consultas/valorMercado',
    corpo: {
      codigoCorretor: identity.codigoCorretor,
      codigoUsuario: identity.codigoUsuario,
      codigoOperadora: identity.codigoOperadora,
      idVeiculo,
      anoModelo,
      zeroKm: zeroKm ? 'S' : 'N',
      inicioVigencia: null,
    },
  })

  if (resposta.erros?.mensagens) {
    throw new Error(`Tokio (valor de mercado): ${resposta.erros.mensagens}`)
  }

  const valor = resposta.valorMercado?.valor
  if (!valor) {
    throw new Error('Tokio (valor de mercado): resposta sem valor.')
  }
  return parseFloat(valor)
}
