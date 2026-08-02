import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { contarClientesPorModulo, contarDemandasAbertas } from '../../lib/crm/painelExecutivoService'
import { indicadoresOperacionais } from '../../lib/crm/comissoesService'

const MODULOS = [
  { id: 'saude', label: 'Lifcare', rota: '/' },
  { id: 'auto', label: 'Lifleet', rota: '/lifleet' },
  { id: 'lifsure', label: 'LifSure', rota: '/lifsure' },
  { id: 'lishield', label: 'LiShield', rota: '/lishield' },
  { id: 'lifplan', label: 'LifPlan', rota: '/lifplan' },
]

function formatarMoeda(valor) {
  return (Number(valor) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export default function PainelExecutivoPage() {
  const [clientesPorModulo, setClientesPorModulo] = useState(null)
  const [demandas, setDemandas] = useState(null)
  const [financeiro, setFinanceiro] = useState(null)
  const [carregando, setCarregando] = useState(true)

  useEffect(() => {
    carregar()
  }, [])

  async function carregar() {
    setCarregando(true)
    const [clientes, dem, fin] = await Promise.all([
      contarClientesPorModulo(),
      contarDemandasAbertas(),
      indicadoresOperacionais(),
    ])
    setClientesPorModulo(clientes)
    setDemandas(dem)
    setFinanceiro(fin)
    setCarregando(false)
  }

  if (carregando) return <p className="cliente-carregando">Carregando painel...</p>

  return (
    <div className="config-page">
      <h2>Painel Executivo</h2>
      <p className="config-instrucao">
        Visão consolidada dos 5 módulos — clientes por etapa, demandas em aberto
        e indicadores financeiros, tudo em um lugar só.
      </p>

      <h3 style={{ marginTop: '1.5rem' }}>Clientes por módulo</h3>
      <div className="cotacao-form-linha" style={{ flexWrap: 'wrap' }}>
        {MODULOS.map((m) => {
          const c = clientesPorModulo[m.id]
          const totalAtivo = c.prospect + c.em_negociacao + c.cliente
          return (
            <Link key={m.id} to={m.rota} className="ls-card" style={{ textDecoration: 'none', color: 'inherit', minWidth: '160px' }}>
              <strong>{m.label}</strong>
              <div style={{ fontSize: '1.4rem', fontWeight: 600 }}>{totalAtivo}</div>
              <div className="config-instrucao" style={{ fontSize: '0.8rem' }}>
                {c.prospect} prospect · {c.em_negociacao} negociação · {c.cliente} ativos
              </div>
              <div className="config-instrucao" style={{ fontSize: '0.8rem', marginTop: '0.25rem' }}>
                {demandas.porModulo[m.id]} demanda(s) em aberto
              </div>
            </Link>
          )
        })}
      </div>

      <h3 style={{ marginTop: '1.5rem' }}>Demandas em aberto (total)</h3>
      <div className="ls-card" style={{ maxWidth: '220px' }}>
        <div style={{ fontSize: '1.4rem', fontWeight: 600 }}>{demandas.total}</div>
      </div>

      <h3 style={{ marginTop: '1.5rem' }}>Financeiro (Comissões)</h3>
      <div className="cotacao-form-linha" style={{ flexWrap: 'wrap' }}>
        <div className="ls-card"><strong>Previsto</strong><div>{formatarMoeda(financeiro.totalPrevisto)}</div></div>
        <div className="ls-card"><strong>Recebido</strong><div>{formatarMoeda(financeiro.totalRecebido)}</div></div>
        <div className="ls-card"><strong>Pendente</strong><div>{formatarMoeda(financeiro.totalPendente)}</div></div>
        <div className="ls-card"><strong>Repassado</strong><div>{formatarMoeda(financeiro.totalRepassado)}</div></div>
      </div>
      <Link to="/financeiro" className="ls-btn ls-btn-ghost" style={{ marginTop: '0.75rem', display: 'inline-block' }}>
        Ver detalhes no Financeiro →
      </Link>
    </div>
  )
}
