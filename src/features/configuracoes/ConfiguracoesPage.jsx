import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import '../../styles/lcds-tokens.css'
import InfoTooltip from '../../components/InfoTooltip'
import { cadastrarCorretor } from '../../lib/crm/clientesService'
import { listarPerfis, atualizarPerfil, desativarPerfil, reativarPerfil, transferirCarteira } from '../../lib/crm/perfisService'
import { operacional } from '../../lib/supabaseSchemas'
import { useAuth } from '../auth/AuthContext'
import SeguradorasCard from './MasterCenterSeguradoras'

export default function ConfiguracoesPage() {
  const { perfil } = useAuth()
  const [email, setEmail] = useState('')
  const [nome, setNome] = useState('')
  const [papel, setPapel] = useState('corretor')
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState(null)
  const [sucesso, setSucesso] = useState(null)
  const [abaAtiva, setAbaAtiva] = useState('corretores')

  const podeAcessar = perfil?.papel === 'master' || perfil?.papel === 'administrador'
  const ehMaster = perfil?.papel === 'master'

  if (!podeAcessar) {
    return (
      <div className="config-page" data-theme="lcds">
        <h2>Configurações</h2>
        <p className="config-instrucao">Esta área é restrita a Master e Administrador.</p>
      </div>
    )
  }

  const abas = [
    { id: 'corretores', label: 'Corretores' },
    ...(ehMaster ? [{ id: 'transferir', label: 'Transferir Carteira' }] : []),
    ...(ehMaster ? [{ id: 'seguradoras', label: 'Seguradoras' }] : []),
    ...(ehMaster ? [{ id: 'conexoes', label: 'Conexões' }] : []),
  ]

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
    <div className="config-page" data-theme="lcds">
      <h2>Configurações</h2>

      <div className="config-abas" style={{ display: 'flex', gap: '0.4rem', marginBottom: '1.25rem', borderBottom: '1px solid var(--ls-border)', paddingBottom: '0' }}>
        {abas.map((a) => (
          <button
            key={a.id}
            onClick={() => setAbaAtiva(a.id)}
            className={`ls-btn ${abaAtiva === a.id ? 'ls-btn-primary' : 'ls-btn-ghost'}`}
            style={{ borderRadius: '6px 6px 0 0' }}
          >
            {a.label}
          </button>
        ))}
      </div>

      {abaAtiva === 'corretores' && (
        <>
          <div className="ls-card config-card">
            <h4>
              Cadastrar Corretor
              <InfoTooltip
                titulo="Cadastrar Corretor"
                texto={
                  <>
                    <strong>Passo 1:</strong> crie o login da pessoa no painel do Supabase (Authentication → Users → Add User), com e-mail e senha provisória.
                    <br />
                    <strong>Passo 2:</strong> preencha abaixo com o mesmo e-mail para vincular o perfil.
                  </>
                }
              />
            </h4>

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
        </>
      )}

      {abaAtiva === 'transferir' && ehMaster && <TransferirCarteiraCard />}

      {abaAtiva === 'seguradoras' && ehMaster && <SeguradorasCard />}

      {abaAtiva === 'conexoes' && ehMaster && <ConexoesRedirectCard />}
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
      <h4>
        Corretores Cadastrados
        <InfoTooltip
          titulo="Corretores Cadastrados"
          texto="Editar aqui atualiza só os dados de exibição no sistema. Para trocar o e-mail de login de verdade, é preciso alterar também em Authentication → Users no Supabase."
        />
      </h4>

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
      <h4>
        Transferir Carteira
        <InfoTooltip
          titulo="Transferir Carteira"
          texto="Use quando um corretor sai da empresa: transfere de uma vez todos os clientes dele para outro corretor, preservando o histórico completo (contratos, cotações, demandas)."
        />
      </h4>

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


/**
 * CONNECT-004C — a gestão de Conexões saiu de Configurações e virou
 * área única do Connect Center. Esta tela não guarda mais o CRUD
 * (ConexoesOperadorasCard/NovaConexaoForm/LinhaConexao removidos) —
 * só redireciona. Nenhum dado foi apagado: as conexões continuam na
 * mesma tabela `conexoes_operadoras`, só a UI de gestão mudou de
 * endereço, conforme a diretriz do Chief (remover duplicidade
 * visual/funcional, sem recriar estrutura nova).
 */
function ConexoesRedirectCard() {
  return (
    <div className="ls-card" style={{ marginTop: '1.5rem' }}>
      <h3>
        🔌 Conexões com Operadoras/Provedores
        <InfoTooltip
          titulo="Conexões"
          texto="A gestão de conexões agora é feita no Connect Center — área única da plataforma pra qualquer integração externa, seja com seguradora ou canal de aquisição de leads."
        />
      </h3>
      <p className="config-instrucao" style={{ marginBottom: '1rem' }}>
        Essa gestão foi movida pro Connect Center, junto com o resto da infraestrutura de integrações
        da plataforma. Nenhuma conexão foi perdida — só a tela mudou de lugar.
      </p>
      <Link to="/connect?aba=conexoes" className="ls-btn ls-btn-primary">
        Abrir Conexões no Connect Center →
      </Link>
    </div>
  )
}
