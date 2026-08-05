import { WORKSPACES, WORKSPACES_OPERACIONAIS } from '../../workspaces'
import InfoTooltip from '../../components/InfoTooltip'

/**
 * Painel de Governança de Funcionalidades (Governance Panel).
 *
 * Não é um dado novo — é uma TELA que lê o Capability Engine
 * (`workspaces.js` → campo `features`) já existente desde a Sprint
 * 010 (WIE-002). Cada vez que uma funcionalidade for ligada/desligada
 * pra um Workspace, é só mudar o Registry — esta tela reflete sozinha,
 * sem precisar de manutenção própria.
 */

const FUNCIONALIDADES = [
  { chave: 'commercialLifecycle', label: 'Commercial Lifecycle' },
  { chave: 'workspaceHeader', label: 'Workspace Header' },
  { chave: 'customer360', label: 'Customer 360' },
  { chave: 'comparisonQuote', label: 'Cotador Comparativo' },
  { chave: 'claims', label: 'Claims Center' },
  { chave: 'finance', label: 'Finance (por cliente)' },
  { chave: 'connect', label: 'Connect Center' },
]

export default function GovernancaFuncionalidadesPage() {
  return (
    <div className="config-page" data-theme="lcds">
      <h2>
        Governança de Funcionalidades
        <InfoTooltip
          titulo="Governança de Funcionalidades"
          texto="Mostra o que está ligado ou não em cada Workspace, lendo direto do Capability Engine (workspaces.js). Não é um cadastro à parte — é sempre a verdade atual do Registry."
        />
      </h2>

      <div className="ls-card" style={{ padding: 0, marginTop: '1rem' }}>
        <table className="cliente-tabela">
          <thead>
            <tr>
              <th>Funcionalidade</th>
              {WORKSPACES_OPERACIONAIS.map((id) => (
                <th key={id} style={{ textAlign: 'center' }}>{WORKSPACES[id].nome}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {FUNCIONALIDADES.map((f) => (
              <tr key={f.chave}>
                <td>{f.label}</td>
                {WORKSPACES_OPERACIONAIS.map((id) => {
                  const ativo = WORKSPACES[id].features?.[f.chave] ?? false
                  return (
                    <td key={id} style={{ textAlign: 'center', fontSize: '1.1rem' }}>
                      {ativo ? '✅' : '⏳'}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="config-instrucao" style={{ marginTop: '0.75rem' }}>
        ✅ = ativo e homologado · ⏳ = ainda não aplicado nesse Workspace (não significa bloqueado, só que ainda não foi a vez dele)
      </p>
    </div>
  )
}