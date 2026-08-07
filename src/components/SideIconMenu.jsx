import { useEffect, useState } from 'react'
import { NavLink } from 'react-router-dom'
import {
  Home, LayoutDashboard, User, MessageSquare, Wallet,
  FolderKanban, TrendingUp, BookOpen, ShieldCheck, Settings, LayoutGrid,
  PanelLeft, Pin, PanelLeftClose, Inbox,
} from 'lucide-react'
import { useAuth } from '../features/auth/AuthContext'
import { useWorkspace } from '../features/shared/workspaceContextService'

/**
 * Sprint Visual — Fase 1 (OA-001 REV B) + Sprint 006 (WIE-001, Bloco G).
 *
 * A Sidebar Contextual agora consome o Workspace Registry central
 * (`workspaces.js`) em vez de ter sua própria cópia da lógica de
 * detecção de rota — antes desta Sprint, essa mesma lógica também
 * existia (separadamente) dentro do TopNav, com risco real de
 * divergir com o tempo. Agora existe uma fonte só.
 *
 * Hoje todo Workspace ainda devolve o mesmo conteúdo de menu (é tudo
 * que existe de funcionalidade real) — o Registry é o que vai permitir
 * diferenciar isso no futuro, sem precisar mexer neste componente.
 */

const ITENS_GLOBAIS = [
  { path: '/', Icone: Home, titulo: 'Início (Pipeline)' },
  { path: '/painel', Icone: LayoutDashboard, titulo: 'Painel Executivo', somenteMasterAdmin: true },
  { path: '/perfil', Icone: User, titulo: 'Meu Perfil' },
  { path: '/financeiro', Icone: Wallet, titulo: 'Financeiro', somenteMasterAdmin: true },
  { path: '/claims', Icone: FolderKanban, titulo: 'Claims Center' },
  { path: '/growth', Icone: TrendingUp, titulo: 'Growth Center' },
  { path: '/connect', Icone: Inbox, titulo: 'Connect Center', somenteMasterAdmin: true },
  { path: '/knowledge', Icone: BookOpen, titulo: 'Knowledge Center', somenteMasterAdmin: true },
  { path: '/auditoria', Icone: ShieldCheck, titulo: 'Auditoria', somenteMasterAdmin: true },
  { path: '/governanca', Icone: LayoutGrid, titulo: 'Governança de Funcionalidades', somenteMasterAdmin: true },
  { path: '/configuracoes', Icone: Settings, titulo: 'Configurações', somenteMasterAdmin: true },
]

/** Ponto único de decisão de itens da Sidebar — hoje devolve sempre a lista global, pra qualquer Workspace */
function useItensSidebar() {
  useWorkspace() // já consulta o Registry central (Bloco G) — não precisa do valor ainda, só existir a consulta
  return ITENS_GLOBAIS
}

const CHAVE_LOCALSTORAGE = 'lifcore_sidebar_modo'
const PROXIMO_MODO = { hover: 'expandido', expandido: 'travado', travado: 'hover' }
const ICONE_MODO = { hover: PanelLeft, expandido: Pin, travado: PanelLeftClose }
const LABEL_MODO = {
  hover: 'Modo automático — passe o mouse pra expandir. Clique pra fixar.',
  expandido: 'Modo fixo — sempre expandida. Clique pra travar compacta.',
  travado: 'Modo compacto — sempre recolhida. Clique pra voltar ao automático.',
}

export default function SideIconMenu() {
  const { perfil } = useAuth()
  const podeVerConfiguracoes = perfil?.papel === 'master' || perfil?.papel === 'administrador'
  const itensVisiveis = useItensSidebar().filter((item) => !item.somenteMasterAdmin || podeVerConfiguracoes)

  const [modo, setModo] = useState(() => {
    if (typeof window === 'undefined') return 'hover'
    return localStorage.getItem(CHAVE_LOCALSTORAGE) || 'hover'
  })

  useEffect(() => {
    document.body.dataset.sidebarModo = modo
    localStorage.setItem(CHAVE_LOCALSTORAGE, modo)
  }, [modo])

  function handleCicloModo() {
    setModo((atual) => PROXIMO_MODO[atual])
  }

  const IconeModo = ICONE_MODO[modo]

  return (
    <nav className={`side-icon-menu modo-${modo}`}>
      <div className="side-icon-lista">
        {itensVisiveis.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            end={item.path === '/'}
            className={({ isActive }) => `side-icon-item ${isActive ? 'side-icon-item-ativo' : ''}`}
            title={item.titulo}
          >
            <item.Icone className="side-icon-svg" size={20} strokeWidth={1.75} />
            <span className="side-icon-item-label">{item.titulo}</span>
          </NavLink>
        ))}
      </div>

      <button
        type="button"
        className="side-icon-modo-btn"
        onClick={handleCicloModo}
        title={LABEL_MODO[modo]}
      >
        <IconeModo className="side-icon-svg" size={18} strokeWidth={1.75} />
        <span className="side-icon-item-label">
          {modo === 'hover' ? 'Automático' : modo === 'expandido' ? 'Fixo' : 'Compacto'}
        </span>
      </button>
    </nav>
  )
}
