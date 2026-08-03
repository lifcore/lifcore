import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  buscarClienteProspectCompleto,
  atualizarStatusClienteProspect,
  excluirClienteProspect,
  atualizarClienteProspect,
  criarDemandaManual,
  atualizarDemanda,
  adicionarAtualizacaoManual,
  excluirCotacao,
} from '../../lib/crm/clientesService'
import { listarApolicesLishieldDoCliente, excluirApoliceLishield } from '../../lib/crm/lishieldService'
import { listarTemplates, montarLinkWhatsApp, personalizarMensagem } from '../../lib/crm/templatesService'
import { listarCorretores } from '../../lib/crm/apolicesService'
import { formatarDataBR } from '../../lib/utils/formatarData'
import { DadosCadastraisTab } from '../crm/ClienteDetailPage'
import CotacaoLishieldForm from './CotacaoLishieldForm'
import ApoliceLishieldForm from './ApoliceLishieldForm'
import EspecialistaLishield from '../especialista/EspecialistaLishield'
import { useAuth } from '../auth/AuthContext'
import BotaoGerarRelatorio from '../../components/BotaoGerarRelatorio'
import BotaoOperacaoCritica from '../../components/BotaoOperacaoCritica'

const ABAS = ['Dados Cadastrais', 'Cotações', 'Apólices', 'Demandas']

export default function ClienteDetailLishieldPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { perfil } = useAuth()
  const ehMaster = perfil?.papel === 'master'
  const [dados, setDados] = useState(null)
  const [apolices, setApolices] = useState([])
  const [abaAtiva, setAbaAtiva] = useState('Demandas')
  const [mostrarWhatsApp, setMostrarWhatsApp] = useState(false)
  const [mostrarTransferir, setMostrarTransferir] = useState(false)

  useEffect(() => {
    carregar()
  }, [id])

  async function carregar() {
    const [resultado, listaApolices] = await Promise.all([
      buscarClienteProspectCompleto(id),
      listarApolicesLishieldDoCliente(id),
    ])
    setDados(resultado)
    setApolices(listaApolices)
  }

  async function excluirEVoltar() {
    await excluirClienteProspect(id)
    navigate('/lishield')
  }

  async function handleMarcarInativo() {
    await atualizarStatusClienteProspect(id, 'inativo')
    navigate('/lishield')
  }

  if (!dados) return <p className="cliente-carregando">Carregando...</p>

  const { cliente, contatos, cotacoes, demandas, grupoInfo } = dados
  const contatoPrimario = contatos.find((c) => c.tipo === 'primario') ?? {}
  const contatoSecundario = contatos.find((c) => c.tipo === 'secundario') ?? {}

  return (
    <div className="cliente-detail-page">
      <button className="cliente-voltar" onClick={() => navigate('/lishield')}>&larr; Voltar ao pipeline</button>

      <div className="cliente-detail-header">
        <div>
          <h2>{cliente.razao_social}</h2>
          <span className={`ls-badge ls-badge-${cliente.status}`}>{cliente.status}</span>
        </div>
        <div className="cliente-detail-header-direita">
          {cliente.data_vigencia && (
            <div className="cliente-vigencia">
              Vigência: <strong>{formatarDataBR(cliente.data_vigencia)}</strong>
            </div>
          )}
          <div className="cliente-acoes-perigo">
            <button className="ls-btn ls-btn-accent" onClick={() => setMostrarWhatsApp(true)}>💬 WhatsApp</button>
            <BotaoGerarRelatorio clienteId={cliente.id} />
            {ehMaster && (
              <button className="ls-btn ls-btn-ghost" onClick={() => setMostrarTransferir(true)}>🔁 Transferir</button>
            )}
            <button className="ls-btn ls-btn-ghost" onClick={handleMarcarInativo}>Marcar Inativo</button>
            <BotaoOperacaoCritica
              label="Excluir"
              tabelaAfetada="operacional.clientes_prospects"
              registroId={cliente.id}
              dadosAntes={cliente}
              executar={excluirEVoltar}
              className="cliente-btn-excluir"
            />
          </div>
        </div>
      </div>

      {mostrarTransferir && (
        <TransferirClienteLishieldModal
          clienteId={cliente.id}
          corretorAtualId={cliente.corretor_id}
          onFechar={() => setMostrarTransferir(false)}
          onTransferido={() => {
            setMostrarTransferir(false)
            navigate('/lishield')
          }}
        />
      )}

      <div className="cliente-abas">
        {ABAS.map((aba) => (
          <button
            key={aba}
            className={`cliente-aba ${abaAtiva === aba ? 'cliente-aba-ativa' : ''}`}
            onClick={() => setAbaAtiva(aba)}
          >
            {aba}
          </button>
        ))}
      </div>

      <div className="cliente-aba-conteudo">
        {abaAtiva === 'Dados Cadastrais' && (
          <DadosCadastraisTab
            cliente={cliente}
            contatoPrimario={contatoPrimario}
            contatoSecundario={contatoSecundario}
            grupoInfo={grupoInfo}
            onSalvo={carregar}
          />
        )}

        {abaAtiva === 'Cotações' && (
          <CotacoesLishieldTab clienteId={cliente.id} cotacoes={cotacoes} onAtualizado={carregar} />
        )}

        {abaAtiva === 'Apólices' && (
          <ApolicesLishieldTab
            apolices={apolices}
            clienteProspectId={cliente.id}
            onAtualizado={carregar}
          />
        )}

        {abaAtiva === 'Demandas' && (
          <DemandasLishieldTab demandas={demandas} cliente={cliente} onAtualizado={carregar} />
        )}
      </div>

      {mostrarWhatsApp && (
        <WhatsAppLishieldModal
          contatoPrimario={contatoPrimario}
          nomeEmpresa={cliente.razao_social}
          apoliceRecente={apolices[0] ?? null}
          onFechar={() => setMostrarWhatsApp(false)}
        />
      )}
    </div>
  )
}

