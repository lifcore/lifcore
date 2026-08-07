import { useEffect, useState } from 'react'
import '../../styles/centers.css'
import '../../styles/lcds-tokens.css'
import './connect-inbox.css'
import InfoTooltip from '../../components/InfoTooltip'
import KpiCard from '../../components/KpiCard'
import {
  listarEventosConnect,
  listarFilaOperacional,
  obterKpisConnect,
} from '../../lib/connect/connectService'
import { formatarDataBR } from '../../lib/utils/formatarData'

const STATUS_LOG = {
  recebido: { label: 'Aguardando', classe: 'lcds-badge-alerta' },
  processado: { label: 'Processada', classe: 'lcds-badge-sucesso' },
  erro: { label: 'Com Erro', classe: 'lcds-badge-critico' },
}

const ORIGEM_TIPO = {
  lead: 'Lead / Fale Conosco',
  curriculo: 'Trabalhe Conosco',
}

export default function ConnectInboxPage() {
  const [abaAtiva, setAbaAtiva] = useState('fila')
  const [kpis, setKpis] = useState(null)

  useEffect(() => {
    obterKpisConnect().then(setKpis).catch(() => setKpis(null))
  }, [])

  return (
    <div className="config-page" data-theme="lcds">
      <h2>
        Connect Center — Connect Inbox
        <InfoTooltip
          titulo="Connect Center"
          texto="Camada de observabilidade e fila operacional das entradas externas (site, futuros parceiros). Responde só 'o que entrou, quando, por onde, para onde foi e em que estado está' — conversão, desempenho e ROI pertencem ao futuro BI Center, não a esta tela."
        />
      </h2>

      {kpis && (
        <div className="kpi-grid">
          <KpiCard label="Entradas Recebidas" valor={kpis.entradasRecebidas} />
          <KpiCard
            label="Sem Responsável"
            valor={kpis.semResponsavel}
            trendTexto={kpis.semResponsavel > 0 ? 'requer atribuição' : undefined}
            trendTipo="negativo"
            destacado={kpis.semResponsavel > 0}
          />
          <KpiCard label="Processadas" valor={kpis.processadas} />
          <KpiCard label="Com Erro" valor={kpis.comErro} trendTipo="negativo" destacado={kpis.comErro > 0} />
          <KpiCard label="Aguardando Processamento" valor={kpis.aguardandoProcessamento} />
        </div>
      )}

      <div className="cliente-abas" style={{ marginBottom: '1rem' }}>
        <button
          className={`cliente-aba ${abaAtiva === 'fila' ? 'cliente-aba-ativa' : ''}`}
          onClick={() => setAbaAtiva('fila')}
        >
          Fila Operacional
        </button>
        <button
          className={`cliente-aba ${abaAtiva === 'eventos' ? 'cliente-aba-ativa' : ''}`}
          onClick={() => setAbaAtiva('eventos')}
        >
          Log de Eventos
        </button>
      </div>

      {abaAtiva === 'fila' && <FilaOperacionalTab />}
      {abaAtiva === 'eventos' && <LogEventosTab />}
    </div>
  )
}

