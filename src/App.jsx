import { AuthProvider, useAuth } from './features/auth/AuthContext'
import LoginPage from './features/auth/LoginPage'
import DashboardPage from './features/layout/DashboardPage'

function AppContent() {
  const { user, carregando } = useAuth()

  if (carregando) {
    return <div className="loading-screen">Carregando...</div>
  }

  return user ? <DashboardPage /> : <LoginPage />
}

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  )
}
