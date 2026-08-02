import { useEffect, useState } from 'react'
import {
  listarSeguradoras,
  criarSeguradora,
  atualizarSeguradora,
  inativarSeguradora,
  reativarSeguradora,
  upsertGestorModulo,
  excluirGestorModulo,
} from '../../lib/crm/seguradorasService'
import { operacional } from '../../lib/supabaseSchemas'

const MODULOS_GESTOR = [
  { id: 'saude', label: 'Lifcare (Saúde)' },
  { id: 'auto', label: 'Lifleet (Auto)' },
  { id: 'lifsure', label: 'LifSure' },
  { id: 'lishield', label: 'LiShield' },
  { id: 'lifplan', label: 'LifPlan' },
]

export default function SeguradorasCard() {
  const [seguradoras, setSeguradoras] = useState([])
  const [carregando, setCarregando] = useState(true)
  const [mostrarForm, setMostrarForm] = useState(false)

  useEffect(() => {
    carregar()
  }, [])

  async function carregar() {
    setCarregando(true)
    const lista = await listarSeguradoras()
    setSeguradoras(lista)
    setCarregando(false)
  }

  return (
    <div className="ls-card" style={{ marginTop: '1.5rem' }}>
      <h3>🏢 Seguradoras</h3>
      <p className="config-instrucao">
        Cadastro central das seguradoras — dados gerais e o gestor de relacionamento
        responsável por cada módulo (a mesma seguradora pode ter um gestor diferente
        pra Auto e outro pra Saúde, por exemplo).
      </p>

      {!mostrarForm ? (
        <button className="ls-btn ls-btn-accent" onClick={() => setMostrarForm(true)}>
          + Nova Seguradora
        </button>
      ) : (
        <NovaSeguradoraForm
          onSalvo={() => {
            setMostrarForm(false)
            carregar()
          }}
          onCancelar={() => setMostrarForm(false)}
        />
      )}

      {carregando ? (
        <p className="cliente-carregando">Carregando...</p>
      ) : seguradoras.length === 0 ? (
        <p className="cliente-vazio" style={{ marginTop: '1rem' }}>Nenhuma seguradora cadastrada ainda.</p>
      ) : (
        <div style={{ marginTop: '1rem' }}>
          {seguradoras.map((s) => (
            <SeguradoraItem key={s.id} seguradora={s} onAtualizado={carregar} />
          ))}
        </div>
      )}
    </div>
  )
}

