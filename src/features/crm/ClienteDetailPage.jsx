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
  fecharCotacaoComOpcao,
  fecharCotacaoComDocumento,
  marcarCotacaoPerdida,
  marcarCotacaoExpirada,
  calcularPorte,
  transferirClienteIndividual,
} from '../../lib/crm/clientesService'
import { gerarResumoCandidato, criarCandidatoConhecimento, aprovarCandidatoComoCasoReal, rejeitarCandidato } from '../../lib/crm/aprendizadoService'
import { buscarHistoricoChat } from '../../lib/especialista/especialistaSaude'
import CotacaoForm from './CotacaoForm'
import ContratoForm from './ContratoForm'
import PainelCotacao from './PainelCotacao'
import './cotacoesGrupo.css'
import { marcarCotacaoRecomendada } from '../../lib/crm/multicalculoCotacaoService'
import EspecialistaSaude from '../especialista/EspecialistaSaude'
import { listarTemplates, montarLinkWhatsApp, personalizarMensagem } from '../../lib/crm/templatesService'
import { listarCorretores } from '../../lib/crm/apolicesService'
import { normalizarPosicoes } from '../../lib/crm/posicaoComercialService'
import { useAuth } from '../auth/AuthContext'
import { formatarDataBR } from '../../lib/utils/formatarData'
import BotaoOperacaoCritica from '../../components/BotaoOperacaoCritica'
import CustomerSummaryWidget from '../../components/customer360/CustomerSummaryWidget'
import OperationalHealthWidget from '../../components/customer360/OperationalHealthWidget'
import CustomerTimelineWidget from '../../components/customer360/CustomerTimelineWidget'
import RelationshipPanelWidget from '../../components/customer360/RelationshipPanelWidget'

const ABAS = ['Visão 360°', 'Dados Cadastrais', 'Contratos', 'Cotações', 'Demandas']

export default function ClienteDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { perfil } = useAuth()
  const ehMaster = perfil?.papel === 'master'
  const [dados, setDados] = useState(null)
  const [abaAtiva, setAbaAtiva] = useState('Visão 360°')
  const [mostrarWhatsApp, setMostrarWhatsApp] = useState(false)
  const [mostrarTransferir, setMostrarTransferir] = useState(false)
  const [corretores, setCorretoresPagina] = useState([])

  useEffect(() => {
    carregar()
    listarCorretores().then(setCorretoresPagina)
  }, [id])

  async function carregar() {
    const resultado = await buscarClienteProspectCompleto(id)
    setDados(resultado)
  }

  async function excluirEVoltar() {
    await excluirClienteProspect(id)
    navigate('/')
  }

  async function handleMarcarInativo() {
    await atualizarStatusClienteProspect(id, 'inativo')
    navigate('/')
  }

  if (!dados) return <p className="cliente-carregando">Carregando...</p>

  const { cliente, contatos, contratos, cotacoes, demandas, grupoInfo } = dados
  const posicoes = normalizarPosicoes(contratos, 'contratos', 'saude')
  const contatoPrimario = contatos.find((c) => c.tipo === 'primario') ?? {}
  const contatoSecundario = contatos.find((c) => c.tipo === 'secundario') ?? {}
  // Master transfere qualquer cliente; o corretor só transfere os que são dele hoje.
  const podeTransferir = ehMaster || (perfil?.id && perfil.id === cliente.corretor_id)

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
            {podeTransferir && (
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
        <TransferirClienteModal
          clienteId={cliente.id}
          corretorAtualId={cliente.corretor_id}
          nomeCorretorAtual={corretores.find((c) => c.id === cliente.corretor_id)?.nome_completo}
          usuarioId={perfil?.id}
          onFechar={() => setMostrarTransferir(false)}
          onTransferido={() => {
            setMostrarTransferir(false)
            navigate('/')
          }}
        />
      )}

      <CustomerSummaryWidget cliente={cliente} posicoes={posicoes} cotacoes={cotacoes} />
      <OperationalHealthWidget cliente={cliente} cotacoes={cotacoes} demandas={demandas} />

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
        {abaAtiva === 'Visão 360°' && (
          <div>
            <h4 style={{ marginTop: 0 }}>Linha do Tempo</h4>
            <CustomerTimelineWidget
              clienteId={cliente.id}
              clienteCriadoEm={cliente.criado_em}
              cotacaoIds={cotacoes.map((c) => c.id)}
              casoIds={demandas.map((d) => d.id)}
            />
            <h4>Relacionamento</h4>
            <RelationshipPanelWidget
              cliente={cliente}
              corretorNome={corretores.find((c) => c.id === cliente.corretor_id)?.nome_completo}
              posicoes={posicoes}
              cotacoes={cotacoes}
              demandas={demandas}
            />
          </div>
        )}

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
          <CotacoesSecao clienteId={cliente.id} cotacoes={cotacoes} onAtualizado={carregar} perfil={perfil} />
        )}

        {abaAtiva === 'Demandas' && (
          <DemandasTab demandas={demandas} cliente={cliente} onAtualizado={carregar} />
        )}
      </div>

      {mostrarWhatsApp && (
        <WhatsAppModal
          contatoPrimario={contatoPrimario}
          nomeEmpresa={cliente.razao_social}
          vigencia={cliente.data_vigencia}
          onFechar={() => setMostrarWhatsApp(false)}
        />
      )}
    </div>
  )
}

