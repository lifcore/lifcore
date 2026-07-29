import { NavLink } from 'react-router-dom'

const ITENS = [
  { path: '/', icone: '🏠', titulo: 'Início (Pipeline)' },
  { path: '/perfil', icone: '👤', titulo: 'Meu Perfil' },
  { path: '/mensagens', icone: '💬', titulo: 'Mensagens Padrão' },
  { path: '/configuracoes', icone: '⚙️', titulo: 'Configurações' },
]

export default function SideIconMenu() {
  return (
    <nav className="side-icon-menu">
      {ITENS.map((item) => (
        <NavLink
          key={item.path}
          to={item.path}
          end={item.path === '/'}
          className={({ isActive }) => `side-icon-item ${isActive ? 'side-icon-item-ativo' : ''}`}
          title={item.titulo}
        >
          <span className="side-icon-emoji">{item.icone}</span>
        </NavLink>
      ))}
    </nav>
  )
}
