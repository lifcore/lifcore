import { NavLink } from 'react-router-dom'
import { useAuth } from '../features/auth/AuthContext'

const ITENS = [
  { path: '/', icone: '🏠', titulo: 'Início (Pipeline)' },
  { path: '/painel', icone: '📊', titulo: 'Painel Executivo', somenteMasterAdmin: true },
  { path: '/perfil', icone: '👤', titulo: 'Meu Perfil' },
  { path: '/mensagens', icone: '💬', titulo: 'Mensagens Padrão' },
  { path: '/financeiro', icone: '💰', titulo: 'Financeiro', somenteMasterAdmin: true },
  { path: '/claims', icone: '🗂️', titulo: 'Claims Center' },
  { path: '/growth', icone: '📈', titulo: 'Growth Center' },
  { path: '/knowledge', icone: '📚', titulo: 'Knowledge Center', somenteMasterAdmin: true },
  { path: '/auditoria', icone: '🕵️', titulo: 'Auditoria', somenteMasterAdmin: true },
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