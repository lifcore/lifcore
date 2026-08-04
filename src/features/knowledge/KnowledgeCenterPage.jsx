import { useEffect, useState } from 'react'
import '../../styles/centers.css'
import '../../styles/lcds-tokens.css'
import {
  listarRegras, criarRegra, atualizarRegra, inativarRegra, reativarRegra, CATEGORIAS,
  buscarConhecimentoGlobal,
} from '../../lib/crm/knowledgeService'
import { listarTodosTemplates, atualizarTemplateComGovernanca, inativarTemplate, reativarTemplate } from '../../lib/crm/templatesService'
import { operacional } from '../../lib/supabaseSchemas'
import { useAuth } from '../auth/AuthContext'

const CENTERS = ['Master Center', 'Finance Center', 'Growth Center', 'Claims Center', 'Report Center', 'BI Center', 'SCI', 'Smart Quote Engine', 'Connect Center', 'Knowledge Center', 'Infrastructure']

export default function KnowledgeCenterPage() {
  const [abaAtiva, setAbaAtiva] = useState('regras')

  return (
    <div className="config-page" data-theme="lcds">
      <h2>Knowledge Center — Rule Registry & Template Governance</h2>
      <p className="config-instrucao">
        Catálogo corporativo de regras e templates. Nesta v1, apenas registro e consulta —
        nenhuma regra aqui cadastrada é executada automaticamente por nenhum outro Center.
      </p>

      <div className="cliente-abas" style={{ marginBottom: '1rem' }}>
        <button className={`cliente-aba ${abaAtiva === 'regras' ? 'cliente-aba-ativa' : ''}`} onClick={() => setAbaAtiva('regras')}>Regras</button>
        <button className={`cliente-aba ${abaAtiva === 'templates' ? 'cliente-aba-ativa' : ''}`} onClick={() => setAbaAtiva('templates')}>Templates</button>
        <button className={`cliente-aba ${abaAtiva === 'buscar' ? 'cliente-aba-ativa' : ''}`} onClick={() => setAbaAtiva('buscar')}>Buscar</button>
      </div>

      {abaAtiva === 'regras' && <RegrasTab />}
      {abaAtiva === 'templates' && <TemplatesTab />}
      {abaAtiva === 'buscar' && <BuscaGlobalTab />}
    </div>
  )
}

function RegrasTab() {
  const { perfil } = useAuth()
  const [regras, setRegras] = useState(null)
  const [filtroCategoria, setFiltroCategoria] = useState('')
  const [mostrarForm, setMostrarForm] = useState(false)
  const [carregando, setCarregando] = useState(true)

  useEffect(() => {
    carregar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtroCategoria])

  async function carregar() {
    setCarregando(true)
    const lista = await listarRegras({ categoria: filtroCategoria || undefined })
    setRegras(lista)
    setCarregando(false)
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginBottom: '1rem' }}>
        <select value={filtroCategoria} onChange={(e) => setFiltroCategoria(e.target.value)}>
          <option value="">Todas as categorias</option>
          {CATEGORIAS.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <button className="ls-btn ls-btn-accent" onClick={() => setMostrarForm(!mostrarForm)}>
          {mostrarForm ? 'Cancelar' : '+ Nova Regra'}
        </button>
      </div>

      {mostrarForm && (
        <FormNovaRegra
          perfil={perfil}
          onSalvo={() => { setMostrarForm(false); carregar() }}
          onCancelar={() => setMostrarForm(false)}
        />
      )}

      {carregando ? (
        <p className="cliente-carregando">Carregando regras...</p>
      ) : regras.length === 0 ? (
        <p className="cliente-vazio">Nenhuma regra cadastrada ainda.</p>
      ) : (
        <table className="cliente-tabela">
          <thead>
            <tr><th>Nome</th><th>Categoria</th><th>Center Responsável</th><th>Versão</th><th>Status</th><th>Consumidores</th><th>Ações</th></tr>
          </thead>
          <tbody>
            {regras.map((r) => <LinhaRegra key={r.id} regra={r} onAtualizado={carregar} />)}
          </tbody>
        </table>
      )}
    </div>
  )
}

