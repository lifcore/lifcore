import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom'
import { AuthProvider, useAuth } from './features/auth/AuthContext'
import LoginPage from './features/auth/LoginPage'
import TopNav from './components/TopNav'
import SideIconMenu from './components/SideIconMenu'
import EspecialistaSwitcher from './components/EspecialistaSwitcher'
import PipelinePage from './features/crm/PipelinePage'
import ClienteDetailPage from './features/crm/ClienteDetailPage'
import ConfiguracoesPage from './features/configuracoes/ConfiguracoesPage'
import PerfilPage from './features/perfil/PerfilPage'
import MensagensPage from './features/mensagens/MensagensPage'
import ApolicesPage from './features/administracao/ApolicesPage'
import PipelineLifleetPage from './features/lifleet/PipelineLifleetPage'
import ClienteDetailLifleetPage from './features/lifleet/ClienteDetailLifleetPage'
import PipelineLifsurePage from './features/lifsure/PipelineLifsurePage'
import ClienteDetailLifsurePage from './features/lifsure/ClienteDetailLifsurePage'
import PipelineLifplanPage from './features/lifplan/PipelineLifplanPage'
import ClienteDetailLifplanPage from './features/lifplan/ClienteDetailLifplanPage'
import PipelineLishieldPage from './features/lishield/PipelineLishieldPage'
import ClienteDetailLishieldPage from './features/lishield/ClienteDetailLishieldPage'
import './components/sideiconmenu.css'

function AppShell() {
  const { user, carregando } = useAuth()

  if (carregando) {
    return <div className="loading-screen">Carregando...</div>
  }

  if (!user) {
    return <LoginPage />
  }

  return (
    <BrowserRouter>
      <TopNav />
      <SideIconMenu />
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
          <Route path="/perfil" element={<PerfilPage />} />
          <Route path="/mensagens" element={<MensagensPage />} />
          <Route path="/apolices" element={<ApolicesPage />} />
        </Routes>
      </main>
      <EspecialistaSwitcherCondicional />
    </BrowserRouter>
  )
}

/** Decide o módulo padrão do Especialista conforme a rota atual — LiShield ainda não tem IA própria, então não mostra o botão lá */
function EspecialistaSwitcherCondicional() {
  const location = useLocation()
  if (location.pathname.startsWith('/lishield')) return null
  let moduloPadrao = 'saude'
  if (location.pathname.startsWith('/lifleet')) moduloPadrao = 'auto'
  if (location.pathname.startsWith('/lifsure')) moduloPadrao = 'lifsure'
  if (location.pathname.startsWith('/lifplan')) moduloPadrao = 'lifplan'
  return <EspecialistaSwitcher moduloPadrao={moduloPadrao} />
}

export default function App() {
  return (
    <AuthProvider>
      <AppShell />
    </AuthProvider>
  )
}
