import { useEffect, useState } from 'react'
import EspecialistaSaude from '../features/especialista/EspecialistaSaude'
import EspecialistaAuto from '../features/especialista/EspecialistaAuto'
import EspecialistaLifsure from '../features/especialista/EspecialistaLifsure'
import EspecialistaLifplan from '../features/especialista/EspecialistaLifplan'
import EspecialistaLishield from '../features/especialista/EspecialistaLishield'

const ROTULOS = {
  saude: 'Especialista de Saúde',
  auto: 'Especialista de Auto/Frota',
  lifsure: 'Especialista LifSure',
  lifplan: 'Especialista LifPlan',
  lishield: 'Especialista LiShield',
}

const COMPONENTES = {
  saude: EspecialistaSaude,
  auto: EspecialistaAuto,
  lifsure: EspecialistaLifsure,
  lifplan: EspecialistaLifplan,
  lishield: EspecialistaLishield,
}

/**
 * Painel único que hospeda os três especialistas (Saúde, Auto, LifSure)
 * e sabe trocar de um pro outro — usado quando um deles reconhece que a
 * pergunta é do domínio de outro (campo "especialista_sugerido" na
 * resposta) e o corretor confirma que quer abrir o especialista certo.
 *
 * Sempre que o painel é aberto do zero, volta pro especialista padrão
 * do módulo em que o corretor está navegando. Uma troca manual só vale
 * enquanto o painel estiver aberto.
 */
export default function EspecialistaSwitcher({ moduloPadrao, clienteProspectId }) {
  const [aberto, setAberto] = useState(false)
  const [especialistaAtivo, setEspecialistaAtivo] = useState(moduloPadrao)
  const [perguntaTransferida, setPerguntaTransferida] = useState(null)

  useEffect(() => {
    if (!aberto) setEspecialistaAtivo(moduloPadrao)
  }, [moduloPadrao, aberto])

  function handleAbrir() {
    setEspecialistaAtivo(moduloPadrao)
    setPerguntaTransferida(null)
    setAberto(true)
  }

  function handleFechar() {
    setAberto(false)
    setPerguntaTransferida(null)
  }

  function handleSolicitarTroca(novoModulo, perguntaOriginal) {
    setEspecialistaAtivo(novoModulo)
    setPerguntaTransferida(perguntaOriginal ?? null)
  }

  const ComponenteAtivo = COMPONENTES[especialistaAtivo]

  return (
    <>
      {!aberto && (
        <button
          className="especialista-flutuante-btn"
          onClick={handleAbrir}
          title={`Chamar o ${ROTULOS[moduloPadrao]}`}
        >
          <span className="especialista-flutuante-icone">✦</span>
          Especialista
        </button>
      )}

      {aberto && ComponenteAtivo && (
        <div className="especialista-painel-overlay" onClick={handleFechar}>
          <div className="especialista-painel" onClick={(e) => e.stopPropagation()}>
            <button className="especialista-painel-fechar" onClick={handleFechar} title="Fechar">
              ✕
            </button>
            <div className="especialista-painel-corpo">
              <ComponenteAtivo
                clienteProspectIdInicial={especialistaAtivo === moduloPadrao ? clienteProspectId : null}
                perguntaInicial={perguntaTransferida}
                onSolicitarTroca={handleSolicitarTroca}
              />
            </div>
          </div>
        </div>
      )}
    </>
  )
}
