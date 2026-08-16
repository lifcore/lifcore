/**
 * MOTOR UNIVERSAL (Edge Function) — Extração adaptativa
 * Porte de scripts/motor-universal/extracao-adaptativa.cjs.
 */

import { interpretar as interpretarComProvider } from './ia-providers/index.ts'

export async function extrair(textoDocumento: string) {
  const resultado = (await interpretarComProvider(textoDocumento)) as {
    seguradora_identificada: string | null
    periodo_inicio: string | null
    periodo_fim: string | null
    eventos: unknown[]
    total_informado_documento: number | null
    tipo_estrutura: string | null
    receita_extracao: unknown
    providerUsado: string
  }

  return {
    nomeOrigemDocumento: resultado.seguradora_identificada ?? null,
    periodoInicio: resultado.periodo_inicio ?? null,
    periodoFim: resultado.periodo_fim ?? null,
    eventos: resultado.eventos,
    totalInformadoDocumento: resultado.total_informado_documento ?? null,
    tipoEstrutura: resultado.tipo_estrutura ?? null,
    receitaExtracao: resultado.receita_extracao ?? null,
    providerUsado: resultado.providerUsado,
  }
}
