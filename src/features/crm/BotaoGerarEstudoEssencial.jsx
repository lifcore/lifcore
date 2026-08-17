import { useState } from 'react'
import { montarDadosEstudoEssencial } from '../../lib/crm/estudoEssencialService'
import { gerarHtmlEstudoEssencial } from '../../lib/crm/estudoEssencialPdfService'

/**
 * SPEC-003 — Estudo Essencial. Mesmo mecanismo de janela+impressão do
 * Report Center e do antigo BotaoGerarEstudoPremium.
 */
export default function BotaoGerarEstudoEssencial({ cotacaoId, propostasConfirmadasCount = 0, className = 'ls-btn ls-btn-primary' }) {
  const [gerando, setGerando] = useState(false)

  async function handleGerar() {
    setGerando(true)
    try {
      const dados = await montarDadosEstudoEssencial(cotacaoId)
      if (dados.prontidao.prontas.length === 0) {
        alert('Nenhuma proposta confirmada está pronta (vinculada ao catálogo, com preço aplicável). Revise na tela de Propostas antes de gerar o Estudo.')
        return
      }
      const html = gerarHtmlEstudoEssencial(dados)
      const janela = window.open('', '_blank')
      janela.document.write(html)
      janela.document.close()
    } catch (err) {
      alert(`Erro ao gerar o Estudo Essencial: ${err.message}`)
    } finally {
      setGerando(false)
    }
  }

  return (
    <button className={className} onClick={handleGerar} disabled={gerando || propostasConfirmadasCount === 0}>
      {gerando ? 'Gerando...' : `📊 Gerar Estudo Essencial${propostasConfirmadasCount ? ` (${propostasConfirmadasCount})` : ''}`}
    </button>
  )
}
