/**
 * MOTOR UNIVERSAL — Identificação de formato (DOC-COM-002, Passo 3 / Seção 4)
 *
 * A assinatura NUNCA é "coluna 1 = recibo, coluna 2 = apólice" — é a
 * combinação dos rótulos de cabeçalho que aparecem no documento,
 * normalizados. Isso é o que sobrevive a mudança de ordem de coluna
 * (mesma seguradora reorganizando o relatório continua reconhecível,
 * porque os RÓTULOS continuam lá, só a posição muda).
 */

const crypto = require('crypto')

// Rótulos "candidatos a cabeçalho": tokens curtos, sem número, que
// aparecem na região inicial do documento (antes da primeira linha de
// dado reconhecível). Isso é deliberadamente genérico — não assume o
// vocabulário de nenhuma seguradora específica.
function extrairCandidatosCabecalho(linhas, limiteLinhas = 60) {
  const regiao = linhas.slice(0, limiteLinhas)
  return regiao.filter((l) => {
    const semNumeros = !/\d/.test(l)
    const tamanhoRazoavel = l.length >= 2 && l.length <= 40
    return semNumeros && tamanhoRazoavel
  })
}

/**
 * Gera a assinatura estrutural: hash estável de um conjunto normalizado
 * de rótulos de cabeçalho. Documentos com os mesmos rótulos (mesma
 * ordem ou não) geram a MESMA assinatura — isso é o que permite
 * detectar "mesma seguradora, mesmo tipo de relatório" mesmo se a
 * ordem das colunas mudar.
 */
function calcularAssinaturaEstrutural(linhas) {
  const candidatos = extrairCandidatosCabecalho(linhas)
  const normalizados = [...new Set(candidatos.map((c) => c.toUpperCase().trim()))].sort()
  const hash = crypto.createHash('sha256').update(normalizados.join('|')).digest('hex')
  return { hash, camposDetectados: normalizados }
}

/**
 * Confere se uma estratégia conhecida (código) é compatível com os
 * campos detectados no documento — usa o `camposEsperados` que cada
 * estratégia declara (ver estrategias/suhai.cjs). Compatibilidade por
 * CONTEÚDO dos rótulos, nunca por posição.
 */
function estrategiaCompativel(estrategia, camposDetectados) {
  const detectadosSet = new Set(camposDetectados)
  const encontrados = estrategia.camposEsperados.filter((c) => detectadosSet.has(c.toUpperCase()))
  // Exige que a maioria dos campos esperados apareça — tolera alguma
  // variação sem exigir 100% idêntico letra por letra.
  return encontrados.length / estrategia.camposEsperados.length >= 0.7
}

module.exports = { calcularAssinaturaEstrutural, estrategiaCompativel, extrairCandidatosCabecalho }
