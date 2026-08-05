import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../features/auth/AuthContext'

/**
 * Sprint Visual — Fase 2 (OA-001 REV B). TopNav OS: 48px, Logo +
 * Workspace Selector + Perfil. Os 5 links soltos viraram um único
 * seletor (mesmo padrão visual de dropdown já usado no
 * SeletorCarteira/Growth) — "os Workspaces continuam no topo, mas
 * reorganizados dentro da nova TopNav", como definido pelo Chief.
 *
 * Busca global: NÃO incluída nesta entrega — essa funcionalidade não
 * existe no sistema hoje (nenhuma busca cross-módulo foi construída).
 * Fica registrada como decisão pendente, não como campo decorativo
 * que não faz nada.
 */

const MODULOS = [
  { id: 'lifcare', label: 'Lifcare', path: '/' },
  { id: 'lifleet', label: 'Lifleet', path: '/lifleet' },
  { id: 'lifsure', label: 'Lifsure', path: '/lifsure' },
  { id: 'lishield', label: 'LiShield', path: '/lishield' },
  { id: 'lifplan', label: 'Lifplan', path: '/lifplan' },
]

function moduloAtivo(pathname) {
  if (pathname === '/' || pathname.startsWith('/clientes/')) return 'lifcare'
  if (pathname.startsWith('/lifleet')) return 'lifleet'
  if (pathname.startsWith('/lifsure')) return 'lifsure'
  if (pathname.startsWith('/lishield')) return 'lishield'
  if (pathname.startsWith('/lifplan')) return 'lifplan'
  return null
}

function WorkspaceSelector() {
  const location = useLocation()
  const navigate = useNavigate()
  const [aberto, setAberto] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    function aoClicarFora(e) {
      if (ref.current && !ref.current.contains(e.target)) setAberto(false)
    }
    function aoPressionarTecla(e) {
      if (e.key === 'Escape') setAberto(false)
    }
    document.addEventListener('mousedown', aoClicarFora)
    document.addEventListener('keydown', aoPressionarTecla)
    return () => {
      document.removeEventListener('mousedown', aoClicarFora)
      document.removeEventListener('keydown', aoPressionarTecla)
    }
  }, [])

  const idAtivo = moduloAtivo(location.pathname)
  const atual = MODULOS.find((m) => m.id === idAtivo) ?? null

  return (
    <div className="ls-dropdown topnav-workspace" ref={ref}>
      <button
        type="button"
        className={`ls-dropdown-gatilho ${aberto ? 'ls-dropdown-aberto' : ''}`}
        onClick={() => setAberto((v) => !v)}
      >
        <span>{atual ? atual.label : 'Workspaces'}</span>
        <span className="ls-dropdown-seta">▼</span>
      </button>

      {aberto && (
        <div className="ls-dropdown-painel">
          {MODULOS.map((m) => (
            <button
              key={m.id}
              type="button"
              className={`ls-dropdown-item ${m.id === idAtivo ? 'ls-dropdown-item-ativo' : ''}`}
              onClick={() => {
                navigate(m.path)
                setAberto(false)
              }}
            >
              <span className="ls-dropdown-item-check">{m.id === idAtivo ? '✓' : ''}</span>
              <span>{m.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export default function TopNav() {
  const { perfil, logout } = useAuth()

  return (
    <header className="topnav">
      <Link to="/" className="topnav-brand">
        <span className="topnav-logo">Lifcore</span>
        <span className="topnav-tagline">by LifitSeg</span>
      </Link>

      <WorkspaceSelector />

      <div className="topnav-usuario">
        <span className="topnav-usuario-nome">{perfil?.nome_completo}</span>
        <span className="ls-badge topnav-usuario-papel">{perfil?.papel}</span>
        <button className="ls-btn ls-btn-ghost" onClick={logout}>
          Sair
        </button>
      </div>
    </header>
  )
}