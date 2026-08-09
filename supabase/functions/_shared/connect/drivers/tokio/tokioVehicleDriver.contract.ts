// _shared/connect/drivers/tokio/tokioVehicleDriver.contract.ts
//
// CONNECT-004D — adapta os 3 Drivers já existentes em
// tokioVehicleDriver.ts (CONNECT-005) pro Provider Driver Contract.
// Não altera o arquivo original. Cada função vira seu próprio Driver
// registrável — mesmo princípio "um Driver por Capability" da
// REV.002, aplicado às 3 capabilities que hoje moram juntas no mesmo
// arquivo fonte.

import { buscarVeiculosPorDescricao, consultarValorMercado, listarProdutos } from './tokioVehicleDriver.ts'
import type { TokioIdentity } from './tokioVehicleDriver.ts'
import type { VeiculoConsultado } from '../../models/quote.ts'
import type { ProviderDriver } from '../../contract/providerDriver.ts'

// ---------------------------------------------------------------
// TokioProductListDriver — capability 'codigo_produto'
// ---------------------------------------------------------------

export type ListarProdutosInput = Record<string, never>
export type ListarProdutosOutput = Array<{ codigo: number; descricao: string }>

export const tokioProductListDriver: ProviderDriver<ListarProdutosInput, ListarProdutosOutput, TokioIdentity> = {
  nome: 'TokioProductListDriver',
  provider: 'tokio',
  capability: 'codigo_produto',
  contrato: 'Auto/consultas/codigoProduto',
  versao: '1.0',
  status: 'homologacao',
  ambiente: 'sandbox',

  async authenticate() {
    // Sem passo de autenticação separado — mesma identidade por request.
  },

  async health() {
    return 'nao_verificado'
  },

  validate() {
    // Sem parâmetros de entrada — só a identity, que o Gateway já exige.
    return { valido: true, erros: [] }
  },

  async execute(_input, identity) {
    return listarProdutos(identity)
  },

  normalize(saida) {
    return saida
  },

  capabilities() {
    return ['codigo_produto']
  },
}

// ---------------------------------------------------------------
// TokioVehicleSearchDriver — capability 'consulta_veiculo'
// ---------------------------------------------------------------

export type ConsultaVeiculoInput = {
  descricao: string
  codigoProduto: string
  inicioVigencia: string // DD/MM/AAAA
  anoModelo?: string
}

export const tokioVehicleSearchDriver: ProviderDriver<ConsultaVeiculoInput, VeiculoConsultado[], TokioIdentity> = {
  nome: 'TokioVehicleSearchDriver',
  provider: 'tokio',
  capability: 'consulta_veiculo',
  contrato: 'Auto/consultas/modelos',
  versao: '1.0',
  status: 'homologacao',
  ambiente: 'sandbox',

  async authenticate() {
    // Sem passo de autenticação separado.
  },

  async health() {
    return 'nao_verificado'
  },

  validate(input) {
    const erros: string[] = []
    if (!input?.descricao) erros.push('descricao é obrigatória.')
    if (!input?.codigoProduto) erros.push('codigoProduto é obrigatório (confirmado contra sandbox real — idMsg=302 sem ele).')
    if (!input?.inicioVigencia) erros.push('inicioVigencia é obrigatório (confirmado contra sandbox real — idMsg=306 sem ele).')
    return { valido: erros.length === 0, erros }
  },

  async execute(input, identity) {
    return buscarVeiculosPorDescricao(identity, input.descricao, input.codigoProduto, input.inicioVigencia, input.anoModelo)
  },

  normalize(saida) {
    return saida
  },

  capabilities() {
    return ['consulta_veiculo']
  },
}

// ---------------------------------------------------------------
// TokioMarketValueDriver — capability 'valor_mercado'
// ---------------------------------------------------------------

export type ConsultaValorMercadoInput = {
  idVeiculo: string
  anoModelo: string
  zeroKm: boolean
}

export const tokioMarketValueDriver: ProviderDriver<ConsultaValorMercadoInput, number, TokioIdentity> = {
  nome: 'TokioMarketValueDriver',
  provider: 'tokio',
  capability: 'valor_mercado',
  contrato: 'Auto/consultas/valorMercado',
  versao: '1.0',
  status: 'homologacao',
  ambiente: 'sandbox',

  async authenticate() {
    // Sem passo de autenticação separado.
  },

  async health() {
    return 'nao_verificado'
  },

  validate(input) {
    const erros: string[] = []
    if (!input?.idVeiculo) erros.push('idVeiculo é obrigatório.')
    if (!input?.anoModelo) erros.push('anoModelo é obrigatório.')
    if (typeof input?.zeroKm !== 'boolean') erros.push('zeroKm é obrigatório (true/false).')
    return { valido: erros.length === 0, erros }
  },

  async execute(input, identity) {
    return consultarValorMercado(identity, input.idVeiculo, input.anoModelo, input.zeroKm)
  },

  normalize(saida) {
    return saida
  },

  capabilities() {
    return ['valor_mercado']
  },
}
