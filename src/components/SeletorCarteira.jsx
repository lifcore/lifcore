import { useEffect, useRef, useState } from 'react'

/**
 * Dropdown de clique (não é um <select> nativo) — abre uma lista
 * flutuante ao clicar, fecha ao clicar fora ou ao escolher um item.
 * Usado no seletor "Meus clientes / Carteira de: [Corretor]".
 */
export default function SeletorCarteira({ opcoes, valorSelecionado, aoSelecionar }) {
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

  const atual = opcoes.find((o) => o.id === valorSelecionado)

  return (
    <div className="ls-dropdown" ref={ref}>
      <button
        type="button"
        className={`ls-dropdown-gatilho ${aberto ? 'ls-dropdown-aberto' : ''}`}
        onClick={() => setAberto((v) => !v)}
      >
        <span>{atual?.icone ?? '👤'}</span>
        <span>{atual?.rotulo ?? 'Selecionar'}</span>
        <span className="ls-dropdown-seta">▼</span>
      </button>

      {aberto && (
        <div className="ls-dropdown-painel">
          {opcoes.map((o, index) => (
            <div key={o.id}>
              {o.separadorAntes && <hr className="ls-dropdown-separador" />}
              <button
                type="button"
                className={`ls-dropdown-item ${o.id === valorSelecionado ? 'ls-dropdown-item-ativo' : ''}`}
                onClick={() => {
                  aoSelecionar(o.id)
                  setAberto(false)
                }}
              >
                <span className="ls-dropdown-item-check">{o.id === valorSelecionado ? '✓' : ''}</span>
                <span>{o.icone ?? ''}</span>
                <span>{o.rotulo}</span>
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
