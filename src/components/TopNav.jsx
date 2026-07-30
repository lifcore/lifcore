import { NavLink, Link } from 'react-router-dom'
import { useAuth } from '../features/auth/AuthContext'

const MODULOS = [
  { id: 'lifcare', label: 'Lifcare', path: '/', ativo: true },
  { id: 'lifleet', label: 'Lifleet', path: '/lifleet', ativo: true },
  { id: 'lifsure', label: 'Lifsure', path: '#', ativo: false },
  { id: 'lifplan', label: 'Lifplan', path: '#', ativo: false },
]

export default function TopNav() {
  const { perfil, logout } = useAuth()

  return (
    <header className="topnav">
      <Link to="/" className="topnav-brand">
        <span className="topnav-logo">Lifcore</span>
        <span className="topnav-tagline">by LifitSeg</span>
      </Link>

      <nav className="topnav-modulos">
        {MODULOS.map((m) =>
          m.ativo ? (
            <NavLink
              key={m.id}
              to={m.path}
              end
              className={({ isActive }) =>
                `topnav-modulo ${isActive ? 'topnav-modulo-ativo' : ''}`
              }
            >
              {m.label}
            </NavLink>
          ) : (
            <span key={m.id} className="topnav-modulo topnav-modulo-em-breve" title="Em breve">
              {m.label}
            </span>
          )
        )}
      </nav>

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
