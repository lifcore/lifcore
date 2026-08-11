import { useState } from 'react'
import './workspaceLayout.css'

/**
 * Workspace Alert Panel (Sprint 010, Bloco C).
 *
 * ATUALIZADO (BMR-004/CLU-002, Fase 3 — 11/08): virou um botão com
 * contador que abre o painel sob demanda, em vez de ficar fixo
 * ocupando a tela (pedido do Raphael, aprovado). Continua só exibindo
 * — recebe os itens já filtrados por Workspace
 * (`metricas.itensPendencia`, vindo do workspaceMetricsService), não
 * decide nada sozinho. Nenhuma página que já usa este componente
 * precisa mudar nada — o comportamento novo é interno.
 */
export default function WorkspaceAlertPanel({ itens = [] }) {
  const [aberto, setAberto] = useState(false)

  if (itens.length === 0) {
    return <div className="ws-alerts ws-alerts-vazio">🟢 Sem pendências neste Workspace</div>
  }

  return (
    <div className="ws-alerts-wrapper">
      <button className="ls-btn ls-btn-ghost" onClick={() => setAberto((v) => !v)}>
        ⚠️ Pendências e Alertas · {itens.length}
      </button>

      {aberto && (
        <div className="ws-alerts">
          {itens.slice(0, 6).map((item, i) => (
            <div key={i} className="ws-alert-item">
              <span>⚠</span>
              <span>{item.tipo}{item.clienteNome ? ` — ${item.clienteNome}` : ''}</span>
            </div>
          ))}
          {itens.length > 6 && <div className="ws-alert-mais">+ {itens.length - 6} outra(s)</div>}
        </div>
      )}
    </div>
  )
}
