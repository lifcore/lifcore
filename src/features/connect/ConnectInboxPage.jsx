import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import '../../styles/centers.css'
import '../../styles/lcds-tokens.css'
import './connect-inbox.css'
import InfoTooltip from '../../components/InfoTooltip'
import KpiCard from '../../components/KpiCard'
import {
  listarEventosConnect,
  listarFilaOperacional,
  obterKpisConnect,
  obterPainelSaude,
  atribuirResponsavel,
} from '../../lib/connect/connectService'
import { listarTodasConexoes, criarConexaoOperadora, obterOrganizacaoPadrao } from '../../lib/crm/conexoesService'
import { listarProviders } from '../../lib/connect/providerRegistryService'
import { listarCorretores } from '../../lib/crm/apolicesService'
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
  const [searchParams] = useSearchParams()
  const abaValida = ['fila', 'eventos', 'saude', 'conexoes'].includes(searchParams.get('aba'))
  const [abaAtiva, setAbaAtiva] = useState(abaValida ? searchParams.get('aba') : 'fila')
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
        <button
          className={`cliente-aba ${abaAtiva === 'saude' ? 'cliente-aba-ativa' : ''}`}
          onClick={() => setAbaAtiva('saude')}
        >
          Health Dashboard
        </button>
        <button
          className={`cliente-aba ${abaAtiva === 'conexoes' ? 'cliente-aba-ativa' : ''}`}
          onClick={() => setAbaAtiva('conexoes')}
        >
          Conexões
        </button>
      </div>

      {abaAtiva === 'fila' && <FilaOperacionalTab />}
      {abaAtiva === 'eventos' && <LogEventosTab />}
      {abaAtiva === 'saude' && <HealthDashboardTab />}
      {abaAtiva === 'conexoes' && <ConexoesTab />}    </div>
  )
}

/**
 * Rota de detalhe do cliente por módulo — mesmo padrão já usado no
 * App.jsx. Só cobre `tipo_origem = 'lead'`: candidatos de recrutamento
 * (`tipo_origem = 'curriculo'`) não têm ficha de cliente, são People,
 * não CRM comercial — não navega pra lugar nenhum, propositalmente.
 */
const ROTA_CLIENTE_POR_MODULO = {
  saude: (id) => `/clientes/${id}`,
  auto: (id) => `/lifleet/clientes/${id}`,
  lifsure: (id) => `/lifsure/clientes/${id}`,
  lishield: (id) => `/lishield/clientes/${id}`,
  lifplan: (id) => `/lifplan/clientes/${id}`,
}

