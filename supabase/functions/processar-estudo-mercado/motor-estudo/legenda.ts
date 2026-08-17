/**
 * MOTOR DE ESTUDO DE MERCADO (Edge Function) — Legenda
 * SPEC-001 §6: "NÃO HARD-CODAR A LEGENDA. O motor deve localizar e
 * interpretar a legenda existente no documento. Não assumir que H, M,
 * PS, HD, PAG24 ou qualquer outra sigla tenha significado fixo. Sem
 * legenda, preservar a sigla bruta e marcar interpretação pendente."
 *
 * Puramente determinístico — a legenda de um documento como o
 * Multicálculo é sempre uma lista de linhas "SIGLA: significado" ou
 * "SIGLA - significado" no formato "Legenda:" ao final do bloco de rede.
 * Não usa IA: se o padrão não bater, a sigla fica pendente de
 * interpretação humana, nunca adivinhada.
 */

const PADRAO_LINHA_LEGENDA = /^([A-ZÀ-Ú0-9¹²³]{1,8})\s*[:\-–]\s*(.{3,200})$/

export interface EntradaLegenda {
  sigla: string
  significado: string
  paginaOrigem: number | null
}

/**
 * Localiza o bloco de legenda dentro do texto (procura por um marcador
 * "Legenda" nas proximidades, tolerando variações de capitalização) e
 * extrai as entradas sigla → significado.
 */
export function interpretarLegenda(linhas: string[], paginaPorLinha: (number | null)[] = []): EntradaLegenda[] {
  const indiceMarcador = linhas.findIndex((l) => /^legenda\s*:?\s*$/i.test(l.trim()))
  if (indiceMarcador === -1) return []

  const entradas: EntradaLegenda[] = []
  // A legenda normalmente é uma lista curta logo após o marcador — para
  // de procurar se encontrar uma linha claramente fora do padrão depois
  // de já ter achado pelo menos uma entrada, ou depois de 60 linhas sem
  // achar nenhuma (evita varrer o documento inteiro por engano).
  let semMatchSeguidas = 0
  for (let i = indiceMarcador + 1; i < linhas.length; i++) {
    const linha = linhas[i].trim()
    const match = linha.match(PADRAO_LINHA_LEGENDA)
    if (match) {
      entradas.push({
        sigla: match[1].trim(),
        significado: match[2].trim(),
        paginaOrigem: paginaPorLinha[i] ?? null,
      })
      semMatchSeguidas = 0
    } else {
      semMatchSeguidas++
      if (entradas.length > 0 && semMatchSeguidas >= 2) break
      if (entradas.length === 0 && semMatchSeguidas >= 60) break
    }
  }
  return entradas
}

/**
 * Aplica a legenda descoberta a um código bruto (pode ter múltiplas
 * siglas separadas por vírgula, ex: "H¹,M,PS¹"). Siglas sem
 * correspondência na legenda voltam marcadas como pendentes — nunca
 * adivinhadas.
 */
export function interpretarCodigo(codigoBruto: string, legenda: EntradaLegenda[]) {
  const porSigla = new Map(legenda.map((e) => [e.sigla, e.significado]))
  const partes = codigoBruto.split(',').map((p) => p.trim()).filter(Boolean)
  return partes.map((sigla) => ({
    sigla,
    significado: porSigla.get(sigla) ?? null,
    pendente: !porSigla.has(sigla),
  }))
}
