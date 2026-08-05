import './workspaceLayout.css'

const ROTULO_ETAPA = {
  em_analise: 'Cotação',
  proposta_emitida: 'Proposta',
  analise_operadora: 'Análise Operadora',
  analise_credito: 'Análise de Crédito',
  assinatura: 'Assinatura',
  aprovada: 'Emitido',
}

/**
 * Workspace KPI Bar (Sprint 010, Bloco B). O funil visual junta DUAS
 * fontes diferentes de dado, de propósito: "Lead" e "Carteira Ativa"
 * são status do CLIENTE (clientes_prospects.status), enquanto as
 * etapas do meio são status da COTAÇÃO (commercialLifecycle.stages,
 * consultado no Workspace Registry — nunca lista fixa aqui).
 */
export default function WorkspaceKpiBar({ workspace, metricas }) {
  const etapas = workspace.commercialLifecycle?.enabled ? workspace.commercialLifecycle.stages : []
  // "recusada" não é uma etapa do funil (é um ramo lateral), e a
  // etapa final já vira "Carteira Ativa" simbolicamente — mostramos
  // as etapas intermediárias só até a penúltima, a última bloco (doc
  // final) já aparece representado por Carteira Ativa no funil.
  const etapasVisiveis = etapas.filter((e) => e !== 'aprovada')

  const blocos = [
    { label: 'Lead', valor: metricas.leads },
    ...etapasVisiveis.map((e) => ({ label: ROTULO_ETAPA[e] ?? e, valor: metricas.porEtapa?.[e] ?? 0 })),
    { label: 'Carteira Ativa', valor: metricas.carteiraAtiva },
  ]

  return (
    <div className="ws-kpibar">
      {blocos.map((b, i) => (
        <div className="ws-kpibar-item" key={i}>
          <div className="ws-kpibar-bloco">
            <span className="ws-kpibar-valor">{b.valor}</span>
            <span className="ws-kpibar-label">{b.label}</span>
          </div>
          {i < blocos.length - 1 && <span className="ws-kpibar-seta">→</span>}
        </div>
      ))}
    </div>
  )
}