function FormNovaRegra({ perfil, onSalvo, onCancelar }) {
  const [nome, setNome] = useState('')
  const [categoria, setCategoria] = useState(CATEGORIAS[0])
  const [centerResponsavel, setCenterResponsavel] = useState(CENTERS[0])
  const [workspaceRelacionado, setWorkspaceRelacionado] = useState('')
  const [descricao, setDescricao] = useState('')
  const [consumidoresTexto, setConsumidoresTexto] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState(null)

  async function handleSalvar() {
    if (!nome.trim()) { setErro('Informe o nome da regra.'); return }
    setSalvando(true)
    setErro(null)
    try {
      const { data: org } = await operacional.from('organizacoes').select('id').limit(1).single()
      await criarRegra({
        organizacaoId: org.id,
        nome,
        categoria,
        centerResponsavel,
        workspaceRelacionado,
        descricao,
        consumidores: consumidoresTexto.split(',').map((c) => c.trim()).filter(Boolean),
        usuarioId: perfil?.id,
      })
      onSalvo()
    } catch (err) {
      setErro(err.message)
    } finally {
      setSalvando(false)
    }
  }

  return (
    <div className="ls-card" style={{ marginBottom: '1rem' }}>
      <label>Nome da regra</label>
      <input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex: Governança Master - Exclusão Crítica" />

      <div className="cotacao-form-linha">
        <div>
          <label>Categoria</label>
          <select value={categoria} onChange={(e) => setCategoria(e.target.value)}>
            {CATEGORIAS.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div>
          <label>Center responsável</label>
          <select value={centerResponsavel} onChange={(e) => setCenterResponsavel(e.target.value)}>
            {CENTERS.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
      </div>

      <label>Workspace relacionado (opcional)</label>
      <input value={workspaceRelacionado} onChange={(e) => setWorkspaceRelacionado(e.target.value)} placeholder="Ex: auto, saude..." />

      <label>Descrição funcional</label>
      <textarea value={descricao} onChange={(e) => setDescricao(e.target.value)} rows={3} />

      <label>Consumidores (separados por vírgula)</label>
      <input value={consumidoresTexto} onChange={(e) => setConsumidoresTexto(e.target.value)} placeholder="Ex: Finance, Growth, Claims" />

      {erro && <p className="ls-modal-erro">{erro}</p>}

      <div className="ls-modal-acoes">
        <button className="ls-btn ls-btn-ghost" onClick={onCancelar}>Cancelar</button>
        <button className="ls-btn ls-btn-primary" onClick={handleSalvar} disabled={salvando}>
          {salvando ? 'Salvando...' : 'Salvar Regra'}
        </button>
      </div>
    </div>
  )
}

function LinhaRegra({ regra, onAtualizado }) {
  async function handleToggleStatus() {
    if (regra.status === 'ativo') await inativarRegra(regra.id)
    else await reativarRegra(regra.id)
    onAtualizado()
  }

  return (
    <tr>
      <td>{regra.nome}</td>
      <td>{regra.categoria}</td>
      <td>{regra.center_responsavel}</td>
      <td>v{regra.versao}</td>
      <td><span className="ls-badge">{regra.status}</span></td>
      <td>{regra.consumidores?.join(', ') || '—'}</td>
      <td className="cliente-tabela-acoes">
        <button className="cliente-tabela-btn" onClick={handleToggleStatus}>
          {regra.status === 'ativo' ? 'Inativar' : 'Reativar'}
        </button>
      </td>
    </tr>
  )
}

function TemplatesTab() {
  const [templates, setTemplates] = useState(null)
  const [filtroModulo, setFiltroModulo] = useState('')
  const [carregando, setCarregando] = useState(true)

  useEffect(() => {
    carregar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtroModulo])

  async function carregar() {
    setCarregando(true)
    const lista = await listarTodosTemplates({ modulo: filtroModulo || undefined })
    setTemplates(lista)
    setCarregando(false)
  }

  return (
    <div>
      <p className="config-instrucao">
        Visão de governança dos templates já usados no WhatsApp de cada módulo — mesma tabela,
        agora com categoria/versão/status. Edição de conteúdo continua no fluxo original (Mensagens Padrão).
      </p>
      {carregando ? (
        <p className="cliente-carregando">Carregando templates...</p>
      ) : templates.length === 0 ? (
        <p className="cliente-vazio">Nenhum template cadastrado ainda.</p>
      ) : (
        <table className="cliente-tabela">
          <thead>
            <tr><th>Título</th><th>Módulo</th><th>Categoria</th><th>Versão</th><th>Status</th><th>Ações</th></tr>
          </thead>
          <tbody>
            {templates.map((t) => <LinhaTemplate key={t.id} template={t} onAtualizado={carregar} />)}
          </tbody>
        </table>
      )}
    </div>
  )
}

function LinhaTemplate({ template, onAtualizado }) {
  const [editandoCategoria, setEditandoCategoria] = useState(false)
  const [categoria, setCategoria] = useState(template.categoria ?? '')

  async function handleSalvarCategoria() {
    await atualizarTemplateComGovernanca(template.id, { categoria })
    setEditandoCategoria(false)
    onAtualizado()
  }

  async function handleToggleStatus() {
    if (template.status === 'ativo') await inativarTemplate(template.id)
    else await reativarTemplate(template.id)
    onAtualizado()
  }

  return (
    <tr>
      <td>{template.titulo}</td>
      <td>{template.modulo}</td>
      <td>
        {editandoCategoria ? (
          <input value={categoria} onChange={(e) => setCategoria(e.target.value)} style={{ width: '120px' }} />
        ) : (
          template.categoria || '—'
        )}
      </td>
      <td>v{template.versao}</td>
      <td><span className="ls-badge">{template.status}</span></td>
      <td className="cliente-tabela-acoes">
        {editandoCategoria ? (
          <button className="cliente-tabela-btn" onClick={handleSalvarCategoria}>Salvar</button>
        ) : (
          <button className="cliente-tabela-btn" onClick={() => setEditandoCategoria(true)}>Categorizar</button>
        )}
        <button className="cliente-tabela-btn" onClick={handleToggleStatus}>
          {template.status === 'ativo' ? 'Inativar' : 'Reativar'}
        </button>
      </td>
    </tr>
  )
}

function BuscaGlobalTab() {
  const [termo, setTermo] = useState('')
  const [resultados, setResultados] = useState(null)
  const [buscando, setBuscando] = useState(false)

  async function handleBuscar() {
    setBuscando(true)
    try {
      const r = await buscarConhecimentoGlobal(termo)
      setResultados(r)
    } finally {
      setBuscando(false)
    }
  }

  return (
    <div>
      <p className="config-instrucao">Pesquisa simples por nome/título/palavra-chave — sem IA, sem embeddings.</p>
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
        <input value={termo} onChange={(e) => setTermo(e.target.value)} placeholder="Buscar regra ou template..." style={{ flex: 1 }} />
        <button className="ls-btn ls-btn-primary" onClick={handleBuscar} disabled={buscando}>
          {buscando ? 'Buscando...' : 'Buscar'}
        </button>
      </div>

      {resultados && (
        resultados.length === 0 ? (
          <p className="cliente-vazio">Nenhum resultado.</p>
        ) : (
          <table className="cliente-tabela">
            <thead><tr><th>Tipo</th><th>Título</th><th>Categoria</th><th>Versão</th><th>Status</th></tr></thead>
            <tbody>
              {resultados.map((r) => (
                <tr key={`${r.tipo}-${r.id}`}>
                  <td><span className="ls-badge">{r.tipo}</span></td>
                  <td>{r.titulo}</td>
                  <td>{r.categoria}</td>
                  <td>v{r.versao}</td>
                  <td>{r.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )
      )}
    </div>
  )
}