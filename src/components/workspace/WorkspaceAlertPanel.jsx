import './workspaceLayout.css'

/**
 * Workspace Alert Panel (Sprint 010, Bloco C). Recebe os itens já
 * filtrados por Workspace (`metricas.itensPendencia`, vindo do
 * workspaceMetricsService) — não decide nada sozinho, só exibe.
 */
export default function WorkspaceAlertPanel({ itens = [] }) {
  if (itens.length === 0) {
    return <div className="ws-alerts ws-alerts-vazio">🟢 Sem pendências neste Workspace</div>
  }

  return (
    <div className="ws-alerts">
      {itens.slice(0, 6).map((item, i) => (
        <div key={i} className="ws-alert-item">
          <span>⚠</span>
          <span>{item.tipo}{item.clienteNome ? ` — ${item.clienteNome}` : ''}</span>
        </div>
      ))}
      {itens.length > 6 && <div className="ws-alert-mais">+ {itens.length - 6} outra(s)</div>}
    </div>
  )
}