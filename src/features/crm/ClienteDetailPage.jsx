import { useEffect, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import {
  buscarClienteProspectCompleto,
  salvarContato,
  atualizarClienteProspect,
  excluirClienteProspect,
  atualizarStatusClienteProspect,
  criarDemandaManual,
  atualizarDemanda,
  adicionarAtualizacaoManual,
  excluirContrato,
  excluirCotacao,
} from '../../lib/crm/clientesService'
import { gerarResumoCandidato, criarCandidatoConhecimento, aprovarCandidatoComoCasoReal, rejeitarCandidato } from '../../lib/crm/aprendizadoService'
import { buscarHistoricoChat } from '../../lib/especialista/especialistaSaude'
import CotacaoForm from './CotacaoForm'
import ContratoForm from './ContratoForm'
import EspecialistaSaude from '../especialista/EspecialistaSaude'
import { listarTemplates, montarLinkWhatsApp, personalizarMensagem } from '../../lib/crm/templatesService'
import { useAuth } from '../auth/AuthContext'
import { formatarDataBR } from '../../lib/utils/formatarData'

const ABAS = ['Dados Cadastrais', 'Contratos', 'Cotações', 'Demandas']

export default function ClienteDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [dados, setDados] = useState(null)
  const [abaAtiva, setAbaAtiva] = useState('Demandas')
  const [erroExclusao, setErroExclusao] = useState(null)
  const [mostrarWhatsApp, setMostrarWhatsApp] = useState(false)

  useEffect(() => {
    carregar()
  }, [id])

  async function carregar() {
    const resultado = await buscarClienteProspectCompleto(id)
    setDados(resultado)
  }

  async function handleExcluirCliente() {
    if (!window.confirm('Tem certeza que deseja excluir este cliente/prospect? Essa ação não pode ser desfeita.')) return
    try {
      await excluirClienteProspect(id)
      navigate('/')
    } catch (err) {
      setErroExclusao(err.message)
    }
  }

  async function handleMarcarInativo() {
    await atualizarStatusClienteProspect(id, 'inativo')
    navigate('/')
  }

  if (!dados) return <p className="cliente-carregando">Carregando...</p>

  const { cliente, contatos, contratos, cotacoes, demandas, grupoInfo } = dados
  const contatoPrimario = contatos.find((c) => c.tipo === 'primario') ?? {}
  const contatoSecundario = contatos.find((c) => c.tipo === 'secundario') ?? {}

  return (
    <div className="cliente-detail-page">
      <button className="cliente-voltar" onClick={() => navigate('/')}>&larr; Voltar ao pipeline</button>

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

        {abaAtiva === 'Contratos' && (
          <ContratosTab contratos={contratos} clienteProspectId={cliente.id} onAtualizado={carregar} />
        )}

        {abaAtiva === 'Cotações' && (
          <CotacoesSecao clienteId={cliente.id} cotacoes={cotacoes} onAtualizado={carregar} />
        )}

        {abaAtiva === 'Demandas' && (
          <DemandasTab demandas={demandas} cliente={cliente} onAtualizado={carregar} />
        )}
      </div>

      {mostrarWhatsApp && (
        <WhatsAppModal
          contatoPrimario={contatoPrimario}
          nomeEmpresa={cliente.razao_social}
          onFechar={() => setMostrarWhatsApp(false)}
        />
      )}
    </div>
  )
}

