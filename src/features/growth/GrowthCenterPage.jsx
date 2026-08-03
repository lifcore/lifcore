import { useEffect, useState } from 'react'
import '../../styles/centers.css'
import { Link } from 'react-router-dom'
import {
  listarCarteiraConsolidada,
  obterAgendaComercial,
  obterIndicadoresComerciais,
  obterPainelCorretor,
} from '../../lib/crm/growthService'
import { listarCorretores } from '../../lib/crm/apolicesService'
import { useAuth } from '../auth/AuthContext'
import { formatarDataBR } from '../../lib/utils/formatarData'

const MODULOS = [
  { id: 'saude', label: 'Lifcare' }, { id: 'auto', label: 'Lifleet' }, { id: 'lifsure', label: 'LifSure' },
  { id: 'lishield', label: 'LiShield' }, { id: 'lifplan', label: 'LifPlan' },
]
const STATUS_LABEL = { prospect: 'Prospect', em_negociacao: 'Em Negociação', cliente: 'Cliente Ativo' }

export default function GrowthCenterPage() {
  const { perfil } = useAuth()
  const ehMaster = perfil?.papel === 'master'
  const [abaAtiva, setAbaAtiva] = useState('central')

  return (
    <div className="config-page">
      <h2>Growth Center — Customer Journey & Pipeline Hub</h2>
      <p className="config-instrucao">
        Consolida CRM e Pipeline dos 5 Workspaces (já compartilham a mesma base — só faltava a visão única).
        Campanhas, Ads e automações externas seguem congeladas até o Connect Center ser homologado.
      </p>

      <div className="cliente-abas" style={{ marginBottom: '1rem' }}>
        <button className={`cliente-aba ${abaAtiva === 'central' ? 'cliente-aba-ativa' : ''}`} onClick={() => setAbaAtiva('central')}>Central</button>
        <button className={`cliente-aba ${abaAtiva === 'agenda' ? 'cliente-aba-ativa' : ''}`} onClick={() => setAbaAtiva('agenda')}>Agenda Comercial</button>
        <button className={`cliente-aba ${abaAtiva === 'meupainel' ? 'cliente-aba-ativa' : ''}`} onClick={() => setAbaAtiva('meupainel')}>{ehMaster ? 'Painel do Corretor' : 'Meu Painel'}</button>
      </div>

      {abaAtiva === 'central' && <CentralTab />}
      {abaAtiva === 'agenda' && <AgendaTab />}
      {abaAtiva === 'meupainel' && <PainelCorretorTab perfil={perfil} ehMaster={ehMaster} />}
    </div>
  )
}

