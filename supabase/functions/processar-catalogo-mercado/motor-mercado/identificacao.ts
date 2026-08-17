/**
 * CONNECT CENTER (Edge Function) — Identificação de formato.
 * Mesma lógica já usada no Motor Universal e no Motor de Estudo de
 * Mercado — cópia própria (cada Edge Function é um bundle independente).
 */

function extrairCandidatosCabecalho(linhas: string[], limiteLinhas = 80): string[] {
  const regiao = linhas.slice(0, limiteLinhas)
  return regiao.filter((l) => !/\d/.test(l) && l.length >= 2 && l.length <= 40)
}

export async function calcularAssinaturaEstrutural(linhas: string[]) {
  const candidatos = extrairCandidatosCabecalho(linhas)
  const normalizados = [...new Set(candidatos.map((c) => c.toUpperCase().trim()))].sort()
  const dados = new TextEncoder().encode(normalizados.join('|'))
  const hashBuffer = await crypto.subtle.digest('SHA-256', dados)
  const hash = Array.from(new Uint8Array(hashBuffer)).map((b) => b.toString(16).padStart(2, '0')).join('')
  return { hash, camposDetectados: normalizados }
}
