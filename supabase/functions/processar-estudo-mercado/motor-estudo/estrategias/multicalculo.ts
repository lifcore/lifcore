/**
 * MOTOR DE ESTUDO DE MERCADO (Edge Function) — Estratégia Multicálculo
 * SPEC-001 §2: "Extração determinística primeiro; IA somente em etapa
 * posterior e opcional."
 *
 * ESCOPO REAL DESTE PARSER (transparência, mesmo espírito da nota em
 * processar-lote/index.ts): a extração de PDF via pdf-parse preserva a
 * tabela comparativa linha a linha — cada linha lógica (Modalidade,
 * Acomodação, faixa etária) vira uma linha de texto com valores
 * separados por espaço. Isso é confiável para:
 *   - linhas numéricas (faixas etárias e total) — formato inequívoco;
 *   - linhas de atributo (Modalidade/Acomodação/Coparticipação) — via
 *     casamento contra um vocabulário conhecido;
 *   - o bloco de nome de operadora/plano — quando aparece uma linha por
 *     coluna, um padrão observado no documento de amostra.
 * QUALQUER uma dessas etapas que não fechar de forma inequívoca faz a
 * função devolver `sucesso: false` — o motor então cai para IA
 * automaticamente (extracao-adaptativa), nunca força um resultado
 * incerto. Este comportamento só pode ser validado de verdade com
 * upload real (mesma ressalva já aplicada ao restante do Motor Universal).
 */

const REGEX_FAIXA = /^(\d{1,3}\s*(?:a|-)\s*\d{1,3}|\d{1,3}\s*(?:ou mais|\+))\b\s*(.*)$/i
const REGEX_MULTIPLICADOR = /^\d+\s*x\b/i
const REGEX_VALOR_BR = /^\d{1,3}(?:\.\d{3})*,\d{2}$/

const VOCABULARIO_MODALIDADE = ['Saúde PME', 'Saúde Empresarial', 'Saúde Individual', 'Odonto PME', 'Odonto Empresarial']
const VOCABULARIO_ACOMODACAO = ['Apartamento', 'Enfermaria', 'Coletivo']
const VOCABULARIO_COPARTICIPACAO = ['Sem Coparticipação', 'Coparticipação Parcial', 'Coparticipação Completa', 'Parcial', 'Completa', 'Integral']

export interface PropostaExtraida {
  colunaChave: string
  operadoraNomeExtraido: string | null
  plano: string | null
  modalidade: string | null
  acomodacao: string | null
  coparticipacao: string | null
  valorTotalMensal: number | null
  faixas: { faixaEtaria: string; valor: number | null }[]
}

interface ResultadoParser {
  sucesso: boolean
  motivo: string
  propostas: PropostaExtraida[]
}

/** Remove um "N x" no início da linha (multiplicador visto no documento de amostra) */
function removerMultiplicador(texto: string): string {
  return texto.replace(REGEX_MULTIPLICADOR, '').trim()
}

/**
 * Casa uma lista de tokens contra um vocabulário conhecido, tentando o
 * casamento mais longo primeiro (greedy), até formar exatamente `n`
 * segmentos. Se não conseguir, devolve null — nunca aproxima.
 */
function dividirPorVocabulario(textoRestante: string, vocabulario: string[], n: number): string[] | null {
  const tokens = textoRestante.split(/\s+/).filter(Boolean)
  const vocabOrdenado = [...vocabulario].sort((a, b) => b.split(' ').length - a.split(' ').length)
  const resultado: string[] = []
  let cursor = 0

  while (cursor < tokens.length && resultado.length < n) {
    let casou = false
    for (const frase of vocabOrdenado) {
      const partesFrase = frase.split(' ')
      const janela = tokens.slice(cursor, cursor + partesFrase.length).join(' ')
      if (janela.toLowerCase() === frase.toLowerCase()) {
        resultado.push(frase)
        cursor += partesFrase.length
        casou = true
        break
      }
    }
    if (!casou) return null
  }

  return resultado.length === n && cursor === tokens.length ? resultado : null
}

/** Extrai N valores em formato brasileiro (250,00) de uma linha, após remover o rótulo. */
function extrairValoresBR(textoRestante: string): number[] {
  return textoRestante
    .split(/\s+/)
    .filter((t) => REGEX_VALOR_BR.test(t))
    .map((t) => Number(t.replace(/\./g, '').replace(',', '.')))
}

