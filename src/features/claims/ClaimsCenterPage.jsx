import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  listarCasosConsolidado,
  obterIndicadoresOperacionais,
  obterTimelineCaso,
  buscarCasosGlobal,
} from '../../lib/crm/casosService'
import { montarDadosDocumentoCliente, gerarHtmlDocumentoCliente } from '../../lib/crm/documentoClienteService'
import { listarCorretores } from '../../lib/crm/apolicesService'
import { formatarDataBR } from '../../lib/utils/formatarData'

const MODULOS = [
  { id: 'saude', label: 'Lifcare' },
  { id: 'auto', label: 'Lifleet' },
  { id: 'lifsure', label: 'LifSure' },
  { id: 'lishield', label: 'LiShield' },
  { id: 'lifplan', label: 'LifPlan' },
]

const SITUACAO_LABEL = {
  aberto: 'Aberta', em_andamento: 'Em andamento', aguardando_operadora: 'Aguardando seguradora',
  aguardando_cliente: 'Aguardando cliente', resolvido: 'Resolvida', encerrado: 'Fechada',
}

export default function ClaimsCenterPage() {
  const [abaAtiva, setAbaAtiva] = useState('central')
  const [indicadores, setIndicadores] = useState(null)
  const [casos, setCasos] = useState(null)
  const [filtroSituacao, setFiltroSituacao] = useState('')
  const [filtroModulo, setFiltroModulo] = useState('')
  const [carregando, setCarregando] = useState(true)

  useEffect(() => {
    carregar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtroSituacao, filtroModulo])

  async function carregar() {
    setCarregando(true)
    const [ind, lista] = await Promise.all([
      obterIndicadoresOperacionais(),
      listarCasosConsolidado({ situacao: filtroSituacao || undefined, modulo: filtroModulo || undefined }),
    ])
    setIndicadores(ind)
    setCasos(lista)
    setCarregando(false)
  }

  const CARDS_SITUACAO = [
    { situacao: 'aberto', label: 'Novos' },
    { situacao: 'em_andamento', label: 'Em Atendimento' },
    { situacao: 'aguardando_cliente', label: 'Aguardando Cliente' },
    { situacao: 'aguardando_operadora', label: 'Aguardando Seguradora' },
    { situacao: 'resolvido', label: 'Concluídos' },
  ]

  return (
    <div className="config-page">
      <h2>Claims Center — Central Operacional</h2>
      <p className="config-instrucao">
        Consolida os Casos (Demandas) dos 5 Workspaces num único motor operacional —
        mesma tabela de sempre (`casos`), agora com visão cruzada.
      </p>

      <div className="cliente-abas" style={{ marginBottom: '1rem' }}>
        <button className={`cliente-aba ${abaAtiva === 'central' ? 'cliente-aba-ativa' : ''}`} onClick={() => setAbaAtiva('central')}>Central</button>
        <button className={`cliente-aba ${abaAtiva === 'buscar' ? 'cliente-aba-ativa' : ''}`} onClick={() => setAbaAtiva('buscar')}>Buscar</button>
      </div>

      {abaAtiva === 'buscar' && <BuscaGlobalCasos />}

      {abaAtiva === 'central' && (
        <>
          {indicadores && (
            <div className="cotacao-form-linha" style={{ flexWrap: 'wrap', marginBottom: '1rem' }}>
              <div className="ls-card" style={{ minWidth: '140px' }}><strong>Total de Casos</strong><div style={{ fontSize: '1.3rem', fontWeight: 600 }}>{indicadores.totalCasos}</div></div>
              <div className="ls-card" style={{ minWidth: '140px' }}><strong>Abertos</strong><div style={{ fontSize: '1.3rem', fontWeight: 600 }}>{indicadores.totalAbertos}</div></div>
              <div className="ls-card" style={{ minWidth: '140px', color: '#b23b3b' }}><strong>Críticos (15+ dias)</strong><div style={{ fontSize: '1.3rem', fontWeight: 600 }}>{indicadores.totalCriticos}</div></div>
              <div className="ls-card" style={{ minWidth: '140px' }}><strong>Tempo Médio de Resolução</strong><div style={{ fontSize: '1.3rem', fontWeight: 600 }}>{indicadores.tempoMedioResolucaoDias ?? '—'}{indicadores.tempoMedioResolucaoDias !== null && ' dias'}</div></div>
            </div>
          )}

          <div className="ls-card" style={{ marginBottom: '1rem' }}>
            <div className="cotacao-form-linha">
              <div>
                <label>Situação</label>
                <select value={filtroSituacao} onChange={(e) => setFiltroSituacao(e.target.value)}>
                  <option value="">Todas</option>
                  {Object.entries(SITUACAO_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
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

          <div className="cotacao-form-linha" style={{ flexWrap: 'wrap', marginBottom: '1rem' }}>
            {CARDS_SITUACAO.map((c) => (
              <button
                key={c.situacao}
                className="ls-card"
                style={{ minWidth: '150px', textAlign: 'left', cursor: 'pointer', border: filtroSituacao === c.situacao ? '2px solid #0e2a3d' : undefined }}
                onClick={() => setFiltroSituacao(filtroSituacao === c.situacao ? '' : c.situacao)}
              >
                <strong>{c.label}</strong>
                <div style={{ fontSize: '1.2rem', fontWeight: 600 }}>{indicadores?.porSituacao[c.situacao] ?? 0}</div>
              </button>
            ))}
          </div>

          {carregando ? (
            <p className="cliente-carregando">Carregando casos...</p>
          ) : casos.length === 0 ? (
            <p className="cliente-vazio">Nenhum caso encontrado com esse filtro.</p>
          ) : (
            <table className="cliente-tabela">
              <thead>
                <tr><th>Código</th><th>Cliente</th><th>Módulo</th><th>Situação</th><th>Tempo Aberto</th><th>Ações</th></tr>
              </thead>
              <tbody>
                {casos.map((c) => <LinhaCaso key={c.id} caso={c} />)}
              </tbody>
            </table>
          )}
        </>
      )}
    </div>
  )
}

function LinhaCaso({ caso }) {
  const [mostrarTimeline, setMostrarTimeline] = useState(false)
  const [gerando, setGerando] = useState(false)

  async function handleGerarRelatorio() {
    if (!caso.cliente_prospect_id) return
    setGerando(true)
    try {
      const dados = await montarDadosDocumentoCliente(caso.cliente_prospect_id)
      const html = gerarHtmlDocumentoCliente(dados)
      const janela = window.open('', '_blank')
      janela.document.write(html)
      janela.document.close()
    } catch (err) {
      alert(`Erro ao gerar relatório: ${err.message}`)
    } finally {
      setGerando(false)
    }
  }

  const moduloLabel = MODULOS.find((m) => m.id === caso.moduloOrigem)?.label ?? caso.moduloOrigem ?? '—'

  return (
    <>
      <tr>
        <td className="ls-mono">{caso.codigo}</td>
        <td>{caso.cliente?.razao_social ?? '—'}</td>
        <td>{moduloLabel}</td>
        <td><span className="ls-badge">{SITUACAO_LABEL[caso.situacao] ?? caso.situacao}</span></td>
        <td style={caso.tempoAbertoDias > 15 && !caso.finalizado ? { color: '#b23b3b', fontWeight: 600 } : {}}>
          {caso.tempoAbertoDias} dia(s)
        </td>
        <td className="cliente-tabela-acoes">
          {caso.rotaCliente && <Link to={caso.rotaCliente} className="cliente-tabela-btn">Ver Cliente</Link>}
          {caso.rotaPipeline && <Link to={caso.rotaPipeline} className="cliente-tabela-btn">Pipeline</Link>}
          <button className="cliente-tabela-btn" onClick={() => setMostrarTimeline(!mostrarTimeline)}>Timeline</button>
          <button className="cliente-tabela-btn" onClick={handleGerarRelatorio} disabled={gerando}>
            {gerando ? '...' : '📄 Relatório'}
          </button>
        </td>
      </tr>
      {mostrarTimeline && <LinhaTimeline casoId={caso.id} />}
    </>
  )
}

function LinhaTimeline({ casoId }) {
  const [eventos, setEventos] = useState(null)

  useEffect(() => {
    obterTimelineCaso(casoId).then(setEventos)
  }, [casoId])

  return (
    <tr>
      <td colSpan={6}>
        <div className="ls-card" style={{ padding: '0.75rem' }}>
          <strong style={{ fontSize: '0.85rem' }}>Timeline do caso</strong>
          {!eventos ? (
            <p className="cliente-carregando">Carregando...</p>
          ) : eventos.length === 0 ? (
            <p className="config-instrucao">Nenhum evento registrado ainda além da abertura.</p>
          ) : (
            <ul style={{ marginTop: '0.5rem', fontSize: '0.85rem' }}>
              {eventos.map((e, i) => (
                <li key={i}>
                  <strong>{new Date(e.data).toLocaleString('pt-BR')}</strong> — {e.descricao}
                  {e.motivo && <span className="config-instrucao"> ({e.motivo})</span>}
                </li>
              ))}
            </ul>
          )}
        </div>
      </td>
    </tr>
  )
}

function BuscaGlobalCasos() {
  const [corretores, setCorretores] = useState([])
  const [termoCliente, setTermoCliente] = useState('')
  const [codigoCaso, setCodigoCaso] = useState('')
  const [filtroSituacao, setFiltroSituacao] = useState('')
  const [filtroCorretor, setFiltroCorretor] = useState('')
  const [periodoInicio, setPeriodoInicio] = useState('')
  const [periodoFim, setPeriodoFim] = useState('')
  const [resultados, setResultados] = useState(null)
  const [buscando, setBuscando] = useState(false)

  useEffect(() => {
    listarCorretores().then(setCorretores)
  }, [])

  async function handleBuscar() {
    setBuscando(true)
    try {
      const r = await buscarCasosGlobal({
        termoCliente: termoCliente || undefined,
        codigoCaso: codigoCaso || undefined,
        situacao: filtroSituacao || undefined,
        corretorId: filtroCorretor || undefined,
        periodoInicio: periodoInicio || undefined,
        periodoFim: periodoFim || undefined,
      })
      setResultados(r)
    } finally {
      setBuscando(false)
    }
  }

  return (
    <div>
      <p className="config-instrucao">
        Busca por Cliente (nome, CPF ou CNPJ), Código do caso, Situação, Período e Corretor.
        Busca por Contrato/Apólice/Especialista ainda não disponível — registrado como pendência
        técnica (depende de decisão de como vincular caso a produto específico).
      </p>

      <div className="ls-card" style={{ marginBottom: '1rem' }}>
        <div className="cotacao-form-linha">
          <div><label>Cliente (nome, CPF ou CNPJ)</label><input value={termoCliente} onChange={(e) => setTermoCliente(e.target.value)} /></div>
          <div><label>Código do caso</label><input value={codigoCaso} onChange={(e) => setCodigoCaso(e.target.value)} /></div>
        </div>
        <div className="cotacao-form-linha">
          <div>
            <label>Situação</label>
            <select value={filtroSituacao} onChange={(e) => setFiltroSituacao(e.target.value)}>
              <option value="">Todas</option>
              {Object.entries(SITUACAO_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          <div>
            <label>Corretor</label>
            <select value={filtroCorretor} onChange={(e) => setFiltroCorretor(e.target.value)}>
              <option value="">Todos</option>
              {corretores.map((c) => <option key={c.id} value={c.id}>{c.nome_completo}</option>)}
            </select>
          </div>
        </div>
        <div className="cotacao-form-linha">
          <div><label>Período — de</label><input type="date" value={periodoInicio} onChange={(e) => setPeriodoInicio(e.target.value)} /></div>
          <div><label>Período — até</label><input type="date" value={periodoFim} onChange={(e) => setPeriodoFim(e.target.value)} /></div>
        </div>
        <button className="ls-btn ls-btn-primary" onClick={handleBuscar} disabled={buscando} style={{ marginTop: '0.5rem' }}>
          {buscando ? 'Buscando...' : 'Buscar'}
        </button>
      </div>

      {resultados && (
        resultados.length === 0 ? (
          <p className="cliente-vazio">Nenhum caso encontrado.</p>
        ) : (
          <table className="cliente-tabela">
            <thead><tr><th>Código</th><th>Cliente</th><th>Situação</th><th>Aberto em</th></tr></thead>
            <tbody>
              {resultados.map((c) => (
                <tr key={c.id}>
                  <td className="ls-mono">{c.codigo}</td>
                  <td>{c.cliente?.razao_social ?? '—'}</td>
                  <td><span className="ls-badge">{SITUACAO_LABEL[c.situacao] ?? c.situacao}</span></td>
                  <td>{formatarDataBR(c.criado_em.slice(0, 10))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )
      )}
    </div>
  )
}