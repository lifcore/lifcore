/**
 * MOTOR UNIVERSAL (Edge Function) — Detecção de alteração + confiança
 * Porte de scripts/motor-universal/confianca.cjs — lógica idêntica.
 */

export const NIVEIS = { ALTA: 'alta', REVISAO: 'revisao', BLOQUEADO: 'bloqueado' } as const

export function detectarAlteracao(
  formatoHomologado: { assinatura_estrutural: string } | null,
  assinaturaAtual: { hash: string }
) {
  if (!formatoHomologado) return { alterado: false }
  const mudou = formatoHomologado.assinatura_estrutural !== assinaturaAtual.hash
  return { alterado: mudou }
}

export function calcularConfianca({
  formatoEncontrado,
  alteracaoDetectada,
  origemExtracao,
  validacao,
}: {
  formatoEncontrado: boolean
  alteracaoDetectada: boolean
  origemExtracao: string
  validacao: { aprovado: boolean; falhas: string[] }
}) {
  if (!validacao.aprovado) {
    return { nivel: NIVEIS.BLOQUEADO, motivo: `Inconsistência: ${validacao.falhas.join('; ')}` }
  }
  if (alteracaoDetectada) {
    return { nivel: NIVEIS.REVISAO, motivo: 'Formato conhecido, mas a estrutura do documento mudou desde a última homologação.' }
  }
  if (!formatoEncontrado) {
    const motivoOrigem =
      origemExtracao === 'adaptativa'
        ? 'nenhuma estratégia conhecida reconheceu este documento — extração adaptativa por IA.'
        : 'uma estratégia de código já reconhece este formato, mas ele ainda não foi homologado formalmente pra esta seguradora.'
    return { nivel: NIVEIS.REVISAO, motivo: `Formato ainda não homologado — ${motivoOrigem} Precisa de confirmação do Gestor antes de virar conhecimento reutilizável.` }
  }
  return { nivel: NIVEIS.ALTA, motivo: 'Formato homologado, estrutura confere, validações aprovadas.' }
}
