import { useEffect, useState } from 'react'
import { cadastrarCorretor } from '../../lib/crm/clientesService'
import { listarPerfis, atualizarPerfil, desativarPerfil, reativarPerfil, transferirCarteira } from '../../lib/crm/perfisService'
import {
  listarConexoesOperadoras,
  criarConexaoOperadora,
  atualizarConexaoOperadora,
  marcarSincronizada,
  excluirConexaoOperadora,
} from '../../lib/crm/conexoesService'
import { operacional } from '../../lib/supabaseSchemas'
import { useAuth } from '../auth/AuthContext'

export default function ConfiguracoesPage() {
  const { perfil } = useAuth()
  const [email, setEmail] = useState('')
  const [nome, setNome] = useState('')
  const [papel, setPapel] = useState('corretor')
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState(null)
  const [sucesso, setSucesso] = useState(null)

  const podeAcessar = perfil?.papel === 'master' || perfil?.papel === 'administrador'
  const ehMaster = perfil?.papel === 'master'

  if (!podeAcessar) {
    return (
      <div className="config-page">
        <h2>Configurações</h2>
        <p className="config-instrucao">Esta área é restrita a Master e Administrador.</p>
      </div>
    )
  }

  async function handleCadastrar() {
    if (!email.trim() || !nome.trim()) {
      setErro('Preencha e-mail e nome completo.')
      return
    }
    setSalvando(true)
    setErro(null)
    setSucesso(null)
    try {
      await cadastrarCorretor({ email, nomeCompleto: nome, papel })
      setSucesso(`${nome} cadastrado(a) como ${papel} com sucesso.`)
      setEmail('')
      setNome('')
      setPapel('corretor')
    } catch (err) {
      setErro(err.message)
    } finally {
      setSalvando(false)
    }
  }

  return (
    <div className="config-page">
      <h2>Configurações</h2>

      <div className="ls-card config-card">
        <h4>Cadastrar Corretor</h4>
        <p className="config-instrucao">
          <strong>Passo 1:</strong> crie o login da pessoa no painel do Supabase
          (Authentication → Users → Add User), com e-mail e senha provisória.
          <br />
          <strong>Passo 2:</strong> preencha abaixo com o mesmo e-mail para vincular o perfil.
        </p>

        <div className="config-form-grid">
          <div className="config-campo-largo">
            <label>E-mail (o mesmo usado no Supabase Auth)</label>
            <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="nome@lifitseg.com.br" />
          </div>

          <div>
            <label>Nome completo</label>
            <input value={nome} onChange={(e) => setNome(e.target.value)} />
          </div>

          <div>
            <label>Papel</label>
            <select value={papel} onChange={(e) => setPapel(e.target.value)}>
              <option value="corretor">Corretor</option>
              <option value="assistente">Assistente</option>
              <option value="administrador">Administrador</option>
              <option value="master">Master</option>
            </select>
          </div>
        </div>

        {erro && <p className="ls-modal-erro">{erro}</p>}
        {sucesso && <p className="config-sucesso">{sucesso}</p>}

        <button className="ls-btn ls-btn-primary" onClick={handleCadastrar} disabled={salvando}>
          {salvando ? 'Cadastrando...' : 'Cadastrar Corretor'}
        </button>
      </div>

      <ListaCorretores />

      {ehMaster && <TransferirCarteiraCard />}

      {ehMaster && <ConexoesOperadorasCard />}
    </div>
  )
}

