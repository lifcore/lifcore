/**
 * MOTOR DE ESTUDO DE MERCADO (Edge Function) — Rede Credenciada (Passada 2)
 *
 * A matriz prestador × plano × código é grande, esparsa e sem um padrão
 * de coluna tão previsível quanto a tabela comparativa (nomes de
 * hospital têm tamanho e formato muito mais variados). Por isso, ao
 * contrário da Passada 1, esta passada usa IA desde já — chunkada por
 * tamanho de linhas para não estourar o contexto nem arriscar a IA
 * "perder a coluna" no meio de um bloco gigante. Uma vez que o layout de
 * um tipo de documento for homologado com dado real (mesmo mecanismo já
 * usado no Motor Universal), uma estratégia determinística pode ser
 * adicionada aqui depois — não nesta primeira entrega.
 *
 * O código bruto (ex: "H¹,M,PS¹") NUNCA é interpretado aqui — só
 * capturado como está. A interpretação de sigla usa `legenda.ts` à
 * parte, sobre o texto integral do documento.
 */

import { interpretarRedeChunkComIA } from './ia-providers/index.ts'

const TAMANHO_CHUNK_LINHAS = 120

export interface LinhaRedeExtraida {
  prestador: string
  regiao: string | null
  tipo: 'hospital' | 'laboratorio' | 'clinica'
  colunaChave: string
  codigoBruto: string | null
  paginaOrigem: number | null
}

/** Localiza o bloco de Rede Credenciada dentro do texto integral do documento. */
export function extrairBlocoRedeCredenciada(linhas: string[]): { inicio: number; fim: number } | null {
  const inicio = linhas.findIndex((l) => /rede\s+credenciada/i.test(l))
  if (inicio === -1) return null
  const fimLegenda = linhas.findIndex((l, i) => i > inicio && /^legenda\s*:?\s*$/i.test(l.trim()))
  const fim = fimLegenda === -1 ? linhas.length : fimLegenda
  return { inicio, fim }
}

function dividirEmChunks(linhas: string[]): string[][] {
  const chunks: string[][] = []
  for (let i = 0; i < linhas.length; i += TAMANHO_CHUNK_LINHAS) {
    chunks.push(linhas.slice(i, i + TAMANHO_CHUNK_LINHAS))
  }
  return chunks
}

/**
 * Processa a Rede Credenciada inteira, chunk a chunk. Cada chunk que
 * falhar (erro de IA, resposta inválida) é registrado no resumo mas não
 * derruba os chunks que já deram certo — rede parcial é melhor que
 * nenhuma, e o resumo deixa claro o que faltou (nunca silencioso).
 */
export async function processarRedeCredenciada(
  linhasRedeBruto: string[],
  colunasConhecidas: string[]
): Promise<{ linhas: LinhaRedeExtraida[]; chunksTotais: number; chunksComErro: number; erros: string[] }> {
  if (colunasConhecidas.length === 0) {
    return { linhas: [], chunksTotais: 0, chunksComErro: 0, erros: ['Nenhuma coluna conhecida da Passada 1 — Rede Credenciada não processada para evitar vínculo às cegas.'] }
  }

  const chunks = dividirEmChunks(linhasRedeBruto)
  const linhasExtraidas: LinhaRedeExtraida[] = []
  const erros: string[] = []
  let chunksComErro = 0

  for (const chunk of chunks) {
    const textoChunk = chunk.join('\n')
    if (!textoChunk.trim()) continue
    try {
      const resultado = (await interpretarRedeChunkComIA(textoChunk, colunasConhecidas)) as { linhas: Record<string, unknown>[] }
      for (const l of resultado.linhas) {
        if (typeof l.coluna_chave === 'string' && !colunasConhecidas.includes(l.coluna_chave)) {
          // IA inventou uma coluna que não existe na Passada 1 — descarta a linha, não o chunk inteiro.
          continue
        }
        linhasExtraidas.push({
          prestador: String(l.prestador),
          regiao: (l.regiao as string) ?? null,
          tipo: (l.tipo as 'hospital' | 'laboratorio' | 'clinica') ?? 'hospital',
          colunaChave: String(l.coluna_chave),
          codigoBruto: (l.codigo_bruto as string) ?? null,
          paginaOrigem: (l.pagina_origem as number) ?? null,
        })
      }
    } catch (e) {
      chunksComErro++
      erros.push((e as Error).message)
    }
  }

  return { linhas: linhasExtraidas, chunksTotais: chunks.length, chunksComErro, erros }
}
