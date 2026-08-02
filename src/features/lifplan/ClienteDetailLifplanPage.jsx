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
import { listarContratosLifplanDoCliente, excluirContratoLifplan } from '../../lib/crm/lifplanService'
import { listarTemplates, montarLinkWhatsApp, personalizarMensagem } from '../../lib/crm/templatesService'
import { listarCorretores } from '../../lib/crm/apolicesService'
import { gerarResumoCandidato, criarCandidatoConhecimento, aprovarCandidatoComoCasoReal, rejeitarCandidato } from '../../lib/crm/aprendizadoService'
import { formatarDataBR } from '../../lib/utils/formatarData'
import { DadosCadastraisTab } from '../crm/ClienteDetailPage'
import PropostaLifplanForm from './PropostaLifplanForm'
import ContratoLifplanForm from './ContratoLifplanForm'
import EspecialistaLifplan from '../especialista/EspecialistaLifplan'
import { useAuth } from '../auth/AuthContext'
import BotaoOperacaoCritica from '../../components/BotaoOperacaoCritica'

const ABAS = ['Dados Cadastrais', 'Propostas', 'Contratos', 'Demandas']

export default function ClienteDetailLifplanPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { perfil } = useAuth()
  const ehMaster = perfil?.papel === 'master'
  const [dados, setDados] = useState(null)
  const [contratos, setContratos] = useState([])
  const [abaAtiva, setAbaAtiva] = useState('Demandas')
  const [mostrarWhatsApp, setMostrarWhatsApp] = useState(false)
  const [mostrarTransferir, setMostrarTransferir] = useState(false)

  useEffect(() => {
    carregar()
  }, [id])

  async function carregar() {
    const [resultado, listaContratos] = await Promise.all([
      buscarClienteProspectCompleto(id),
      listarContratosLifplanDoCliente(id),
    ])
    setDados(resultado)
    setContratos(listaContratos)
  }

  async function excluirEVoltar() {
    await excluirClienteProspect(id)
    navigate('/lifplan')
  }

  async function handleMarcarInativo() {
    await atualizarStatusClienteProspect(id, 'inativo')
    navigate('/lifplan')
  }

  if (!dados) return <p className="cliente-carregando">Carregando...</p>

  const { cliente, contatos, cotacoes, demandas, grupoInfo } = dados
  const contatoPrimario = contatos.find((c) => c.tipo === 'primario') ?? {}
  const contatoSecundario = contatos.find((c) => c.tipo === 'secundario') ?? {}

  return (
    <div className="cliente-detail-page">
      <button className="cliente-voltar" onClick={() => navigate('/lifplan')}>&larr; Voltar ao pipeline</button>

      <div className="cliente-detail-header">
        <div>
          <h2>{cliente.razao_social}</h2>
          <span className={`ls-badge ls-badge-${cliente.status}`}>{cliente.status}</span>
        </div>
        <div className="cliente-detail-header-direita">
          {cliente.data_vigencia && (
            <div className="cliente-vigencia">
              Data relevante: <strong>{formatarDataBR(cliente.data_vigencia)}</strong>
            </div>
          )}
          <div className="cliente-acoes-perigo">
            <button className="ls-btn ls-btn-accent" onClick={() => setMostrarWhatsApp(true)}>💬 WhatsApp</button>
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
        <TransferirClienteLifplanModal
          clienteId={cliente.id}
          corretorAtualId={cliente.corretor_id}
          onFechar={() => setMostrarTransferir(false)}
          onTransferido={() => {
            setMostrarTransferir(false)
            navigate('/lifplan')
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

        {abaAtiva === 'Propostas' && (
          <PropostasLifplanTab clienteId={cliente.id} cotacoes={cotacoes} onAtualizado={carregar} />
        )}

        {abaAtiva === 'Contratos' && (
          <ContratosLifplanTab
            contratos={contratos}
            clienteProspectId={cliente.id}
            onAtualizado={carregar}
          />
        )}

        {abaAtiva === 'Demandas' && (
          <DemandasLifplanTab demandas={demandas} cliente={cliente} onAtualizado={carregar} />
        )}
      </div>

      {mostrarWhatsApp && (
        <WhatsAppLifplanModal
          contatoPrimario={contatoPrimario}
          nomeEmpresa={cliente.razao_social}
          contratoRecente={contratos[0] ?? null}
          onFechar={() => setMostrarWhatsApp(false)}
        />
      )}
    </div>
  )
}

function PropostasLifplanTab({ clienteId, cotacoes, onAtualizado }) {
  const [mostrarForm, setMostrarForm] = useState(false)
  const [propostaEditando, setPropostaEditando] = useState(null)

  async function handleExcluir(propostaId) {
    if (!window.confirm('Excluir esta proposta?')) return
    await excluirCotacao(propostaId)
    onAtualizado()
  }

  return (
    <div>
      {!mostrarForm && !propostaEditando && (
        <button className="ls-btn ls-btn-accent" onClick={() => setMostrarForm(true)}>
          + Registrar Proposta
        </button>
      )}

      {(mostrarForm || propostaEditando) && (
        <PropostaLifplanForm
          clienteProspectId={clienteId}
          cotacaoExistente={propostaEditando}
          onSalvo={() => {
            setMostrarForm(false)
            setPropostaEditando(null)
            onAtualizado()
          }}
          onCancelar={() => {
            setMostrarForm(false)
            setPropostaEditando(null)
          }}
        />
      )}

      {cotacoes.length === 0 ? (
        <p className="cliente-vazio">Nenhuma proposta registrada ainda.</p>
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
                <button className="cliente-tabela-btn" onClick={() => setPropostaEditando(cot)}>Editar</button>
                <button className="cliente-tabela-btn cliente-tabela-btn-perigo" onClick={() => handleExcluir(cot.id)}>Excluir</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function ContratosLifplanTab({ contratos, clienteProspectId, onAtualizado }) {
  const [mostrarForm, setMostrarForm] = useState(false)
  const [contratoEditando, setContratoEditando] = useState(null)

  return (
    <div>
      {!mostrarForm && !contratoEditando && (
        <button className="ls-btn ls-btn-accent" onClick={() => setMostrarForm(true)}>
          + Novo Contrato
        </button>
      )}

      {(mostrarForm || contratoEditando) && (
        <ContratoLifplanForm
          clienteProspectId={clienteProspectId}
          contratoExistente={contratoEditando}
          onSalvo={() => {
            setMostrarForm(false)
            setContratoEditando(null)
            onAtualizado()
          }}
          onCancelar={() => {
            setMostrarForm(false)
            setContratoEditando(null)
          }}
        />
      )}

      {contratos.length === 0 ? (
        <p className="cliente-vazio">Nenhum contrato lançado ainda.</p>
      ) : (
        <div className="cotacoes-historico" style={{ marginTop: '1rem' }}>
          {contratos.map((c) => (
            <div key={c.id} className="ls-card cotacao-item">
              <div className="cotacao-item-header">
                <strong>{c.operadora_nome_livre ?? '—'}</strong>
                <span className="ls-badge ls-badge-prospect">{c.produto}</span>
                {c.numero_apolice && <span className="ls-mono">Contrato: {c.numero_apolice}</span>}
                <span>R$ {Number(c.premio ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                <span>Vencimento: {c.vigencia_fim ? formatarDataBR(c.vigencia_fim) : '—'}</span>
              </div>
              {c.detalhes_produto && (
                <p className="config-instrucao" style={{ marginTop: '0.5rem', whiteSpace: 'pre-wrap' }}>{c.detalhes_produto}</p>
              )}
              <div className="cliente-tabela-acoes" style={{ marginTop: '0.6rem' }}>
                <button className="cliente-tabela-btn" onClick={() => setContratoEditando(c)}>Editar</button>
                <BotaoOperacaoCritica
                  label="Excluir"
                  tabelaAfetada="lifplanService.contratos"
                  registroId={c.id}
                  dadosAntes={c}
                  executar={() => excluirContratoLifplan(c.id)}
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

function traduzirSituacaoLifplan(situacao) {
  const mapa = {
    aberto: 'Aberta',
    em_andamento: 'Em andamento',
    aguardando_operadora: 'Aguardando Instituição',
    aguardando_cliente: 'Aguardando cliente',
    resolvido: 'Resolvida',
    encerrado: 'Fechada',
  }
  return mapa[situacao] ?? situacao
}

function DemandasLifplanTab({ demandas, cliente, onAtualizado }) {
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
        codigoRpc: 'gerar_codigo_demanda_lifplan',
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
            placeholder="Ex: Cliente quer avaliar carta de crédito contemplada"
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
                    <td><span className="ls-badge ls-badge-prospect">{traduzirSituacaoLifplan(d.situacao)}</span></td>
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
        <DemandaDetailLifplanModal
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

/** Painel de detalhe da Demanda — sem Especialista ainda (o Lifplan ainda não tem IA própria construída) */
function DemandaDetailLifplanModal({ demanda, onFechar, onAtualizado, onSalvoSemFechar }) {
  const { perfil } = useAuth()
  const [editando, setEditando] = useState(false)
  const [situacao, setSituacao] = useState(demanda.situacao)
  const [dataProximaAcao, setDataProximaAcao] = useState(demanda.data_proxima_acao ?? '')
  const [novaAtualizacao, setNovaAtualizacao] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [gerandoResumo, setGerandoResumo] = useState(false)
  const [candidato, setCandidato] = useState(null)
  const [abrirEspecialista, setAbrirEspecialista] = useState(false)

  async function handleSalvar() {
    setSalvando(true)
    try {
      const situacaoMudouParaEncerrado = situacao === 'encerrado' && demanda.situacao !== 'encerrado'

      await atualizarDemanda(demanda.id, { situacao, dataProximaAcao })
      if (novaAtualizacao.trim()) {
        await adicionarAtualizacaoManual(demanda.id, novaAtualizacao, perfil?.id)
      }

      if (situacaoMudouParaEncerrado) {
        setGerandoResumo(true)
        const resumo = await gerarResumoCandidato(demanda.id)
        const novoCandidato = await criarCandidatoConhecimento(demanda.id, resumo)
        setCandidato({ ...novoCandidato, resumoObjeto: resumo })
        setGerandoResumo(false)
        setEditando(false)
        return
      }

      setNovaAtualizacao('')
      setEditando(false)
      onSalvoSemFechar?.()
    } finally {
      setSalvando(false)
    }
  }

  async function handleAprovarCandidato() {
    await aprovarCandidatoComoCasoReal(candidato.id, perfil?.id)
    onAtualizado()
  }

  async function handleRejeitarCandidato() {
    await rejeitarCandidato(candidato.id)
    onAtualizado()
  }

  if (abrirEspecialista) {
    return (
      <div className="ls-modal-overlay" onClick={onFechar}>
        <div className="especialista-modal" onClick={(e) => e.stopPropagation()}>
          <button className="especialista-modal-fechar" onClick={onFechar}>✕</button>
          <EspecialistaLifplan clienteProspectIdInicial={demanda.cliente_prospect_id} casoIdContinuacao={demanda.id} />
        </div>
      </div>
    )
  }

  return (
    <div className="ls-modal-overlay" onClick={editando ? undefined : onFechar}>
      <div className="ls-modal" onClick={(e) => e.stopPropagation()}>
        <h3>{demanda.codigo}</h3>
        <p className="config-instrucao">{demanda.demanda_original}</p>

        {gerandoResumo && <p className="especialista-carregando-historico">Gerando resumo sugerido...</p>}

        {candidato ? (
          <div className="candidato-aprovacao">
            <h4>✅ Demanda encerrada — sugestão de Caso Real gerada</h4>
            <p className="config-instrucao">
              <strong>{candidato.resumoObjeto.titulo}</strong><br />
              {candidato.resumoObjeto.resultado}
            </p>
            <p className="config-instrucao">
              Isso só vira conhecimento institucional se você aprovar — nada acontece sozinho.
            </p>
            <div className="ls-modal-acoes">
              <button className="ls-btn ls-btn-ghost" onClick={handleRejeitarCandidato}>Rejeitar</button>
              <button className="ls-btn ls-btn-primary" onClick={handleAprovarCandidato}>Aprovar como Caso Real</button>
            </div>
          </div>
        ) : !editando ? (
          <div className="demanda-detail-rodape">
            <span className="ls-badge ls-badge-prospect">{traduzirSituacaoLifplan(situacao)}</span>
            <button className="ls-btn ls-btn-accent" onClick={() => setAbrirEspecialista(true)}>🧠 Especialista</button>
            <button className="ls-btn ls-btn-ghost" onClick={() => setEditando(true)}>Editar Demanda</button>
          </div>
        ) : (
          <div className="demanda-detail-edicao">
            <label>Situação</label>
            <select className="demanda-select-status" value={situacao} onChange={(e) => setSituacao(e.target.value)}>
              <option value="aberto">Aberta</option>
              <option value="em_andamento">Em andamento</option>
              <option value="aguardando_operadora">Aguardando Instituição</option>
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
          </div>
        )}
      </div>
    </div>
  )
}

function WhatsAppLifplanModal({ contatoPrimario, nomeEmpresa, contratoRecente, onFechar }) {
  const { perfil } = useAuth()
  const [templates, setTemplates] = useState([])
  const [templateSelecionado, setTemplateSelecionado] = useState(null)
  const [textoEditavel, setTextoEditavel] = useState('')
  const [carregando, setCarregando] = useState(true)

  const textoVigencia = contratoRecente?.vigencia_fim ? formatarDataBR(contratoRecente.vigencia_fim) : ''

  useEffect(() => {
    listarTemplates('lifplan').then((lista) => {
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
            Nenhuma mensagem padrão cadastrada ainda para o Lifplan. Cadastre em "Mensagens Padrão" no menu lateral.
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

function TransferirClienteLifplanModal({ clienteId, corretorAtualId, onFechar, onTransferido }) {
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
          (contratos, propostas, demandas) é mantido, só o dono do cadastro muda.
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