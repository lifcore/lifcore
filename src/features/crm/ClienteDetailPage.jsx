import { useEffect, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { institucional } from '../../lib/supabaseSchemas'
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
import './selecaoPlanosMulticalculo.css'
import { marcarCotacaoRecomendada, marcarCotacaoCenarioAtual } from '../../lib/crm/multicalculoCotacaoService'
import { buscarResumoPlanosPorId } from '../../lib/crm/motorSmartQuoteService'
import { montarDadosEstudoEssencial, montarDadosEstudoExecutivo } from '../../lib/crm/estudoManualDadosService'
import { gerarHtmlEstudoEssencial } from '../../lib/crm/estudoEssencialPdfService'
import { gerarHtmlEstudoMercado } from '../../lib/crm/estudoMercadoPdfService'
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
/**
 * Sprint 3b (21/08) — mesma lógica de chip adaptativo já usada em
 * `SelecaoPlanosMulticalculo.jsx` (LogoOperadora) — duplicada aqui de
 * propósito (arquivo diferente, sem import cruzado entre features/crm
 * e components/multicalculo) em vez de compartilhada, pra não criar
 * acoplamento entre as duas telas por causa de um detalhe visual.
 *
 * ATUALIZADO (21/08) — `tamanho="grande"` (achado real: no cabeçalho
 * compacto do card o logo pequeno ficava difícil de ver). Movido pra
 * dentro da linha de botões, empurrado pro canto direito (`margin-left:
 * auto` na classe grande) — é onde sobrava espaço vazio de verdade.
 */
function LogoOperadoraCotacao({ logoInfo, tamanho = 'normal' }) {
  if (!logoInfo?.logo_url) return null
  const classes = ['selecao-planos-logo-chip']
  if (logoInfo.logo_fundo_chip === 'claro') classes.push('selecao-planos-logo-chip-claro')
  else if (logoInfo.logo_fundo_chip === 'escuro') classes.push('selecao-planos-logo-chip-escuro')
  if (tamanho === 'grande') classes.push('selecao-planos-logo-chip-grande')
  // REDESENHO card cliente-facing (25/08) — variante nova, menor que
  // "grande" (usado no Multicálculo). Classe própria em
  // cotacoesGrupo.css, isolada — não mexe no tamanho usado em nenhuma
  // outra tela.
  else if (tamanho === 'media') classes.push('cotacao-item-logo-media')
  return (
    <span className={classes.join(' ')}>
      <img src={logoInfo.logo_url} alt="" className="selecao-planos-logo-img" />
    </span>
  )
}

function CotacoesSecao({ clienteId, cotacoes, onAtualizado, perfil }) {
  const [mostrarForm, setMostrarForm] = useState(false)
  const [mostrarMulticalculo, setMostrarMulticalculo] = useState(false)
  const [cotacaoFormalizando, setCotacaoFormalizando] = useState(null)
  const [processando, setProcessando] = useState(null)
  const [erroWorkflow, setErroWorkflow] = useState(null)
  // REDESENHO card cliente-facing (25/08) — menu de ações escondido atrás
  // de "⋮" no canto do card; guarda o id da Cotação com o menu aberto no
  // momento (só 1 por vez, fecha se abrir outro).
  const [menuAbertoId, setMenuAbertoId] = useState(null)

  // Etapa 4 do plano "Registro Manual + Estudo de Mercado" (21/08) —
  // seleção pro Estudo é TRANSIENTE (só existe enquanto o corretor está
  // montando o PDF nesta visita à tela) — não precisa de coluna no
  // banco, mesma ideia do carrinho do Multicálculo (Set em memória).
  const [selecionadasParaEstudo, setSelecionadasParaEstudo] = useState(new Set())
  const [mostrarOpcoesEstudo, setMostrarOpcoesEstudo] = useState(false)
  const [incluirRede, setIncluirRede] = useState(true) // rede é por plano, estável — praticamente sempre desejada (confirmado com o usuário)
  const [incluirRegras, setIncluirRegras] = useState(false) // regras são de venda, não valem pro que o cliente já tem ativo — opt-in
  const [gerandoEstudo, setGerandoEstudo] = useState(false)

  function alternarSelecaoEstudo(cotacaoId) {
    setSelecionadasParaEstudo((atual) => {
      const novo = new Set(atual)
      if (novo.has(cotacaoId)) novo.delete(cotacaoId)
      else novo.add(cotacaoId)
      return novo
    })
  }

  // ETAPA 5 (ainda não construída) vai substituir este handler pela
  // busca de dado de verdade + geração do HTML/PDF. Por enquanto só
  // confirma a seleção, pra a Etapa 4 já ser testável sozinha sem
  // depender da reescrita inteira de uma vez.
  // Etapa 5 (21/08) — liga a seleção da Etapa 4 na busca de dado nova
  // (estudoManualDadosService.js, lê direto das Cotações selecionadas,
  // sem sistema antigo de upload+extração no meio) + no HTML que já
  // existia (gerarHtmlEstudoEssencial/gerarHtmlEstudoMercado, ambos
  // intocados — só a fonte do dado mudou). Mesmo mecanismo de
  // janela+impressão dos botões antigos (BotaoGerarEstudoEssencial/
  // Premium): abre em aba nova, pronto pra "Salvar como PDF".
  async function handleGerarEstudo(tipo) {
    setGerandoEstudo(true)
    setErroWorkflow(null)
    try {
      const opcoes = { cotacaoIds: [...selecionadasParaEstudo], incluirRede, incluirRegras }
      const dados = tipo === 'essencial' ? await montarDadosEstudoEssencial(opcoes) : await montarDadosEstudoExecutivo(opcoes)
      const html = tipo === 'essencial' ? gerarHtmlEstudoEssencial(dados) : gerarHtmlEstudoMercado(dados)
      const janela = window.open('', '_blank')
      janela.document.write(html)
      janela.document.close()
      setMostrarOpcoesEstudo(false)
      setSelecionadasParaEstudo(new Set())
    } catch (err) {
      setErroWorkflow(`Erro ao gerar o Estudo: ${err.message}`)
    } finally {
      setGerandoEstudo(false)
    }
  }

  // Sprint 3b (21/08) — logo da operadora no card de Cotação, mesmo
  // padrão do cabeçalho de operadora no Multicálculo
  // (SelecaoPlanosMulticalculo.jsx). Busca só 1 vez (poucas linhas, ~12
  // operadoras), mapeado por id pra achar rápido card a card.
  const [logosPorOperadoraId, setLogosPorOperadoraId] = useState(new Map())

  useEffect(() => {
    institucional
      .from('operadoras')
      .select('id, logo_url, logo_fundo_chip')
      .then(({ data, error }) => {
        if (error) return
        setLogosPorOperadoraId(new Map((data ?? []).map((o) => [o.id, o])))
      })
  }, [])

  // REDESENHO card cliente-facing (25/08) — Acomodação + contagem de
  // prestadores na rede, por plano_biblioteca_id. Busca em lote 1 vez
  // sempre que a lista de Cotações muda (não card a card, pra não
  // multiplicar idas ao banco). Cotação sem plano_biblioteca_id (ainda
  // não vinculada à Biblioteca) simplesmente não aparece no Map — o
  // card trata a ausência mostrando nada nesse espaço, sem quebrar.
  const [resumoPlanosPorId, setResumoPlanosPorId] = useState(new Map())

  useEffect(() => {
    const idsDaPagina = cotacoes.map((c) => c.plano_biblioteca_id).filter(Boolean)
    if (idsDaPagina.length === 0) {
      setResumoPlanosPorId(new Map())
      return
    }
    buscarResumoPlanosPorId(idsDaPagina).then(setResumoPlanosPorId)
  }, [cotacoes])

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

  // Etapa 3 do plano "Registro Manual + Estudo de Mercado" (21/08) —
  // mesmo padrão de handleAlternarRecomendada, independente dela.
  // Cliente com mais de 1 plano ativo hoje → o corretor marca várias
  // Cotações como Cenário Atual, sem trava nenhuma pra isso.
  async function handleAlternarCenarioAtual(cotacaoId, valorAtual) {
    setProcessando(cotacaoId)
    setErroWorkflow(null)
    try {
      await marcarCotacaoCenarioAtual(cotacaoId, !valorAtual)
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
      {!mostrarForm && !cotacaoFormalizando && !mostrarMulticalculo && (
        <div style={{ display: 'flex', gap: '0.6rem' }}>
          {/* ATUALIZADO (21/08) — troca de destaque pedida pelo usuário:
              o Multicálculo é o fluxo real de cotação hoje (cria as
              Cotações de verdade, com preço vindo da Biblioteca de
              Mercado), então vira a ação primária "Registrar Cotação".
              O formulário antigo (que embute Cenário Atual + Propostas
              de Mercado) reflete melhor o que ele faz de verdade sendo
              chamado de "Estudo de Mercado" — nenhuma lógica mudou, só
              rótulo/ícone/destaque visual dos 2 botões. */}
          <button className="ls-btn ls-btn-accent" onClick={() => setMostrarMulticalculo(true)}>
            + Registrar Cotação
          </button>
          <button className="ls-btn ls-btn-ghost" onClick={() => setMostrarForm(true)}>
            📊 Estudo de Mercado
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
            ✕ Fechar
          </button>
          <PainelCotacao clienteProspectId={clienteId} onConcluido={handleMulticalculoConcluido} />
        </div>
      )}

      {/* REDESENHO "Registro Manual" (21/08) — `cotacaoEditando`/`onCriado`
          removidos: o botão "Editar" saiu do card (não funcionava certo,
          criar de novo é mais simples), e o `CotacaoForm` não fica mais
          aberto depois de salvar (os blocos embutidos que justificavam
          isso, Cenário Atual/Propostas, saíram também — ver
          CotacaoForm.jsx). Esse caminho hoje só serve pra CRIAR. */}
      {mostrarForm && (
        <CotacaoForm
          clienteProspectId={clienteId}
          onSalvo={() => {
            setMostrarForm(false)
            onAtualizado()
          }}
          onCancelar={() => setMostrarForm(false)}
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

      {/* Etapa 4 (21/08) — barra de seleção pro Estudo, mesmo padrão
          visual do carrinho do Multicálculo (selecao-planos-carrinho),
          reaproveitado aqui pra ficar familiar pro corretor. */}
      {selecionadasParaEstudo.size > 0 && (
        <div className="selecao-planos-carrinho" style={{ marginBottom: '1rem' }}>
          <div className="selecao-planos-carrinho-cabecalho">
            <span>
              📊 {selecionadasParaEstudo.size} cotação{selecionadasParaEstudo.size === 1 ? '' : 'ões'} selecionada
              {selecionadasParaEstudo.size === 1 ? '' : 's'} pro Estudo
            </span>
            <button className="ls-btn ls-btn-primary" onClick={() => setMostrarOpcoesEstudo(true)}>
              Gerar Estudo
            </button>
          </div>
        </div>
      )}

      {mostrarOpcoesEstudo && (
        <div className="ls-card" style={{ marginBottom: '1rem' }}>
          <h3 style={{ marginTop: 0 }}>O que incluir no comparativo</h3>
          <p className="config-instrucao">
            Rede vem do plano vinculado na Biblioteca de Mercado (quando existir) — praticamente sempre faz
            sentido incluir. Regras são de venda e não valem pro que o cliente já tem ativo — inclua só se fizer
            sentido pro comparativo.
          </p>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
            <input type="checkbox" checked={incluirRede} onChange={(e) => setIncluirRede(e.target.checked)} />
            Rede credenciada
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
            <input type="checkbox" checked={incluirRegras} onChange={(e) => setIncluirRegras(e.target.checked)} />
            Regras da operadora
          </label>
          <div className="ls-modal-acoes">
            <button className="ls-btn ls-btn-ghost" onClick={() => setMostrarOpcoesEstudo(false)} disabled={gerandoEstudo}>
              Cancelar
            </button>
            <button className="ls-btn ls-btn-ghost" onClick={() => handleGerarEstudo('essencial')} disabled={gerandoEstudo}>
              {gerandoEstudo ? 'Gerando...' : '📊 Gerar Estudo Essencial'}
            </button>
            <button className="ls-btn ls-btn-primary" onClick={() => handleGerarEstudo('executivo')} disabled={gerandoEstudo}>
              {gerandoEstudo ? 'Gerando...' : '📊 Gerar Estudo Executivo'}
            </button>
          </div>
        </div>
      )}

      {cotacoes.length === 0 ? (
        <p className="cliente-vazio">Nenhuma cotação registrada ainda.</p>
      ) : (
        <div className="cotacoes-historico" style={{ marginTop: '1rem' }}>
          {/* REDESENHO (25/08) — Cenário Atual precisa ser sempre o
              PRIMEIRO card entre TODAS as Cotações, não só dentro do
              próprio grupo de comparação. Ele pode estar sozinho num
              grupo de 1 item (separado do grupo com as opções concorrentes,
              como no caso real observado) — por isso a ordenação de
              grupos entre si é tão necessária quanto a ordenação dentro
              de cada grupo (já feita mais abaixo, no .map de cada card). */}
          {[...grupos.entries()]
            .sort(([, a], [, b]) => {
              const aTemCenarioAtual = a.some((c) => c.eh_cenario_atual) ? 1 : 0
              const bTemCenarioAtual = b.some((c) => c.eh_cenario_atual) ? 1 : 0
              return bTemCenarioAtual - aTemCenarioAtual
            })
            .map(([chaveGrupo, cotacoesDoGrupo]) => (
            <div key={chaveGrupo} className={cotacoesDoGrupo.length > 1 ? 'cotacoes-grupo-comparacao' : undefined}>
              {cotacoesDoGrupo.length > 1 && (
                <p className="cotacoes-grupo-titulo">{cotacoesDoGrupo.length} opções nesta rodada de comparação</p>
              )}

              {/* REDESENHO (25/08) — Cenário Atual sempre em primeiro,
                  independente da ordem de criação/vinda do banco. É a
                  referência do cliente, faz sentido ler antes das opções. */}
              {[...cotacoesDoGrupo]
                .sort((a, b) => (b.eh_cenario_atual ? 1 : 0) - (a.eh_cenario_atual ? 1 : 0))
                .map((cot) => {
                const status = ROTULO_STATUS_COTACAO[cot.status ?? 'em_negociacao'] ?? ROTULO_STATUS_COTACAO.em_negociacao
                const podeFechar = (cot.status ?? 'em_negociacao') === 'em_negociacao'
                const podeFormalizar = cot.status === 'emissao'
                const podeDesistirOuExpirar = ['em_negociacao', 'emissao'].includes(cot.status ?? 'em_negociacao')
                const hoje = new Date().toISOString().slice(0, 10)
                const venceu = cot.validade && cot.validade < hoje
                const totalCotacao = (cot.itens_cotacao ?? []).reduce(
                  (soma, item) => soma + (item.quantidade_vidas ?? 0) * Number(item.valor ?? 0),
                  0
                )
                const menuAberto = menuAbertoId === cot.id
                const resumoPlano = resumoPlanosPorId.get(cot.plano_biblioteca_id)

                return (
                  <div
                    key={cot.id}
                    className={`ls-card cotacao-item${cot.recomendada ? ' cotacao-item-recomendada' : ''}${cot.eh_cenario_atual ? ' cotacao-item-cenario-atual' : ''}`}
                    style={{ position: 'relative' }}
                  >
                    {/* REDESENHO (25/08) — menu de ações escondido atrás de
                        "⋮". Fecha sozinho depois de qualquer ação (cada
                        handle* já chama onAtualizado, que remonta a lista). */}
                    <button
                      className="cotacao-item-menu-gatilho"
                      onClick={() => setMenuAbertoId(menuAberto ? null : cot.id)}
                      aria-label="Mais ações"
                      title="Mais ações"
                    >
                      ⋮
                    </button>
                    {menuAberto && (
                      <div className="cotacao-item-menu" onMouseLeave={() => setMenuAbertoId(null)}>
                        {podeFechar && (
                          <button
                            className="cotacao-item-menu-item"
                            disabled={processando === cot.id}
                            onClick={() => { setMenuAbertoId(null); handleFechar(cot.id) }}
                          >
                            {processando === cot.id ? '...' : 'Fechar com esta (ir pra Emissão)'}
                          </button>
                        )}
                        {podeFormalizar && (
                          <button
                            className="cotacao-item-menu-item"
                            disabled={processando === cot.id}
                            onClick={() => { setMenuAbertoId(null); setCotacaoFormalizando(cot) }}
                          >
                            {processando === cot.id ? '...' : 'Formalizar Contrato'}
                          </button>
                        )}
                        {podeDesistirOuExpirar && venceu && (
                          <button
                            className="cotacao-item-menu-item"
                            disabled={processando === cot.id}
                            onClick={() => { setMenuAbertoId(null); handleExpirar(cot.id) }}
                          >
                            {processando === cot.id ? '...' : 'Marcar Expirada'}
                          </button>
                        )}
                        {podeFechar && (
                          <button
                            className="cotacao-item-menu-item"
                            disabled={processando === cot.id}
                            onClick={() => { setMenuAbertoId(null); handleAlternarRecomendada(cot.id, cot.recomendada) }}
                          >
                            {cot.recomendada ? '★ Desmarcar recomendada' : '☆ Marcar como recomendada'}
                          </button>
                        )}
                        <button
                          className="cotacao-item-menu-item"
                          disabled={processando === cot.id}
                          onClick={() => { setMenuAbertoId(null); handleAlternarCenarioAtual(cot.id, cot.eh_cenario_atual) }}
                        >
                          {cot.eh_cenario_atual ? '☑ Desmarcar cenário atual' : '☐ Marcar como cenário atual'}
                        </button>
                        <button
                          className="cotacao-item-menu-item cotacao-item-menu-item-perigo"
                          onClick={() => { setMenuAbertoId(null); handleExcluir(cot.id) }}
                        >
                          Excluir
                        </button>
                      </div>
                    )}

                    <div className="cotacao-item-header">
                      <strong>{cot.operadora_nome_livre}</strong>
                      <span className="ls-badge ls-badge-prospect">{cot.porte}</span>
                      <span>{cot.numero_vidas} vidas</span>
                      <span>{formatarDataBR(cot.data_cotacao)}</span>
                      <span style={{ fontWeight: 600, color: status.cor }}>{status.texto}</span>
                      {cot.recomendada && <span className="ls-badge cotacao-badge-recomendada">★ Recomendada</span>}
                      {cot.eh_cenario_atual && <span className="ls-badge cotacao-badge-cenario-atual">📍 Cenário Atual</span>}
                    </div>

                    {/* REDESENHO (25/08) — vitrine: nome do plano em
                        destaque, seguido de Prestadores/Acomodação/
                        Coparticipação com mais contraste (não mais cinza
                        apagado) — é a informação que o cliente mais quer
                        ver rápido, ganha peso visual próprio, separada dos
                        badges operacionais do corretor. Só aparece o que a
                        Cotação tem de fato: ver notas de cada campo mais
                        abaixo. */}
                    {(cot.plano || cot.coparticipacao_tipo || resumoPlano) && (
                      <div className="cotacao-item-vitrine">
                        {cot.plano && <span className="cotacao-item-plano">{cot.plano}</span>}
                        {(resumoPlano || cot.coparticipacao_tipo) && (
                          <div className="cotacao-item-vitrine-specs">
                            {resumoPlano?.acomodacao && (
                              <span className="cotacao-item-vitrine-spec">{resumoPlano.acomodacao}</span>
                            )}
                            {cot.coparticipacao_tipo && (
                              <span className="cotacao-item-vitrine-spec">Coparticipação {cot.coparticipacao_tipo}</span>
                            )}
                            {resumoPlano && (
                              <span className="cotacao-item-vitrine-spec">
                                {resumoPlano.totalPrestadores} prestador{resumoPlano.totalPrestadores === 1 ? '' : 'es'} na rede
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    )}

                    {cot.itens_cotacao?.length > 0 && (
                      <div className="cotacao-item-valores">
                        {cot.itens_cotacao.map((item) => {
                          const subtotalFaixa = (item.quantidade_vidas ?? 0) * Number(item.valor ?? 0)
                          return (
                            <span key={item.id} className="cotacao-item-valor">
                              {item.faixa_etaria} ({item.quantidade_vidas ?? 0}x): R$ {subtotalFaixa.toFixed(2)}
                            </span>
                          )
                        })}
                      </div>
                    )}

                    {/* REDESENHO (25/08) — Total maior, linha própria logo
                        acima do logo (vitrine pro cliente, não só ferramenta
                        de trabalho do corretor). */}
                    <div className="cotacao-item-destaque">
                      <span className="cotacao-item-total-grande">
                        R$ {totalCotacao.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </span>
                      <LogoOperadoraCotacao logoInfo={logosPorOperadoraId.get(cot.operadora_id)} tamanho="media" />
                    </div>

                    {cot.contrato_id && (
                      <div className="kpi-detalhe" style={{ margin: '0.25rem 0 0' }}>
                        Contrato gerado — veja em Contratos
                      </div>
                    )}

                    {/* Etapa 4 (21/08) — continua visível fora do menu, de
                        propósito: é usada repetidamente ao montar um
                        Estudo, esconder atrás de "⋮" atrapalharia o fluxo. */}
                    <label className="cotacao-item-incluir-estudo">
                      <input
                        type="checkbox"
                        checked={selecionadasParaEstudo.has(cot.id)}
                        onChange={() => alternarSelecaoEstudo(cot.id)}
                      />
                      Incluir no Estudo
                    </label>
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