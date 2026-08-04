import { supabase } from '../supabaseClient'

/**
 * Valores padrão — usados quando o campo ainda não existe pra um
 * usuário (conta antiga) ou quando algum campo específico não foi
 * preenchido ainda (merge raso por cima do que vier do banco).
 */
export const PREFERENCIAS_IA_PADRAO = {
  versao: 1,
  estilo: 'equilibrado',
  profundidade: 'completa',
  formato: 'texto_corrido',
  tom: 'consultivo',
  perfil: 'comercial',
  objetivo: 'vendas',
  iniciativa: 'assistiva',
  recursos: {
    sugestoes: true,
    resumos: true,
    alertas: true,
    recomendacoes: true,
    explicacoes: true,
  },
  especialistas: {
    saude: true,
    auto: true,
    lifsure: true,
    lishield: true,
    lifplan: true,
  },
}

/** Busca as preferências de IA de um usuário, sempre com fallback completo pro padrão */
export async function buscarPreferenciasIa(usuarioId) {
  const { data, error } = await supabase
    .from('perfis')
    .select('preferencias_ia')
    .eq('id', usuarioId)
    .single()
  if (error) throw new Error(`Erro ao buscar preferências de IA: ${error.message}`)

  const salvas = data?.preferencias_ia ?? {}
  return {
    ...PREFERENCIAS_IA_PADRAO,
    ...salvas,
    recursos: { ...PREFERENCIAS_IA_PADRAO.recursos, ...(salvas.recursos ?? {}) },
    especialistas: { ...PREFERENCIAS_IA_PADRAO.especialistas, ...(salvas.especialistas ?? {}) },
  }
}

/** Salva as preferências de IA de um usuário — sempre grava a versão atual (1) */
export async function salvarPreferenciasIa(usuarioId, preferencias) {
  const { error } = await supabase
    .from('perfis')
    .update({ preferencias_ia: { ...preferencias, versao: 1 } })
    .eq('id', usuarioId)
  if (error) throw new Error(`Erro ao salvar preferências de IA: ${error.message}`)
}