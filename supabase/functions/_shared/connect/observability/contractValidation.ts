// _shared/connect/observability/contractValidation.ts
//
// CONNECT-004F — Contract Validation (Bloco 11 do documento original).
//
// Metadados de quando/como o Contract de cada Driver foi validado
// contra a documentação/sandbox real do Provider. Isto é dado
// ESTÁTICO, atualizado manualmente — não existe forma de detectar
// sozinho quando a Tokio muda a documentação deles. A marcação de
// "Revisão Necessária" é uma ação humana registrada aqui através de
// marcarRevisaoNecessaria(), nunca uma automação.
//
// Datas exatas de validação não foram registradas nas sessões
// anteriores — ficam null aqui em vez de inventadas. Preencher
// quando existir o dado real (nunca inferir).

export type StatusValidacaoContrato = 'validado' | 'revisao_necessaria' | 'nunca_validado'

export type ValidacaoContrato = {
  driverNome: string
  versaoContrato: string
  dataValidacao: string | null // ISO date — null = data exata não registrada
  origemDocumentacao: string
  status: StatusValidacaoContrato
}

const VALIDACOES: Record<string, ValidacaoContrato> = {
  TokioQuoteDriver: {
    driverNome: 'TokioQuoteDriver',
    versaoContrato: '1.0',
    dataValidacao: null,
    origemDocumentacao: 'Documentação oficial Tokio Marine (Auto/Cotação SOAP). Nunca testado contra sandbox real — bloqueio comercial (idMsg=736).',
    status: 'nunca_validado',
  },
  TokioProductListDriver: {
    driverNome: 'TokioProductListDriver',
    versaoContrato: '1.0',
    dataValidacao: null,
    origemDocumentacao: 'Testado contra sandbox real da Tokio antes do bloqueio comercial — comunicação confirmada, respostas de validação reais recebidas.',
    status: 'validado',
  },
  TokioVehicleSearchDriver: {
    driverNome: 'TokioVehicleSearchDriver',
    versaoContrato: '1.0',
    dataValidacao: null,
    origemDocumentacao: 'Testado contra sandbox real — codigoProduto e inicioVigencia confirmados como obrigatórios na prática (idMsg=302/306), mesmo a documentação original dizendo opcional.',
    status: 'validado',
  },
  TokioMarketValueDriver: {
    driverNome: 'TokioMarketValueDriver',
    versaoContrato: '1.0',
    dataValidacao: null,
    origemDocumentacao: 'Documentação oficial Tokio Marine. Nunca testado contra sandbox real.',
    status: 'nunca_validado',
  },
  MockInsuranceQuoteDriver: {
    driverNome: 'MockInsuranceQuoteDriver',
    versaoContrato: '1.0',
    dataValidacao: null,
    origemDocumentacao: 'Provider interno de teste — não representa contrato real de nenhuma seguradora.',
    status: 'validado',
  },
}

export function obterValidacaoContrato(driverNome: string): ValidacaoContrato | undefined {
  return VALIDACOES[driverNome]
}

export function listarValidacoesContrato(): ValidacaoContrato[] {
  return Object.values(VALIDACOES)
}

/**
 * Marca um Driver como precisando de revisão — chamado manualmente
 * (não automaticamente) quando alguém identifica que a Tokio mudou a
 * documentação ou o comportamento real do serviço.
 */
export function marcarRevisaoNecessaria(driverNome: string, motivo: string): boolean {
  const validacao = VALIDACOES[driverNome]
  if (!validacao) return false
  validacao.status = 'revisao_necessaria'
  validacao.origemDocumentacao = `${validacao.origemDocumentacao} — ⚠️ REVISÃO NECESSÁRIA: ${motivo}`
  return true
}
