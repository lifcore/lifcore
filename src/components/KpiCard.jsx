import { Link } from 'react-router-dom'
import './kpi-card.css'

const CLASSE_TREND = {
  positivo: 'kpi-card-v2-trend-positivo',
  atencao: 'kpi-card-v2-trend-atencao',
  negativo: 'kpi-card-v2-trend-negativo',
  neutro: 'kpi-card-v2-trend-neutro',
}

/**
 * KPI Card padrão executivo (LCDS-002).
 *
 * Anatomia fixa de 5 camadas: Label → Valor (+unidade opcional) →
 * Tendência (opcional) → divisor → Rodapé chave:valor (opcional).
 * Quando não há trend ou rodapé, esses blocos simplesmente não
 * renderizam — nunca deixamos espaço vazio "empurrando" o card
 * (Regra de Resiliência Estrutural, seção 4 do LCDS-002).
 *
 * - `to`: se informado, o card vira um <Link> clicável.
 * - `onClick` sem `to`: vira um <button> (mantém acessibilidade).
 * - Nenhum dos dois: <div> estático.
 */
export default function KpiCard({
  label,
  valor,
  unidade,
  trendTexto,
  trendTipo = 'neutro',
  rodapeLabel,
  rodapeValor,
  destacado = false,
  to,
  onClick,
}) {
  const classe = `kpi-card-v2 ${destacado ? 'kpi-card-v2-destacado' : ''}`

  const miolo = (
    <>
      <div className="kpi-card-v2-topo">
        <span className="kpi-card-v2-label">{label}</span>

        <div className="kpi-card-v2-valor-linha">
          <span className="kpi-card-v2-valor">{valor}</span>
          {unidade && <span className="kpi-card-v2-unidade">{unidade}</span>}
        </div>

        {trendTexto && (
          <div className={`kpi-card-v2-trend ${CLASSE_TREND[trendTipo] || CLASSE_TREND.neutro}`}>
            {trendTexto}
          </div>
        )}
      </div>

      {(rodapeLabel || rodapeValor) && (
        <div className="kpi-card-v2-rodape">
          <span className="kpi-card-v2-rodape-label">{rodapeLabel}</span>
          <span className="kpi-card-v2-rodape-valor">{rodapeValor}</span>
        </div>
      )}
    </>
  )

  if (to) {
    return (
      <Link to={to} className={classe}>
        {miolo}
      </Link>
    )
  }

  if (onClick) {
    return (
      <button type="button" className={classe} onClick={onClick} style={{ textAlign: 'left', width: '100%' }}>
        {miolo}
      </button>
    )
  }

  return <div className={classe}>{miolo}</div>
}