export function parsearMulticalculo(linhas: string[]): ResultadoParser {
  const falhar = (motivo: string): ResultadoParser => ({ sucesso: false, motivo, propostas: [] })

  // 1. Ancora: primeira linha de faixa etária define N (contagem de colunas),
  //    pela contagem inequívoca de valores em formato monetário BR.
  const indiceFaixaBase = linhas.findIndex((l) => REGEX_FAIXA.test(l))
  if (indiceFaixaBase === -1) {
    return falhar('Nenhuma linha de faixa etária reconhecida — layout não é o Multicálculo esperado.')
  }

  const matchBase = linhas[indiceFaixaBase].match(REGEX_FAIXA)!
  const restoBase = removerMultiplicador(matchBase[2])
  const valoresBase = extrairValoresBR(restoBase)
  const n = valoresBase.length
  if (n < 2) {
    return falhar(`Linha de faixa etária base não rendeu colunas suficientes (${n}) — não é seguro assumir a estrutura.`)
  }

  // 2. Todas as linhas de faixa etária a partir daí, mesma contagem N obrigatória.
  const faixasPorColuna: { faixaEtaria: string; valores: number[] }[] = []
  let indiceUltimaFaixa = indiceFaixaBase
  for (let i = indiceFaixaBase; i < linhas.length; i++) {
    const m = linhas[i].match(REGEX_FAIXA)
    if (!m) {
      // primeira linha que não é faixa depois de já termos pelo menos uma — provavelmente é o total ou fim da tabela
      if (faixasPorColuna.length > 0) break
      continue
    }
    const resto = removerMultiplicador(m[2])
    const valores = extrairValoresBR(resto)
    if (valores.length !== n) {
      return falhar(`Faixa "${m[1]}" tem ${valores.length} valores, esperado ${n} — divergência de coluna, não é seguro completar sem revisão.`)
    }
    faixasPorColuna.push({ faixaEtaria: m[1].trim(), valores })
    indiceUltimaFaixa = i
  }

  // 3. Linha de total — logo após a última faixa, mesma contagem N, só números.
  let totais: number[] | null = null
  for (let i = indiceUltimaFaixa + 1; i < Math.min(indiceUltimaFaixa + 4, linhas.length); i++) {
    const valores = extrairValoresBR(linhas[i])
    if (valores.length === n) {
      totais = valores
      break
    }
    if (linhas[i].trim().length > 0 && valores.length > 0) break // achou algo numérico mas não bateu — não arrisca
  }

  // 4. Linhas de atributo — Modalidade / Acomodação / Coparticipação — por vocabulário.
  function extrairAtributo(rotulo: string, vocabulario: string[]): (string | null)[] | null {
    const idx = linhas.findIndex((l) => new RegExp(`^${rotulo}\\b`, 'i').test(l.trim()))
    if (idx === -1) return new Array(n).fill(null) // atributo ausente é aceitável (campo opcional)
    const resto = linhas[idx].replace(new RegExp(`^${rotulo}\\s*`, 'i'), '').trim()
    const dividido = dividirPorVocabulario(resto, vocabulario, n)
    return dividido // null se não fechou — tratado pelo chamador
  }

  const modalidades = extrairAtributo('Modalidade', VOCABULARIO_MODALIDADE)
  const acomodacoes = extrairAtributo('Acomodação', VOCABULARIO_ACOMODACAO)
  const coparticipacoes = extrairAtributo('Coparticipação', VOCABULARIO_COPARTICIPACAO)

  if (modalidades === null || acomodacoes === null || coparticipacoes === null) {
    return falhar('Linha de atributo (Modalidade/Acomodação/Coparticipação) não fechou em segmentos exatos pelo vocabulário conhecido — risco de casar valor com coluna errada.')
  }

  // 5. Cabeçalho de operadora/plano — bloco de N linhas curtas (nome do
  //    plano) precedido por outro bloco de N linhas curtas (nome da
  //    operadora), imediatamente acima da linha "Modalidade".
  const indiceModalidade = linhas.findIndex((l) => /^Modalidade\b/i.test(l.trim()))
  function coletarBlocoAcima(fimExclusivo: number, tamanho: number): string[] | null {
    const inicio = fimExclusivo - tamanho
    if (inicio < 0) return null
    const bloco = linhas.slice(inicio, fimExclusivo)
    // Nome de plano pode ter dígito no meio (ex: "P420", "S750") — só
    // rejeita linha que É um valor monetário ou uma faixa etária (sinal
    // de que já saímos do bloco de cabeçalho), não qualquer dígito.
    const valido = bloco.every((l) => {
      const t = l.trim()
      return t.length >= 1 && t.length <= 40 && !REGEX_VALOR_BR.test(t) && !REGEX_FAIXA.test(t)
    })
    return valido ? bloco.map((l) => l.trim()) : null
  }

  let cursorHeader = indiceModalidade === -1 ? indiceFaixaBase : indiceModalidade
  // Pula linhas de rótulo de seção (ex: "Geral") entre o header e Modalidade
  while (cursorHeader > 0 && /^geral$/i.test(linhas[cursorHeader - 1].trim())) cursorHeader--

  const nomesPlano = coletarBlocoAcima(cursorHeader, n)
  const nomesOperadora = nomesPlano ? coletarBlocoAcima(cursorHeader - n, n) : null

  if (!nomesPlano || !nomesOperadora) {
    return falhar('Bloco de nome de operadora/plano acima da tabela não teve o formato esperado (uma linha curta por coluna) — extraindo valores por IA para não arriscar vínculo de plano errado.')
  }

  // 6. Monta as propostas — coluna_chave é a defesa contra "Bronze SP" x "Bronze SP Mais".
  const propostas: PropostaExtraida[] = []
  for (let col = 0; col < n; col++) {
    const colunaChave = `${nomesOperadora[col]}|${nomesPlano[col]}|${acomodacoes[col] ?? ''}`
    propostas.push({
      colunaChave,
      operadoraNomeExtraido: nomesOperadora[col],
      plano: nomesPlano[col],
      modalidade: modalidades[col],
      acomodacao: acomodacoes[col],
      coparticipacao: coparticipacoes[col],
      valorTotalMensal: totais ? totais[col] : null,
      faixas: faixasPorColuna.map((f) => ({ faixaEtaria: f.faixaEtaria, valor: f.valores[col] })),
    })
  }

  return { sucesso: true, motivo: 'Estrutura reconhecida e todas as linhas fecharam em colunas exatas.', propostas }
}
