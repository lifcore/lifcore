import { operacional } from '../supabaseSchemas'

/**
 * Governança Master — service único e reutilizável por qualquer Center
 * para operações administrativas críticas (exclusão definitiva,
 * saneamento, recuperação, reorganização). Nenhum módulo deve
 * reimplementar confirmação/auditoria própria — usa este service.
 */

const ACOES_VALIDAS = ['exclusao', 'edicao_critica', 'recuperacao', 'saneamento', 'reorganizacao']

/** Registra um evento de auditoria — sempre chamado ANTES da operação
 * de fato ser executada, garantindo rastro mesmo se a operação falhar */
export async function registrarAuditoria({ usuarioId, usuarioPapel, acao, tabelaAfetada, registroId, motivo, dadosAntes }) {
  if (!ACOES_VALIDAS.includes(acao)) {
    throw new Error(`Ação de auditoria inválida: "${acao}". Use uma de: ${ACOES_VALIDAS.join(', ')}`)
  }
  if (!motivo?.trim()) {
    throw new Error('Motivo é obrigatório para qualquer operação crítica.')
  }
  const { error } = await operacional.from('auditoria').insert({
    usuario_id: usuarioId || null,
    usuario_papel: usuarioPapel || null,
    acao,
    tabela_afetada: tabelaAfetada,
    registro_id: String(registroId),
    motivo,
    dados_antes: dadosAntes || null,
  })
  if (error) throw new Error(`Erro ao registrar auditoria: ${error.message}`)
}

/** Lista o histórico de auditoria, com filtros opcionais */
export async function listarAuditoria({ tabelaAfetada, acao, usuarioId, limite = 50 } = {}) {
  let query = operacional.from('auditoria').select('*').order('created_at', { ascending: false }).limit(limite)
  if (tabelaAfetada) query = query.eq('tabela_afetada', tabelaAfetada)
  if (acao) query = query.eq('acao', acao)
  if (usuarioId) query = query.eq('usuario_id', usuarioId)
  const { data, error } = await query
  if (error) throw new Error(`Erro ao listar auditoria: ${error.message}`)
  return data ?? []
}

/**
 * Executa uma operação administrativa crítica de forma padronizada:
 * 1. Valida que quem está executando é Master.
 * 2. Exige motivo.
 * 3. Registra auditoria (com snapshot "antes", pra recuperação manual).
 * 4. Só então executa a operação de fato (callback `executar`).
 *
 * Isso garante que TODA operação crítica de TODO Center passe pelo
 * mesmo portão de segurança e rastreabilidade — sem exceção, sem
 * implementação paralela por módulo.
 */
export async function executarOperacaoCritica({ perfil, acao, tabelaAfetada, registroId, motivo, dadosAntes, executar }) {
  if (perfil?.papel !== 'master') {
    throw new Error('Apenas o perfil Master pode executar operações administrativas críticas.')
  }
  await registrarAuditoria({
    usuarioId: perfil?.id,
    usuarioPapel: perfil?.papel,
    acao,
    tabelaAfetada,
    registroId,
    motivo,
    dadosAntes,
  })
  return executar()
}