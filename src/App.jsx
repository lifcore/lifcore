import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom'
import { useState } from 'react'
import { AuthProvider, useAuth } from './features/auth/AuthContext'
import LoginPage from './features/auth/LoginPage'
import TopNav from './components/TopNav'
import { TopNavSlotProvider } from './components/TopNavSlotContext'
import SideIconMenu from './components/SideIconMenu'
import EspecialistaSwitcher from './components/EspecialistaSwitcher'
import PipelinePage from './features/crm/PipelinePage'
import ClienteDetailPage from './features/crm/ClienteDetailPage'
import ConfiguracoesPage from './features/configuracoes/ConfiguracoesPage'
import FinanceiroPage from './features/financeiro/FinanceiroPage'
import PainelExecutivoPage from './features/painel-executivo/PainelExecutivoPage'
import AuditoriaPage from './features/auditoria/AuditoriaPage'
import ClaimsCenterPage from './features/claims/ClaimsCenterPage'
import GrowthCenterPage from './features/growth/GrowthCenterPage'
import KnowledgeCenterPage from './features/knowledge/KnowledgeCenterPage'
import PerfilPage from './features/perfil/PerfilPage'
import ApolicesPage from './features/administracao/ApolicesPage'
import GovernancaFuncionalidadesPage from './features/shared/GovernancaFuncionalidadesPage'
import PipelineLifleetPage from './features/lifleet/PipelineLifleetPage'
import ClienteDetailLifleetPage from './features/lifleet/ClienteDetailLifleetPage'
import PipelineLifsurePage from './features/lifsure/PipelineLifsurePage'
import ClienteDetailLifsurePage from './features/lifsure/ClienteDetailLifsurePage'
import PipelineLifplanPage from './features/lifplan/PipelineLifplanPage'
import ClienteDetailLifplanPage from './features/lifplan/ClienteDetailLifplanPage'
import PipelineLishieldPage from './features/lishield/PipelineLishieldPage'
import ClienteDetailLishieldPage from './features/lishield/ClienteDetailLishieldPage'
import ConnectInboxPage from './features/connect/ConnectInboxPage'
import './components/sideiconmenu.css'
import './styles/lcds-tokens.css'

function AppShell() {
  const { user, carregando } = useAuth()
  const [topnavSlot, setTopnavSlot] = useState(null)

  if (carregando) {
    return <div className="loading-screen">Carregando...</div>
  }

  if (!user) {
    return <LoginPage />
  }

  return (
    <BrowserRouter>
      <TopNav onSlotRef={setTopnavSlot} />
      <SideIconMenu />
      <TopNavSlotProvider value={topnavSlot}>
      <div data-theme="lcds" className="lcds-app-shell">
        <main className="app-main">
          <Routes>
            <Route path="/" element={<PipelinePage />} />
            <Route path="/clientes/:id" element={<ClienteDetailPage />} />
            <Route path="/lifleet" element={<PipelineLifleetPage />} />
            <Route path="/lifleet/clientes/:id" element={<ClienteDetailLifleetPage />} />
            <Route path="/lifsure" element={<PipelineLifsurePage />} />
            <Route path="/lifsure/clientes/:id" element={<ClienteDetailLifsurePage />} />
            <Route path="/lifplan" element={<PipelineLifplanPage />} />
            <Route path="/lifplan/clientes/:id" element={<ClienteDetailLifplanPage />} />
            <Route path="/lishield" element={<PipelineLishieldPage />} />
            <Route path="/lishield/clientes/:id" element={<ClienteDetailLishieldPage />} />
            <Route path="/configuracoes" element={<ConfiguracoesPage />} />
            <Route path="/financeiro" element={<FinanceiroPage />} />
            <Route path="/painel" element={<PainelExecutivoPage />} />
            <Route path="/auditoria" element={<AuditoriaPage />} />
            <Route path="/claims" element={<ClaimsCenterPage />} />
            <Route path="/growth" element={<GrowthCenterPage />} />
            <Route path="/knowledge" element={<KnowledgeCenterPage />} />
            <Route path="/perfil" element={<PerfilPage />} />
            <Route path="/apolices" element={<ApolicesPage />} />
            <Route path="/governanca" element={<GovernancaFuncionalidadesPage />} />
            <Route path="/connect" element={<ConnectInboxPage />} />
          </Routes>
        </main>
        <EspecialistaSwitcherCondicional />
      </div>
      </TopNavSlotProvider>
    </BrowserRouter>
  )
}

/** Decide o módulo padrão do Especialista conforme a rota atual */
function EspecialistaSwitcherCondicional() {
  const location = useLocation()
  let moduloPadrao = 'saude'
  if (location.pathname.startsWith('/lifleet')) moduloPadrao = 'auto'
  if (location.pathname.startsWith('/lifsure')) moduloPadrao = 'lifsure'
  if (location.pathname.startsWith('/lifplan')) moduloPadrao = 'lifplan'
  if (location.pathname.startsWith('/lishield')) moduloPadrao = 'lishield'
  return <EspecialistaSwitcher moduloPadrao={moduloPadrao} />
}

export default function App() {
  return (
    <AuthProvider>
      <AppShell />
    </AuthProvider>
  )
}
