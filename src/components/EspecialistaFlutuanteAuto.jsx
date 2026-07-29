import { useState } from 'react'
import EspecialistaAuto from '../features/especialista/EspecialistaAuto'

/** Mesmo padrão do EspecialistaFlutuante (Saúde), só que aponta pro motor de Auto/Frota */
export default function EspecialistaFlutuanteAuto({ clienteProspectId }) {
  const [aberto, setAberto] = useState(false)

  return (
    <>
      {!aberto && (
        <button
          className="especialista-flutuante-btn"
          onClick={() => setAberto(true)}
          title="Chamar o Especialista de Auto/Frota"
        >
          <span className="especialista-flutuante-icone">✦</span>
          Especialista
        </button>
      )}

      {aberto && (
        <div className="especialista-painel-overlay" onClick={() => setAberto(false)}>
          <div className="especialista-painel" onClick={(e) => e.stopPropagation()}>
            <button className="especialista-painel-fechar" onClick={() => setAberto(false)} title="Fechar">
              ✕
            </button>
            <div className="especialista-painel-corpo">
              <EspecialistaAuto clienteProspectIdInicial={clienteProspectId} />
            </div>
          </div>
        </div>
      )}
    </>
  )
}
