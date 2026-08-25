import { useEffect, useState, Fragment } from 'react'
import '../../styles/lcds-tokens.css'
import InfoTooltip from '../../components/InfoTooltip'
import { cadastrarCorretor } from '../../lib/crm/clientesService'
import { listarPerfis, atualizarPerfil, desativarPerfil, reativarPerfil, transferirCarteira } from '../../lib/crm/perfisService'
import {
  listarPercentuaisPadraoCorretor,
  salvarPercentualPadraoCorretor,
  excluirPercentualPadraoCorretor,
  MODULOS_PERCENTUAL_PADRAO,
} from '../../lib/crm/apolicesService'
import { operacional } from '../../lib/supabaseSchemas'
import { useAuth } from '../auth/AuthContext'
import RegrasComissaoCard from './RegrasComissaoCard'

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
    ...(ehMaster ? [{ id: 'regras-comissao', label: 'Regras de Comissão' }] : []),
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

      {abaAtiva === 'regras-comissao' && ehMaster && <RegrasComissaoCard />}
    </div>
  )
}

function ListaCorretores() {
  const { perfil } = useAuth()
  const [perfis, setPerfis] = useState([])
  const [carregando, setCarregando] = useState(true)
  const [editandoId, setEditandoId] = useState(null)
  const [rascunho, setRascunho] = useState({})
  const [expandidoPercentuaisId, setExpandidoPercentuaisId] = useState(null)

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
              <tr><th>Nome</th><th>E-mail</th><th>Papel</th><th>Status</th><th>Comissão</th><th>Ações</th></tr>
            </thead>
            <tbody>
              {perfis.map((p) => (
                <Fragment key={p.id}>
                <tr>
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
                      <td>—</td>
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
                      <td>
                        <button
                          className="ls-btn ls-btn-ghost"
                          style={{ fontSize: '0.8rem' }}
                          onClick={() => setExpandidoPercentuaisId(expandidoPercentuaisId === p.id ? null : p.id)}
                        >
                          % por módulo
                        </button>
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
                {expandidoPercentuaisId === p.id && (
                  <tr>
                    <td colSpan={6}>
                      <PainelPercentuaisCorretor corretorId={p.id} usuarioId={perfil?.id} />
                    </td>
                  </tr>
                )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

const ROTULOS_MODULO = {
  saude: 'Lifcare (Saúde)',
  auto: 'Lifleet (Auto)',
  lifsure: 'Lifsure',
  lishield: 'Lishield',
  lifplan: 'Lifplan',
}

/**
 * % padrão por módulo (Etapa 4, Peça 6). Quando cadastrado, o
 * vendasService usa isso pra montar sozinho a composição da venda
 * (Corretor X% / LifitSeg 100−X%) — sem precisar de nenhuma ação
 * manual em cada venda. Sem cadastro aqui, a venda fica sem composição
 * automática, e o Gestor define manualmente em Financeiro → Repasses
 * ("Incluir Participante").
 */
function PainelPercentuaisCorretor({ corretorId, usuarioId }) {
  const [percentuais, setPercentuais] = useState({})
  const [carregando, setCarregando] = useState(true)
  const [salvandoModulo, setSalvandoModulo] = useState(null)
  const [erro, setErro] = useState('')

  useEffect(() => {
    carregar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [corretorId])

  async function carregar() {
    setCarregando(true)
    try {
      const lista = await listarPercentuaisPadraoCorretor(corretorId)
      const mapa = {}
      for (const l of lista) mapa[l.modulo] = { id: l.id, percentual: String(l.percentual) }
      setPercentuais(mapa)
    } catch (e) {
      setErro(e.message)
    }
    setCarregando(false)
  }

  function atualizarValor(modulo, valor) {
    setPercentuais((atual) => ({ ...atual, [modulo]: { ...atual[modulo], percentual: valor } }))
  }

  async function handleSalvar(modulo) {
    const valor = percentuais[modulo]?.percentual
    if (valor === undefined || valor === '') return
    setSalvandoModulo(modulo)
    setErro('')
    try {
      await salvarPercentualPadraoCorretor({ corretorId, modulo, percentual: Number(valor), usuarioId })
      carregar()
    } catch (e) {
      setErro(e.message)
    }
    setSalvandoModulo(null)
  }

  async function handleExcluir(modulo) {
    const id = percentuais[modulo]?.id
    if (!id) return
    setSalvandoModulo(modulo)
    setErro('')
    try {
      await excluirPercentualPadraoCorretor(id)
      carregar()
    } catch (e) {
      setErro(e.message)
    }
    setSalvandoModulo(null)
  }

  if (carregando) return <p style={{ fontSize: '0.8rem' }}>Carregando...</p>

  return (
    <div className="ls-card" style={{ padding: '0.75rem' }}>
      <p className="config-instrucao" style={{ marginTop: 0 }}>
        % padrão que este corretor recebe da comissão em cada módulo (o restante fica com a LifitSeg). Deixe em branco os módulos onde ele não atua.
      </p>
      {erro && <p className="ls-modal-erro">{erro}</p>}
      <div className="config-form-grid">
        {MODULOS_PERCENTUAL_PADRAO.map((modulo) => (
          <div key={modulo}>
            <label>{ROTULOS_MODULO[modulo]}</label>
            <div style={{ display: 'flex', gap: '0.3rem' }}>
              <input
                type="number"
                step="0.01"
                min="0"
                max="100"
                value={percentuais[modulo]?.percentual ?? ''}
                onChange={(e) => atualizarValor(modulo, e.target.value)}
                placeholder="Ex: 70"
                style={{ width: '80px' }}
              />
              <button
                className="cliente-tabela-btn"
                onClick={() => handleSalvar(modulo)}
                disabled={salvandoModulo === modulo || !percentuais[modulo]?.percentual}
              >
                Salvar
              </button>
              {percentuais[modulo]?.id && (
                <button className="ls-btn ls-btn-ghost" onClick={() => handleExcluir(modulo)} disabled={salvandoModulo === modulo}>
                  Remover
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
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
