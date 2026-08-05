import { useLocation } from 'react-router-dom'
import { WORKSPACES, detectarWorkspaceAtivo, obterWorkspace } from '../../workspaces'

/**
 * Workspace Context Engine (Sprint 006, Bloco B).
 *
 * Hook único que qualquer componente usa pra saber "qual Workspace
 * está ativo agora" — elimina a necessidade de cada componente ter
 * sua própria lógica de detecção de rota (o que já causava divergência
 * entre a Sidebar e o TopNav antes desta Sprint).
 *
 * Devolve o objeto completo do Workspace Registry (nome, cor,
 * especialista padrão, breadcrumb, etc.) ou `null` se a rota atual
 * não corresponder a nenhum Workspace conhecido.
 */
export function useWorkspace() {
  const location = useLocation()
  const idAtivo = detectarWorkspaceAtivo(location.pathname)
  return idAtivo ? obterWorkspace(idAtivo) : null
}

/** Versão sem hook, pra uso fora de componentes React (ex: dentro de um service) */
export function obterWorkspaceAtivo(pathname) {
  const id = detectarWorkspaceAtivo(pathname)
  return id ? WORKSPACES[id] : null
}