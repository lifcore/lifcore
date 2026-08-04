import { useEffect, useState } from 'react'
import '../../styles/centers.css'
import '../../styles/lcds-tokens.css'
import InfoTooltip from '../../components/InfoTooltip'
import KpiCard from '../../components/KpiCard'
import { Link } from 'react-router-dom'
import { contarClientesPorModulo, contarDemandasAbertas, contarConsultasPorEspecialista, contarIndicadoresPorCorretor, obterSaudeFinanceira, obterSaudeOperacional } from '../../lib/crm/painelExecutivoService'
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
  const [saudeOperacional, setSaudeOperacional] = useState(null)
  const [corretores, setCorretores] = useState([])
  const [carregando, setCarregando] = useState(true)

  useEffect(() => {
    carregar()
  }, [])

  async function carregar() {
    setCarregando(true)
    const [clientes, dem, fin, consultas, porCorretor, listaCorretores, saude, saudeOp] = await Promise.all([
      contarClientesPorModulo(),
      contarDemandasAbertas(),
      indicadoresOperacionais(),
      contarConsultasPorEspecialista(),
      contarIndicadoresPorCorretor(),
      listarCorretores(),
      obterSaudeFinanceira(),
      obterSaudeOperacional(),
    ])
    setClientesPorModulo(clientes)
    setDemandas(dem)
    setFinanceiro(fin)
    setConsultasPorEspecialista(consultas)
    setIndicadoresPorCorretor(porCorretor)
    setCorretores(listaCorretores)
    setSaudeFinanceira(saude)
    setSaudeOperacional(saudeOp)
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
    <div className="config-page" data-theme="lcds">
      <h2>
        Painel Executivo
        <InfoTooltip
          titulo="Painel Executivo"
          texto="Visão consolidada dos 5 módulos — clientes por etapa, demandas em aberto e indicadores financeiros, tudo em um lugar só."
        />
      </h2>

      <h3 className="secao-titulo">Clientes por módulo</h3>
      <div className="kpi-grid">
        {MODULOS.map((m) => {
          const c = clientesPorModulo[m.id]
          const totalAtivo = c.prospect + c.em_negociacao + c.cliente
          return (
            <KpiCard
              key={m.id}
              to={m.rota}
              label={m.label}
              valor={totalAtivo}
              trendTexto={`${c.prospect} prospect · ${c.em_negociacao} negociação · ${c.cliente} ativos`}
              trendTipo="neutro"
              rodapeLabel="Demandas"
              rodapeValor={`${demandas.porModulo[m.id]} em aberto`}
            />
          )
        })}
      </div>

      <h3 className="secao-titulo">Demandas em aberto (total)</h3>
      <div className="kpi-grid" style={{ maxWidth: '220px' }}>
        <KpiCard label="Demandas em aberto" valor={demandas.total} />
      </div>

      <h3 className="secao-titulo">Consultas por especialista (histórico total)</h3>
      <div className="kpi-grid">
        {MODULOS.map((m) => (
          <KpiCard key={m.id} label={m.label} valor={consultasPorEspecialista[m.id]} />
        ))}
      </div>

      <h3 className="secao-titulo">Ranking por corretor</h3>
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

      <h3 className="secao-titulo">Saúde Operacional</h3>
      <div className="kpi-grid">
        <KpiCard to="/claims" label="Casos Abertos" valor={saudeOperacional.totalAbertos} />
        <KpiCard
          to="/claims"
          label="Casos Críticos"
          valor={saudeOperacional.totalCriticos}
          trendTexto="abertos há 15+ dias"
          trendTipo="atencao"
          destacado
        />
        <KpiCard
          label="Tempo Médio de Resolução"
          valor={saudeOperacional.tempoMedioResolucaoDias ?? '—'}
          unidade={saudeOperacional.tempoMedioResolucaoDias !== null ? 'dias' : undefined}
        />
        <KpiCard label="Total de Casos" valor={saudeOperacional.totalCasos} />
      </div>

      <h3 className="secao-titulo">Saúde Financeira</h3>
      <div className="kpi-grid">
        <KpiCard
          to="/financeiro?aba=contasareceber"
          label="Total a Receber"
          valor={formatarMoeda(saudeFinanceira.totalAReceber)}
        />
        <KpiCard
          to="/financeiro?aba=contasareceber"
          label="Total em Atraso"
          valor={formatarMoeda(saudeFinanceira.totalEmAtraso)}
          trendTexto={`${saudeFinanceira.percentualEmAtraso.toFixed(1)}% do total a receber`}
          trendTipo="negativo"
          destacado
        />
        <KpiCard
          to="/financeiro?aba=contasareceber"
          label="Faixa Crítica (90+ dias)"
          valor={formatarMoeda(saudeFinanceira.totalFaixaCritica90)}
          trendTexto={`${saudeFinanceira.quantidadeFaixaCritica90} lançamento(s)`}
          trendTipo="negativo"
          destacado
        />
        <KpiCard
          to="/financeiro?aba=repasses"
          label="Repasses Pendentes"
          valor={formatarMoeda(saudeFinanceira.totalRepassesPendentes)}
        />
        <KpiCard
          to="/financeiro?aba=conciliacao"
          label="Conciliado"
          valor={formatarMoeda(saudeFinanceira.totalConciliado)}
          trendTexto={`${saudeFinanceira.percentualConciliado.toFixed(1)}% conciliado`}
          trendTipo="positivo"
        />
        <KpiCard
          to="/financeiro?aba=pendencias"
          label="Volume Aguardando Ação"
          valor={formatarMoeda(saudeFinanceira.volumeAguardandoAcao)}
        />
      </div>

      <h3 className="secao-titulo">Financeiro (Comissões)</h3>
      <div className="kpi-grid">
        <KpiCard label="Previsto" valor={formatarMoeda(financeiro.totalPrevisto)} />
        <KpiCard label="Recebido" valor={formatarMoeda(financeiro.totalRecebido)} />
        <KpiCard label="Pendente" valor={formatarMoeda(financeiro.totalPendente)} />
        <KpiCard label="Repassado" valor={formatarMoeda(financeiro.totalRepassado)} />
      </div>
      <Link to="/financeiro" className="ls-btn ls-btn-ghost" style={{ marginTop: '0.75rem', display: 'inline-block' }}>
        Ver detalhes no Financeiro →
      </Link>
    </div>
  )
}