import { useEffect, useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import {
  Home, LayoutDashboard, User, MessageSquare, Wallet,
  FolderKanban, TrendingUp, BookOpen, ShieldCheck, Settings,
  PanelLeft, Pin, PanelLeftClose,
} from 'lucide-react'
import { useAuth } from '../features/auth/AuthContext'

/**
 * Sprint Visual — Fase 1 (OA-001 REV B, aprovado pelo Chief Systems
 * Architect).
 *
 * SIDEBAR CONTEXTUAL — MECANISMO DE VERDADE, NÃO SÓ ARQUITETURA:
 * `detectarWorkspaceAtivo()` lê a rota atual e identifica qual
 * Workspace está ativo (Lifcare/Lifleet/LifSure/LiShield/LifPlan, ou
 * `null` quando o usuário está num Center/Governança, sem Workspace
 * específico). `ITENS_POR_WORKSPACE` é o mapa que a Sidebar consulta
 * pra decidir o que mostrar.
 *
 * Hoje todos os Workspaces apontam pro MESMO conteúdo (a lista
 * global) — porque é tudo que existe de funcionalidade real hoje.
 * O mecanismo de troca já funciona de ponta a ponta; só falta o
 * conteúdo diferenciado, que nasce quando cada módulo (Beneficiários,
 * Movimentações, Implantações etc.) for construído de verdade. Nunca
 * inventamos tela nova só pra preencher a Sidebar (diretriz do Chief).
 */

const ITENS_GLOBAIS = [
  { path: '/', Icone: Home, titulo: 'Início (Pipeline)' },
  { path: '/painel', Icone: LayoutDashboard, titulo: 'Painel Executivo', somenteMasterAdmin: true },
  { path: '/perfil', Icone: User, titulo: 'Meu Perfil' },
  { path: '/mensagens', Icone: MessageSquare, titulo: 'Mensagens Padrão' },
  { path: '/financeiro', Icone: Wallet, titulo: 'Financeiro', somenteMasterAdmin: true },
  { path: '/claims', Icone: FolderKanban, titulo: 'Claims Center' },
  { path: '/growth', Icone: TrendingUp, titulo: 'Growth Center' },
  { path: '/knowledge', Icone: BookOpen, titulo: 'Knowledge Center', somenteMasterAdmin: true },
  { path: '/auditoria', Icone: ShieldCheck, titulo: 'Auditoria', somenteMasterAdmin: true },
  { path: '/configuracoes', Icone: Settings, titulo: 'Configurações', somenteMasterAdmin: true },
]

/**
 * Mapa por Workspace. Todos apontam pra ITENS_GLOBAIS hoje — de
 * propósito. Quando um Workspace ganhar itens próprios de verdade
 * (ex: Lifleet ganhar um atalho direto pra "Cotações" quando essa
 * tela deixar de ser só uma aba dentro da ficha do cliente), é só
 * trocar a entrada dele aqui, sem mexer no resto do componente.
 */
const ITENS_POR_WORKSPACE = {
  lifcare: ITENS_GLOBAIS,
  auto: ITENS_GLOBAIS,
  lifsure: ITENS_GLOBAIS,
  lishield: ITENS_GLOBAIS,
  lifplan: ITENS_GLOBAIS,
}

/** Lê a rota atual e identifica o Workspace ativo — `null` quando está num Center/Governança */
function detectarWorkspaceAtivo(pathname) {
  if (pathname === '/' || pathname.startsWith('/clientes/')) return 'lifcare'
  if (pathname.startsWith('/lifleet')) return 'auto'
  if (pathname.startsWith('/lifsure')) return 'lifsure'
  if (pathname.startsWith('/lishield')) return 'lishield'
  if (pathname.startsWith('/lifplan')) return 'lifplan'
  return null
}

/** Mecanismo real de troca por Workspace — hoje todo Workspace devolve o mesmo conteúdo (ver nota acima) */
function useItensSidebar() {
  const location = useLocation()
  const workspaceAtivo = detectarWorkspaceAtivo(location.pathname)
  return workspaceAtivo ? (ITENS_POR_WORKSPACE[workspaceAtivo] ?? ITENS_GLOBAIS) : ITENS_GLOBAIS
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