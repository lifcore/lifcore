import { useState } from 'react'
import { criarClienteProspect } from '../../lib/crm/clientesService'
import { operacional } from '../../lib/supabaseSchemas'
import { useAuth } from '../auth/AuthContext'

export default function NovoClienteLifleetModal({ onFechar, onCriado, corretorAlvoId }) {
  const [tipoPessoa, setTipoPessoa] = useState(null)

  return (
    <div className="ls-modal-overlay" onClick={onFechar}>
      <div className="ls-modal" onClick={(e) => e.stopPropagation()}>
        {tipoPessoa === null && (
          <EscolhaTipoPessoa onEscolher={setTipoPessoa} onFechar={onFechar} />
        )}
        {tipoPessoa && (
          <Formulario tipoPessoa={tipoPessoa} onFechar={onFechar} onCriado={onCriado} onVoltar={() => setTipoPessoa(null)} corretorAlvoId={corretorAlvoId} />
        )}
      </div>
    </div>
  )
}

function EscolhaTipoPessoa({ onEscolher, onFechar }) {
  return (
    <>
      <h3>Novo Prospect — Lifleet</h3>
      <p className="config-instrucao" style={{ marginBottom: '1rem' }}>
        Este cliente é uma empresa (CNPJ) ou uma pessoa física (CPF)?
      </p>
      <div className="ls-modal-acoes" style={{ justifyContent: 'center', gap: '1rem' }}>
        <button className="ls-btn ls-btn-primary" onClick={() => onEscolher('juridica')}>
          🏢 Empresarial (CNPJ)
        </button>
        <button className="ls-btn ls-btn-primary" onClick={() => onEscolher('fisica')}>
          🧑 Pessoa Física (CPF)
        </button>
      </div>
      <div className="ls-modal-acoes" style={{ marginTop: '1rem' }}>
        <button className="ls-btn ls-btn-ghost" onClick={onFechar}>Cancelar</button>
      </div>
    </>
  )
}

/** Formulário enxuto — comum aos dois tipos, só troca o rótulo/campo de identificação */
function Formulario({ tipoPessoa, onFechar, onCriado, onVoltar, corretorAlvoId }) {
  const { perfil } = useAuth()
  const ehPessoaFisica = tipoPessoa === 'fisica'
  const [form, setForm] = useState({
    razao_social: '',
    documento: '', // CNPJ ou CPF, conforme o tipo
    data_vigencia: '',
    origem: '',
  })
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState(null)

  function atualizar(campo, valor) {
    setForm((f) => ({ ...f, [campo]: valor }))
  }

  async function handleSalvar() {
    if (!form.razao_social.trim()) {
      setErro(ehPessoaFisica ? 'Informe o nome completo do cliente.' : 'Informe ao menos o nome da empresa.')
      return
    }
    setSalvando(true)
    setErro(null)
    try {
      const { data: org } = await operacional.from('organizacoes').select('id').limit(1).single()

      await criarClienteProspect({
        organizacao_id: org.id,
        corretor_id: corretorAlvoId ?? perfil.id,
        modulo: 'auto',
        tipo_pessoa: tipoPessoa,
        razao_social: form.razao_social,
        cnpj: ehPessoaFisica ? null : form.documento || null,
        cpf: ehPessoaFisica ? form.documento || null : null,
        data_vigencia: form.data_vigencia || null,
        origem: form.origem || null,
        status: 'prospect',
      })
      onCriado()
    } catch (err) {
      setErro(err.message)
    } finally {
      setSalvando(false)
    }
  }

  return (
    <>
      <h3>Novo Prospect — {ehPessoaFisica ? 'Pessoa Física' : 'Empresarial'}</h3>

      <label>{ehPessoaFisica ? 'Nome completo *' : 'Nome da empresa *'}</label>
      <input value={form.razao_social} onChange={(e) => atualizar('razao_social', e.target.value)} />

      <label>{ehPessoaFisica ? 'CPF' : 'CNPJ'}</label>
      <input
        value={form.documento}
        onChange={(e) => atualizar('documento', e.target.value)}
        placeholder={ehPessoaFisica ? '000.000.000-00' : '00.000.000/0001-00'}
      />

      <label>Data de vigência/renovação (se já tiver um plano)</label>
      <input type="date" value={form.data_vigencia} onChange={(e) => atualizar('data_vigencia', e.target.value)} />

      <label>Origem</label>
      <input value={form.origem} onChange={(e) => atualizar('origem', e.target.value)} placeholder="Indicação, prospecção ativa..." />

      {erro && <p className="ls-modal-erro">{erro}</p>}

      <div className="ls-modal-acoes">
        <button className="ls-btn ls-btn-ghost" onClick={onVoltar}>← Voltar</button>
        <button className="ls-btn ls-btn-ghost" onClick={onFechar}>Cancelar</button>
        <button className="ls-btn ls-btn-primary" onClick={handleSalvar} disabled={salvando}>
          {salvando ? 'Salvando...' : 'Criar Prospect'}
        </button>
      </div>
    </>
  )
}
