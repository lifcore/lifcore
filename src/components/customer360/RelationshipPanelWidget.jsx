import './customer360.css'

/**
 * Relationship Panel Widget (Sprint 008, Bloco C). Painel estruturado
 * (opção A, escolhida pelo Chief — não é diagrama/grafo). Só organiza
 * dado que a ficha do cliente já carregou.
 */
export default function RelationshipPanelWidget({ cliente, corretorNome, contratos = [], cotacoes = [], demandas = [] }) {
  const operadoras = [...new Set([
    ...contratos.map((c) => c.operadora_nome_livre).filter(Boolean),
    ...cotacoes.map((c) => c.operadora_nome_livre).filter(Boolean),
  ])]

  const produtos = [...new Set(contratos.map((c) => c.plano).filter(Boolean))]

  return (
    <div className="c360-relacionamento">
      <div className="c360-relacionamento-linha">
        <span className="c360-relacionamento-label">Corretor responsável</span>
        <span>{corretorNome ?? 'Sem responsável definido'}</span>
      </div>

      <div className="c360-relacionamento-linha">
        <span className="c360-relacionamento-label">Operadoras ({operadoras.length})</span>
        <span>{operadoras.length > 0 ? operadoras.join(', ') : '—'}</span>
      </div>

      <div className="c360-relacionamento-linha">
        <span className="c360-relacionamento-label">Produtos ({produtos.length})</span>
        <span>{produtos.length > 0 ? produtos.join(', ') : '—'}</span>
      </div>

      <div className="c360-relacionamento-linha">
        <span className="c360-relacionamento-label">Contratos</span>
        <span>{contratos.length} total, {contratos.filter((c) => c.status === 'ativo').length} ativo(s)</span>
      </div>

      <div className="c360-relacionamento-linha">
        <span className="c360-relacionamento-label">Casos (Demandas)</span>
        <span>{demandas.length} total, {demandas.filter((d) => d.situacao !== 'resolvido' && d.situacao !== 'encerrado').length} em aberto</span>
      </div>
    </div>
  )
}