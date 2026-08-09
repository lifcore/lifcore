// _shared/connect/drivers/tokio/tokioQuoteDriver.contract.ts
//
// CONNECT-004D — adapta o Driver de Cotação já existente
// (tokioQuoteDriver.ts, CONNECT-005) pro Provider Driver Contract.
// Não altera o arquivo original — só envolve `cotar()` num objeto
// padronizado que o Provider Gateway sabe consumir.

import { cotar } from './tokioQuoteDriver.ts'
import type { ProviderDriver } from '../../contract/providerDriver.ts'
import type { QuoteRequest, QuoteResponse } from '../../models/quote.ts'
import type { TokioIdentity } from './tokioVehicleDriver.ts'

export const tokioQuoteDriver: ProviderDriver<QuoteRequest, QuoteResponse, TokioIdentity> = {
  nome: 'TokioQuoteDriver',
  provider: 'tokio',
  capability: 'cotacao',
  contrato: 'CotacaoWS.cotar',
  versao: '1.0',
  status: 'homologacao',
  ambiente: 'sandbox',

  async authenticate() {
    // Tokio não tem passo de autenticação separado — identidade
    // (codigoCorretor/codigoUsuario/codigoOperadora) vai em cada
    // request. No-op documentado, não omitido.
  },

  async health() {
    // Sem endpoint de health dedicado na Tokio. Retornar 'ok' aqui
    // seria inventar uma checagem que não existe — fica pra quando o
    // Test Harness (CONNECT-004F) definir um proxy de saúde (ex: uma
    // chamada leve e barata, tipo listar produtos).
    return 'nao_verificado'
  },

  validate(request) {
    const erros: string[] = []
    if (!request?.segurado?.cpfCnpj) erros.push('segurado.cpfCnpj é obrigatório.')
    if (!request?.segurado?.nome) erros.push('segurado.nome é obrigatório.')
    if (!request?.veiculo?.idVeiculo) erros.push('veiculo.idVeiculo é obrigatório (resolvido via TokioVehicleSearchDriver).')
    if (!request?.vigencia?.inicio || !request?.vigencia?.fim) erros.push('vigencia.inicio e vigencia.fim são obrigatórios.')
    return { valido: erros.length === 0, erros }
  },

  async execute(request, identity) {
    return cotar(request, identity)
  },

  normalize(saida) {
    // cotar() já devolve QuoteResponse normalizado (normalizarResposta
    // interna do driver original) — normalize() aqui é identidade.
    return saida
  },

  capabilities() {
    return ['cotacao']
  },
}
