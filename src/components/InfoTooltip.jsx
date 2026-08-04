import { useEffect, useRef, useState } from 'react'
import './info-tooltip.css'

/**
 * Ícone ⓘ que, ao ser clicado, abre um painel com o texto completo —
 * substitui os blocos longos de "config-instrucao" espalhados no topo
 * das telas (LCDS-001, seção 12-A). Fecha ao clicar fora ou Esc, mesmo
 * padrão já usado no SeletorCarteira.
 */
export default function InfoTooltip({ texto, titulo }) {
  const [aberto, setAberto] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    function aoClicarFora(e) {
      if (ref.current && !ref.current.contains(e.target)) setAberto(false)
    }
    function aoPressionarTecla(e) {
      if (e.key === 'Escape') setAberto(false)
    }
    document.addEventListener('mousedown', aoClicarFora)
    document.addEventListener('keydown', aoPressionarTecla)
    return () => {
      document.removeEventListener('mousedown', aoClicarFora)
      document.removeEventListener('keydown', aoPressionarTecla)
    }
  }, [])

  return (
    <span className="info-tooltip" ref={ref}>
      <button
        type="button"
        className="info-tooltip-gatilho"
        onClick={() => setAberto((v) => !v)}
        aria-label={titulo ? `Mais informações sobre ${titulo}` : 'Mais informações'}
        aria-expanded={aberto}
      >
        i
      </button>

      {aberto && (
        <div className="info-tooltip-painel" role="tooltip">
          {texto}
        </div>
      )}
    </span>
  )
}