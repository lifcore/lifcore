import { createContext, useContext } from 'react'

/**
 * Sprint Visual — mecanismo de "ações contextuais no TopNav".
 *
 * O TopNav renderiza uma div vazia (o "encaixe") e expõe sua
 * referência aqui. Qualquer página usa `useTopNavSlot()` + um
 * `createPortal` do React pra desenhar seus próprios controles
 * (busca, seletor de carteira, botões) DENTRO dessa div, sem o TopNav
 * precisar saber nada sobre o conteúdo de cada página — ele só
 * "empresta o espaço".
 *
 * Isso evita duplicar layout: cada página continua dona da sua
 * lógica (o que mostrar, quando, pra quem), só o LUGAR na tela que
 * muda.
 */
const TopNavSlotContext = createContext(null)

export const TopNavSlotProvider = TopNavSlotContext.Provider

export function useTopNavSlot() {
  return useContext(TopNavSlotContext)
}