import { operacional } from '../supabaseSchemas'

/**
 * Eventos Comerciais — domínio isolado do Commercial Event History.
 *
 * Por decisão explícita do Chief Systems Analyst: NUNCA generalizar a
 * tabela `eventos` (exclusiva de Claims/Demandas). Este é um domínio
 * próprio, com sua própria tabela (`eventos_comerciais`). No futuro,
 * um `timelineService.js` vai consolidar os dois domínios só na
 * APRESENTAÇÃO (leitura combinada), nunca no armazenamento.
 *
 * Registra apenas transições relevantes do fluxo comercial — nunca
 * alterações cadastrais/administrativas (apontamento 6 do Chief).
 */
export async function registrarEventoComercial({ entidadeTipo, entidadeId, tipoEvento, descricao, usuarioId }) {
  const { error } = await operacional
    .from('eventos_comerciais')
    .insert({
      entidade_tipo: entidadeTipo,
      entidade_id: entidadeId,
      tipo_evento: tipoEvento,
      descricao: descricao ?? null,
      usuario_id: usuarioId ?? null,
    })
  if (error) throw new Error(`Erro ao registrar evento comercial: ${error.message}`)
}

/** Lista os eventos comerciais de uma entidade específica (ex: uma cotação), em ordem cronológica */
export async function listarEventosComerciais(entidadeTipo, entidadeId) {
  const { data, error } = await operacional
    .from('eventos_comerciais')
    .select('*')
    .eq('entidade_tipo', entidadeTipo)
    .eq('entidade_id', entidadeId)
    .order('criado_em', { ascending: true })
  if (error) throw new Error(`Erro ao listar eventos comerciais: ${error.message}`)
  return data ?? []
}