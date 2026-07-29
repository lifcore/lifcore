import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  buscarClienteProspectCompleto,
  salvarContato,
  atualizarClienteProspect,
  excluirClienteProspect,
  atualizarStatusClienteProspect,
  criarDemandaManual,
  atualizarDemanda,
  adicionarAtualizacaoManual,
  excluirCotacao,
} from '../../lib/crm/clientesService'
import { listarApolicesDoCliente, excluirApoliceAuto } from '../../lib/crm/lifleetService'
import { listarTemplates, montarLinkWhatsApp, personalizarMensagem } from '../../lib/crm/templatesService'
import { formatarDataBR } from '../../lib/utils/formatarData'
import { DadosCadastraisTab } from '../crm/ClienteDetailPage'
import CotacaoAutoForm from './CotacaoAutoForm'
import ApoliceAutoForm from './ApoliceAutoForm'
import EspecialistaAuto from '../especialista/EspecialistaAuto'
import { gerarResumoCandidato, criarCandidatoConhecimento, aprovarCandidatoComoCasoReal, rejeitarCandidato } from '../../lib/crm/aprendizadoService'
import { useAuth } from '../auth/AuthContext'

const ABAS = ['Dados Cadastrais', 'Cotações', 'Apólices', 'Demandas']

export default function ClienteDetailLifleetPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [dados, setDados] = useState(null)
  const [apolices, setApolices] = useState([])
  const [abaAtiva, setAbaAtiva] = useState('Demandas')
  const [erroExclusao, setErroExclusao] = useState(null)
  const [mostrarWhatsApp, setMostrarWhatsApp] = useState(false)

  useEffect(() => {
    carregar()
  }, [id])

  async function carregar() {
    const [resultado, listaApolices] = await Promise.all([
      buscarClienteProspectCompleto(id),
      listarApolicesDoCliente(id),
    ])
    setDados(resultado)
    setApolices(listaApolices)
  }

  async function handleExcluirCliente() {
    if (!window.confirm('Tem certeza que deseja excluir este cliente/prospect? Essa ação não pode ser desfeita.')) return
    try {
      await excluirClienteProspect(id)
      navigate('/lifleet')
    } catch (err) {
      setErroExclusao(err.message)
    }
  }

  async function handleMarcarInativo() {
    await atualizarStatusClienteProspect(id, 'inativo')
    navigate('/lifleet')
  }

  if (!dados) return <p className="cliente-carregando">Carregando...</p>

  const { cliente, contatos, cotacoes, demandas, grupoInfo } = dados
  const contatoPrimario = contatos.find((c) => c.tipo === 'primario') ?? {}
  const contatoSecundario = contatos.find((c) => c.tipo === 'secundario') ?? {}

  return (
    <div className="cliente-detail-page">
      <button className="cliente-voltar" onClick={() => navigate('/lifleet')}>&larr; Voltar ao pipeline</button>

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
            <button className="ls-btn ls-btn-ghost" onClick={handleMarcarInativo}>Marcar Inativo</button>
            <button className="cliente-btn-excluir" onClick={handleExcluirCliente}>Excluir</button>
          </div>
        </div>
      </div>

      {erroExclusao && <p className="ls-modal-erro">{erroExclusao}</p>}

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
          <CotacoesAutoTab clienteId={cliente.id} cotacoes={cotacoes} onAtualizado={carregar} />
        )}

        {abaAtiva === 'Apólices' && (
          <ApolicesTab
            apolices={apolices}
            clienteProspectId={cliente.id}
            tipoPessoa={cliente.tipo_pessoa}
            onAtualizado={carregar}
          />
        )}

        {abaAtiva === 'Demandas' && (
          <DemandasLifleetTab demandas={demandas} cliente={cliente} onAtualizado={carregar} />
        )}
      </div>

      {mostrarWhatsApp && (
        <WhatsAppLifleetModal
          contatoPrimario={contatoPrimario}
          nomeEmpresa={cliente.razao_social}
          apoliceRecente={apolices[0] ?? null}
          onFechar={() => setMostrarWhatsApp(false)}
        />
      )}
    </div>
  )
}