function CotacoesLishieldTab({ clienteId, cotacoes, onAtualizado }) {
  const [mostrarForm, setMostrarForm] = useState(false)
  const [cotacaoEditando, setCotacaoEditando] = useState(null)

  async function handleExcluir(cotacaoId) {
    if (!window.confirm('Excluir esta cotação?')) return
    await excluirCotacao(cotacaoId)
    onAtualizado()
  }

  return (
    <div>
      {!mostrarForm && !cotacaoEditando && (
        <button className="ls-btn ls-btn-accent" onClick={() => setMostrarForm(true)}>
          + Registrar Cotação
        </button>
      )}

      {(mostrarForm || cotacaoEditando) && (
        <CotacaoLishieldForm
          clienteProspectId={clienteId}
          cotacaoExistente={cotacaoEditando}
          onSalvo={() => {
            setMostrarForm(false)
            setCotacaoEditando(null)
            onAtualizado()
          }}
          onCancelar={() => {
            setMostrarForm(false)
            setCotacaoEditando(null)
          }}
        />
      )}

      {cotacoes.length === 0 ? (
        <p className="cliente-vazio">Nenhuma cotação registrada ainda.</p>
      ) : (
        <div className="cotacoes-historico" style={{ marginTop: '1rem' }}>
          {cotacoes.map((cot) => (
            <div key={cot.id} className="ls-card cotacao-item">
              <div className="cotacao-item-header">
                <strong>{cot.operadora_nome_livre}</strong>
                <span>R$ {Number(cot.valor_total ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                <span>Válida até: {cot.validade ? formatarDataBR(cot.validade) : '—'}</span>
              </div>
              <div className="cliente-tabela-acoes" style={{ marginTop: '0.6rem' }}>
                <button className="cliente-tabela-btn" onClick={() => setCotacaoEditando(cot)}>Editar</button>
                <button className="cliente-tabela-btn cliente-tabela-btn-perigo" onClick={() => handleExcluir(cot.id)}>Excluir</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function ApolicesLishieldTab({ apolices, clienteProspectId, onAtualizado }) {
  const [mostrarForm, setMostrarForm] = useState(false)
  const [apoliceEditando, setApoliceEditando] = useState(null)

  return (
    <div>
      {!mostrarForm && !apoliceEditando && (
        <button className="ls-btn ls-btn-accent" onClick={() => setMostrarForm(true)}>
          + Nova Apólice
        </button>
      )}

      {(mostrarForm || apoliceEditando) && (
        <ApoliceLishieldForm
          clienteProspectId={clienteProspectId}
          apoliceExistente={apoliceEditando}
          onSalvo={() => {
            setMostrarForm(false)
            setApoliceEditando(null)
            onAtualizado()
          }}
          onCancelar={() => {
            setMostrarForm(false)
            setApoliceEditando(null)
          }}
        />
      )}

      {apolices.length === 0 ? (
        <p className="cliente-vazio">Nenhuma apólice lançada ainda.</p>
      ) : (
        <div className="cotacoes-historico" style={{ marginTop: '1rem' }}>
          {apolices.map((ap) => (
            <div key={ap.id} className="ls-card cotacao-item">
              <div className="cotacao-item-header">
                <strong>{ap.operadora_nome_livre ?? '—'}</strong>
                <span className="ls-badge ls-badge-prospect">{ap.produto}</span>
                {ap.numero_apolice && <span className="ls-mono">Apólice: {ap.numero_apolice}</span>}
                <span>R$ {Number(ap.premio ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                <span>Vigência: {ap.vigencia_fim ? formatarDataBR(ap.vigencia_fim) : '—'}</span>
              </div>
              {ap.detalhes_produto && (
                <p className="config-instrucao" style={{ marginTop: '0.5rem', whiteSpace: 'pre-wrap' }}>{ap.detalhes_produto}</p>
              )}
              <div className="cliente-tabela-acoes" style={{ marginTop: '0.6rem' }}>
                <button className="cliente-tabela-btn" onClick={() => setApoliceEditando(ap)}>Editar</button>
                <BotaoOperacaoCritica
                  label="Excluir"
                  tabelaAfetada="operacional.apolices"
                  registroId={ap.id}
                  dadosAntes={ap}
                  executar={() => excluirApoliceLishield(ap.id)}
                  onSucesso={onAtualizado}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function traduzirSituacaoLishield(situacao) {
  const mapa = {
    aberto: 'Aberta',
    em_andamento: 'Em andamento',
    aguardando_operadora: 'Aguardando Seguradora',
    aguardando_cliente: 'Aguardando cliente',
    resolvido: 'Resolvida',
    encerrado: 'Fechada',
  }
  return mapa[situacao] ?? situacao
}

function DemandasLishieldTab({ demandas, cliente, onAtualizado }) {
  const [mostrarForm, setMostrarForm] = useState(false)
  const [descricao, setDescricao] = useState('')
  const [dataAcao, setDataAcao] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [demandaSelecionada, setDemandaSelecionada] = useState(null)

  async function handleAbrirDemanda() {
    if (!descricao.trim()) return
    setSalvando(true)
    try {
      await criarDemandaManual({
        clienteProspectId: cliente.id,
        organizacaoId: cliente.organizacao_id,
        descricao,
        dataProximaAcao: dataAcao || null,
        codigoRpc: 'gerar_codigo_demanda_lishield',
      })
      setDescricao('')
      setDataAcao('')
      setMostrarForm(false)
      onAtualizado()
    } finally {
      setSalvando(false)
    }
  }

  const demandasOrdenadas = [...demandas].sort((a, b) => {
    const aFinalizada = a.situacao === 'resolvido' || a.situacao === 'encerrado'
    const bFinalizada = b.situacao === 'resolvido' || b.situacao === 'encerrado'
    if (aFinalizada === bFinalizada) return 0
    return aFinalizada ? 1 : -1
  })

  return (
    <div>
      <div className="demandas-header-acoes">
        {!mostrarForm && (
          <button className="ls-btn ls-btn-accent" onClick={() => setMostrarForm(true)}>
            + Abrir Demanda
          </button>
        )}
      </div>

      {mostrarForm && (
        <div className="ls-card demanda-form">
          <label>O que o cliente pediu?</label>
          <input
            value={descricao}
            onChange={(e) => setDescricao(e.target.value)}
            placeholder="Ex: Cliente solicitou revisão de LMI da apólice de RC"
          />
          <label>Data para próxima ação</label>
          <input type="date" value={dataAcao} onChange={(e) => setDataAcao(e.target.value)} />
          <div className="ls-modal-acoes">
            <button className="ls-btn ls-btn-ghost" onClick={() => setMostrarForm(false)}>Cancelar</button>
            <button className="ls-btn ls-btn-primary" onClick={handleAbrirDemanda} disabled={salvando}>
              {salvando ? 'Abrindo...' : 'Abrir Demanda'}
            </button>
          </div>
        </div>
      )}

      {demandasOrdenadas.length === 0 ? (
        <p className="cliente-vazio">Nenhuma demanda para este cliente.</p>
      ) : (
        <div className="ls-card" style={{ marginTop: '1rem', padding: 0 }}>
          <table className="cliente-tabela">
            <thead>
              <tr><th>Código</th><th>Demanda</th><th>Situação</th><th>Próxima ação</th><th>Aberto em</th></tr>
            </thead>
            <tbody>
              {demandasOrdenadas.map((d) => {
                const finalizada = d.situacao === 'resolvido' || d.situacao === 'encerrado'
                return (
                  <tr
                    key={d.id}
                    className={`demanda-linha-clicavel ${finalizada ? 'demanda-linha-finalizada' : ''}`}
                    onClick={() => setDemandaSelecionada(d)}
                  >
                    <td className="ls-mono">{d.codigo}</td>
                    <td>{d.demanda_original ?? d.categoria ?? '—'}</td>
                    <td><span className="ls-badge ls-badge-prospect">{traduzirSituacaoLishield(d.situacao)}</span></td>
                    <td>{d.data_proxima_acao ? formatarDataBR(d.data_proxima_acao) : '—'}</td>
                    <td>{new Date(d.criado_em).toLocaleDateString('pt-BR')}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {demandaSelecionada && (
        <DemandaDetailLishieldModal
          demanda={demandaSelecionada}
          onFechar={() => setDemandaSelecionada(null)}
          onSalvoSemFechar={onAtualizado}
          onAtualizado={() => {
            setDemandaSelecionada(null)
            onAtualizado()
          }}
        />
      )}
    </div>
  )
}

/** Painel de detalhe da Demanda — sem Especialista ainda (o LiShield ainda não tem IA própria construída) */
function DemandaDetailLishieldModal({ demanda, onFechar, onAtualizado, onSalvoSemFechar }) {
  const { perfil } = useAuth()
  const [editando, setEditando] = useState(false)
  const [situacao, setSituacao] = useState(demanda.situacao)
  const [dataProximaAcao, setDataProximaAcao] = useState(demanda.data_proxima_acao ?? '')
  const [novaAtualizacao, setNovaAtualizacao] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [abrirEspecialista, setAbrirEspecialista] = useState(false)

  async function handleSalvar() {
    setSalvando(true)
    try {
      await atualizarDemanda(demanda.id, { situacao, dataProximaAcao })
      if (novaAtualizacao.trim()) {
        await adicionarAtualizacaoManual(demanda.id, novaAtualizacao, perfil?.id)
      }
      setNovaAtualizacao('')
      setEditando(false)
      if (situacao === 'encerrado') {
        onAtualizado()
      } else {
        onSalvoSemFechar?.()
      }
    } finally {
      setSalvando(false)
    }
  }

  if (abrirEspecialista) {
    return (
      <div className="ls-modal-overlay" onClick={onFechar}>
        <div className="especialista-modal" onClick={(e) => e.stopPropagation()}>
          <button className="especialista-modal-fechar" onClick={onFechar}>✕</button>
          <EspecialistaLishield clienteProspectIdInicial={demanda.cliente_prospect_id} casoIdContinuacao={demanda.id} />
        </div>
      </div>
    )
  }

  return (
    <div className="ls-modal-overlay" onClick={editando ? undefined : onFechar}>
      <div className="ls-modal" onClick={(e) => e.stopPropagation()}>
        <h3>{demanda.codigo}</h3>
        <p className="config-instrucao">{demanda.demanda_original}</p>

        {!editando ? (
          <>
            <p><strong>Situação:</strong> {traduzirSituacaoLishield(demanda.situacao)}</p>
            <p><strong>Próxima ação:</strong> {demanda.data_proxima_acao ? formatarDataBR(demanda.data_proxima_acao) : '—'}</p>
            <div className="ls-modal-acoes">
              <button className="ls-btn ls-btn-ghost" onClick={onFechar}>Fechar</button>
              <button className="ls-btn ls-btn-accent" onClick={() => setAbrirEspecialista(true)}>🧠 Especialista</button>
              <button className="ls-btn ls-btn-primary" onClick={() => setEditando(true)}>Editar Demanda</button>
            </div>
          </>
        ) : (
          <>
            <label>Situação</label>
            <select className="demanda-select-status" value={situacao} onChange={(e) => setSituacao(e.target.value)}>
              <option value="aberto">Aberta</option>
              <option value="em_andamento">Em andamento</option>
              <option value="aguardando_operadora">Aguardando Seguradora</option>
              <option value="aguardando_cliente">Aguardando cliente</option>
              <option value="resolvido">Resolvida</option>
              <option value="encerrado">Encerrado</option>
            </select>

            <label>Próxima ação (data)</label>
            <input type="date" value={dataProximaAcao ?? ''} onChange={(e) => setDataProximaAcao(e.target.value)} />

            <label>Adicionar atualização (fica registrado, não pode ser apagado depois)</label>
            <textarea
              value={novaAtualizacao}
              onChange={(e) => setNovaAtualizacao(e.target.value)}
              rows={3}
              style={{ width: '100%', padding: '0.5rem 0.65rem', border: '1px solid var(--ls-border)', borderRadius: 'var(--ls-radius-sm)', fontFamily: 'inherit' }}
            />

            <div className="ls-modal-acoes">
              <button className="ls-btn ls-btn-ghost" onClick={() => setEditando(false)}>Cancelar</button>
              <button className="ls-btn ls-btn-primary" onClick={handleSalvar} disabled={salvando}>
                {salvando ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function WhatsAppLishieldModal({ contatoPrimario, nomeEmpresa, apoliceRecente, onFechar }) {
  const { perfil } = useAuth()
  const [templates, setTemplates] = useState([])
  const [templateSelecionado, setTemplateSelecionado] = useState(null)
  const [textoEditavel, setTextoEditavel] = useState('')
  const [carregando, setCarregando] = useState(true)

  const textoVigencia = apoliceRecente?.vigencia_fim ? formatarDataBR(apoliceRecente.vigencia_fim) : ''

  useEffect(() => {
    listarTemplates('lishield').then((lista) => {
      setTemplates(lista)
      setCarregando(false)
    })
  }, [])

  function selecionarTemplate(t) {
    setTemplateSelecionado(t)
    setTextoEditavel(
      personalizarMensagem(t.corpo, {
        nomeContato: contatoPrimario?.nome,
        nomeEmpresa,
        nomeCorretor: perfil?.nome_completo,
        vigencia: textoVigencia,
      })
    )
  }

  function handleAbrirWhatsApp() {
    if (!contatoPrimario?.celular) {
      alert('Este cliente não tem celular cadastrado no Contato Primário. Cadastre em Dados Cadastrais primeiro.')
      return
    }
    const link = montarLinkWhatsApp(contatoPrimario.celular, textoEditavel)
    window.open(link, '_blank')
    onFechar()
  }

  return (
    <div className="ls-modal-overlay" onClick={onFechar}>
      <div className="ls-modal" onClick={(e) => e.stopPropagation()}>
        <h3>Enviar mensagem por WhatsApp</h3>

        {!contatoPrimario?.celular && (
          <p className="ls-modal-erro">
            ⚠️ Sem celular cadastrado no Contato Primário — cadastre antes de enviar.
          </p>
        )}

        {carregando ? (
          <p>Carregando mensagens...</p>
        ) : templates.length === 0 ? (
          <p className="cliente-vazio-inline">
            Nenhuma mensagem padrão cadastrada ainda para o LiShield. Cadastre em "Mensagens Padrão" no menu lateral.
          </p>
        ) : (
          <>
            <label>Escolha uma mensagem padrão</label>
            <div className="especialista-lista-clientes" style={{ marginBottom: '0.75rem' }}>
              {templates.map((t) => (
                <button
                  key={t.id}
                  className="especialista-cliente-item"
                  onClick={() => selecionarTemplate(t)}
                  style={templateSelecionado?.id === t.id ? { borderColor: 'var(--ls-accent)' } : {}}
                >
                  {t.titulo}
                </button>
              ))}
            </div>

            {templateSelecionado && (
              <>
                <label>Texto (pode editar antes de enviar)</label>
                <textarea
                  value={textoEditavel}
                  onChange={(e) => setTextoEditavel(e.target.value)}
                  rows={5}
                  style={{ width: '100%', padding: '0.5rem 0.65rem', border: '1px solid var(--ls-border)', borderRadius: 'var(--ls-radius-sm)', fontFamily: 'inherit' }}
                />
              </>
            )}
          </>
        )}

        <div className="ls-modal-acoes">
          <button className="ls-btn ls-btn-ghost" onClick={onFechar}>Cancelar</button>
          <button
            className="ls-btn ls-btn-primary"
            onClick={handleAbrirWhatsApp}
            disabled={!templateSelecionado}
          >
            Abrir WhatsApp
          </button>
        </div>
      </div>
    </div>
  )
}

function TransferirClienteLishieldModal({ clienteId, corretorAtualId, onFechar, onTransferido }) {
  const [corretores, setCorretores] = useState([])
  const [corretorDestinoId, setCorretorDestinoId] = useState('')
  const [transferindo, setTransferindo] = useState(false)
  const [erro, setErro] = useState(null)

  useEffect(() => {
    listarCorretores().then(setCorretores)
  }, [])

  async function handleTransferir() {
    if (!corretorDestinoId) {
      setErro('Escolha o corretor de destino.')
      return
    }
    setTransferindo(true)
    setErro(null)
    try {
      await atualizarClienteProspect(clienteId, { corretor_id: corretorDestinoId })
      onTransferido()
    } catch (err) {
      setErro(err.message)
    } finally {
      setTransferindo(false)
    }
  }

  return (
    <div className="ls-modal-overlay" onClick={onFechar}>
      <div className="ls-modal" onClick={(e) => e.stopPropagation()}>
        <h3>Transferir Cliente</h3>
        <p className="config-instrucao">
          Escolha pra qual corretor este cliente deve passar a ser atendido. O histórico
          (apólices, cotações, demandas) é mantido, só o dono do cadastro muda.
        </p>

        <label>Novo corretor responsável</label>
        <select value={corretorDestinoId} onChange={(e) => setCorretorDestinoId(e.target.value)}>
          <option value="">Selecione...</option>
          {corretores.filter((c) => c.id !== corretorAtualId).map((c) => (
            <option key={c.id} value={c.id}>{c.nome_completo}</option>
          ))}
        </select>

        {erro && <p className="ls-modal-erro">{erro}</p>}

        <div className="ls-modal-acoes">
          <button className="ls-btn ls-btn-ghost" onClick={onFechar}>Cancelar</button>
          <button className="ls-btn ls-btn-primary" onClick={handleTransferir} disabled={transferindo}>
            {transferindo ? 'Transferindo...' : 'Transferir'}
          </button>
        </div>
      </div>
    </div>
  )
}