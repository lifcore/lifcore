import { Link, NavLink } from 'react-router-dom'
import { useAuth } from '../features/auth/AuthContext'

/**
 * Sprint Visual — ajuste pós-homologação (feedback do Gemini +
 * Raphael): o Workspace Selector em dropdown adicionava um clique a
 * mais na navegação do dia a dia. Voltou pros 5 links lado a lado,
 * mantendo a altura de 48px do TopNav OS.
 */

const MODULOS = [
  { id: 'lifcare', label: 'Lifcare', path: '/', ativo: true },
  { id: 'lifleet', label: 'Lifleet', path: '/lifleet', ativo: true },
  { id: 'lifsure', label: 'Lifsure', path: '/lifsure', ativo: true },
  { id: 'lishield', label: 'LiShield', path: '/lishield', ativo: true },
  { id: 'lifplan', label: 'Lifplan', path: '/lifplan', ativo: true },
]

export default function TopNav({ onSlotRef }) {
  const { perfil, logout } = useAuth()

  return (
    <header className="topnav">
      <Link to="/" className="topnav-brand">
        <span className="topnav-logo">Lifcore</span>
        <span className="topnav-tagline">by LifitSeg</span>
      </Link>

      <nav className="topnav-modulos">
        {MODULOS.map((m) => (
          <NavLink
            key={m.id}
            to={m.path}
            end
            className={({ isActive }) => `topnav-modulo ${isActive ? 'topnav-modulo-ativo' : ''}`}
          >
            {m.label}
          </NavLink>
        ))}
      </nav>

      <div className="topnav-acoes-slot" ref={onSlotRef} />

      <div className="topnav-usuario">
        <span className="ls-badge topnav-usuario-papel">{perfil?.papel}</span>
        <button className="ls-btn ls-btn-ghost" onClick={logout}>
          Sair
        </button>
      </div>
    </header>
  )
}