function ListaCorretores() {
  const [perfis, setPerfis] = useState([])
  const [carregando, setCarregando] = useState(true)
  const [editandoId, setEditandoId] = useState(null)
  const [rascunho, setRascunho] = useState({})

  useEffect(() => {
    carregar()
  }, [])

  async function carregar() {
    setCarregando(true)
    const lista = await listarPerfis()
    setPerfis(lista)
    setCarregando(false)
  }

  function iniciarEdicao(p) {
    setEditandoId(p.id)
    setRascunho({ nome_completo: p.nome_completo, email: p.email, papel: p.papel })
  }

  async function salvarEdicao(id) {
    await atualizarPerfil(id, rascunho)
    setEditandoId(null)
    carregar()
  }

  async function handleDesativar(p) {
    if (!window.confirm(`Desativar o acesso de ${p.nome_completo}? Ele(a) não vai mais conseguir entrar no sistema, mas todo o histórico é mantido.`)) return
    await desativarPerfil(p.id)
    carregar()
  }

  async function handleReativar(p) {
    await reativarPerfil(p.id)
    carregar()
  }

  return (
    <div className="ls-card config-card" style={{ marginTop: '1.25rem' }}>
      <h4>Corretores Cadastrados</h4>
      <p className="config-instrucao">
        Editar aqui atualiza só os dados de exibição no sistema. Para trocar o e-mail de
        login de verdade, é preciso alterar também em Authentication → Users no Supabase.
      </p>

      {carregando ? (
        <p>Carregando...</p>
      ) : (
        <div className="ls-card" style={{ marginTop: '0.75rem', padding: 0 }}>
          <table className="cliente-tabela">
            <thead>
              <tr><th>Nome</th><th>E-mail</th><th>Papel</th><th>Status</th><th>Ações</th></tr>
            </thead>
            <tbody>
              {perfis.map((p) => (
                <tr key={p.id}>
                  {editandoId === p.id ? (
                    <>
                      <td><input value={rascunho.nome_completo} onChange={(e) => setRascunho({ ...rascunho, nome_completo: e.target.value })} /></td>
                      <td><input value={rascunho.email ?? ''} onChange={(e) => setRascunho({ ...rascunho, email: e.target.value })} /></td>
                      <td>
                        <select value={rascunho.papel} onChange={(e) => setRascunho({ ...rascunho, papel: e.target.value })}>
                          <option value="corretor">Corretor</option>
                          <option value="assistente">Assistente</option>
                          <option value="administrador">Administrador</option>
                          <option value="master">Master</option>
                        </select>
                      </td>
                      <td>{p.ativo ? 'Ativo' : 'Inativo'}</td>
                      <td className="cliente-tabela-acoes">
                        <button className="cliente-tabela-btn" onClick={() => salvarEdicao(p.id)}>Salvar</button>
                        <button className="cliente-tabela-btn" onClick={() => setEditandoId(null)}>Cancelar</button>
                      </td>
                    </>
                  ) : (
                    <>
                      <td>{p.nome_completo}</td>
                      <td>{p.email}</td>
                      <td>{p.papel}</td>
                      <td>
                        <span className={`ls-badge ls-badge-${p.ativo ? 'cliente' : 'inativo'}`}>
                          {p.ativo ? 'Ativo' : 'Inativo'}
                        </span>
                      </td>
                      <td className="cliente-tabela-acoes">
                        <button className="cliente-tabela-btn" onClick={() => iniciarEdicao(p)}>Editar</button>
                        {p.ativo ? (
                          <button className="cliente-tabela-btn cliente-tabela-btn-perigo" onClick={() => handleDesativar(p)}>Desativar</button>
                        ) : (
                          <button className="cliente-tabela-btn" onClick={() => handleReativar(p)}>Reativar</button>
                        )}
                      </td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function TransferirCarteiraCard() {
  const [perfis, setPerfis] = useState([])
  const [origemId, setOrigemId] = useState('')
  const [destinoId, setDestinoId] = useState('')
  const [transferindo, setTransferindo] = useState(false)
  const [resultado, setResultado] = useState(null)
  const [erro, setErro] = useState(null)

  useEffect(() => {
    listarPerfis().then(setPerfis)
  }, [])

  async function handleTransferir() {
    if (!origemId || !destinoId) {
      setErro('Escolha o corretor de origem e o de destino.')
      return
    }
    if (origemId === destinoId) {
      setErro('Origem e destino não podem ser o mesmo corretor.')
      return
    }
    const nomeOrigem = perfis.find((p) => p.id === origemId)?.nome_completo
    const nomeDestino = perfis.find((p) => p.id === destinoId)?.nome_completo
    if (!window.confirm(`Transferir TODOS os clientes de ${nomeOrigem} para ${nomeDestino}? Essa ação não pode ser desfeita automaticamente.`)) return

    setTransferindo(true)
    setErro(null)
    setResultado(null)
    try {
      const quantidade = await transferirCarteira(origemId, destinoId)
      setResultado(`${quantidade} cliente(s) transferido(s) de ${nomeOrigem} para ${nomeDestino}.`)
      setOrigemId('')
      setDestinoId('')
    } catch (err) {
      setErro(err.message)
    } finally {
      setTransferindo(false)
    }
  }

  return (
    <div className="ls-card config-card" style={{ marginTop: '1.25rem' }}>
      <h4>Transferir Carteira</h4>
      <p className="config-instrucao">
        Use quando um corretor sai da empresa: transfere de uma vez todos os clientes dele
        para outro corretor, preservando o histórico completo (contratos, cotações, demandas).
      </p>

      <div className="config-form-grid">
        <div>
          <label>De (corretor de origem)</label>
          <select value={origemId} onChange={(e) => setOrigemId(e.target.value)}>
            <option value="">Selecione...</option>
            {perfis.map((p) => (
              <option key={p.id} value={p.id}>{p.nome_completo} {!p.ativo ? '(inativo)' : ''}</option>
            ))}
          </select>
        </div>

        <div>
          <label>Para (corretor de destino)</label>
          <select value={destinoId} onChange={(e) => setDestinoId(e.target.value)}>
            <option value="">Selecione...</option>
            {perfis.filter((p) => p.ativo).map((p) => (
              <option key={p.id} value={p.id}>{p.nome_completo}</option>
            ))}
          </select>
        </div>
      </div>

      {erro && <p className="ls-modal-erro">{erro}</p>}
      {resultado && <p className="config-sucesso">{resultado}</p>}

      <button className="ls-btn ls-btn-primary" onClick={handleTransferir} disabled={transferindo}>
        {transferindo ? 'Transferindo...' : 'Transferir Carteira'}
      </button>
    </div>
  )
}

const MODULOS_CONEXAO = [
  { id: 'saude', label: 'Lifcare (Saúde)' },
  { id: 'auto', label: 'Lifleet (Auto)' },
  { id: 'lifsure', label: 'LifSure' },
  { id: 'lishield', label: 'LiShield' },
  { id: 'lifplan', label: 'LifPlan' },
]

const ROTULO_TIPO_CONEXAO = { api: '🔌 API', tabela: '📄 Tabela importada', manual: '✍️ Manual' }
const ROTULO_STATUS_CONEXAO = { ativa: 'Ativa', pendente: 'Pendente', inativa: 'Inativa' }
const ROTULO_AMBIENTE = { desenvolvimento: 'Desenvolvimento', homologacao: 'Homologação', producao: 'Produção' }

function ConexoesOperadorasCard() {
  const [moduloSelecionado, setModuloSelecionado] = useState('auto')
  const [conexoes, setConexoes] = useState([])
  const [carregando, setCarregando] = useState(true)
  const [mostrarForm, setMostrarForm] = useState(false)

  useEffect(() => {
    carregar()
  }, [moduloSelecionado])

  async function carregar() {
    setCarregando(true)
    const lista = await listarConexoesOperadoras(moduloSelecionado)
    setConexoes(lista)
    setCarregando(false)
  }

  return (
    <div className="ls-card" style={{ marginTop: '1.5rem' }}>
      <h3>🔌 Conexões com Operadoras/Seguradoras</h3>
      <p className="config-instrucao">
        Acompanhe quais operadoras têm integração ativa, por tabela importada ou totalmente manual —
        essa tela nunca guarda chave, token ou credencial nenhuma, só o status de cada conexão.
      </p>

      <div style={{ display: 'flex', gap: '0.4rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
        {MODULOS_CONEXAO.map((m) => (
          <button
            key={m.id}
            className={`ls-btn ${moduloSelecionado === m.id ? 'ls-btn-primary' : 'ls-btn-ghost'}`}
            onClick={() => setModuloSelecionado(m.id)}
          >
            {m.label}
          </button>
        ))}
      </div>

      {!mostrarForm ? (
        <button className="ls-btn ls-btn-accent" onClick={() => setMostrarForm(true)}>
          + Nova Conexão
        </button>
      ) : (
        <NovaConexaoForm
          modulo={moduloSelecionado}
          onSalvo={() => {
            setMostrarForm(false)
            carregar()
          }}
          onCancelar={() => setMostrarForm(false)}
        />
      )}

      {carregando ? (
        <p className="cliente-carregando">Carregando...</p>
      ) : conexoes.length === 0 ? (
        <p className="cliente-vazio" style={{ marginTop: '1rem' }}>Nenhuma conexão cadastrada para este módulo ainda.</p>
      ) : (
        <div className="ls-card" style={{ marginTop: '1rem', padding: 0 }}>
          <table className="cliente-tabela">
            <thead>
              <tr><th>Operadora</th><th>Tipo</th><th>Status</th><th>Última sincronização</th><th>Ações</th></tr>
            </thead>
            <tbody>
              {conexoes.map((c) => (
                <LinhaConexao key={c.id} conexao={c} onAtualizado={carregar} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function NovaConexaoForm({ modulo, onSalvo, onCancelar }) {
  const [nomeOperadora, setNomeOperadora] = useState('')
  const [tipoConexao, setTipoConexao] = useState('manual')
  const [observacoes, setObservacoes] = useState('')
  const [codigoSucursal, setCodigoSucursal] = useState('')
  const [ambiente, setAmbiente] = useState('homologacao')
  const [configuracoesExtras, setConfiguracoesExtras] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState(null)

  async function handleSalvar() {
    if (!nomeOperadora.trim()) {
      setErro('Informe o nome da operadora.')
      return
    }
    setSalvando(true)
    setErro(null)
    try {
      const { data: org } = await operacional.from('organizacoes').select('id').limit(1).single()
      await criarConexaoOperadora({
        organizacaoId: org.id,
        modulo,
        nomeOperadora,
        tipoConexao,
        observacoes,
        codigoSucursal,
        ambiente,
        configuracoesExtras,
      })
      onSalvo()
    } catch (err) {
      setErro(err.message)
    } finally {
      setSalvando(false)
    }
  }

  return (
    <div className="ls-card" style={{ marginTop: '0.75rem' }}>
      <label>Nome da operadora/seguradora</label>
      <input value={nomeOperadora} onChange={(e) => setNomeOperadora(e.target.value)} placeholder="Ex: Porto Seguro, SulAmérica, Bradesco Seguros..." />

      <label>Tipo de conexão</label>
      <select value={tipoConexao} onChange={(e) => setTipoConexao(e.target.value)}>
        <option value="manual">✍️ Manual (corretor digita)</option>
        <option value="tabela">📄 Tabela importada (Excel/CSV)</option>
        <option value="api">🔌 API</option>
      </select>

      {tipoConexao === 'api' && (
        <>
          <div className="cotacao-form-linha">
            <div>
              <label>Código de sucursal/filial (se souber)</label>
              <input value={codigoSucursal} onChange={(e) => setCodigoSucursal(e.target.value)} placeholder="Ex: 911" />
            </div>
            <div>
              <label>Ambiente</label>
              <select value={ambiente} onChange={(e) => setAmbiente(e.target.value)}>
                <option value="desenvolvimento">Desenvolvimento</option>
                <option value="homologacao">Homologação</option>
                <option value="producao">Produção</option>
              </select>
            </div>
          </div>

          <label>Outros códigos técnicos (livre — nunca coloque client_id/client_secret ou senha aqui)</label>
          <textarea
            value={configuracoesExtras}
            onChange={(e) => setConfiguracoesExtras(e.target.value)}
            rows={3}
            placeholder="Ex: cdEmpresa: 123, cdInspetoria: 456, cdProdutoCliente: 789, comissão Auto: 20%"
            style={{ width: '100%', padding: '0.5rem 0.65rem', border: '1px solid var(--ls-border)', borderRadius: 'var(--ls-radius-sm)', fontFamily: 'inherit' }}
          />
        </>
      )}

      <label>Observações</label>
      <input value={observacoes} onChange={(e) => setObservacoes(e.target.value)} placeholder="Ex: aguardando retorno da operadora sobre disponibilizar tabela" />

      {erro && <p className="ls-modal-erro">{erro}</p>}

      <div className="ls-modal-acoes">
        <button className="ls-btn ls-btn-ghost" onClick={onCancelar}>Cancelar</button>
        <button className="ls-btn ls-btn-primary" onClick={handleSalvar} disabled={salvando}>
          {salvando ? 'Salvando...' : 'Salvar Conexão'}
        </button>
      </div>
    </div>
  )
}

function LinhaConexao({ conexao, onAtualizado }) {
  const [editando, setEditando] = useState(false)
  const [status, setStatus] = useState(conexao.status)
  const [tipoConexao, setTipoConexao] = useState(conexao.tipo_conexao)
  const [codigoSucursal, setCodigoSucursal] = useState(conexao.codigo_sucursal ?? '')
  const [ambiente, setAmbiente] = useState(conexao.ambiente ?? 'homologacao')
  const [configuracoesExtras, setConfiguracoesExtras] = useState(conexao.configuracoes_extras ?? '')

  async function handleSalvar() {
    await atualizarConexaoOperadora(conexao.id, {
      status,
      tipo_conexao: tipoConexao,
      codigo_sucursal: codigoSucursal || null,
      ambiente,
      configuracoes_extras: configuracoesExtras || null,
    })
    setEditando(false)
    onAtualizado()
  }

  async function handleMarcarSincronizada() {
    await marcarSincronizada(conexao.id)
    onAtualizado()
  }

  async function handleExcluir() {
    if (!window.confirm(`Excluir a conexão com ${conexao.nome_operadora}?`)) return
    await excluirConexaoOperadora(conexao.id)
    onAtualizado()
  }

  if (editando) {
    return (
      <tr>
        <td colSpan={5}>
          <div className="ls-card" style={{ padding: '0.75rem' }}>
            <strong>{conexao.nome_operadora}</strong>
            <div className="cotacao-form-linha" style={{ marginTop: '0.5rem' }}>
              <div>
                <label>Tipo de conexão</label>
                <select value={tipoConexao} onChange={(e) => setTipoConexao(e.target.value)}>
                  <option value="manual">Manual</option>
                  <option value="tabela">Tabela importada</option>
                  <option value="api">API</option>
                </select>
              </div>
              <div>
                <label>Status</label>
                <select value={status} onChange={(e) => setStatus(e.target.value)}>
                  <option value="pendente">Pendente</option>
                  <option value="ativa">Ativa</option>
                  <option value="inativa">Inativa</option>
                </select>
              </div>
              {tipoConexao === 'api' && (
                <>
                  <div>
                    <label>Código de sucursal/filial</label>
                    <input value={codigoSucursal} onChange={(e) => setCodigoSucursal(e.target.value)} placeholder="Ex: 911" />
                  </div>
                  <div>
                    <label>Ambiente</label>
                    <select value={ambiente} onChange={(e) => setAmbiente(e.target.value)}>
                      <option value="desenvolvimento">Desenvolvimento</option>
                      <option value="homologacao">Homologação</option>
                      <option value="producao">Produção</option>
                    </select>
                  </div>
                </>
              )}
            </div>
            {tipoConexao === 'api' && (
              <>
                <label>Outros códigos técnicos (nunca client_id/client_secret ou senha)</label>
                <textarea
                  value={configuracoesExtras}
                  onChange={(e) => setConfiguracoesExtras(e.target.value)}
                  rows={2}
                  style={{ width: '100%', padding: '0.5rem 0.65rem', border: '1px solid var(--ls-border)', borderRadius: 'var(--ls-radius-sm)', fontFamily: 'inherit' }}
                />
              </>
            )}
            <div className="ls-modal-acoes">
              <button className="cliente-tabela-btn" onClick={() => setEditando(false)}>Cancelar</button>
              <button className="cliente-tabela-btn" onClick={handleSalvar}>Salvar</button>
            </div>
          </div>
        </td>
      </tr>
    )
  }

  return (
    <tr>
      <td>
        {conexao.nome_operadora}
        {conexao.tipo_conexao === 'api' && (conexao.codigo_sucursal || conexao.ambiente) && (
          <div className="config-instrucao" style={{ fontSize: '0.75rem', marginTop: '0.15rem' }}>
            {conexao.codigo_sucursal && `Sucursal ${conexao.codigo_sucursal}`}
            {conexao.codigo_sucursal && conexao.ambiente && ' · '}
            {conexao.ambiente && ROTULO_AMBIENTE[conexao.ambiente]}
          </div>
        )}
      </td>
      <td>{ROTULO_TIPO_CONEXAO[conexao.tipo_conexao]}</td>
      <td><span className={`ls-badge ls-badge-${conexao.status === 'ativa' ? 'cliente' : 'prospect'}`}>{ROTULO_STATUS_CONEXAO[conexao.status]}</span></td>
      <td>{conexao.ultima_sincronizacao ? new Date(conexao.ultima_sincronizacao).toLocaleString('pt-BR') : '—'}</td>
      <td className="cliente-tabela-acoes">
        <button className="cliente-tabela-btn" onClick={() => setEditando(true)}>Editar</button>
        {conexao.tipo_conexao === 'tabela' && (
          <button className="cliente-tabela-btn" onClick={handleMarcarSincronizada}>Marcar sincronizada agora</button>
        )}
        <button className="cliente-tabela-btn cliente-tabela-btn-perigo" onClick={handleExcluir}>Excluir</button>
      </td>
    </tr>
  )
}