function CentralTab() {
  const [indicadores, setIndicadores] = useState(null)
  const [carteira, setCarteira] = useState(null)
  const [filtroStatus, setFiltroStatus] = useState('')
  const [filtroModulo, setFiltroModulo] = useState('')
  const [carregando, setCarregando] = useState(true)

  useEffect(() => {
    carregar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtroStatus, filtroModulo])

  async function carregar() {
    setCarregando(true)
    const [ind, lista] = await Promise.all([
      obterIndicadoresComerciais({ modulo: filtroModulo || undefined }),
      listarCarteiraConsolidada({ status: filtroStatus || undefined, modulo: filtroModulo || undefined }),
    ])
    setIndicadores(ind)
    setCarteira(lista)
    setCarregando(false)
  }

  return (
    <div>
      {indicadores && (
        <div className="kpi-grid">
          <div className="ls-card kpi-card"><strong>Carteira Ativa</strong><div className="kpi-valor">{indicadores.totalAtivos}</div></div>
          <div className="ls-card kpi-card card-clicavel-critico"><strong>Ações Atrasadas</strong><div className="kpi-valor">{indicadores.atrasados}</div></div>
          <div className="ls-card kpi-card"><strong>Sem Corretor</strong><div className="kpi-valor">{indicadores.semCorretor}</div></div>
          <div className="ls-card kpi-card"><strong>Sem Próxima Ação</strong><div className="kpi-valor">{indicadores.semProximaAcao}</div></div>
          <div className="ls-card kpi-card"><strong>Inativos</strong><div className="kpi-valor">{indicadores.totalInativos}</div></div>
        </div>
      )}

      <div className="ls-card" style={{ marginBottom: '1rem' }}>
        <div className="cotacao-form-linha">
          <div>
            <label>Status</label>
            <select value={filtroStatus} onChange={(e) => setFiltroStatus(e.target.value)}>
              <option value="">Todos</option>
              {Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          <div>
            <label>Módulo</label>
            <select value={filtroModulo} onChange={(e) => setFiltroModulo(e.target.value)}>
              <option value="">Todos</option>
              {MODULOS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
            </select>
          </div>
        </div>
      </div>

      {indicadores && (
        <div className="kpi-grid">
          {Object.entries(STATUS_LABEL).map(([k, label]) => (
            <button
              key={k}
              className="ls-card"
              className={`ls-card kpi-card card-clicavel ${filtroStatus === k ? 'card-clicavel-ativo' : ''}`}
              onClick={() => setFiltroStatus(filtroStatus === k ? '' : k)}
            >
              <strong>{label}</strong>
              <div className="kpi-valor">{indicadores.porStatus[k]}</div>
            </button>
          ))}
        </div>
      )}

      {carregando ? (
        <p className="cliente-carregando">Carregando carteira...</p>
      ) : carteira.length === 0 ? (
        <p className="cliente-vazio">Nenhum cliente/prospect com esse filtro.</p>
      ) : (
        <table className="cliente-tabela">
          <thead><tr><th>Cliente</th><th>Módulo</th><th>Status</th><th>Próxima Ação</th><th>Ações</th></tr></thead>
          <tbody>
            {carteira.map((c) => (
              <tr key={c.id}>
                <td>{c.razao_social}</td>
                <td>{MODULOS.find((m) => m.id === c.modulo)?.label || c.modulo}</td>
                <td><span className="ls-badge">{STATUS_LABEL[c.status] ?? c.status}</span></td>
                <td style={c.proximaAcaoAtrasada ? { color: '#b23b3b', fontWeight: 600 } : {}}>
                  {c.proxima_acao_data ? formatarDataBR(c.proxima_acao_data) : 'Sem data definida'}
                </td>
                <td className="cliente-tabela-acoes">
                  <Link to={c.rotaCliente} className="cliente-tabela-btn">Ver Cliente</Link>
                  <Link to={c.rotaPipeline} className="cliente-tabela-btn">Pipeline</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <MetricasIndisponiveis />
    </div>
  )
}

function AgendaTab() {
  const [agenda, setAgenda] = useState(null)

  useEffect(() => {
    obterAgendaComercial().then(setAgenda)
  }, [])

  if (!agenda) return <p className="cliente-carregando">Carregando agenda...</p>

  const BLOCOS = [
    { chave: 'atrasados', titulo: 'Atrasados', critico: true },
    { chave: 'hoje', titulo: 'Hoje' },
    { chave: 'estaSemana', titulo: 'Esta Semana' },
    { chave: 'proximos30Dias', titulo: 'Próximos 30 dias' },
    { chave: 'semAcaoDefinida', titulo: 'Sem Ação Definida' },
  ]

  return (
    <div>
      {BLOCOS.map((b) => (
        <div key={b.chave} style={{ marginBottom: '1.5rem' }}>
          <h3 style={b.critico ? { color: '#b23b3b' } : {}}>{b.titulo} ({agenda[b.chave].length})</h3>
          {agenda[b.chave].length === 0 ? (
            <p className="cliente-vazio">Nenhum cliente nessa faixa.</p>
          ) : (
            <table className="cliente-tabela">
              <thead><tr><th>Cliente</th><th>Módulo</th><th>Próxima Ação</th><th>Ações</th></tr></thead>
              <tbody>
                {agenda[b.chave].map((c) => (
                  <tr key={c.id}>
                    <td>{c.razao_social}</td>
                    <td>{MODULOS.find((m) => m.id === c.modulo)?.label || c.modulo}</td>
                    <td>{c.proxima_acao_data ? formatarDataBR(c.proxima_acao_data) : '—'}</td>
                    <td><Link to={c.rotaCliente} className="cliente-tabela-btn">Ver Cliente</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      ))}
    </div>
  )
}

function PainelCorretorTab({ perfil, ehMaster }) {
  const [corretores, setCorretores] = useState([])
  const [corretorSelecionado, setCorretorSelecionado] = useState(perfil?.id ?? null)
  const [painel, setPainel] = useState(null)

  useEffect(() => {
    if (ehMaster) listarCorretores().then(setCorretores)
  }, [ehMaster])

  useEffect(() => {
    if (corretorSelecionado) obterPainelCorretor(corretorSelecionado).then(setPainel)
  }, [corretorSelecionado])

  if (!painel) return <p className="cliente-carregando">Carregando painel...</p>

  return (
    <div>
      {ehMaster && (
        <div style={{ marginBottom: '1rem' }}>
          <label>Ver painel de:</label>
          <select value={corretorSelecionado ?? ''} onChange={(e) => setCorretorSelecionado(e.target.value)}>
            <option value={perfil.id}>Eu mesmo</option>
            {corretores.filter((c) => c.id !== perfil.id).map((c) => <option key={c.id} value={c.id}>{c.nome_completo}</option>)}
          </select>
        </div>
      )}

      <div className="kpi-grid">
        <div className="ls-card kpi-card"><strong>Minha Carteira</strong><div className="kpi-valor">{painel.totalCarteira}</div></div>
        <div className="ls-card kpi-card"><strong>Prospects</strong><div className="kpi-valor">{painel.porStatus.prospect}</div></div>
        <div className="ls-card kpi-card"><strong>Em Negociação</strong><div className="kpi-valor">{painel.porStatus.em_negociacao}</div></div>
        <div className="ls-card kpi-card"><strong>Clientes Ativos</strong><div className="kpi-valor">{painel.porStatus.cliente}</div></div>
        <div className="ls-card kpi-card card-clicavel-critico"><strong>Negociações Críticas</strong><div className="kpi-valor">{painel.negociacoesCriticas.length}</div></div>
      </div>

      <h3>Ações Atrasadas</h3>
      {painel.agenda.atrasados.length === 0 ? (
        <p className="cliente-vazio">Nenhuma ação atrasada.</p>
      ) : (
        <table className="cliente-tabela">
          <thead><tr><th>Cliente</th><th>Próxima Ação</th><th></th></tr></thead>
          <tbody>
            {painel.agenda.atrasados.map((c) => (
              <tr key={c.id}>
                <td>{c.razao_social}</td>
                <td style={{ color: '#b23b3b', fontWeight: 600 }}>{formatarDataBR(c.proxima_acao_data)}</td>
                <td><Link to={c.rotaCliente} className="cliente-tabela-btn">Ver Cliente</Link></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

/** Métricas de Grupo B — dependem de histórico de transição de status
 * que a plataforma não registra hoje. Mantidas visíveis (não escondidas)
 * com o texto exato acordado com o Chief, em vez de fingir cálculo. */
function MetricasIndisponiveis() {
  const ITENS = [
    'Tempo médio em Prospect', 'Tempo médio em Negociação', 'Conversão Prospect → Cliente',
    'Taxa de conversão por etapa', 'Tempo médio de fechamento', 'Timeline comercial completa', 'Gargalos históricos',
  ]
  return (
    <div className="ls-card" style={{ marginTop: '1.5rem', opacity: 0.7 }}>
      <strong>Métricas históricas</strong>
      <ul style={{ marginTop: '0.5rem' }}>
        {ITENS.map((item) => (
          <li key={item}>{item} — <em>disponível após ativação do Commercial Event History</em></li>
        ))}
      </ul>
    </div>
  )
}