import './workspaceLayout.css'

/**
 * Workspace Quick Actions (Sprint 010, Bloco D). Cada Workspace define
 * quais ações aparecem — o componente não decide nada, só renderiza a
 * lista que recebe.
 */
export default function WorkspaceQuickActions({ acoes = [] }) {
  if (acoes.length === 0) return null

  return (
    <div className="ws-quick-actions">
      {acoes.map((acao, i) => (
        <button key={i} className="ls-btn ls-btn-ghost" onClick={acao.onClick}>
          {acao.label}
        </button>
      ))}
    </div>
  )
}