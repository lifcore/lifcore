import { useAuth } from '../auth/AuthContext'

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
        <p>
          Fundação criada com sucesso. Aqui entrarão os módulos do CoreON
          conforme forem especificados.
        </p>
      </main>
    </div>
  )
}
