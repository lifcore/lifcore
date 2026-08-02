import { useState } from 'react'
import { useAuth } from '../features/auth/AuthContext'
import { executarOperacaoCritica } from '../lib/governanca/governancaService'

/**
 * Botão único de Governança Master, reutilizável por qualquer Center.
 * Só renderiza algo se o perfil logado for Master. Exige motivo e
 * confirmação antes de executar, e registra auditoria automaticamente
 * — nenhum módulo deve reimplementar essa lógica localmente.
 *
 * Uso típico (exclusão definitiva):
 *   <BotaoOperacaoCritica
 *     label="Excluir"
 *     tabelaAfetada="operacional.comissoes"
 *     registroId={comissao.id}
 *     dadosAntes={comissao}
 *     executar={() => excluirComissao(comissao.id)}
 *     onSucesso={recarregar}
 *   />
 */
export default function BotaoOperacaoCritica({
  label = 'Excluir',
  acao = 'exclusao',
  tabelaAfetada,
  registroId,
  dadosAntes,
  executar,
  onSucesso,
  className = 'cliente-tabela-btn cliente-tabela-btn-perigo',
}) {
  const { perfil } = useAuth()
  const [executando, setExecutando] = useState(false)

  if (perfil?.papel !== 'master') return null

  async function handleClick() {
    const motivo = window.prompt(`Motivo (obrigatório) para: ${label}`)
    if (!motivo?.trim()) return
    if (!window.confirm(`Confirma "${label}"? Esta ação é registrada em auditoria e não pode ser desfeita.`)) return

    setExecutando(true)
    try {
      await executarOperacaoCritica({ perfil, acao, tabelaAfetada, registroId, motivo, dadosAntes, executar })
      onSucesso?.()
    } catch (err) {
      alert(err.message)
    } finally {
      setExecutando(false)
    }
  }

  return (
    <button className={className} onClick={handleClick} disabled={executando}>
      {executando ? 'Processando...' : label}
    </button>
  )
}