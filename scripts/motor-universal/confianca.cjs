/**
 * MOTOR UNIVERSAL — Detecção de alteração + Níveis de confiança
 * (DOC-COM-002, Passo 7 / Seção 7 e 11)
 */

const NIVEIS = { ALTA: 'alta', REVISAO: 'revisao', BLOQUEADO: 'bloqueado' }

/**
 * Compara a assinatura do documento atual com a assinatura gravada no
 * formato homologado. Se a seguradora+tipo já tem formato homologado
 * mas a assinatura mudou, isso é ALTERAÇÃO — nunca reprocessa
 * silenciosamente com a estratégia antiga.
 */
function detectarAlteracao(formatoHomologado, assinaturaAtual) {
  if (!formatoHomologado) return { alterado: false } // não é alteração, é formato novo — fluxo diferente
  const mudou = formatoHomologado.assinatura_estrutural !== assinaturaAtual.hash
  return { alterado: mudou }
}

/**
 * Consolida tudo (situação do formato + validações) num nível único
 * de confiança, que é o que decide o que a UI mostra e o que o motor
 * faz a seguir.
 */
function calcularConfianca({ formatoEncontrado, alteracaoDetectada, origemExtracao, validacao }) {
  if (!validacao.aprovado) {
    return { nivel: NIVEIS.BLOQUEADO, motivo: `Inconsistência: ${validacao.falhas.join('; ')}` }
  }
  if (alteracaoDetectada) {
    return { nivel: NIVEIS.REVISAO, motivo: 'Formato conhecido, mas a estrutura do documento mudou desde a última homologação.' }
  }
  if (!formatoEncontrado) {
    const motivoOrigem = origemExtracao === 'adaptativa'
      ? 'nenhuma estratégia conhecida reconheceu este documento — extração adaptativa por IA.'
      : 'uma estratégia de código já reconhece este formato, mas ele ainda não foi homologado formalmente pra esta seguradora.'
    return { nivel: NIVEIS.REVISAO, motivo: `Formato ainda não homologado — ${motivoOrigem} Precisa de confirmação do Gestor antes de virar conhecimento reutilizável.` }
  }
  return { nivel: NIVEIS.ALTA, motivo: 'Formato homologado, estrutura confere, validações aprovadas.' }
}

module.exports = { NIVEIS, detectarAlteracao, calcularConfianca }
