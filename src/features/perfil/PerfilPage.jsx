import { useEffect, useState } from 'react'
import '../../styles/lcds-tokens.css'
import { useAuth } from '../auth/AuthContext'
import { supabase } from '../../lib/supabaseClient'
import { operacional } from '../../lib/supabaseSchemas'

export default function PerfilPage() {
  const { perfil } = useAuth()
  const [nome, setNome] = useState(perfil?.nome_completo ?? '')
  const [telefone, setTelefone] = useState(perfil?.telefone ?? '')
  const [cpf, setCpf] = useState(perfil?.cpf ?? '')
  const [endereco, setEndereco] = useState(perfil?.endereco ?? '')
  const [banco, setBanco] = useState(perfil?.banco ?? '')
  const [agencia, setAgencia] = useState(perfil?.agencia ?? '')
  const [conta, setConta] = useState(perfil?.conta ?? '')
  const [tipoConta, setTipoConta] = useState(perfil?.tipo_conta ?? 'corrente')
  const [chavePix, setChavePix] = useState(perfil?.chave_pix ?? '')
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
      .update({
        nome_completo: nome,
        telefone,
        cpf,
        endereco,
        banco,
        agencia,
        conta,
        tipo_conta: tipoConta,
        chave_pix: chavePix,
      })
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
    <div className="config-page" data-theme="lcds">
      <h2>Meu Perfil</h2>
      <div className="ls-card config-card">
        <div className="config-form-grid">
          <div>
            <label>Nome completo</label>
            <input value={nome} onChange={(e) => setNome(e.target.value)} />
          </div>
          <div>
            <label>E-mail (login)</label>
            <input value={perfil?.email ?? ''} disabled />
          </div>

          <div>
            <label>Telefone / Celular</label>
            <input value={telefone ?? ''} onChange={(e) => setTelefone(e.target.value)} placeholder="(11) 91234-5678" />
          </div>
          <div>
            <label>CPF</label>
            <input value={cpf ?? ''} onChange={(e) => setCpf(e.target.value)} placeholder="000.000.000-00" />
          </div>

          <div>
            <label>Papel</label>
            <input value={perfil?.papel ?? ''} disabled />
          </div>
          <div>
            <label>Endereço (opcional)</label>
            <input value={endereco ?? ''} onChange={(e) => setEndereco(e.target.value)} placeholder="Rua, número, cidade..." />
          </div>
        </div>

        <h4 style={{ marginTop: '1.5rem' }}>Dados Bancários</h4>
        <p className="config-instrucao">Usados para pagamento de comissão.</p>

        <div className="config-form-grid">
          <div>
            <label>Banco</label>
            <input value={banco ?? ''} onChange={(e) => setBanco(e.target.value)} placeholder="Ex: Itaú, Nubank..." />
          </div>
          <div>
            <label>Agência</label>
            <input value={agencia ?? ''} onChange={(e) => setAgencia(e.target.value)} />
          </div>

          <div>
            <label>Conta</label>
            <input value={conta ?? ''} onChange={(e) => setConta(e.target.value)} />
          </div>
          <div>
            <label>Tipo de Conta</label>
            <select value={tipoConta} onChange={(e) => setTipoConta(e.target.value)}>
              <option value="corrente">Corrente</option>
              <option value="poupanca">Poupança</option>
            </select>
          </div>

          <div className="config-campo-largo">
            <label>Chave PIX (opcional)</label>
            <input value={chavePix ?? ''} onChange={(e) => setChavePix(e.target.value)} placeholder="CPF, e-mail, telefone ou chave aleatória" />
          </div>
        </div>

        {sucessoPerfil && <p className="config-sucesso">{sucessoPerfil}</p>}

        <button className="ls-btn ls-btn-primary" onClick={handleSalvarPerfil} disabled={salvandoPerfil} style={{ marginTop: '1rem' }}>
          {salvandoPerfil ? 'Salvando...' : 'Salvar perfil'}
        </button>
      </div>

      <div className="ls-card config-card" style={{ marginTop: '1.25rem' }}>
        <h4 style={{ marginTop: 0 }}>Dados da Corretora</h4>
        <p className="config-instrucao">
          Não aparecem nas mensagens automáticas — ficam aqui só para consulta rápida,
          caso um cliente peça CNPJ/SUSEP da LifitSeg.
        </p>

        <div className="config-form-grid">
          <div className="config-campo-largo">
            <label>Razão Social</label>
            <input value={corretora.razao_social ?? ''} disabled />
          </div>

          <div>
            <label>CNPJ</label>
            <input
              value={corretora.cnpj ?? ''}
              onChange={(e) => setCorretora({ ...corretora, cnpj: e.target.value })}
              disabled={!podeEditarCorretora}
            />
          </div>

          <div>
            <label>Registro SUSEP</label>
            <input
              value={corretora.susep ?? ''}
              onChange={(e) => setCorretora({ ...corretora, susep: e.target.value })}
              disabled={!podeEditarCorretora}
            />
          </div>

          <div>
            <label>Telefone</label>
            <input
              value={corretora.telefone ?? ''}
              onChange={(e) => setCorretora({ ...corretora, telefone: e.target.value })}
              disabled={!podeEditarCorretora}
            />
          </div>

          <div>
            <label>Endereço</label>
            <input
              value={corretora.endereco ?? ''}
              onChange={(e) => setCorretora({ ...corretora, endereco: e.target.value })}
              disabled={!podeEditarCorretora}
            />
          </div>
        </div>

        {sucessoCorretora && <p className="config-sucesso">{sucessoCorretora}</p>}

        {podeEditarCorretora ? (
          <button className="ls-btn ls-btn-primary" onClick={handleSalvarCorretora} disabled={salvandoCorretora} style={{ marginTop: '1rem' }}>
            {salvandoCorretora ? 'Salvando...' : 'Salvar dados da corretora'}
          </button>
        ) : (
          <p className="config-instrucao">Somente master/administrador podem editar estes dados.</p>
        )}
      </div>
    </div>
  )
}