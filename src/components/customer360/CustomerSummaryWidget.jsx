import './customer360.css'
import { formatarDataBR } from '../../lib/utils/formatarData'

/**
 * Customer Summary Widget (Sprint 008, Bloco B — adaptado na Sprint
 * "Fechamento Customer 360" pra consumir a Posição Comercial
 * normalizada em vez de `contratos` cru, permitindo reuso idêntico
 * em Lifleet/Lifsure/LiShield). Widget independente e reutilizável —
 * não busca dado próprio, recebe o que a ficha do cliente já carregou
 * (zero query nova).
 *
 * "Último contato" usa `cliente.atualizado_em` como aproximação —
 * é a última vez que o cadastro mudou, não necessariamente um contato
 * humano real. Rotulado com honestidade, não fingindo precisão que
 * não existe.
 */
export default function CustomerSummaryWidget({ cliente, posicoes = [], cotacoes = [] }) {
  const produtosAtivos = posicoes.filter((p) => p.ativo).length

  const receitaEstimada = posicoes
    .filter((p) => p.ativo)
    .reduce((soma, p) => soma + (p.valor ?? 0), 0)

  const pendencias = cotacoes.filter((c) => ['em_analise', 'proposta_emitida'].includes(c.status ?? 'em_analise')).length

  return (
    <div className="c360-summary">
      <div className="c360-summary-item">
        <span className="c360-summary-label">Produtos ativos</span>
        <span className="c360-summary-valor">{produtosAtivos}</span>
      </div>
      <div className="c360-summary-item">
        <span className="c360-summary-label">Receita estimada/mês</span>
        <span className="c360-summary-valor">R$ {receitaEstimada.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
      </div>
      <div className="c360-summary-item">
        <span className="c360-summary-label">Pendências comerciais</span>
        <span className="c360-summary-valor">{pendencias}</span>
      </div>
      <div className="c360-summary-item">
        <span className="c360-summary-label">Próxima ação</span>
        <span className="c360-summary-valor-texto">
          {cliente.proxima_acao_data ? formatarDataBR(cliente.proxima_acao_data) : 'Não definida'}
        </span>
      </div>
      <div className="c360-summary-item">
        <span className="c360-summary-label">Última atualização</span>
        <span className="c360-summary-valor-texto">
          {cliente.atualizado_em ? formatarDataBR(cliente.atualizado_em) : '—'}
        </span>
      </div>
    </div>
  )
}