export function DadosCadastraisTab({ cliente, contatoPrimario, contatoSecundario, grupoInfo, onSalvo }) {
  const ehPessoaFisica = cliente.tipo_pessoa === 'fisica'
  const ehGrupoNovo = Array.isArray(cliente.empresas_grupo) && cliente.empresas_grupo.length > 0
  const [editando, setEditando] = useState(false)
  const [empresa, setEmpresa] = useState({
    cnpj: cliente.cnpj ?? '',
    segmento: cliente.segmento ?? '',
    numero_colaboradores: cliente.numero_colaboradores ?? '',
    data_vigencia: cliente.data_vigencia ?? '',
    cpf: cliente.cpf ?? '',
    graduacao: cliente.graduacao ?? '',
  })
  const [empresasGrupo, setEmpresasGrupo] = useState(
    ehGrupoNovo ? cliente.empresas_grupo.map((e) => ({ ...e, id: crypto.randomUUID() })) : []
  )
  const [primario, setPrimario] = useState(contatoPrimario)
  const [secundario, setSecundario] = useState(contatoSecundario)
  const [salvando, setSalvando] = useState(false)

  function atualizarEmpresaGrupo(id, campo, valor) {
    setEmpresasGrupo((lista) => lista.map((e) => (e.id === id ? { ...e, [campo]: valor } : e)))
  }

  function adicionarEmpresaGrupo() {
    setEmpresasGrupo((lista) => [...lista, { id: crypto.randomUUID(), cnpj: '', nome: '', numero_colaboradores: '' }])
  }

  function removerEmpresaGrupo(id) {
    setEmpresasGrupo((lista) => (lista.length > 1 ? lista.filter((e) => e.id !== id) : lista))
  }

  async function handleSalvarTudo() {
    setSalvando(true)
    if (ehPessoaFisica) {
      await atualizarClienteProspect(cliente.id, {
        cpf: empresa.cpf || null,
        graduacao: empresa.graduacao || null,
        data_vigencia: empresa.data_vigencia || null,
      })
    } else if (ehGrupoNovo) {
      const empresasLimpas = empresasGrupo.map(({ id, ...resto }) => ({
        cnpj: resto.cnpj || null,
        nome: resto.nome,
        numero_colaboradores: parseInt(resto.numero_colaboradores, 10) || 0,
      }))
      const numeroVidasTotal = empresasLimpas.reduce((soma, e) => soma + e.numero_colaboradores, 0)
      await atualizarClienteProspect(cliente.id, {
        empresas_grupo: empresasLimpas,
        numero_colaboradores: numeroVidasTotal || null,
        porte: numeroVidasTotal ? calcularPorte(numeroVidasTotal) : null,
        segmento: empresa.segmento || null,
        data_vigencia: empresa.data_vigencia || null,
      })
    } else {
      await atualizarClienteProspect(cliente.id, {
        cnpj: empresa.cnpj || null,
        segmento: empresa.segmento || null,
        numero_colaboradores: empresa.numero_colaboradores ? parseInt(empresa.numero_colaboradores, 10) : null,
        data_vigencia: empresa.data_vigencia || null,
      })
    }
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
          <h4>{ehPessoaFisica ? 'Pessoa Física' : ehGrupoNovo ? 'Grupo Econômico' : 'Empresa'}</h4>
          <button className="ls-btn ls-btn-ghost" onClick={() => setEditando(true)}>Editar</button>
        </div>
        <div className="cadastro-grid">
          <CampoView label={ehPessoaFisica ? 'Nome Completo' : ehGrupoNovo ? 'Nome do Grupo' : 'Razão Social'} valor={cliente.razao_social} />
          {ehPessoaFisica ? (
            <>
              <CampoView label="CPF" valor={empresa.cpf || '—'} />
              <CampoView label="Graduação" valor={empresa.graduacao || '—'} />
              <CampoView label="Vigência" valor={empresa.data_vigencia ? formatarDataBR(empresa.data_vigencia) : '—'} />
            </>
          ) : ehGrupoNovo ? (
            <>
              <CampoView label="Segmento" valor={empresa.segmento || '—'} />
              <CampoView label="Vigência" valor={empresa.data_vigencia ? formatarDataBR(empresa.data_vigencia) : '—'} />
              <CampoView label="Total de vidas do grupo" valor={cliente.numero_colaboradores ?? '—'} />
              <CampoView label="Porte (calculado)" valor={cliente.porte ?? '—'} />
            </>
          ) : (
            <>
              <CampoView label="CNPJ" valor={empresa.cnpj || '—'} />
              <CampoView label="Segmento" valor={empresa.segmento || '—'} />
              <CampoView label="Nº Colaboradores" valor={empresa.numero_colaboradores || '—'} />
              <CampoView label="Vigência" valor={empresa.data_vigencia ? formatarDataBR(empresa.data_vigencia) : '—'} />
              <CampoView label="Porte (calculado)" valor={cliente.porte ?? '—'} />
            </>
          )}
        </div>

        {ehGrupoNovo && (
          <div className="grupo-economico-bloco">
            <h4 style={{ marginTop: '1rem' }}>Empresas deste grupo</h4>
            <ul className="grupo-economico-lista">
              {cliente.empresas_grupo.map((e, i) => (
                <li key={i}>
                  <strong>{e.nome}</strong>{e.cnpj ? ` — ${e.cnpj}` : ''} — {e.numero_colaboradores ?? 0} vidas
                </li>
              ))}
            </ul>
          </div>
        )}

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
      <h4>{ehPessoaFisica ? 'Pessoa Física' : ehGrupoNovo ? 'Grupo Econômico' : 'Empresa'}</h4>
      <div className="cadastro-grid">
        <Campo label={ehPessoaFisica ? 'Nome Completo' : ehGrupoNovo ? 'Nome do Grupo' : 'Razão Social'} valor={cliente.razao_social} disabled />

        {ehPessoaFisica ? (
          <>
            <div>
              <label>CPF</label>
              <input value={empresa.cpf} onChange={(e) => setEmpresa({ ...empresa, cpf: e.target.value })} placeholder="000.000.000-00" />
            </div>
            <div>
              <label>Graduação</label>
              <input
                value={empresa.graduacao}
                onChange={(e) => setEmpresa({ ...empresa, graduacao: e.target.value })}
                placeholder="Ex: Engenheiro, Advogado... (se for Adesão)"
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
          </>
        ) : ehGrupoNovo ? (
          <>
            <div>
              <label>Segmento</label>
              <input value={empresa.segmento} onChange={(e) => setEmpresa({ ...empresa, segmento: e.target.value })} />
            </div>
            <div>
              <label>Data de vigência / renovação</label>
              <input
                type="date"
                value={empresa.data_vigencia ?? ''}
                onChange={(e) => setEmpresa({ ...empresa, data_vigencia: e.target.value })}
              />
            </div>
            <Campo label="Total de vidas (somado automaticamente)" valor={empresasGrupo.reduce((s, e) => s + (parseInt(e.numero_colaboradores, 10) || 0), 0)} disabled />
          </>
        ) : (
          <>
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
          </>
        )}
      </div>

      {ehGrupoNovo && (
        <>
          <h4 style={{ marginTop: '1rem' }}>Empresas do grupo</h4>
          {empresasGrupo.map((e, index) => (
            <div key={e.id} className="ls-card" style={{ padding: '0.75rem', marginBottom: '0.6rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.3rem' }}>
                <strong>Empresa {index + 1}</strong>
                <button className="cotacao-remover-bloco" onClick={() => removerEmpresaGrupo(e.id)}>✕</button>
              </div>
              <div className="cotacao-form-linha">
                <div>
                  <label>Nome</label>
                  <input value={e.nome} onChange={(ev) => atualizarEmpresaGrupo(e.id, 'nome', ev.target.value)} />
                </div>
                <div>
                  <label>CNPJ</label>
                  <input value={e.cnpj ?? ''} onChange={(ev) => atualizarEmpresaGrupo(e.id, 'cnpj', ev.target.value)} />
                </div>
                <div>
                  <label>Nº colaboradores</label>
                  <input
                    type="number"
                    value={e.numero_colaboradores}
                    onChange={(ev) => atualizarEmpresaGrupo(e.id, 'numero_colaboradores', ev.target.value)}
                  />
                </div>
              </div>
            </div>
          ))}
          <button className="ls-btn ls-btn-ghost cotacao-add-bloco" onClick={adicionarEmpresaGrupo}>
            + Adicionar empresa
          </button>
        </>
      )}

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
                  <BotaoOperacaoCritica
                    label="Excluir"
                    tabelaAfetada="operacional.contratos"
                    registroId={c.id}
                    dadosAntes={c}
                    executar={() => excluirContrato(c.id)}
                    onSucesso={onAtualizado}
                  />
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

/**
 * Rótulos do ciclo comercial universal (BMR-004/CLU-002, Fase 2 —
 * 11/08). Substitui o antigo ROTULO_ETAPA_LIFCARE (5 etapas
 * específicas do Lifcare, que deixaram de existir na Fase 1).
 */
const ROTULO_STATUS_COTACAO = {
  em_negociacao: { texto: 'Em negociação', cor: 'var(--lcds-text-secondary, #94a3b8)' },
  emissao: { texto: 'Emissão — formalizar contrato', cor: 'var(--lcds-gold, #f59e0b)' },
  fechada: { texto: 'Fechada', cor: 'var(--lcds-success, #10b981)' },
  perdida: { texto: 'Perdida', cor: 'var(--lcds-text-muted, #64748b)' },
  expirada: { texto: 'Expirada', cor: 'var(--lcds-text-muted, #64748b)' },
}

/**
 * ATUALIZADO (BMR-004/CLU-002, Fase 2 — 11/08): antes usava uma lista
 * de 5 etapas específicas do Lifcare e `avancarEtapaComercial`, que
 * autogerava um Contrato com dado mínimo ao chegar na etapa final —
 * exatamente o que o Chief travou como proibido. Agora: "Fechar com
 * esta" avança em_negociacao→emissao (`fecharCotacaoComOpcao`); em
 * emissao, "Formalizar Contrato" abre o ContratoForm de verdade — o
 * corretor preenche os dados reais, e o Salvar chama
 * `fecharCotacaoComDocumento`, fechando a cotação de fato.
 */
function CotacoesSecao({ clienteId, cotacoes, onAtualizado, perfil }) {
  const [mostrarForm, setMostrarForm] = useState(false)
  const [mostrarMulticalculo, setMostrarMulticalculo] = useState(false)
  const [cotacaoEditando, setCotacaoEditando] = useState(null)
  const [cotacaoFormalizando, setCotacaoFormalizando] = useState(null)
  const [processando, setProcessando] = useState(null)
  const [erroWorkflow, setErroWorkflow] = useState(null)

  async function handleExcluir(cotacaoId) {
    if (!window.confirm('Excluir esta cotação?')) return
    await excluirCotacao(cotacaoId)
    onAtualizado()
  }

  async function handleFechar(cotacaoId) {
    if (!window.confirm('O cliente escolheu esta opção? A cotação vai para Emissão.')) return
    setProcessando(cotacaoId)
    setErroWorkflow(null)
    try {
      await fecharCotacaoComOpcao(cotacaoId, perfil?.id)
      onAtualizado()
    } catch (err) {
      setErroWorkflow(err.message)
    } finally {
      setProcessando(null)
    }
  }

  async function handleDesistir(cotacaoId) {
    const motivo = window.prompt('Motivo da desistência (opcional):')
    if (motivo === null) return
    setProcessando(cotacaoId)
    setErroWorkflow(null)
    try {
      await marcarCotacaoPerdida(cotacaoId, perfil?.id, motivo)
      onAtualizado()
    } catch (err) {
      setErroWorkflow(err.message)
    } finally {
      setProcessando(null)
    }
  }

  async function handleExpirar(cotacaoId) {
    if (!window.confirm('Marcar esta cotação como expirada? A validade já passou.')) return
    setProcessando(cotacaoId)
    setErroWorkflow(null)
    try {
      await marcarCotacaoExpirada(cotacaoId, perfil?.id)
      onAtualizado()
    } catch (err) {
      setErroWorkflow(err.message)
    } finally {
      setProcessando(null)
    }
  }

  async function handleContratoFormalizado(contrato) {
    setProcessando(cotacaoFormalizando.id)
    setErroWorkflow(null)
    try {
      await fecharCotacaoComDocumento(cotacaoFormalizando.id, perfil?.id, { contratoId: contrato.id })
      setCotacaoFormalizando(null)
      onAtualizado()
    } catch (err) {
      setErroWorkflow(err.message)
    } finally {
      setProcessando(null)
    }
  }

  // NOVO (19/08) — tag manual "Recomendada" (BMR-008). Nunca calculada
  // sozinha, sempre clique explícito do corretor.
  async function handleAlternarRecomendada(cotacaoId, valorAtual) {
    setProcessando(cotacaoId)
    setErroWorkflow(null)
    try {
      await marcarCotacaoRecomendada(cotacaoId, !valorAtual)
      onAtualizado()
    } catch (err) {
      setErroWorkflow(err.message)
    } finally {
      setProcessando(null)
    }
  }

  // NOVO (19/08) — o Multicálculo (Sprint 3) já cria as Cotações
  // direto no banco (mesmo grupo_comparacao_id); ao terminar, só fecha
  // o wizard e recarrega a lista — a UI de baixo (agrupada) já mostra
  // o resultado.
  function handleMulticalculoConcluido() {
    setMostrarMulticalculo(false)
    onAtualizado()
  }

  // NOVO (19/08) — agrupa por grupo_comparacao_id (cotações sem grupo
  // viram "grupo" de 1 item só, comportamento idêntico ao de antes
  // pra elas — nada muda visualmente pra Cotações registradas do jeito
  // manual de sempre).
  const grupos = new Map()
  for (const cot of cotacoes) {
    const chave = cot.grupo_comparacao_id ?? cot.id
    if (!grupos.has(chave)) grupos.set(chave, [])
    grupos.get(chave).push(cot)
  }

  return (
    <div>
      {!mostrarForm && !cotacaoEditando && !cotacaoFormalizando && !mostrarMulticalculo && (
        <div style={{ display: 'flex', gap: '0.6rem' }}>
          <button className="ls-btn ls-btn-accent" onClick={() => setMostrarForm(true)}>
            + Registrar Cotação
          </button>
          <button className="ls-btn ls-btn-ghost" onClick={() => setMostrarMulticalculo(true)}>
            🔍 Multicálculo (Biblioteca de Mercado)
          </button>
        </div>
      )}

      {mostrarMulticalculo && (
        <div>
          <button
            className="ls-btn ls-btn-ghost"
            style={{ marginBottom: '0.75rem' }}
            onClick={() => setMostrarMulticalculo(false)}
          >
            ✕ Fechar Multicálculo
          </button>
          <PainelCotacao clienteProspectId={clienteId} onConcluido={handleMulticalculoConcluido} />
        </div>
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
          onCriado={(novaCotacao) => {
            // CORREÇÃO 17/08 — na primeira criação, NÃO fecha o
            // formulário: troca pro modo "editando" com a Cotação
            // recém-criada, mantendo o mesmo formulário aberto pra que
            // Cenário Atual e Propostas de Mercado fiquem visíveis sem
            // precisar reabrir manualmente depois.
            setMostrarForm(false)
            setCotacaoEditando(novaCotacao)
            onAtualizado()
          }}
          onCancelar={() => {
            setMostrarForm(false)
            setCotacaoEditando(null)
          }}
        />
      )}

      {cotacaoFormalizando && (
        <div>
          <p className="config-instrucao">
            Formalizando o Contrato da cotação com <strong>{cotacaoFormalizando.operadora_nome_livre}</strong> —
            preencha os dados reais. Salvar aqui fecha a cotação de vez.
          </p>
          <ContratoForm
            clienteProspectId={clienteId}
            operadoraInicial={cotacaoFormalizando.operadora_nome_livre}
            itensIniciais={cotacaoFormalizando.itens_cotacao}
            onSalvo={handleContratoFormalizado}
            onCancelar={() => setCotacaoFormalizando(null)}
          />
        </div>
      )}

      {erroWorkflow && <p className="ls-modal-erro">{erroWorkflow}</p>}

      {cotacoes.length === 0 ? (
        <p className="cliente-vazio">Nenhuma cotação registrada ainda.</p>
      ) : (
        <div className="cotacoes-historico" style={{ marginTop: '1rem' }}>
          {[...grupos.entries()].map(([chaveGrupo, cotacoesDoGrupo]) => (
            <div key={chaveGrupo} className={cotacoesDoGrupo.length > 1 ? 'cotacoes-grupo-comparacao' : undefined}>
              {cotacoesDoGrupo.length > 1 && (
                <p className="cotacoes-grupo-titulo">{cotacoesDoGrupo.length} opções nesta rodada de comparação</p>
              )}

              {cotacoesDoGrupo.map((cot) => {
                const status = ROTULO_STATUS_COTACAO[cot.status ?? 'em_negociacao'] ?? ROTULO_STATUS_COTACAO.em_negociacao
                const podeFechar = (cot.status ?? 'em_negociacao') === 'em_negociacao'
                const podeFormalizar = cot.status === 'emissao'
                const podeDesistirOuExpirar = ['em_negociacao', 'emissao'].includes(cot.status ?? 'em_negociacao')
                const hoje = new Date().toISOString().slice(0, 10)
                const venceu = cot.validade && cot.validade < hoje

                return (
                  <div key={cot.id} className={`ls-card cotacao-item${cot.recomendada ? ' cotacao-item-recomendada' : ''}`}>
                    <div className="cotacao-item-header">
                      <strong>{cot.operadora_nome_livre}</strong>
                      <span className="ls-badge ls-badge-prospect">{cot.porte}</span>
                      <span>{cot.numero_vidas} vidas</span>
                      <span>{formatarDataBR(cot.data_cotacao)}</span>
                      <span style={{ fontWeight: 600, color: status.cor }}>{status.texto}</span>
                      {cot.recomendada && <span className="ls-badge cotacao-badge-recomendada">★ Recomendada</span>}
                    </div>
                    {cot.itens_cotacao?.length > 0 && (
                      <div className="cotacao-item-valores">
                        {cot.itens_cotacao.map((item) => {
                          // ACHADO (21/08): mostrava só o valor unitário por
                          // vida, nunca multiplicava por quantidade_vidas —
                          // quem tinha 2+ vidas na mesma faixa via o preço de
                          // 1 pessoa só. Mesmo padrão de soma já usado pra
                          // Contratos (totalValor, mais acima neste arquivo).
                          const subtotalFaixa = (item.quantidade_vidas ?? 0) * Number(item.valor ?? 0)
                          return (
                            <span key={item.id} className="cotacao-item-valor">
                              {item.faixa_etaria} ({item.quantidade_vidas ?? 0}x): R$ {subtotalFaixa.toFixed(2)}
                            </span>
                          )
                        })}
                        <span
                          className="cotacao-item-valor cotacao-item-valor-total"
                          style={{
                            display: 'block',
                            width: '100%',
                            marginTop: '0.5rem',
                            paddingTop: '0.5rem',
                            borderTop: '1px solid var(--lcds-border-strong)',
                            color: 'var(--lcds-gold)',
                            fontWeight: 700,
                            fontSize: '1.05rem',
                            letterSpacing: '0.01em',
                          }}
                        >
                          Total: R${' '}
                          {cot.itens_cotacao
                            .reduce((soma, item) => soma + (item.quantidade_vidas ?? 0) * Number(item.valor ?? 0), 0)
                            .toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </span>
                      </div>
                    )}
                    {cot.contrato_id && (
                      <div className="kpi-detalhe" style={{ margin: '0.25rem 0 0' }}>
                        Contrato gerado — veja em Contratos
                      </div>
                    )}
                    <div className="cliente-tabela-acoes" style={{ marginTop: '0.6rem' }}>
                      {podeFechar && (
                        <button
                          className="cliente-tabela-btn"
                          disabled={processando === cot.id}
                          onClick={() => handleFechar(cot.id)}
                        >
                          {processando === cot.id ? '...' : 'Fechar com esta (ir pra Emissão)'}
                        </button>
                      )}
                      {podeFormalizar && (
                        <button
                          className="cliente-tabela-btn"
                          disabled={processando === cot.id}
                          onClick={() => setCotacaoFormalizando(cot)}
                        >
                          {processando === cot.id ? '...' : 'Formalizar Contrato'}
                        </button>
                      )}
                      {podeDesistirOuExpirar && venceu && (
                        <button
                          className="cliente-tabela-btn"
                          disabled={processando === cot.id}
                          onClick={() => handleExpirar(cot.id)}
                        >
                          {processando === cot.id ? '...' : 'Marcar Expirada'}
                        </button>
                      )}
                      {podeDesistirOuExpirar && (
                        <button
                          className="cliente-tabela-btn cliente-tabela-btn-perigo"
                          disabled={processando === cot.id}
                          onClick={() => handleDesistir(cot.id)}
                        >
                          {processando === cot.id ? '...' : 'Cliente Desistiu'}
                        </button>
                      )}
                      {podeFechar && (
                        <button
                          className="cliente-tabela-btn"
                          disabled={processando === cot.id}
                          onClick={() => handleAlternarRecomendada(cot.id, cot.recomendada)}
                        >
                          {cot.recomendada ? '★ Desmarcar recomendada' : '☆ Marcar como recomendada'}
                        </button>
                      )}
                      <button className="cliente-tabela-btn" onClick={() => setCotacaoEditando(cot)}>
                        Editar
                      </button>
                      <button className="cliente-tabela-btn cliente-tabela-btn-perigo" onClick={() => handleExcluir(cot.id)}>
                        Excluir
                      </button>
                    </div>
                  </div>
                )
              })}
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

  // Lista única: ativas primeiro, "Resolvida" e "Encerrado" (as duas
  // contam como finalizadas) afundam pro fim — sem precisar de um
  // clique extra pra ver o histórico.
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
                    <td><span className="ls-badge ls-badge-prospect">{traduzirSituacao(d.situacao)}</span></td>
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
    <div className="ls-modal-overlay" onClick={editando ? undefined : onFechar}>
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

function WhatsAppModal({ contatoPrimario, nomeEmpresa, vigencia, onFechar }) {
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
        vigencia: vigencia ? formatarDataBR(vigencia) : '',
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

function TransferirClienteModal({ clienteId, corretorAtualId, nomeCorretorAtual, usuarioId, onFechar, onTransferido }) {
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
      const corretorDestino = corretores.find((c) => c.id === corretorDestinoId)
      await transferirClienteIndividual({
        clienteId,
        corretorDestinoId,
        usuarioId,
        nomeCorretorOrigem: nomeCorretorAtual,
        nomeCorretorDestino: corretorDestino?.nome_completo ?? 'corretor selecionado',
      })
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
          (contratos, cotações, demandas) é mantido, só o dono do cadastro muda.
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