import { NavLink } from 'react-router-dom'
import { useAuth } from '../features/auth/AuthContext'

const ITENS = [
  { path: '/', icone: '🏠', titulo: 'Início (Pipeline)' },
  { path: '/perfil', icone: '👤', titulo: 'Meu Perfil' },
  { path: '/mensagens', icone: '💬', titulo: 'Mensagens Padrão' },
  { path: '/configuracoes', icone: '⚙️', titulo: 'Configurações', somenteMasterAdmin: true },
]

export default function SideIconMenu() {
  const { perfil } = useAuth()
  const podeVerConfiguracoes = perfil?.papel === 'master' || perfil?.papel === 'administrador'
  const itensVisiveis = ITENS.filter((item) => !item.somenteMasterAdmin || podeVerConfiguracoes)

  return (
    <nav className="side-icon-menu">
      {itensVisiveis.map((item) => (
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
