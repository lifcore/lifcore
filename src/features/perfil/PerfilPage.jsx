import { useEffect, useState } from 'react'
import { useAuth } from '../auth/AuthContext'
import { supabase } from '../../lib/supabaseClient'
import { operacional } from '../../lib/supabaseSchemas'

export default function PerfilPage() {
  const { perfil } = useAuth()
  const [nome, setNome] = useState(perfil?.nome_completo ?? '')
  const [telefone, setTelefone] = useState(perfil?.telefone ?? '')
  const [salvandoPerfil, setSalvandoPerfil] = useState(false)
  const [sucessoPerfil, setSucessoPerfil] = useState(null)

  const [corretora, setCorretora] = useState({ razao_social: '', cnpj: '', susep: '', telefone: '', endereco: '' })
  const [salvandoCorretora, setSalvandoCorretora] = useState(false)
  const [sucessoCorretora, setSucessoCorretora] = useState(null)
  const podeEditarCorretora = perfil?.papel === 'master' || perfil?.papel === 'administrador'

  useEffect(() => {
    operacional
      .from('organizacoes')
      .select('*')
      .limit(1)
      .single()
      .then(({ data }) => {
        if (data) setCorretora(data)
      })
  }, [])

  async function handleSalvarPerfil() {
    setSalvandoPerfil(true)
    setSucessoPerfil(null)
    const { error } = await supabase
      .from('perfis')
      .update({ nome_completo: nome, telefone })
      .eq('id', perfil.id)
    setSalvandoPerfil(false)
    if (!error) setSucessoPerfil('Perfil atualizado com sucesso.')
  }

  async function handleSalvarCorretora() {
    setSalvandoCorretora(true)
    setSucessoCorretora(null)
    const { error } = await operacional
      .from('organizacoes')
      .update({
        cnpj: corretora.cnpj,
        susep: corretora.susep,
        telefone: corretora.telefone,
        endereco: corretora.endereco,
      })
      .eq('id', corretora.id)
    setSalvandoCorretora(false)
    if (!error) setSucessoCorretora('Dados da corretora atualizados.')
  }

  return (
    <div className="config-page">
      <h2>Meu Perfil</h2>
      <div className="ls-card config-card">
        <label>Nome completo</label>
        <input value={nome} onChange={(e) => setNome(e.target.value)} />

        <label>E-mail (login)</label>
        <input value={perfil?.email ?? ''} disabled />

        <label>Telefone</label>
        <input value={telefone ?? ''} onChange={(e) => setTelefone(e.target.value)} placeholder="(11) 91234-5678" />

        <label>Papel</label>
        <input value={perfil?.papel ?? ''} disabled />

        {sucessoPerfil && <p className="config-sucesso">{sucessoPerfil}</p>}

        <button className="ls-btn ls-btn-primary" onClick={handleSalvarPerfil} disabled={salvandoPerfil}>
          {salvandoPerfil ? 'Salvando...' : 'Salvar perfil'}
        </button>
      </div>

      <div className="ls-card config-card" style={{ marginTop: '1.25rem' }}>
        <h4 style={{ marginTop: 0 }}>Dados da Corretora</h4>
        <p className="config-instrucao">
          Não aparecem nas mensagens automáticas — ficam aqui só para consulta rápida,
          caso um cliente peça CNPJ/SUSEP da LifitSeg.
        </p>

        <label>Razão Social</label>
        <input value={corretora.razao_social ?? ''} disabled />

        <label>CNPJ</label>
        <input
          value={corretora.cnpj ?? ''}
          onChange={(e) => setCorretora({ ...corretora, cnpj: e.target.value })}
          disabled={!podeEditarCorretora}
        />

        <label>Registro SUSEP</label>
        <input
          value={corretora.susep ?? ''}
          onChange={(e) => setCorretora({ ...corretora, susep: e.target.value })}
          disabled={!podeEditarCorretora}
        />

        <label>Telefone</label>
        <input
          value={corretora.telefone ?? ''}
          onChange={(e) => setCorretora({ ...corretora, telefone: e.target.value })}
          disabled={!podeEditarCorretora}
        />

        <label>Endereço</label>
        <input
          value={corretora.endereco ?? ''}
          onChange={(e) => setCorretora({ ...corretora, endereco: e.target.value })}
          disabled={!podeEditarCorretora}
        />

        {sucessoCorretora && <p className="config-sucesso">{sucessoCorretora}</p>}

        {podeEditarCorretora ? (
          <button className="ls-btn ls-btn-primary" onClick={handleSalvarCorretora} disabled={salvandoCorretora}>
            {salvandoCorretora ? 'Salvando...' : 'Salvar dados da corretora'}
          </button>
        ) : (
          <p className="config-instrucao">Somente master/administrador podem editar estes dados.</p>
        )}
      </div>
    </div>
  )
}
