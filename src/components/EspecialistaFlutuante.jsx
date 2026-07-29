import { useState } from 'react'
import EspecialistaSaude from '../features/especialista/EspecialistaSaude'

/**
 * Botão flutuante que chama o Especialista de qualquer lugar do
 * sistema — Modo 1: pergunta solta, sem cliente vinculado (ex:
 * "autismo tem carência?"). Quando chamado de dentro da ficha de
 * um cliente, pode futuramente já vir com clienteProspectId
 * pré-preenchido (basta passar via prop).
 *
 * O painel sobe do canto onde o botão fica (efeito de "chat
 * subindo"), com cantos arredondados e o X sempre dentro dos
 * limites do painel — nada de flutuar cortado na borda da tela.
 */
export default function EspecialistaFlutuante({ clienteProspectId }) {
  const [aberto, setAberto] = useState(false)

  return (
    <>
      {!aberto && (
        <button
          className="especialista-flutuante-btn"
          onClick={() => setAberto(true)}
          title="Chamar o Especialista de Saúde"
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
              <EspecialistaSaude clienteProspectIdInicial={clienteProspectId} />
            </div>
          </div>
        </div>
      )}
    </>
  )
}