function CotacoesAutoTab({ clienteId, cotacoes, onAtualizado }) {
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
        <CotacaoAutoForm
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

function ApolicesTab({ apolices, clienteProspectId, tipoPessoa, onAtualizado }) {
  const [mostrarForm, setMostrarForm] = useState(false)
  const [apoliceEditando, setApoliceEditando] = useState(null)

  async function handleExcluir(apoliceId) {
    if (!window.confirm('Excluir esta apólice e os veículos vinculados a ela?')) return
    await excluirApoliceAuto(apoliceId)
    onAtualizado()
  }

  return (
    <div>
      {!mostrarForm && !apoliceEditando && (
        <button className="ls-btn ls-btn-accent" onClick={() => setMostrarForm(true)}>
          + Nova Apólice
        </button>
      )}

      {(mostrarForm || apoliceEditando) && (
        <ApoliceAutoForm
          clienteProspectId={clienteProspectId}
          tipoPessoa={tipoPessoa}
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
                <span className={`ls-badge ls-badge-${ap.produto === 'Frota' ? 'cliente' : 'prospect'}`}>{ap.produto}</span>
                {ap.numero_apolice && <span className="ls-mono">Apólice: {ap.numero_apolice}</span>}
                <span>R$ {Number(ap.premio ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                <span>Vigência: {ap.vigencia_fim ? formatarDataBR(ap.vigencia_fim) : '—'}</span>
              </div>
              <div className="cotacao-item-valores">
                {(ap.veiculos ?? []).map((v) => (
                  <span key={v.id} className="cotacao-item-valor">
                    🚗 {v.placa} {v.marca ? `— ${v.marca} ${v.modelo ?? ''}` : ''}
                  </span>
                ))}
              </div>
              <div className="cliente-tabela-acoes" style={{ marginTop: '0.6rem' }}>
                <button className="cliente-tabela-btn" onClick={() => setApoliceEditando(ap)}>Editar</button>
                <button className="cliente-tabela-btn cliente-tabela-btn-perigo" onClick={() => handleExcluir(ap.id)}>Excluir</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function traduzirSituacaoLifleet(situacao) {
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

function DemandasLifleetTab({ demandas, cliente, onAtualizado }) {
  const [mostrarForm, setMostrarForm] = useState(false)
  const [descricao, setDescricao] = useState('')
  const [dataAcao, setDataAcao] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [mostrarFinalizadas, setMostrarFinalizadas] = useState(false)
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
        codigoRpc: 'gerar_codigo_demanda_auto',
      })
      setDescricao('')
      setDataAcao('')
      setMostrarForm(false)
      onAtualizado()
    } finally {
      setSalvando(false)
    }
  }

  const demandasVisiveis = mostrarFinalizadas ? demandas : demandas.filter((d) => d.situacao !== 'encerrado')

  return (
    <div>
      <div className="demandas-header-acoes">
        {!mostrarForm && (
          <button className="ls-btn ls-btn-accent" onClick={() => setMostrarForm(true)}>
            + Abrir Demanda
          </button>
        )}
        <button className="ls-btn ls-btn-ghost" onClick={() => setMostrarFinalizadas((v) => !v)}>
          {mostrarFinalizadas ? 'Ocultar finalizadas' : 'Ver finalizadas'}
        </button>
      </div>

      {mostrarForm && (
        <div className="ls-card demanda-form">
          <label>O que o cliente pediu?</label>
          <input
            value={descricao}
            onChange={(e) => setDescricao(e.target.value)}
            placeholder="Ex: Cliente solicitou inclusão de novo veículo"
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

      {demandasVisiveis.length === 0 ? (
        <p className="cliente-vazio">Nenhuma demanda em aberto para este cliente.</p>
      ) : (
        <div className="ls-card" style={{ marginTop: '1rem', padding: 0 }}>
          <table className="cliente-tabela">
            <thead>
              <tr><th>Código</th><th>Demanda</th><th>Situação</th><th>Próxima ação</th><th>Aberto em</th></tr>
            </thead>
            <tbody>
              {demandasVisiveis.map((d) => (
                <tr key={d.id} className="demanda-linha-clicavel" onClick={() => setDemandaSelecionada(d)}>
                  <td className="ls-mono">{d.codigo}</td>
                  <td>{d.demanda_original ?? d.categoria ?? '—'}</td>
                  <td><span className="ls-badge ls-badge-prospect">{traduzirSituacaoLifleet(d.situacao)}</span></td>
                  <td>{d.data_proxima_acao ? formatarDataBR(d.data_proxima_acao) : '—'}</td>
                  <td>{new Date(d.criado_em).toLocaleDateString('pt-BR')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {demandaSelecionada && (
        <DemandaDetailLifleetModal
          demanda={demandaSelecionada}
          cliente={cliente}
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

/**
 * Painel de detalhe da Demanda no Lifleet — mesmo padrão do Lifcare:
 * histórico só leitura por padrão, "Editar" destrava status +
 * atualização, botão "Especialista" abre o Especialista de Auto/Frota
 * vinculado a essa demanda, e encerrar gera um resumo sugerido de Caso
 * Real (nunca vira conhecimento institucional sem aprovação humana).
 */
function DemandaDetailLifleetModal({ demanda, cliente, onFechar, onAtualizado, onSalvoSemFechar }) {
  const { perfil } = useAuth()
  const [editando, setEditando] = useState(false)
  const [situacao, setSituacao] = useState(demanda.situacao)
  const [dataProximaAcao, setDataProximaAcao] = useState(demanda.data_proxima_acao ?? '')
  const [novaAtualizacao, setNovaAtualizacao] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [abrirEspecialista, setAbrirEspecialista] = useState(false)
  const [gerandoResumo, setGerandoResumo] = useState(false)
  const [candidato, setCandidato] = useState(null)

  async function handleSalvar() {
    setSalvando(true)
    try {
      const situacaoMudouParaEncerrado = situacao === 'encerrado' && demanda.situacao !== 'encerrado'

      await atualizarDemanda(demanda.id, { situacao, dataProximaAcao })
      if (novaAtualizacao.trim()) {
        await adicionarAtualizacaoManual(demanda.id, novaAtualizacao, perfil?.id)
      }

      if (situacaoMudouParaEncerrado) {
        // Mesma regra do Lifcare: todo ciclo encerrado gera um resumo
        // sugerido, mas NUNCA vira Caso Real sem aprovação humana. É
        // assim que a base de casos do Auto cresce organicamente.
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
          <EspecialistaAuto clienteProspectIdInicial={cliente?.id} casoIdContinuacao={demanda.id} />
        </div>
      </div>
    )
  }

  return (
    <div className="ls-modal-overlay" onClick={onFechar}>
      <div className="ls-modal" onClick={(e) => e.stopPropagation()}>
        <div className="demanda-detail-header">
          <h3>{demanda.codigo}</h3>
          <div className="demanda-detail-header-botoes">
            <button className="ls-btn ls-btn-accent" onClick={() => setAbrirEspecialista(true)}>
              🧠 Especialista
            </button>
          </div>
        </div>
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
          <>
            <p><strong>Situação:</strong> {traduzirSituacaoLifleet(demanda.situacao)}</p>
            <p><strong>Próxima ação:</strong> {demanda.data_proxima_acao ? formatarDataBR(demanda.data_proxima_acao) : '—'}</p>
            <div className="ls-modal-acoes">
              <button className="ls-btn ls-btn-ghost" onClick={onFechar}>Fechar</button>
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

function WhatsAppLifleetModal({ contatoPrimario, nomeEmpresa, apoliceRecente, onFechar }) {
  const { perfil } = useAuth()
  const [templates, setTemplates] = useState([])
  const [templateSelecionado, setTemplateSelecionado] = useState(null)
  const [textoEditavel, setTextoEditavel] = useState('')
  const [carregando, setCarregando] = useState(true)

  const textoVeiculo = (apoliceRecente?.veiculos ?? [])
    .map((v) => {
      const marcaModelo = [v.marca, v.modelo].filter(Boolean).join(' ')
      return marcaModelo ? `${v.placa} (${marcaModelo})` : v.placa
    })
    .join(', ')
  const textoVigencia = apoliceRecente?.vigencia_fim ? formatarDataBR(apoliceRecente.vigencia_fim) : ''

  useEffect(() => {
    listarTemplates('lifleet').then((lista) => {
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
        veiculo: textoVeiculo,
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
            Nenhuma mensagem padrão cadastrada ainda para o Lifleet. Cadastre em "Mensagens Padrão" no menu lateral.
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
