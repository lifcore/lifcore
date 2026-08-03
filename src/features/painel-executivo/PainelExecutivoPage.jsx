import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { contarClientesPorModulo, contarDemandasAbertas, contarConsultasPorEspecialista, contarIndicadoresPorCorretor, obterSaudeFinanceira } from '../../lib/crm/painelExecutivoService'
import { indicadoresOperacionais } from '../../lib/crm/comissoesService'
import { listarCorretores } from '../../lib/crm/apolicesService'

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
  const [consultasPorEspecialista, setConsultasPorEspecialista] = useState(null)
  const [indicadoresPorCorretor, setIndicadoresPorCorretor] = useState(null)
  const [saudeFinanceira, setSaudeFinanceira] = useState(null)
  const [corretores, setCorretores] = useState([])
  const [carregando, setCarregando] = useState(true)

  useEffect(() => {
    carregar()
  }, [])

  async function carregar() {
    setCarregando(true)
    const [clientes, dem, fin, consultas, porCorretor, listaCorretores, saude] = await Promise.all([
      contarClientesPorModulo(),
      contarDemandasAbertas(),
      indicadoresOperacionais(),
      contarConsultasPorEspecialista(),
      contarIndicadoresPorCorretor(),
      listarCorretores(),
      obterSaudeFinanceira(),
    ])
    setClientesPorModulo(clientes)
    setDemandas(dem)
    setFinanceiro(fin)
    setConsultasPorEspecialista(consultas)
    setIndicadoresPorCorretor(porCorretor)
    setCorretores(listaCorretores)
    setSaudeFinanceira(saude)
    setCarregando(false)
  }

  if (carregando) return <p className="cliente-carregando">Carregando painel...</p>

  const nomesPorId = Object.fromEntries(corretores.map((c) => [c.id, c.nome_completo]))

  // Ranking simples: mais clientes ativos primeiro. Sem cálculo de
  // conversão/receita individual — depende de dado financeiro por
  // corretor que ainda não existe modelado.
  const rankingCorretores = Object.entries(indicadoresPorCorretor)
    .map(([corretorId, dados]) => ({ corretorId, nome: nomesPorId[corretorId] ?? 'Corretor', ...dados }))
    .sort((a, b) => b.clientesAtivos - a.clientesAtivos)

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

      <h3 style={{ marginTop: '1.5rem' }}>Consultas por especialista (histórico total)</h3>
      <div className="cotacao-form-linha" style={{ flexWrap: 'wrap' }}>
        {MODULOS.map((m) => (
          <div key={m.id} className="ls-card" style={{ minWidth: '140px' }}>
            <strong>{m.label}</strong>
            <div style={{ fontSize: '1.4rem', fontWeight: 600 }}>{consultasPorEspecialista[m.id]}</div>
          </div>
        ))}
      </div>

      <h3 style={{ marginTop: '1.5rem' }}>Ranking por corretor</h3>
      <div className="ls-card" style={{ padding: 0 }}>
        <table className="cliente-tabela">
          <thead>
            <tr>
              <th>Corretor</th><th>Prospect</th><th>Negociação</th><th>Ativos</th><th>Demandas abertas</th><th>Demandas resolvidas</th>
            </tr>
          </thead>
          <tbody>
            {rankingCorretores.map((c) => (
              <tr key={c.corretorId}>
                <td>{c.nome}</td>
                <td>{c.clientesProspect}</td>
                <td>{c.clientesNegociacao}</td>
                <td>{c.clientesAtivos}</td>
                <td>{c.demandasAbertas}</td>
                <td>{c.demandasResolvidas}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h3 style={{ marginTop: '1.5rem' }}>Saúde Financeira</h3>
      <div className="cotacao-form-linha" style={{ flexWrap: 'wrap' }}>
        <Link to="/financeiro?aba=contasareceber" className="ls-card" style={{ textDecoration: 'none', color: 'inherit', minWidth: '160px' }}>
          <strong>Total a Receber</strong>
          <div style={{ fontSize: '1.2rem', fontWeight: 600 }}>{formatarMoeda(saudeFinanceira.totalAReceber)}</div>
        </Link>
        <Link to="/financeiro?aba=contasareceber" className="ls-card" style={{ textDecoration: 'none', color: '#b23b3b', minWidth: '160px' }}>
          <strong>Total em Atraso</strong>
          <div style={{ fontSize: '1.2rem', fontWeight: 600 }}>{formatarMoeda(saudeFinanceira.totalEmAtraso)}</div>
          <div className="config-instrucao" style={{ fontSize: '0.75rem' }}>{saudeFinanceira.percentualEmAtraso.toFixed(1)}% do total a receber</div>
        </Link>
        <Link to="/financeiro?aba=contasareceber" className="ls-card" style={{ textDecoration: 'none', color: '#b23b3b', minWidth: '160px' }}>
          <strong>Faixa Crítica (90+ dias)</strong>
          <div style={{ fontSize: '1.2rem', fontWeight: 600 }}>{formatarMoeda(saudeFinanceira.totalFaixaCritica90)}</div>
          <div className="config-instrucao" style={{ fontSize: '0.75rem' }}>{saudeFinanceira.quantidadeFaixaCritica90} lançamento(s)</div>
        </Link>
        <Link to="/financeiro?aba=repasses" className="ls-card" style={{ textDecoration: 'none', color: 'inherit', minWidth: '160px' }}>
          <strong>Repasses Pendentes</strong>
          <div style={{ fontSize: '1.2rem', fontWeight: 600 }}>{formatarMoeda(saudeFinanceira.totalRepassesPendentes)}</div>
        </Link>
        <Link to="/financeiro?aba=conciliacao" className="ls-card" style={{ textDecoration: 'none', color: 'inherit', minWidth: '160px' }}>
          <strong>Conciliado</strong>
          <div style={{ fontSize: '1.2rem', fontWeight: 600 }}>{formatarMoeda(saudeFinanceira.totalConciliado)}</div>
          <div className="config-instrucao" style={{ fontSize: '0.75rem' }}>{saudeFinanceira.percentualConciliado.toFixed(1)}% conciliado</div>
        </Link>
        <Link to="/financeiro?aba=pendencias" className="ls-card" style={{ textDecoration: 'none', color: 'inherit', minWidth: '160px' }}>
          <strong>Volume Aguardando Ação</strong>
          <div style={{ fontSize: '1.2rem', fontWeight: 600 }}>{formatarMoeda(saudeFinanceira.volumeAguardandoAcao)}</div>
        </Link>
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