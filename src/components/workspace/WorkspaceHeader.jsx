import './workspaceLayout.css'

const LABEL_DOCUMENTO = { apolice: 'Apólices', contrato: 'Contratos' }

/**
 * Workspace Header (Sprint 010, Bloco A). Reutilizável — todo
 * Workspace usa o mesmo componente, só muda o dado (`metricas`, vindo
 * de `workspaceMetricsService.js`).
 */
export default function WorkspaceHeader({ workspace, metricas }) {
  const documentoLabel = LABEL_DOCUMENTO[workspace.commercialLifecycle?.documentoFinal] ?? 'Documentos'
  const totalDocumentos = workspace.commercialLifecycle?.enabled
    ? metricas.porEtapa?.[workspace.commercialLifecycle.stages.at(-1)] ?? 0
    : null

  return (
    <div className="ws-header">
      <div className="ws-header-titulo">
        <h2>{workspace.nome}</h2>
        {workspace.descricao && <span className="ws-header-subtitulo">Comercial • {workspace.descricao}</span>}
      </div>
      <div className="ws-header-stats">
        <div className="ws-header-stat">
          <span className="ws-header-stat-label">Leads</span>
          <span className="ws-header-stat-valor">{metricas.leads}</span>
        </div>
        {workspace.commercialLifecycle?.enabled && (
          <div className="ws-header-stat">
            <span className="ws-header-stat-label">Propostas</span>
            <span className="ws-header-stat-valor">{metricas.porEtapa?.proposta_emitida ?? 0}</span>
          </div>
        )}
        {totalDocumentos !== null && (
          <div className="ws-header-stat">
            <span className="ws-header-stat-label">{documentoLabel}</span>
            <span className="ws-header-stat-valor">{totalDocumentos}</span>
          </div>
        )}
        <div className="ws-header-stat">
          <span className="ws-header-stat-label">Pendências</span>
          <span className="ws-header-stat-valor" style={{ color: metricas.pendencias > 0 ? '#f59e0b' : undefined }}>
            {metricas.pendencias}
          </span>
        </div>
      </div>
      <div className="ws-header-ai-slot" title="Reservado para Sprint futura de IA Contextual">
        🤖 AI Copilot — Em breve
      </div>
    </div>
  )
}