import { useState } from 'react'
import EspecialistaSaude from '../features/especialista/EspecialistaSaude'

/**
 * Botão flutuante que chama o Especialista de qualquer lugar do
 * sistema — Modo 1: pergunta solta, sem cliente vinculado (ex:
 * "autismo tem carência?"). Quando chamado de dentro da ficha de
 * um cliente, pode futuramente já vir com clienteProspectId
 * pré-preenchido (basta passar via prop).
 */
export default function EspecialistaFlutuante({ clienteProspectId }) {
  const [aberto, setAberto] = useState(false)

  return (
    <>
      <button
        className="especialista-flutuante-btn"
        onClick={() => setAberto(true)}
        title="Chamar o Especialista de Saúde"
      >
        <span className="especialista-flutuante-icone">✦</span>
        Especialista
      </button>

      {aberto && (
        <div className="ls-modal-overlay" onClick={() => setAberto(false)}>
          <div className="especialista-modal" onClick={(e) => e.stopPropagation()}>
            <button className="especialista-modal-fechar" onClick={() => setAberto(false)}>
              ✕
            </button>
            <EspecialistaSaude clienteProspectIdInicial={clienteProspectId} />
          </div>
        </div>
      )}
    </>
  )
}