function NovaSeguradoraForm({ onSalvo, onCancelar }) {
  const [nomeFantasia, setNomeFantasia] = useState('')
  const [razaoSocial, setRazaoSocial] = useState('')
  const [cnpj, setCnpj] = useState('')
  const [site, setSite] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState(null)

  async function handleSalvar() {
    if (!nomeFantasia.trim()) {
      setErro('Informe o nome da seguradora.')
      return
    }
    setSalvando(true)
    setErro(null)
    try {
      const { data: org } = await operacional.from('organizacoes').select('id').limit(1).single()
      await criarSeguradora({
        organizacaoId: org.id,
        nomeFantasia,
        razaoSocial,
        cnpj,
        site,
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
      <label>Nome fantasia</label>
      <input value={nomeFantasia} onChange={(e) => setNomeFantasia(e.target.value)} placeholder="Ex: Bradesco Seguros" />

      <div className="cotacao-form-linha">
        <div>
          <label>Razão social</label>
          <input value={razaoSocial} onChange={(e) => setRazaoSocial(e.target.value)} />
        </div>
        <div>
          <label>CNPJ</label>
          <input value={cnpj} onChange={(e) => setCnpj(e.target.value)} placeholder="00.000.000/0000-00" />
        </div>
      </div>

      <label>Site</label>
      <input value={site} onChange={(e) => setSite(e.target.value)} placeholder="https://..." />

      {erro && <p className="ls-modal-erro">{erro}</p>}

      <div className="ls-modal-acoes">
        <button className="ls-btn ls-btn-ghost" onClick={onCancelar}>Cancelar</button>
        <button className="ls-btn ls-btn-primary" onClick={handleSalvar} disabled={salvando}>
          {salvando ? 'Salvando...' : 'Salvar Seguradora'}
        </button>
      </div>
    </div>
  )
}

function SeguradoraItem({ seguradora, onAtualizado }) {
  const [expandido, setExpandido] = useState(false)

  const gestoresPorModulo = new Map(
    (seguradora.seguradora_gestores || []).map((g) => [g.modulo, g])
  )

  async function handleInativar() {
    if (!window.confirm(`Inativar ${seguradora.nome_fantasia}? Ela deixa de aparecer como opção ativa, mas nada é excluído.`)) return
    await inativarSeguradora(seguradora.id)
    onAtualizado()
  }

  async function handleReativar() {
    await reativarSeguradora(seguradora.id)
    onAtualizado()
  }

  return (
    <div className="ls-card" style={{ marginTop: '0.75rem', padding: '0.85rem 1rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <strong>{seguradora.nome_fantasia}</strong>
          {seguradora.cnpj && (
            <span className="config-instrucao" style={{ marginLeft: '0.5rem', fontSize: '0.8rem' }}>
              CNPJ: {seguradora.cnpj}
            </span>
          )}
          {!seguradora.ativo && (
            <span className="ls-badge ls-badge-inativo" style={{ marginLeft: '0.5rem' }}>Inativa</span>
          )}
        </div>
        <div className="cliente-tabela-acoes">
          <button className="cliente-tabela-btn" onClick={() => setExpandido(!expandido)}>
            {expandido ? 'Fechar' : 'Ver gestores'}
          </button>
          {seguradora.ativo ? (
            <button className="cliente-tabela-btn cliente-tabela-btn-perigo" onClick={handleInativar}>Inativar</button>
          ) : (
            <button className="cliente-tabela-btn" onClick={handleReativar}>Reativar</button>
          )}
        </div>
      </div>

      {expandido && (
        <div style={{ marginTop: '0.75rem' }}>
          <table className="cliente-tabela">
            <thead>
              <tr><th>Módulo</th><th>Gestor</th><th>Contato</th><th>Ações</th></tr>
            </thead>
            <tbody>
              {MODULOS_GESTOR.map((m) => (
                <LinhaGestor
                  key={m.id}
                  modulo={m}
                  seguradoraId={seguradora.id}
                  gestor={gestoresPorModulo.get(m.id)}
                  onAtualizado={onAtualizado}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function LinhaGestor({ modulo, seguradoraId, gestor, onAtualizado }) {
  const [editando, setEditando] = useState(false)
  const [nome, setNome] = useState(gestor?.nome ?? '')
  const [telefone, setTelefone] = useState(gestor?.telefone ?? '')
  const [whatsapp, setWhatsapp] = useState(gestor?.whatsapp ?? '')
  const [email, setEmail] = useState(gestor?.email ?? '')
  const [salvando, setSalvando] = useState(false)

  async function handleSalvar() {
    setSalvando(true)
    try {
      await upsertGestorModulo({ seguradoraId, modulo: modulo.id, nome, telefone, whatsapp, email })
      setEditando(false)
      onAtualizado()
    } finally {
      setSalvando(false)
    }
  }

  async function handleRemover() {
    if (!gestor) return
    if (!window.confirm(`Remover o gestor de ${modulo.label}?`)) return
    await excluirGestorModulo(gestor.id)
    onAtualizado()
  }

  if (editando) {
    return (
      <tr>
        <td colSpan={4}>
          <div className="ls-card" style={{ padding: '0.75rem' }}>
            <strong>{modulo.label}</strong>
            <div className="cotacao-form-linha" style={{ marginTop: '0.5rem' }}>
              <div>
                <label>Nome</label>
                <input value={nome} onChange={(e) => setNome(e.target.value)} />
              </div>
              <div>
                <label>Telefone</label>
                <input value={telefone} onChange={(e) => setTelefone(e.target.value)} />
              </div>
            </div>
            <div className="cotacao-form-linha">
              <div>
                <label>WhatsApp</label>
                <input value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} />
              </div>
              <div>
                <label>E-mail</label>
                <input value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
            </div>
            <div className="ls-modal-acoes">
              <button className="cliente-tabela-btn" onClick={() => setEditando(false)}>Cancelar</button>
              <button className="cliente-tabela-btn" onClick={handleSalvar} disabled={salvando}>
                {salvando ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </div>
        </td>
      </tr>
    )
  }

  return (
    <tr>
      <td>{modulo.label}</td>
      <td>{gestor?.nome || '—'}</td>
      <td>
        {gestor?.telefone && <div>{gestor.telefone}</div>}
        {gestor?.email && <div>{gestor.email}</div>}
        {!gestor?.telefone && !gestor?.email && '—'}
      </td>
      <td className="cliente-tabela-acoes">
        <button className="cliente-tabela-btn" onClick={() => setEditando(true)}>
          {gestor ? 'Editar' : 'Definir gestor'}
        </button>
        {gestor && (
          <button className="cliente-tabela-btn cliente-tabela-btn-perigo" onClick={handleRemover}>Remover</button>
        )}
      </td>
    </tr>
  )
}