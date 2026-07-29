import { useState } from 'react'
import { cadastrarCorretor } from '../../lib/crm/clientesService'

export default function ConfiguracoesPage() {
  const [email, setEmail] = useState('')
  const [nome, setNome] = useState('')
  const [papel, setPapel] = useState('corretor')
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState(null)
  const [sucesso, setSucesso] = useState(null)

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

        <label>E-mail (o mesmo usado no Supabase Auth)</label>
        <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="nome@lifitseg.com.br" />

        <label>Nome completo</label>
        <input value={nome} onChange={(e) => setNome(e.target.value)} />

        <label>Papel</label>
        <select value={papel} onChange={(e) => setPapel(e.target.value)}>
          <option value="corretor">Corretor</option>
          <option value="assistente">Assistente</option>
          <option value="administrador">Administrador</option>
          <option value="master">Master</option>
        </select>

        {erro && <p className="ls-modal-erro">{erro}</p>}
        {sucesso && <p className="config-sucesso">{sucesso}</p>}

        <button className="ls-btn ls-btn-primary" onClick={handleCadastrar} disabled={salvando}>
          {salvando ? 'Cadastrando...' : 'Cadastrar Corretor'}
        </button>
      </div>
    </div>
  )
}
