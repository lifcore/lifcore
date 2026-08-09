// _shared/connect/resilience/errorClassification.ts
//
// CONNECT-004E — Error Classification (parte do Bloco 04, Retry Policy).
//
// Decide se um erro vale retentar (recuperável) ou não (definitivo).
// Só usa o que os Protocol Handlers já expõem hoje — não inventa
// código de erro que a Tokio não manda pra cá.

import { RestProtocolError } from '../protocol/restClient.ts'
import { SoapProtocolError } from '../protocol/soapClient.ts'
import { TimeoutGatewayError } from './timeoutManager.ts'

export type ClasseErro = 'recuperavel' | 'definitivo'

/**
 * REST: status 5xx ou ausência de status (falha de rede/timeout antes
 * de qualquer resposta) é recuperável. Status 4xx é erro do próprio
 * request (dado inválido, autenticação) — repetir não muda o resultado.
 *
 * SOAP: os clients atuais não expõem um código de erro estruturado da
 * Tokio (rawResponse é XML cru, sem parser de erro de negócio) — sem
 * esse dado, tratar como recuperável é a opção mais segura hoje
 * (timeout/falha de rede é o caso mais comum nesta camada). Quando o
 * Contract Validation (CONNECT-004F) tiver acesso ao código de erro
 * de negócio da Tokio, essa regra fica mais precisa. Limitação
 * conhecida, registrada aqui — não escondida.
 *
 * Qualquer outro erro (validação do próprio Driver, erro de
 * programação) é definitivo — repetir a mesma chamada com o mesmo
 * input nunca dá resultado diferente.
 */
export function classificarErro(erro: unknown): ClasseErro {
  // CORREÇÃO (achada construindo o Mock Provider, CONNECT-004F): sem
  // este caso explícito, TimeoutGatewayError caía no "return
  // 'definitivo'" do final da função — nenhum timeout do Gateway
  // jamais era retentado, contradizendo o próprio propósito do Retry
  // Policy. Timeout é o caso recuperável por excelência.
  if (erro instanceof TimeoutGatewayError) {
    return 'recuperavel'
  }

  if (erro instanceof RestProtocolError) {
    if (!erro.status) return 'recuperavel'
    if (erro.status >= 500) return 'recuperavel'
    return 'definitivo'
  }

  if (erro instanceof SoapProtocolError) {
    return 'recuperavel'
  }

  return 'definitivo'
}
