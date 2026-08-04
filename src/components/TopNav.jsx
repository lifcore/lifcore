import { NavLink, Link, useLocation } from 'react-router-dom'
import { useAuth } from '../features/auth/AuthContext'

const MODULOS = [
  { id: 'lifcare', label: 'Lifcare', path: '/', ativo: true },
  { id: 'lifleet', label: 'Lifleet', path: '/lifleet', ativo: true },
  { id: 'lifsure', label: 'Lifsure', path: '/lifsure', ativo: true },
  { id: 'lishield', label: 'LiShield', path: '/lishield', ativo: true },
  { id: 'lifplan', label: 'Lifplan', path: '/lifplan', ativo: true },
]

/**
 * Lifcare mora na raiz ("/"), que é prefixo de tudo — por isso não dá
 * pra usar "startsWith" puro pra ele, senão ficaria sempre ativo. Cada
 * módulo é considerado ativo quando a rota atual é a dele (Pipeline)
 * ou uma ficha de cliente dentro dele (/clientes/:id ou /lifleet/clientes/:id).
 */
function moduloEstaAtivo(modulo, pathname) {
  if (modulo.id === 'lifcare') {
    return pathname === '/' || pathname.startsWith('/clientes/')
  }
  return pathname.startsWith(modulo.path)
}

export default function TopNav() {
  const { perfil, logout } = useAuth()
  const location = useLocation()

  return (
    <header className="topnav">
      <Link to="/" className="topnav-brand">
        <span className="topnav-logo">Lifcore</span>
        <span className="topnav-tagline">by LifitSeg</span>
      </Link>

      <nav className="topnav-modulos">
        {MODULOS.map((m) =>
          m.ativo ? (
            <Link
              key={m.id}
              to={m.path}
              className={`topnav-modulo ${moduloEstaAtivo(m, location.pathname) ? 'topnav-modulo-ativo' : ''}`}
            >
              {m.label}
            </Link>
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