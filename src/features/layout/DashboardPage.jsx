import { useAuth } from '../auth/AuthContext'
import EspecialistaSaude from '../especialista/EspecialistaSaude'
import '../especialista/especialista.css'

export default function DashboardPage() {
  const { perfil, logout } = useAuth()

  return (
    <div className="dashboard-container">
      <header className="dashboard-header">
        <h1>CoreON</h1>
        <div>
          <span>
            {perfil?.nome_completo} · <strong>{perfil?.papel}</strong>
          </span>
          <button onClick={logout}>Sair</button>
        </div>
      </header>

      <main>
        <EspecialistaSaude />
      </main>
    </div>
  )
}
