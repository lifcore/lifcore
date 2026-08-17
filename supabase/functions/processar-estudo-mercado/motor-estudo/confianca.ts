/**
 * MOTOR DE ESTUDO DE MERCADO (Edge Function) — Confiança
 * Mesma régua ALTA/REVISAO/BLOQUEADO do Motor Universal
 * (processar-lote/motor-universal/confianca.ts), adaptada: aqui a
 * confiança do lote é decidida pela Passada 1 (Propostas), que é o dado
 * crítico. A Passada 2 (Rede Credenciada) tem seu próprio resumo, guardado
 * à parte em `receita_extracao` — uma rede parcial nunca derruba a
 * confiança das Propostas, que são o que o Estudo Financeiro depende.
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
        ? 'o parser determinístico não conseguiu reconstruir a tabela com segurança — extração adaptativa por IA.'
        : 'uma estratégia determinística já reconhece este formato, mas ele ainda não foi homologado formalmente.'
    return { nivel: NIVEIS.REVISAO, motivo: `Formato ainda não homologado — ${motivoOrigem} Precisa de confirmação do corretor antes de virar conhecimento reutilizável.` }
  }
  return { nivel: NIVEIS.ALTA, motivo: 'Formato homologado, estrutura confere, validações aprovadas.' }
}