function FilaOperacionalTab() {
  const [itens, setItens] = useState([])
  const [carregando, setCarregando] = useState(true)
  const [busca, setBusca] = useState('')
  const [origem, setOrigem] = useState('')
  const [produto, setProduto] = useState('')

  useEffect(() => {
    carregar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [origem, produto])

  async function carregar() {
    setCarregando(true)
    const dados = await listarFilaOperacional({
      origem: origem || undefined,
      produto: produto || undefined,
      busca: busca || undefined,
    })
    setItens(dados)
    setCarregando(false)
  }

  function aoSubmeterBusca(e) {
    e.preventDefault()
    carregar()
  }

  const origensDisponiveis = [...new Set(itens.map((i) => i.origem_lead).filter(Boolean))]
  const produtosDisponiveis = [...new Set(itens.map((i) => i.produto_interesse).filter(Boolean))]

  return (
    <div>
      <div className="ls-card" style={{ marginBottom: '1rem' }}>
        <form onSubmit={aoSubmeterBusca} className="cotacao-form-linha">
          <div>
            <label>Buscar por nome</label>
            <input
              type="text"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Nome do lead ou candidato"
            />
          </div>
          <div>
            <label>Origem</label>
            <select value={origem} onChange={(e) => setOrigem(e.target.value)}>
              <option value="">Todas</option>
              {origensDisponiveis.map((o) => (
                <option key={o} value={o}>{o}</option>
              ))}
            </select>
          </div>
          <div>
            <label>Produto</label>
            <select value={produto} onChange={(e) => setProduto(e.target.value)}>
              <option value="">Todos</option>
              {produtosDisponiveis.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </div>
          <div style={{ alignSelf: 'flex-end' }}>
            <button type="submit" className="ls-btn ls-btn-ghost">Buscar</button>
          </div>
        </form>
      </div>

      {carregando ? (
        <p className="cliente-carregando">Carregando fila...</p>
      ) : itens.length === 0 ? (
        <p className="cliente-vazio">Nenhuma entrada pendente de responsável com esse filtro.</p>
      ) : (
        <table className="cliente-tabela">
          <thead>
            <tr>
              <th>Nome</th>
              <th>Tipo de Entrada</th>
              <th>Módulo</th>
              <th>Produto/Área de Interesse</th>
              <th>Origem</th>
              <th>Recebido em</th>
            </tr>
          </thead>
          <tbody>
            {itens.map((item) => (
              <tr key={`${item.tipo_origem}-${item.id}`}>
                <td>{item.nome}</td>
                <td><span className="ls-badge">{ORIGEM_TIPO[item.tipo_origem] ?? item.tipo_origem}</span></td>
                <td>{item.modulo ?? '—'}</td>
                <td>{item.produto_interesse ?? '—'}</td>
                <td>{item.origem_lead ?? '—'}</td>
                <td>{formatarDataBR(item.criado_em)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <p className="connect-nota-rodape">
        Atribuição de responsável e navegação para o registro completo ainda não estão nesta tela —
        pendência registrada para uma próxima sprint (rota final por tipo de origem ainda não definida).
      </p>
    </div>
  )
}

function LogEventosTab() {
  const [eventos, setEventos] = useState([])
  const [carregando, setCarregando] = useState(true)
  const [status, setStatus] = useState('')
  const [busca, setBusca] = useState('')
  const [selecionado, setSelecionado] = useState(null)

  useEffect(() => {
    carregar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status])

  async function carregar() {
    setCarregando(true)
    const dados = await listarEventosConnect({ status: status || undefined, busca: busca || undefined })
    setEventos(dados)
    setCarregando(false)
  }

  function aoSubmeterBusca(e) {
    e.preventDefault()
    carregar()
  }

  return (
    <div>
      <div className="ls-card" style={{ marginBottom: '1rem' }}>
        <form onSubmit={aoSubmeterBusca} className="cotacao-form-linha">
          <div>
            <label>Buscar (entry point, origem, destino, tipo)</label>
            <input type="text" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Ex: receber-lead-site" />
          </div>
          <div>
            <label>Status</label>
            <select value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">Todos</option>
              <option value="recebido">Aguardando</option>
              <option value="processado">Processada</option>
              <option value="erro">Com Erro</option>
            </select>
          </div>
          <div style={{ alignSelf: 'flex-end' }}>
            <button type="submit" className="ls-btn ls-btn-ghost">Buscar</button>
          </div>
        </form>
      </div>

      {carregando ? (
        <p className="cliente-carregando">Carregando eventos...</p>
      ) : eventos.length === 0 ? (
        <p className="cliente-vazio">Nenhum evento com esse filtro.</p>
      ) : (
        <table className="cliente-tabela">
          <thead>
            <tr>
              <th>Entry Point</th>
              <th>Origem → Destino</th>
              <th>Status</th>
              <th>Correlation ID</th>
              <th>Recebido em</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {eventos.map((ev) => {
              const info = STATUS_LOG[ev.status] ?? { label: ev.status, classe: 'ls-badge' }
              return (
                <tr key={ev.id}>
                  <td>{ev.entry_point}</td>
                  <td>{ev.origem ?? '—'} → {ev.destino ?? '—'}</td>
                  <td><span className={info.classe}>{info.label}</span></td>
                  <td><span className="ls-mono">{ev.correlation_id}</span></td>
                  <td>{formatarDataBR(ev.criado_em)}</td>
                  <td>
                    <button className="cliente-tabela-btn" onClick={() => setSelecionado(ev)}>
                      Ver Payload
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}

      {selecionado && (
        <PayloadViewer evento={selecionado} onFechar={() => setSelecionado(null)} />
      )}
    </div>
  )
}

function PayloadViewer({ evento, onFechar }) {
  const info = STATUS_LOG[evento.status] ?? { label: evento.status, classe: 'ls-badge' }

  return (
    <div className="connect-payload-overlay" onClick={onFechar}>
      <div className="connect-payload-modal" onClick={(e) => e.stopPropagation()}>
        <div className="connect-payload-header">
          <div>
            <strong>{evento.entry_point}</strong>
            <span className={`${info.classe} connect-payload-status`}>{info.label}</span>
          </div>
          <button className="ls-btn ls-btn-ghost" onClick={onFechar}>Fechar</button>
        </div>

        <dl className="connect-payload-meta">
          <dt>Correlation ID</dt>
          <dd className="ls-mono">{evento.correlation_id}</dd>
          <dt>Tipo de Entrada</dt>
          <dd>{evento.tipo_entrada}</dd>
          <dt>Origem</dt>
          <dd>{evento.origem ?? '—'}</dd>
          <dt>Destino</dt>
          <dd>{evento.destino ?? '—'}</dd>
          <dt>Recebido em</dt>
          <dd>{formatarDataBR(evento.criado_em)}</dd>
          <dt>Processado em</dt>
          <dd>{evento.processado_em ? formatarDataBR(evento.processado_em) : '—'}</dd>
          {evento.erro_mensagem && (
            <>
              <dt>Erro</dt>
              <dd className="ls-modal-erro">{evento.erro_mensagem}</dd>
            </>
          )}
        </dl>

        <div>
          <strong>Payload</strong>
          <pre className="connect-payload-json">{JSON.stringify(evento.payload, null, 2)}</pre>
        </div>
      </div>
    </div>
  )
}
