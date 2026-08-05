import { useEffect, useState } from 'react'
import '../../styles/centers.css'
import '../../styles/lcds-tokens.css'
import InfoTooltip from '../../components/InfoTooltip'
import KpiCard from '../../components/KpiCard'
import { Link } from 'react-router-dom'
import {
  listarCasosConsolidado,
  obterIndicadoresOperacionais,
  obterTimelineCaso,
  buscarCasosGlobal,
  obterCentralGargalos,
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
    <div className="config-page" data-theme="lcds">
      <h2>
        Claims Center — Central Operacional
        <InfoTooltip
          titulo="Claims Center"
          texto="Consolida os Casos (Demandas) dos 5 Workspaces num único motor operacional — mesma tabela de sempre (casos), agora com visão cruzada."
        />
      </h2>

      <div className="cliente-abas" style={{ marginBottom: '1rem' }}>
        <button className={`cliente-aba ${abaAtiva === 'central' ? 'cliente-aba-ativa' : ''}`} onClick={() => setAbaAtiva('central')}>Central</button>
        <button className={`cliente-aba ${abaAtiva === 'gargalos' ? 'cliente-aba-ativa' : ''}`} onClick={() => setAbaAtiva('gargalos')}>Gargalos</button>
        <button className={`cliente-aba ${abaAtiva === 'especialistas' ? 'cliente-aba-ativa' : ''}`} onClick={() => setAbaAtiva('especialistas')}>Por Módulo</button>
        <button className={`cliente-aba ${abaAtiva === 'buscar' ? 'cliente-aba-ativa' : ''}`} onClick={() => setAbaAtiva('buscar')}>Buscar</button>
      </div>

      {abaAtiva === 'gargalos' && <GargalosTab />}
      {abaAtiva === 'especialistas' && <PorEspecialistaTab />}
      {abaAtiva === 'buscar' && <BuscaGlobalCasos />}

      {abaAtiva === 'central' && (
        <>
          {indicadores && (
            <div className="kpi-grid">
              <KpiCard label="Total de Casos" valor={indicadores.totalCasos} />
              <KpiCard label="Abertos" valor={indicadores.totalAbertos} />
              <KpiCard
                label="Críticos (15+ dias)"
                valor={indicadores.totalCriticos}
                trendTexto="requer atenção"
                trendTipo="negativo"
                destacado
              />
              <KpiCard
                label="Tempo Médio de Resolução"
                valor={indicadores.tempoMedioResolucaoDias ?? '—'}
                unidade={indicadores.tempoMedioResolucaoDias !== null ? 'dias' : undefined}
              />
              <KpiCard label="Concluídas (7 dias)" valor={indicadores.totalConcluidosRecentemente} />
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

          <div className="kpi-grid">
            {CARDS_SITUACAO.map((c) => (
              <KpiCard
                key={c.situacao}
                label={c.label}
                valor={indicadores?.porSituacao[c.situacao] ?? 0}
                destacado={filtroSituacao === c.situacao}
                onClick={() => setFiltroSituacao(filtroSituacao === c.situacao ? '' : c.situacao)}
              />
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
      {mostrarTimeline && <LinhaTimeline caso={caso} />}
    </>
  )
}

function LinhaTimeline({ caso }) {
  const [eventos, setEventos] = useState(null)

  useEffect(() => {
    obterTimelineCaso(caso.id).then(setEventos)
  }, [caso.id])

  const primeiroEvento = eventos && eventos.length > 0 ? eventos[0] : null
  const ultimoEvento = eventos && eventos.length > 0 ? eventos[eventos.length - 1] : null

  return (
    <tr>
      <td colSpan={6}>
        <div className="ls-card" style={{ padding: '0.75rem' }}>
          <strong style={{ fontSize: '0.85rem' }}>Timeline do caso — estágios reais (derivados dos dados existentes)</strong>

          {!eventos ? (
            <p className="cliente-carregando">Carregando...</p>
          ) : (
            <>
              <div className="cotacao-form-linha" style={{ flexWrap: 'wrap', marginTop: '0.5rem' }}>
                <div className="ls-card kpi-card">
                  <span className="kpi-card-label">ABERTURA</span>
                  <div style={{ fontSize: '0.85rem' }}>{new Date(caso.criado_em).toLocaleString('pt-BR')}</div>
                </div>
                <div className="ls-card kpi-card">
                  <span className="kpi-card-label">PRIMEIRO ATENDIMENTO</span>
                  <div style={{ fontSize: '0.85rem' }}>{primeiroEvento ? new Date(primeiroEvento.data).toLocaleString('pt-BR') : 'Ainda sem registro'}</div>
                </div>
                <div className="ls-card kpi-card">
                  <span className="kpi-card-label">ÚLTIMA ATUALIZAÇÃO</span>
                  <div style={{ fontSize: '0.85rem' }}>{ultimoEvento ? new Date(ultimoEvento.data).toLocaleString('pt-BR') : 'Sem movimentação ainda'}</div>
                </div>
                <div className="ls-card kpi-card">
                  <span className="kpi-card-label">SITUAÇÃO ATUAL</span>
                  <div style={{ fontSize: '0.85rem' }}>{SITUACAO_LABEL[caso.situacao] ?? caso.situacao}</div>
                </div>
                <div className="ls-card kpi-card">
                  <span className="kpi-card-label">PRÓXIMA AÇÃO</span>
                  <div style={{ fontSize: '0.85rem' }}>{caso.data_proxima_acao ? formatarDataBR(caso.data_proxima_acao) : 'Não definida'}</div>
                </div>
              </div>

              <strong style={{ fontSize: '0.8rem', marginTop: '0.75rem', display: 'block' }}>Histórico completo</strong>
              {eventos.length === 0 ? (
                <p className="config-instrucao">Nenhum evento registrado ainda além da abertura.</p>
              ) : (
                <ul style={{ marginTop: '0.25rem', fontSize: '0.85rem' }}>
                  {eventos.map((e, i) => (
                    <li key={i}>
                      <strong>{new Date(e.data).toLocaleString('pt-BR')}</strong> — {e.descricao}
                      {e.motivo && <span className="config-instrucao"> ({e.motivo})</span>}
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>
      </td>
    </tr>
  )
}

function GargalosTab() {
  const [gargalos, setGargalos] = useState(null)

  useEffect(() => {
    obterCentralGargalos().then(setGargalos)
  }, [])

  if (!gargalos) return <p className="cliente-carregando">Carregando gargalos...</p>

  const BLOCOS = [
    { chave: 'semResponsavel', titulo: 'Sem Responsável' },
    { chave: 'semMovimentacao', titulo: 'Sem Nenhuma Movimentação' },
    { chave: 'semAtualizacaoRecente', titulo: 'Sem Atualização há 7+ dias' },
    { chave: 'antigos', titulo: 'Antigos (15+ dias)' },
    { chave: 'aguardandoTerceiros', titulo: 'Aguardando Cliente/Seguradora' },
  ]

  return (
    <div>
      <p className="config-instrucao">
        Identificado automaticamente a partir do estado atual dos casos — sem SLA configurado,
        sem histórico novo. Clique num bloco pra ver os casos.
      </p>
      {BLOCOS.map((b) => (
        <div key={b.chave} style={{ marginBottom: '1.5rem' }}>
          <h3>{b.titulo} ({gargalos[b.chave].length})</h3>
          {gargalos[b.chave].length === 0 ? (
            <p className="cliente-vazio">Nenhum caso nessa condição.</p>
          ) : (
            <table className="cliente-tabela">
              <thead><tr><th>Código</th><th>Cliente</th><th>Módulo</th><th>Situação</th><th>Ações</th></tr></thead>
              <tbody>
                {gargalos[b.chave].map((c) => (
                  <tr key={c.id}>
                    <td className="ls-mono">{c.codigo}</td>
                    <td>{c.cliente?.razao_social ?? '—'}</td>
                    <td>{MODULOS.find((m) => m.id === c.moduloOrigem)?.label ?? c.moduloOrigem}</td>
                    <td><span className="ls-badge">{SITUACAO_LABEL[c.situacao] ?? c.situacao}</span></td>
                    <td>{c.rotaCliente && <Link to={c.rotaCliente} className="cliente-tabela-btn">Ver Cliente</Link>}</td>
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

function PorEspecialistaTab() {
  const [indicadores, setIndicadores] = useState(null)
  const [moduloSelecionado, setModuloSelecionado] = useState(null)
  const [casosDoModulo, setCasosDoModulo] = useState(null)

  useEffect(() => {
    obterIndicadoresOperacionais().then(setIndicadores)
  }, [])

  async function verCasos(modulo) {
    setModuloSelecionado(modulo)
    const lista = await listarCasosConsolidado({ modulo })
    setCasosDoModulo(lista)
  }

  if (!indicadores) return <p className="cliente-carregando">Carregando...</p>

  return (
    <div>
      <div style={{ marginBottom: '0.5rem' }}>
        <InfoTooltip
          titulo="Por Módulo"
          texto={'"Especialista" aqui é sinônimo de Módulo/Workspace — não existe uma entidade humana separada de especialista no sistema hoje (GIN=Lifcare, LifAuto=Lifleet, etc).'}
        />
      </div>
      <div className="kpi-grid">
        {MODULOS.map((m) => (
          <KpiCard
            key={m.id}
            label={m.label}
            valor={indicadores.porEspecialista[m.id]}
            destacado={moduloSelecionado === m.id}
            onClick={() => verCasos(m.id)}
          />
        ))}
      </div>

      {casosDoModulo && (
        casosDoModulo.length === 0 ? (
          <p className="cliente-vazio">Nenhum caso nesse módulo.</p>
        ) : (
          <table className="cliente-tabela">
            <thead><tr><th>Código</th><th>Cliente</th><th>Situação</th><th>Tempo Aberto</th></tr></thead>
            <tbody>
              {casosDoModulo.map((c) => (
                <tr key={c.id}>
                  <td className="ls-mono">{c.codigo}</td>
                  <td>{c.cliente?.razao_social ?? '—'}</td>
                  <td><span className="ls-badge">{SITUACAO_LABEL[c.situacao] ?? c.situacao}</span></td>
                  <td>{c.tempoAbertoDias} dia(s)</td>
                </tr>
              ))}
            </tbody>
          </table>
        )
      )}
    </div>
  )
}

function BuscaGlobalCasos() {
  const [corretores, setCorretores] = useState([])
  const [termoCliente, setTermoCliente] = useState('')
  const [codigoCaso, setCodigoCaso] = useState('')
  const [filtroSituacao, setFiltroSituacao] = useState('')
  const [filtroCorretor, setFiltroCorretor] = useState('')
  const [filtroModulo, setFiltroModulo] = useState('')
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
        modulo: filtroModulo || undefined,
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
      <div style={{ marginBottom: '0.5rem' }}>
        <InfoTooltip
          titulo="Buscar casos"
          texto="Busca por Cliente (nome, CPF ou CNPJ), Código do caso, Situação, Período e Corretor. Busca por Contrato/Apólice/Especialista ainda não disponível — registrado como pendência técnica (depende de decisão de como vincular caso a produto específico)."
        />
      </div>

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
            <label>Corretor (Responsável)</label>
            <select value={filtroCorretor} onChange={(e) => setFiltroCorretor(e.target.value)}>
              <option value="">Todos</option>
              {corretores.map((c) => <option key={c.id} value={c.id}>{c.nome_completo}</option>)}
            </select>
          </div>
          <div>
            <label>Especialista (Módulo)</label>
            <select value={filtroModulo} onChange={(e) => setFiltroModulo(e.target.value)}>
              <option value="">Todos</option>
              {MODULOS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
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