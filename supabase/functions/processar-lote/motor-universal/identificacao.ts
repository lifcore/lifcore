/**
 * MOTOR UNIVERSAL (Edge Function) — Identificação de formato
 * Porte de scripts/motor-universal/identificacao.cjs — mesma lógica,
 * só adaptada pro runtime Deno (crypto.subtle é async aqui, Node
 * crypto era síncrono).
 */

function extrairCandidatosCabecalho(linhas: string[], limiteLinhas = 60): string[] {
  const regiao = linhas.slice(0, limiteLinhas)
  return regiao.filter((l) => {
    const semNumeros = !/\d/.test(l)
    const tamanhoRazoavel = l.length >= 2 && l.length <= 40
    return semNumeros && tamanhoRazoavel
  })
}

export async function calcularAssinaturaEstrutural(linhas: string[]) {
  const candidatos = extrairCandidatosCabecalho(linhas)
  const normalizados = [...new Set(candidatos.map((c) => c.toUpperCase().trim()))].sort()
  const dados = new TextEncoder().encode(normalizados.join('|'))
  const hashBuffer = await crypto.subtle.digest('SHA-256', dados)
  const hash = Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
  return { hash, camposDetectados: normalizados }
}

export function estrategiaCompativel(estrategia: { camposEsperados: string[] }, camposDetectados: string[]) {
  const detectadosSet = new Set(camposDetectados)
  const encontrados = estrategia.camposEsperados.filter((c) => detectadosSet.has(c.toUpperCase()))
  return encontrados.length / estrategia.camposEsperados.length >= 0.7
}
