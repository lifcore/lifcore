import { useEffect, useState } from 'react'
import { useAuth } from '../auth/AuthContext'
import { listarTemplates, criarTemplate, atualizarTemplate, excluirTemplate } from '../../lib/crm/templatesService'
import { operacional } from '../../lib/supabaseSchemas'

const MODULOS = [
  { id: 'lifcare', label: 'Lifcare (Saúde/Odonto)' },
  { id: 'lifleet', label: 'Lifleet (Auto/Frota)' },
  { id: 'lifplan', label: 'Lifplan (Consórcio/Previdência)' },
  { id: 'lifsure', label: 'Lifsure (Seguros Gerais)' },
]

export default function MensagensPage() {
  const { perfil } = useAuth()
  const [moduloAtivo, setModuloAtivo] = useState('lifcare')
  const [templates, setTemplates] = useState([])
  const [editando, setEditando] = useState(null) // null = nenhum, {} = novo, {id,...} = editando
  const [titulo, setTitulo] = useState('')
  const [corpo, setCorpo] = useState('')
  const [salvando, setSalvando] = useState(false)

  useEffect(() => {
    carregar()
  }, [moduloAtivo])

  async function carregar() {
    const lista = await listarTemplates(moduloAtivo)
    setTemplates(lista)
  }

  function iniciarNovo() {
    setEditando({})
    setTitulo('')
    setCorpo('')
  }

  function iniciarEdicao(t) {
    setEditando(t)
    setTitulo(t.titulo)
    setCorpo(t.corpo)
  }

  async function handleSalvar() {
    if (!titulo.trim() || !corpo.trim()) return
    setSalvando(true)
    try {
      if (editando?.id) {
        await atualizarTemplate(editando.id, { titulo, corpo })
      } else {
        const { data: org } = await operacional.from('organizacoes').select('id').limit(1).single()
        await criarTemplate({ organizacaoId: org.id, modulo: moduloAtivo, titulo, corpo, usuarioId: perfil?.id })
      }
      setEditando(null)
      carregar()
    } finally {
      setSalvando(false)
    }
  }

  async function handleExcluir(id) {
    if (!window.confirm('Excluir esta mensagem padrão?')) return
    await excluirTemplate(id)
    carregar()
  }

  return (
    <div className="config-page" style={{ maxWidth: 720 }}>
      <h2>Mensagens Padrão</h2>
      <p className="pipeline-subtitulo">Cadastre mensagens prontas para enviar via WhatsApp direto do sistema.</p>
      <p className="config-instrucao">
        💡 Use <strong>{'{{nome}}'}</strong> no texto para puxar automaticamente o nome do contato
        (ex: "Olá {'{{nome}}'}, tudo bem?"), e <strong>{'{{empresa}}'}</strong> para o nome da empresa.
      </p>

      <div className="mensagens-modulos">
        {MODULOS.map((m) => (
          <button
            key={m.id}
            className={`cliente-aba ${moduloAtivo === m.id ? 'cliente-aba-ativa' : ''}`}
            onClick={() => setModuloAtivo(m.id)}
          >
            {m.label}
          </button>
        ))}
      </div>

      {!editando && (
        <button className="ls-btn ls-btn-accent" onClick={iniciarNovo} style={{ marginTop: '1rem' }}>
          + Nova Mensagem
        </button>
      )}

      {editando && (
        <div className="ls-card config-card" style={{ marginTop: '1rem' }}>
          <label>Título (só para identificação interna)</label>
          <input value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Ex: Aviso de Renovação Próxima" />

          <label>Texto da mensagem</label>
          <textarea
            value={corpo}
            onChange={(e) => setCorpo(e.target.value)}
            rows={5}
            style={{ width: '100%', padding: '0.5rem 0.65rem', border: '1px solid var(--ls-border)', borderRadius: 'var(--ls-radius-sm)', fontFamily: 'inherit' }}
          />

          <div className="ls-modal-acoes">
            <button className="ls-btn ls-btn-ghost" onClick={() => setEditando(null)}>Cancelar</button>
            <button className="ls-btn ls-btn-primary" onClick={handleSalvar} disabled={salvando}>
              {salvando ? 'Salvando...' : 'Salvar'}
            </button>
          </div>
        </div>
      )}

      <div className="cotacoes-historico" style={{ marginTop: '1rem' }}>
        {templates.map((t) => (
          <div key={t.id} className="ls-card cotacao-item">
            <strong>{t.titulo}</strong>
            <p style={{ fontSize: '0.85rem', color: 'var(--ls-text-muted)', marginTop: '0.3rem' }}>{t.corpo}</p>
            <div className="cliente-tabela-acoes" style={{ marginTop: '0.5rem' }}>
              <button className="cliente-tabela-btn" onClick={() => iniciarEdicao(t)}>Editar</button>
              <button className="cliente-tabela-btn cliente-tabela-btn-perigo" onClick={() => handleExcluir(t.id)}>Excluir</button>
            </div>
          </div>
        ))}
        {templates.length === 0 && <p className="cliente-vazio">Nenhuma mensagem cadastrada para este módulo ainda.</p>}
      </div>
    </div>
  )
}
