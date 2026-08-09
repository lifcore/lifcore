import './customer360.css'

/**
 * Relationship Panel Widget (Sprint 008, Bloco C — adaptado na Sprint
 * "Fechamento Customer 360" pra consumir a Posição Comercial
 * normalizada). Painel estruturado (opção A, escolhida pelo Chief —
 * não é diagrama/grafo). Só organiza dado que a ficha do cliente já
 * carregou.
 */
export default function RelationshipPanelWidget({ cliente, corretorNome, posicoes = [], cotacoes = [], demandas = [] }) {
  const operadoras = [...new Set([
    ...posicoes.map((p) => p.operadoraNome).filter(Boolean),
    ...cotacoes.map((c) => c.operadora_nome_livre).filter(Boolean),
  ])]

  const produtos = [...new Set(posicoes.map((p) => p.produtoNome).filter(Boolean))]

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
        <span className="c360-relacionamento-label">Contratos/Apólices</span>
        <span>{posicoes.length} total, {posicoes.filter((p) => p.ativo).length} ativo(s)</span>
      </div>

      <div className="c360-relacionamento-linha">
        <span className="c360-relacionamento-label">Casos (Demandas)</span>
        <span>{demandas.length} total, {demandas.filter((d) => d.situacao !== 'resolvido' && d.situacao !== 'encerrado').length} em aberto</span>
      </div>
    </div>
  )
}