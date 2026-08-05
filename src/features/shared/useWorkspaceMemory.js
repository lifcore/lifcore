import { useEffect, useState } from 'react'
import { useWorkspace } from './workspaceContextService'

/**
 * Workspace Memory (Sprint 006, Bloco D) — infraestrutura apenas.
 * Nenhuma tela usa isso ainda; fica pronto pra quando um Workspace
 * precisar lembrar filtro/ordenação/modo de visualização entre
 * visitas, sem precisar reinventar a persistência.
 *
 * Nesta Sprint: localStorage, namespaced por Workspace (dois
 * Workspaces diferentes nunca compartilham a mesma chave, mesmo
 * usando o mesmo nome de filtro). Sprint futura (já prevista):
 * sincronizar também no perfil do usuário, mesmo padrão já usado nas
 * preferências de IA.
 */
export function useWorkspaceMemory(chave, valorPadrao) {
  const workspace = useWorkspace()
  const chaveCompleta = `lifcore_ws_${workspace?.id ?? 'global'}_${chave}`

  const [valor, setValor] = useState(() => {
    if (typeof window === 'undefined') return valorPadrao
    const salvo = localStorage.getItem(chaveCompleta)
    if (salvo === null) return valorPadrao
    try {
      return JSON.parse(salvo)
    } catch {
      return valorPadrao
    }
  })

  useEffect(() => {
    localStorage.setItem(chaveCompleta, JSON.stringify(valor))
  }, [chaveCompleta, valor])

  return [valor, setValor]
}