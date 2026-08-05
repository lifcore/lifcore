import './customer360.css'

/**
 * Operational Health Widget (Sprint 008, Bloco D). Semáforo derivado
 * só do que já está disponível na ficha do cliente — nenhum dado
 * novo buscado.
 *
 * "Repasses pendentes" (do exemplo original do Chief) ficou de fora
 * de propósito: no modelo atual, repasse liga em `comissoes.apolice_id`,
 * e Lifcare (piloto desta Sprint) usa Contratos, não Apólices — não
 * existe um jeito real de calcular isso por cliente aqui ainda. Entra
 * quando o Ciclo de Fechamento (ou o futuro modelo do RFC-001) chegar
 * em Lifcare.
 */
export default function OperationalHealthWidget({ cliente, cotacoes = [], demandas = [] }) {
  const itens = []

  const cotacoesPendentes = cotacoes.filter((c) => ['em_analise', 'proposta_emitida'].includes(c.status ?? 'em_analise')).length
  if (cotacoesPendentes > 0) {
    itens.push(`${cotacoesPendentes} cotação(ões) aguardando decisão`)
  }

  const hoje = new Date()
  const casosCriticos = demandas.filter((d) => {
    const finalizado = d.situacao === 'resolvido' || d.situacao === 'encerrado'
    if (finalizado) return false
    const diasAberto = Math.floor((hoje - new Date(d.criado_em)) / 86400000)
    return diasAberto > 15
  }).length
  if (casosCriticos > 0) {
    itens.push(`${casosCriticos} caso(s) crítico(s) (15+ dias)`)
  }

  const acaoVencida = cliente.proxima_acao_data && cliente.proxima_acao_data < hoje.toISOString().slice(0, 10)
  if (acaoVencida) {
    itens.push('Próxima ação vencida')
  }

  const saudavel = itens.length === 0

  return (
    <div className={`c360-health ${saudavel ? 'c360-health-ok' : 'c360-health-atencao'}`}>
      <span className="c360-health-icone">{saudavel ? '🟢' : '🟡'}</span>
      {saudavel ? (
        <span>Sem pendências</span>
      ) : (
        <ul className="c360-health-lista">
          {itens.map((texto, i) => (
            <li key={i}>{texto}</li>
          ))}
        </ul>
      )}
    </div>
  )
}