export function DadosCadastraisTab({ cliente, contatoPrimario, contatoSecundario, grupoInfo, onSalvo }) {
  const [editando, setEditando] = useState(false)
  const [empresa, setEmpresa] = useState({
    cnpj: cliente.cnpj ?? '',
    segmento: cliente.segmento ?? '',
    numero_colaboradores: cliente.numero_colaboradores ?? '',
    data_vigencia: cliente.data_vigencia ?? '',
  })
  const [primario, setPrimario] = useState(contatoPrimario)
  const [secundario, setSecundario] = useState(contatoSecundario)
  const [salvando, setSalvando] = useState(false)

  async function handleSalvarTudo() {
    setSalvando(true)
    await atualizarClienteProspect(cliente.id, {
      cnpj: empresa.cnpj || null,
      segmento: empresa.segmento || null,
      numero_colaboradores: empresa.numero_colaboradores ? parseInt(empresa.numero_colaboradores, 10) : null,
      data_vigencia: empresa.data_vigencia || null,
    })
    await salvarContato(cliente.id, 'primario', primario)
    await salvarContato(cliente.id, 'secundario', secundario)
    setSalvando(false)
    setEditando(false)
    onSalvo()
  }

  if (!editando) {
    return (
      <div className="ls-card cadastro-card">
        <div className="cadastro-header-view">
          <h4>Empresa</h4>
          <button className="ls-btn ls-btn-ghost" onClick={() => setEditando(true)}>Editar</button>
        </div>
        <div className="cadastro-grid">
          <CampoView label="Razão Social" valor={cliente.razao_social} />
          <CampoView label="CNPJ" valor={empresa.cnpj || '—'} />
          <CampoView label="Segmento" valor={empresa.segmento || '—'} />
          <CampoView label="Nº Colaboradores" valor={empresa.numero_colaboradores || '—'} />
          <CampoView label="Vigência" valor={empresa.data_vigencia ? formatarDataBR(empresa.data_vigencia) : '—'} />
          <CampoView label="Porte (calculado)" valor={cliente.porte ?? '—'} />
        </div>
        <h4>Contato Primário</h4>
        <ContatoView contato={primario} />
        <h4>Contato Secundário</h4>
        <ContatoView contato={secundario} />

        {grupoInfo && (
          <div className="grupo-economico-bloco">
            <h4 style={{ marginTop: '1rem' }}>Grupo Econômico: {grupoInfo.nomeGrupo}</h4>
            <p className="config-instrucao">
              Total de vidas do grupo (todos os CNPJs coligados): <strong>{grupoInfo.totalVidasGrupo}</strong>
            </p>
            {grupoInfo.outrosMembros.length > 0 && (
              <ul className="grupo-economico-lista">
                {grupoInfo.outrosMembros.map((m) => (
                  <li key={m.id}>
                    <Link to={`/clientes/${m.id}`}>{m.razao_social}</Link> — {m.numero_colaboradores ?? 0} vidas
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="ls-card cadastro-card">
      <h4>Empresa</h4>
      <div className="cadastro-grid">
        <Campo label="Razão Social" valor={cliente.razao_social} disabled />
        <div>
          <label>CNPJ</label>
          <input value={empresa.cnpj} onChange={(e) => setEmpresa({ ...empresa, cnpj: e.target.value })} placeholder="00.000.000/0001-00" />
        </div>
        <div>
          <label>Segmento</label>
          <input value={empresa.segmento} onChange={(e) => setEmpresa({ ...empresa, segmento: e.target.value })} />
        </div>
        <div>
          <label>Número de colaboradores</label>
          <input
            type="number"
            value={empresa.numero_colaboradores}
            onChange={(e) => setEmpresa({ ...empresa, numero_colaboradores: e.target.value })}
          />
        </div>
        <div>
          <label>Data de vigência / renovação</label>
          <input
            type="date"
            value={empresa.data_vigencia ?? ''}
            onChange={(e) => setEmpresa({ ...empresa, data_vigencia: e.target.value })}
          />
        </div>
        <Campo label="Porte (calculado)" valor={cliente.porte ?? '—'} disabled />
      </div>

      <h4>Contato Primário</h4>
      <ContatoFormInline contato={primario} onChange={setPrimario} />

      <h4>Contato Secundário</h4>
      <ContatoFormInline contato={secundario} onChange={setSecundario} />

      <div className="ls-modal-acoes">
        <button className="ls-btn ls-btn-ghost" onClick={() => setEditando(false)}>Cancelar</button>
        <button className="ls-btn ls-btn-primary" onClick={handleSalvarTudo} disabled={salvando}>
          {salvando ? 'Salvando...' : 'Salvar alterações'}
        </button>
      </div>
    </div>
  )
}

export function ContatoView({ contato }) {
  if (!contato?.nome) return <p className="cliente-vazio-inline">Não informado.</p>
  return (
    <div className="cadastro-grid">
      <CampoView label="Nome" valor={contato.nome} />
      <CampoView label="Cargo" valor={contato.cargo || '—'} />
      <CampoView label="Celular" valor={contato.celular || '—'} />
      <CampoView label="E-mail" valor={contato.email || '—'} />
      {contato.atualizado_em && (
        <p className="cadastro-atualizado-em">
          Atualizado em {new Date(contato.atualizado_em).toLocaleDateString('pt-BR')}
        </p>
      )}
    </div>
  )
}

export function CampoView({ label, valor }) {
  return (
    <div className="cadastro-campo-view">
      <span className="cadastro-campo-label">{label}</span>
      <span className="cadastro-campo-valor">{valor}</span>
    </div>
  )
}

export function ContatoFormInline({ contato, onChange }) {
  return (
    <div className="cadastro-grid">
      <div>
        <label>Nome</label>
        <input value={contato.nome ?? ''} onChange={(e) => onChange({ ...contato, nome: e.target.value })} />
      </div>
      <div>
        <label>Cargo</label>
        <input value={contato.cargo ?? ''} onChange={(e) => onChange({ ...contato, cargo: e.target.value })} />
      </div>
      <div>
        <label>Celular</label>
        <input value={contato.celular ?? ''} onChange={(e) => onChange({ ...contato, celular: e.target.value })} />
      </div>
      <div>
        <label>E-mail</label>
        <input value={contato.email ?? ''} onChange={(e) => onChange({ ...contato, email: e.target.value })} />
      </div>
      {contato.atualizado_em && (
        <p className="cadastro-atualizado-em">
          Atualizado em {new Date(contato.atualizado_em).toLocaleDateString('pt-BR')}
        </p>
      )}
    </div>
  )
}

export function Campo({ label, valor, disabled }) {
  return (
    <div>
      <label>{label}</label>
      <input value={valor} disabled={disabled} readOnly />
    </div>
  )
}

function ContratosTab({ contratos, clienteProspectId, onAtualizado }) {
  const [mostrarForm, setMostrarForm] = useState(false)
  const [contratoEditando, setContratoEditando] = useState(null)

  async function handleExcluir(contratoId) {
    if (!window.confirm('Excluir este contrato?')) return
    await excluirContrato(contratoId)
    onAtualizado()
  }

  return (
    <div>
      {!mostrarForm && !contratoEditando && (
        <button className="ls-btn ls-btn-accent" onClick={() => setMostrarForm(true)}>
          + Novo Contrato
        </button>
      )}

      {(mostrarForm || contratoEditando) && (
        <ContratoForm
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
        <p className="cliente-vazio">Nenhum contrato ativo ainda.</p>
      ) : (
        <div className="cotacoes-historico" style={{ marginTop: '1rem' }}>
          {contratos.map((c) => {
            const totalVidas = c.itens_contrato?.reduce((s, i) => s + (i.quantidade_vidas ?? 0), 0) ?? 0
            const totalValor = c.itens_contrato?.reduce((s, i) => s + (i.quantidade_vidas ?? 0) * Number(i.valor ?? 0), 0) ?? 0
            return (
              <div key={c.id} className="ls-card cotacao-item">
                <div className="cotacao-item-header">
                  <strong>{c.operadora_nome_livre ?? '—'}</strong>
                  <span>{c.plano ?? ''}</span>
                  <span className={`ls-badge ls-badge-${c.status === 'ativo' ? 'cliente' : 'inativo'}`}>{c.status}</span>
                  {c.numero_apolice && <span className="ls-mono">Apólice: {c.numero_apolice}</span>}
                  <span>Vigência: {c.vigencia_fim ? formatarDataBR(c.vigencia_fim) : '—'}</span>
                </div>
                {totalVidas > 0 && (
                  <div className="cotacao-resumo" style={{ marginTop: '0.5rem' }}>
                    <div className="cotacao-resumo-item">
                      <span className="cotacao-resumo-label">Total de vidas</span>
                      <span className="cotacao-resumo-valor">{totalVidas}</span>
                    </div>
                    <div className="cotacao-resumo-item cotacao-resumo-destaque">
                      <span className="cotacao-resumo-label">Valor total mensal</span>
                      <span className="cotacao-resumo-valor">R$ {totalValor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                    </div>
                  </div>
                )}
                <div className="cliente-tabela-acoes" style={{ marginTop: '0.6rem' }}>
                  {c.anexo_contrato_url && <a href={c.anexo_contrato_url} target="_blank" rel="noreferrer" className="cotacao-anexo-link">📎 Contrato</a>}
                  {c.anexo_proposta_url && <a href={c.anexo_proposta_url} target="_blank" rel="noreferrer" className="cotacao-anexo-link">📎 Proposta</a>}
                  <button className="cliente-tabela-btn" onClick={() => setContratoEditando(c)}>Editar</button>
                  <button className="cliente-tabela-btn cliente-tabela-btn-perigo" onClick={() => handleExcluir(c.id)}>Excluir</button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function CotacoesSecao({ clienteId, cotacoes, onAtualizado }) {
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
        <CotacaoForm
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
                <span className="ls-badge ls-badge-prospect">{cot.porte}</span>
                <span>{cot.numero_vidas} vidas</span>
                <span>{formatarDataBR(cot.data_cotacao)}</span>
              </div>
              {cot.itens_cotacao?.length > 0 && (
                <div className="cotacao-item-valores">
                  {cot.itens_cotacao.map((item) => (
                    <span key={item.id} className="cotacao-item-valor">
                      {item.faixa_etaria}: R$ {Number(item.valor).toFixed(2)}
                    </span>
                  ))}
                </div>
              )}
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

function DemandasTab({ demandas, cliente, onAtualizado }) {
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
            placeholder="Ex: Cliente solicitou cotação de renovação"
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
                  <td><span className="ls-badge ls-badge-prospect">{traduzirSituacao(d.situacao)}</span></td>
                  <td>{d.data_proxima_acao ? formatarDataBR(d.data_proxima_acao) : '—'}</td>
                  <td>{new Date(d.criado_em).toLocaleDateString('pt-BR')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {demandaSelecionada && (
        <DemandaDetailModal
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

function traduzirSituacao(situacao) {
  const mapa = {
    aberto: 'Aberta',
    em_andamento: 'Em andamento',
    aguardando_operadora: 'Aguardando operadora',
    aguardando_cliente: 'Aguardando cliente',
    resolvido: 'Resolvida',
    encerrado: 'Fechada',
  }
  return mapa[situacao] ?? situacao
}

/**
 * Painel de detalhe de uma Demanda — abre ao clicar na linha.
 * Por padrão é só leitura (histórico com scroll). "Editar Demanda"
 * destrava status + atualização manual. O Especialista mora aqui
 * dentro, como uma ação específica, não solto na tabela.
 */
function DemandaDetailModal({ demanda, cliente, onFechar, onAtualizado, onSalvoSemFechar }) {
  const { perfil } = useAuth()
  const [editando, setEditando] = useState(false)
  const [situacao, setSituacao] = useState(demanda.situacao)
  const [dataProximaAcao, setDataProximaAcao] = useState(demanda.data_proxima_acao ?? '')
  const [novaAtualizacao, setNovaAtualizacao] = useState('')
  const [historico, setHistorico] = useState([])
  const [carregandoHistorico, setCarregandoHistorico] = useState(true)
  const [salvando, setSalvando] = useState(false)
  const [abrirEspecialista, setAbrirEspecialista] = useState(false)
  const [abrirCotacao, setAbrirCotacao] = useState(false)

  // Fluxo de aprovação de Caso Real (aparece só depois de encerrar)
  const [candidato, setCandidato] = useState(null)
  const [gerandoResumo, setGerandoResumo] = useState(false)

  useEffect(() => {
    buscarHistoricoChat(demanda.id).then((h) => {
      setHistorico(h)
      setCarregandoHistorico(false)
    })
  }, [demanda.id])

  async function handleSalvar() {
    setSalvando(true)
    try {
      const situacaoMudouParaEncerrado = situacao === 'encerrado' && demanda.situacao !== 'encerrado'

      await atualizarDemanda(demanda.id, {
        situacao,
        dataProximaAcao,
      })

      if (novaAtualizacao.trim()) {
        await adicionarAtualizacaoManual(demanda.id, novaAtualizacao, perfil?.id)
      }

      if (situacaoMudouParaEncerrado) {
        // Regra combinada com o Raphael: todo ciclo encerrado gera um
        // resumo sugerido, mas NUNCA vira Caso Real sem aprovação humana.
        setGerandoResumo(true)
        const resumo = await gerarResumoCandidato(demanda.id)
        const novoCandidato = await criarCandidatoConhecimento(demanda.id, resumo)
        setCandidato({ ...novoCandidato, resumoObjeto: resumo })
        setGerandoResumo(false)
        setEditando(false)
        return // não fecha ainda — mostra a etapa de aprovação primeiro
      }

      // Atualização simples (sem encerrar): recarrega o histórico na hora,
      // sem fechar o painel — você vê o resultado imediatamente.
      const historicoAtualizado = await buscarHistoricoChat(demanda.id)
      setHistorico(historicoAtualizado)
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
          <EspecialistaSaude clienteProspectIdInicial={cliente.id} casoIdContinuacao={demanda.id} />
        </div>
      </div>
    )
  }

  if (abrirCotacao) {
    return (
      <div className="ls-modal-overlay" onClick={() => setAbrirCotacao(false)}>
        <div className="ls-modal" onClick={(e) => e.stopPropagation()}>
          <h3>Nova Cotação — vinculada à demanda {demanda.codigo}</h3>
          <CotacaoForm
            clienteProspectId={cliente.id}
            casoId={demanda.id}
            onSalvo={async () => {
              await adicionarAtualizacaoManual(demanda.id, 'Cotação registrada nesta demanda.', perfil?.id)
              setAbrirCotacao(false)
              const historicoAtualizado = await buscarHistoricoChat(demanda.id)
              setHistorico(historicoAtualizado)
            }}
            onCancelar={() => setAbrirCotacao(false)}
          />
        </div>
      </div>
    )
  }

  return (
    <div className="ls-modal-overlay" onClick={onFechar}>
      <div className="ls-modal demanda-detail-modal" onClick={(e) => e.stopPropagation()}>
        <div className="demanda-detail-header">
          <h3>{demanda.codigo}</h3>
          <div className="demanda-detail-header-botoes">
            <button className="ls-btn ls-btn-ghost" onClick={() => setAbrirCotacao(true)}>
              💰 Gerar Cotação
            </button>
            <button className="ls-btn ls-btn-accent" onClick={() => setAbrirEspecialista(true)}>
              🧠 Especialista
            </button>
          </div>
        </div>

        <div className="demanda-detail-historico">
          {carregandoHistorico ? (
            <p className="especialista-carregando-historico">Carregando histórico...</p>
          ) : historico.length === 0 ? (
            <p className="cliente-vazio-inline">Nenhuma interação registrada ainda.</p>
          ) : (
            historico.map((m, i) => (
              <div key={i} className={`especialista-bolha especialista-bolha-${m.autor}`}>
                <span className="especialista-bolha-autor">
                  {m.autor === 'corretor' ? 'Corretor' : m.autor === 'sistema' ? 'Atualização' : 'Especialista'}
                </span>
                <p>{m.texto}</p>
              </div>
            ))
          )}
        </div>

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
              <button className="ls-btn ls-btn-ghost" onClick={onAtualizado}>Deixar pendente</button>
              <button className="ls-btn ls-btn-primary" onClick={handleRejeitarCandidato}>Rejeitar</button>
              <button className="ls-btn ls-btn-accent" onClick={handleAprovarCandidato}>Aprovar como Caso Real</button>
            </div>
          </div>
        ) : !editando ? (
          <div className="demanda-detail-rodape">
            <span className="ls-badge ls-badge-prospect">{traduzirSituacao(situacao)}</span>
            <button className="ls-btn ls-btn-ghost" onClick={() => setEditando(true)}>Editar Demanda</button>
          </div>
        ) : (
          <div className="demanda-detail-edicao">
            <label>Situação</label>
            <select value={situacao} onChange={(e) => setSituacao(e.target.value)} className="demanda-select-status">
              <option value="aberto">Aberta</option>
              <option value="em_andamento">Em andamento</option>
              <option value="aguardando_operadora">Aguardando operadora</option>
              <option value="aguardando_cliente">Aguardando cliente</option>
              <option value="resolvido">Resolvida</option>
              <option value="encerrado">Fechada</option>
            </select>

            <label>Próxima ação (data)</label>
            <input type="date" value={dataProximaAcao ?? ''} onChange={(e) => setDataProximaAcao(e.target.value)} />

            <label>Adicionar atualização (fica registrado, não pode ser apagado depois)</label>
            <textarea
              value={novaAtualizacao}
              onChange={(e) => setNovaAtualizacao(e.target.value)}
              rows={4}
              placeholder="Ex: Cliente confirmou interesse, aguardando aprovação da diretoria..."
              style={{ width: '100%', padding: '0.5rem 0.65rem', border: '1px solid var(--ls-border)', borderRadius: 'var(--ls-radius-sm)', fontFamily: 'inherit' }}
            />

            {gerandoResumo && <p className="config-instrucao">Gerando resumo do caso encerrado...</p>}

            <div className="ls-modal-acoes">
              <button className="ls-btn ls-btn-ghost" onClick={() => setEditando(false)}>Cancelar</button>
              <button className="ls-btn ls-btn-primary" onClick={handleSalvar} disabled={salvando || gerandoResumo}>
                {salvando || gerandoResumo ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function WhatsAppModal({ contatoPrimario, nomeEmpresa, onFechar }) {
  const { perfil } = useAuth()
  const [templates, setTemplates] = useState([])
  const [templateSelecionado, setTemplateSelecionado] = useState(null)
  const [textoEditavel, setTextoEditavel] = useState('')
  const [carregando, setCarregando] = useState(true)

  useEffect(() => {
    listarTemplates('lifcare').then((lista) => {
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
            Nenhuma mensagem padrão cadastrada ainda. Cadastre em "Mensagens Padrão" no menu lateral.
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
