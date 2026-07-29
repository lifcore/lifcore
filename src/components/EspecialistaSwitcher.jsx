import { useEffect, useState } from 'react'
import EspecialistaSaude from '../features/especialista/EspecialistaSaude'
import EspecialistaAuto from '../features/especialista/EspecialistaAuto'

const ROTULOS = {
  saude: 'Especialista de Saúde',
  auto: 'Especialista de Auto/Frota',
}

/**
 * Painel único que hospeda os dois especialistas (Saúde e Auto) e sabe
 * trocar de um pro outro — usado quando um deles reconhece que a
 * pergunta é do domínio do outro (campo "especialista_sugerido" na
 * resposta) e o corretor confirma que quer abrir o especialista certo.
 *
 * Sempre que o painel é aberto do zero, volta pro especialista padrão
 * do módulo em que o corretor está navegando (Lifcare → Saúde, Lifleet
 * → Auto). Uma troca manual só vale enquanto o painel estiver aberto.
 */
export default function EspecialistaSwitcher({ moduloPadrao, clienteProspectId }) {
  const [aberto, setAberto] = useState(false)
  const [especialistaAtivo, setEspecialistaAtivo] = useState(moduloPadrao)
  const [perguntaTransferida, setPerguntaTransferida] = useState(null)

  // Se o corretor navegar de um módulo pro outro (Lifcare <-> Lifleet)
  // com o painel fechado, o próximo especialista a abrir já é o certo.
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

      {aberto && (
        <div className="especialista-painel-overlay" onClick={handleFechar}>
          <div className="especialista-painel" onClick={(e) => e.stopPropagation()}>
            <button className="especialista-painel-fechar" onClick={handleFechar} title="Fechar">
              ✕
            </button>
            <div className="especialista-painel-corpo">
              {especialistaAtivo === 'saude' ? (
                <EspecialistaSaude
                  clienteProspectIdInicial={moduloPadrao === 'saude' ? clienteProspectId : null}
                  perguntaInicial={perguntaTransferida}
                  onSolicitarTroca={(pergunta) => handleSolicitarTroca('auto', pergunta)}
                />
              ) : (
                <EspecialistaAuto
                  clienteProspectIdInicial={moduloPadrao === 'auto' ? clienteProspectId : null}
                  perguntaInicial={perguntaTransferida}
                  onSolicitarTroca={(pergunta) => handleSolicitarTroca('saude', pergunta)}
                />
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