function FilaOperacionalTab() {
  const [itens, setItens] = useState([])
  const [corretores, setCorretores] = useState([])
  const [carregando, setCarregando] = useState(true)
  const [busca, setBusca] = useState('')
  const [origem, setOrigem] = useState('')
  const [produto, setProduto] = useState('')
  const [atribuindoId, setAtribuindoId] = useState(null)

  useEffect(() => {
    carregar()
    listarCorretores().then(setCorretores)
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

  async function handleAtribuir(item, corretorId) {
    if (!corretorId) return
    setAtribuindoId(item.id)
    try {
      await atribuirResponsavel(item.id, corretorId)
      // A vw_connect_inbox já filtra por corretor_id is null — assim
      // que atribui, o registro some da fila sozinho no próximo carregar().
      await carregar()
    } catch (err) {
      console.error('[FilaOperacionalTab] Erro ao atribuir responsável:', err)
    }
    setAtribuindoId(null)
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
              <th>Atribuir Responsável</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {itens.map((item) => {
              const rotaCliente = item.tipo_origem === 'lead' && item.modulo ? ROTA_CLIENTE_POR_MODULO[item.modulo] : null
              return (
                <tr key={`${item.tipo_origem}-${item.id}`}>
                  <td>{item.nome}</td>
                  <td><span className="ls-badge">{ORIGEM_TIPO[item.tipo_origem] ?? item.tipo_origem}</span></td>
                  <td>{item.modulo ?? '—'}</td>
                  <td>{item.produto_interesse ?? '—'}</td>
                  <td>{item.origem_lead ?? '—'}</td>
                  <td>{formatarDataBR(item.criado_em)}</td>
                  <td>
                    {item.tipo_origem === 'lead' ? (
                      <select
                        defaultValue=""
                        disabled={atribuindoId === item.id}
                        onChange={(e) => handleAtribuir(item, e.target.value)}
                      >
                        <option value="" disabled>
                          {atribuindoId === item.id ? 'Atribuindo...' : 'Selecionar corretor'}
                        </option>
                        {corretores.map((c) => (
                          <option key={c.id} value={c.id}>{c.nome_completo}</option>
                        ))}
                      </select>
                    ) : (
                      <span title="Candidatos de recrutamento não têm corretor responsável — é fluxo de People, não CRM comercial.">—</span>
                    )}
                  </td>
                  <td>
                    {rotaCliente ? (
                      <Link to={rotaCliente(item.id)} className="cliente-tabela-btn">Ver Cliente</Link>
                    ) : (
                      <span title="Sem ficha de cliente pra este tipo de entrada">—</span>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
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

const SAUDE_LABEL = {
  ok: { label: 'OK', classe: 'lcds-badge-sucesso' },
  indisponivel: { label: 'Indisponível', classe: 'lcds-badge-critico' },
  nao_verificado: { label: 'Não verificado', classe: 'ls-badge' },
}

const CIRCUITO_LABEL = {
  closed: { label: 'Fechado', classe: 'lcds-badge-sucesso' },
  half_open: { label: 'Meio-aberto (testando)', classe: 'lcds-badge-alerta' },
  open: { label: 'Aberto (bloqueado)', classe: 'lcds-badge-critico' },
}

const VALIDACAO_LABEL = {
  validado: { label: 'Validado', classe: 'lcds-badge-sucesso' },
  revisao_necessaria: { label: '⚠️ Revisão Necessária', classe: 'lcds-badge-critico' },
  nunca_validado: { label: 'Nunca validado', classe: 'ls-badge' },
}

function HealthDashboardTab() {
  const [drivers, setDrivers] = useState([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState(null)

  useEffect(() => {
    carregar()
  }, [])

  async function carregar() {
    setCarregando(true)
    setErro(null)
    try {
      const dados = await obterPainelSaude()
      setDrivers(dados)
    } catch (e) {
      setErro('Não foi possível carregar o painel de saúde dos Drivers.')
    }
    setCarregando(false)
  }

  return (
    <div>
      <div style={{ marginBottom: '1rem' }}>
        <button className="ls-btn ls-btn-ghost" onClick={carregar}>Atualizar</button>
      </div>

      {carregando ? (
        <p className="cliente-carregando">Carregando painel de saúde...</p>
      ) : erro ? (
        <p className="cliente-vazio">{erro}</p>
      ) : drivers.length === 0 ? (
        <p className="cliente-vazio">Nenhum Driver registrado.</p>
      ) : (
        <table className="cliente-tabela">
          <thead>
            <tr>
              <th>Driver</th>
              <th>Provider / Capability</th>
              <th>Ambiente</th>
              <th>Saúde</th>
              <th>Circuito</th>
              <th>Contrato</th>
              <th>Chamadas</th>
              <th>Sucesso / Erro</th>
              <th>Tempo médio</th>
              <th>Último erro</th>
            </tr>
          </thead>
          <tbody>
            {drivers.map((d) => {
              const saude = SAUDE_LABEL[d.saude] ?? { label: d.saude, classe: 'ls-badge' }
              const circuito = CIRCUITO_LABEL[d.estadoCircuito] ?? { label: d.estadoCircuito, classe: 'ls-badge' }
              const validacao = VALIDACAO_LABEL[d.validacaoContrato?.status] ?? { label: '—', classe: 'ls-badge' }
              return (
                <tr key={d.nome}>
                  <td>{d.nome}</td>
                  <td>{d.provider} / {d.capability}</td>
                  <td>{d.ambiente}</td>
                  <td><span className={saude.classe}>{saude.label}</span></td>
                  <td><span className={circuito.classe}>{circuito.label}</span></td>
                  <td><span className={validacao.classe}>{validacao.label}</span></td>
                  <td>{d.metricas?.chamadas ?? 0}</td>
                  <td>{d.metricas?.sucessos ?? 0} / {d.metricas?.erros ?? 0}</td>
                  <td>{d.metricas?.tempoMedioMs != null ? `${d.metricas.tempoMedioMs}ms` : '—'}</td>
                  <td>{d.metricas?.ultimoErroMensagem ?? '—'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}

      <p className="connect-nota-rodape">
        Métricas e estado do Circuit Breaker vivem em memória da Edge Function — resetam em cold start
        e não são compartilhados entre instâncias simultâneas (limitação conhecida do ambiente serverless).
      </p>
    </div>
  )
}

const DIRECAO_LABEL = {
  entrada: { label: 'Entrada', classe: 'ls-badge' },
  saida: { label: 'Saída', classe: 'ls-badge' },
  bidirecional: { label: 'Bidirecional', classe: 'ls-badge' },
}

const ESTADO_ATIVACAO_LABEL = {
  preparado: { label: 'Preparado', classe: 'ls-badge' },
  aguardando_credenciais: { label: 'Aguardando Credenciais', classe: 'lcds-badge-alerta' },
  configurado: { label: 'Configurado', classe: 'lcds-badge-alerta' },
  testando: { label: 'Testando', classe: 'lcds-badge-alerta' },
  conectado: { label: 'Conectado', classe: 'lcds-badge-sucesso' },
}

const MODULOS_CONEXAO = [
  { valor: '', label: '(Organizacional — sem módulo)' },
  { valor: 'saude', label: 'Lifcare' },
  { valor: 'auto', label: 'Lifleet' },
  { valor: 'lifsure', label: 'Lifsure' },
  { valor: 'lishield', label: 'LiShield' },
  { valor: 'lifplan', label: 'Lifplan' },
]

/**
 * Aba Conexões (CONNECT-004C) — área única do Connect Center pra
 * gestão de Conexões, substituindo a tela que vivia em Configurações.
 * Provider vem do Provider Registry (institucional.providers) — como
 * as duas tabelas moram em schemas diferentes, o cruzamento entre
 * conexão e nome do Provider acontece aqui, no componente, não numa
 * query só (ver nota em conexoesService.listarTodasConexoes).
 */
function ConexoesTab() {
  const [conexoes, setConexoes] = useState([])
  const [providers, setProviders] = useState([])
  const [carregando, setCarregando] = useState(true)
  const [filtroDirecao, setFiltroDirecao] = useState('')
  const [mostrarFormulario, setMostrarFormulario] = useState(false)

  useEffect(() => {
    carregar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtroDirecao])

  async function carregar() {
    setCarregando(true)
    const [listaConexoes, listaProviders] = await Promise.all([
      listarTodasConexoes({ direcao: filtroDirecao || undefined }),
      listarProviders(),
    ])
    setConexoes(listaConexoes)
    setProviders(listaProviders)
    setCarregando(false)
  }

  const providersPorId = Object.fromEntries(providers.map((p) => [p.id, p]))

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <div className="cotacao-form-linha" style={{ marginBottom: 0 }}>
          <div>
            <label>Direção</label>
            <select value={filtroDirecao} onChange={(e) => setFiltroDirecao(e.target.value)}>
              <option value="">Todas</option>
              <option value="entrada">Entrada</option>
              <option value="saida">Saída</option>
              <option value="bidirecional">Bidirecional</option>
            </select>
          </div>
        </div>
        <button className="ls-btn ls-btn-primary" onClick={() => setMostrarFormulario(true)}>
          + Nova Conexão
        </button>
      </div>

      {carregando ? (
        <p className="cliente-carregando">Carregando conexões...</p>
      ) : conexoes.length === 0 ? (
        <p className="cliente-vazio">Nenhuma conexão com esse filtro.</p>
      ) : (
        <table className="cliente-tabela">
          <thead>
            <tr>
              <th>Provider</th>
              <th>Módulo</th>
              <th>Direção</th>
              <th>Mecanismo</th>
              <th>Estado</th>
              <th>Ambiente</th>
            </tr>
          </thead>
          <tbody>
            {conexoes.map((c) => {
              const provider = c.provider_id ? providersPorId[c.provider_id] : null
              const direcao = DIRECAO_LABEL[c.direcao] ?? { label: c.direcao ?? '—', classe: 'ls-badge' }
              const estado = ESTADO_ATIVACAO_LABEL[c.estado_ativacao] ?? { label: c.estado_ativacao ?? '—', classe: 'ls-badge' }
              return (
                <tr key={c.id}>
                  <td>
                    {provider ? provider.nome : (
                      <span title="Registro anterior ao BMR-003, sem Provider correspondente no Registry">
                        {c.nome_operadora} <span className="ls-badge">legado</span>
                      </span>
                    )}
                  </td>
                  <td>{c.modulo ?? <span title="Conexão organizacional, não vinculada a um módulo (BMR-002)">Organizacional</span>}</td>
                  <td><span className={direcao.classe}>{direcao.label}</span></td>
                  <td>{c.tipo_conexao ?? '—'}</td>
                  <td><span className={estado.classe}>{estado.label}</span></td>
                  <td>{c.ambiente ?? '—'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}

      {mostrarFormulario && (
        <NovaConexaoModal
          providers={providers}
          onFechar={() => setMostrarFormulario(false)}
          onCriada={() => {
            setMostrarFormulario(false)
            carregar()
          }}
        />
      )}
    </div>
  )
}

function NovaConexaoModal({ providers, onFechar, onCriada }) {
  const [providerId, setProviderId] = useState('')
  const [modulo, setModulo] = useState('')
  const [direcao, setDirecao] = useState('')
  const [tipoConexao, setTipoConexao] = useState('manual')
  const [ambiente, setAmbiente] = useState('homologacao')
  const [nomeOperadora, setNomeOperadora] = useState('')
  const [organizacaoId, setOrganizacaoId] = useState(null)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')

  useEffect(() => {
    obterOrganizacaoPadrao()
      .then(setOrganizacaoId)
      .catch(() => setErro('Não foi possível carregar a organização padrão (Configuration Registry). Tente novamente ou avise o time técnico.'))
  }, [])

  async function handleSubmit(e) {
    e.preventDefault()
    setErro('')

    if (!organizacaoId) {
      setErro('Organização padrão ainda não carregada — aguarde um instante e tente de novo.')
      return
    }
    if (!providerId) {
      setErro('Selecione um Provider — toda conexão nova precisa referenciar um Provider real do Registry.')
      return
    }
    if (!direcao) {
      setErro('Selecione a direção (entrada, saída ou bidirecional) — campo obrigatório desde o BMR-002.')
      return
    }

    setSalvando(true)
    try {
      await criarConexaoOperadora({
        organizacaoId,
        providerId,
        modulo: modulo || null,
        direcao,
        tipoConexao,
        ambiente,
        nomeOperadora: nomeOperadora || providers.find((p) => p.id === providerId)?.nome,
      })
      onCriada()
    } catch (err) {
      setErro(err.message)
    }
    setSalvando(false)
  }

  return (
    <div className="connect-payload-overlay" onClick={onFechar}>
      <div className="connect-payload-modal" onClick={(e) => e.stopPropagation()}>
        <div className="connect-payload-header">
          <strong>Nova Conexão</strong>
          <button className="ls-btn ls-btn-ghost" onClick={onFechar}>Fechar</button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label>Provider *</label>
            <select value={providerId} onChange={(e) => setProviderId(e.target.value)} required>
              <option value="">Selecione...</option>
              {providers.map((p) => (
                <option key={p.id} value={p.id}>{p.nome}</option>
              ))}
            </select>
          </div>

          <div>
            <label>Módulo</label>
            <select value={modulo} onChange={(e) => setModulo(e.target.value)}>
              {MODULOS_CONEXAO.map((m) => (
                <option key={m.valor} value={m.valor}>{m.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label>Direção *</label>
            <select value={direcao} onChange={(e) => setDirecao(e.target.value)} required>
              <option value="">Selecione...</option>
              <option value="entrada">Entrada</option>
              <option value="saida">Saída</option>
              <option value="bidirecional">Bidirecional</option>
            </select>
          </div>

          <div>
            <label>Mecanismo</label>
            <select value={tipoConexao} onChange={(e) => setTipoConexao(e.target.value)}>
              <option value="manual">Manual</option>
              <option value="tabela">Tabela</option>
              <option value="api">API</option>
            </select>
          </div>

          <div>
            <label>Ambiente</label>
            <select value={ambiente} onChange={(e) => setAmbiente(e.target.value)}>
              <option value="desenvolvimento">Desenvolvimento</option>
              <option value="homologacao">Homologação</option>
              <option value="producao">Produção</option>
            </select>
          </div>

          {erro && <p className="ls-modal-erro">{erro}</p>}

          <button type="submit" className="ls-btn ls-btn-primary" disabled={salvando} style={{ width: '100%' }}>
            {salvando ? 'Salvando...' : 'Criar Conexão'}
          </button>
        </form>
      </div>
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
