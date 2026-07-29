import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { AuthProvider, useAuth } from './features/auth/AuthContext'
import LoginPage from './features/auth/LoginPage'
import TopNav from './components/TopNav'
import SideIconMenu from './components/SideIconMenu'
import EspecialistaFlutuante from './components/EspecialistaFlutuante'
import PipelinePage from './features/crm/PipelinePage'
import ClienteDetailPage from './features/crm/ClienteDetailPage'
import ConfiguracoesPage from './features/configuracoes/ConfiguracoesPage'
import PerfilPage from './features/perfil/PerfilPage'
import MensagensPage from './features/mensagens/MensagensPage'
import ApolicesPage from './features/administracao/ApolicesPage'
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
          <Route path="/configuracoes" element={<ConfiguracoesPage />} />
          <Route path="/perfil" element={<PerfilPage />} />
          <Route path="/mensagens" element={<MensagensPage />} />
          <Route path="/apolices" element={<ApolicesPage />} />
        </Routes>
      </main>
      <EspecialistaFlutuante />
    </BrowserRouter>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <AppShell />
    </AuthProvider>
  )
}
