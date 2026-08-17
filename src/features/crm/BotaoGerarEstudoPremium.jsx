import { useState } from 'react'
import { montarDadosEstudoMercado, gerarHtmlEstudoMercado } from '../../lib/crm/estudoMercadoPdfService'

/**
 * SPEC-001 §12 — mesmo mecanismo do BotaoGerarRelatorio.jsx (Report
 * Center): monta dados, gera HTML, abre em janela nova pronta pra
 * imprimir/salvar como PDF. Só habilitado quando há pelo menos 1
 * proposta confirmada — gerar um Estudo vazio não ajuda ninguém.
 */
export default function BotaoGerarEstudoPremium({ cotacaoId, propostasConfirmadasCount = 0, className = 'ls-btn ls-btn-primary' }) {
  const [gerando, setGerando] = useState(false)

  async function handleGerar() {
    setGerando(true)
    try {
      const dados = await montarDadosEstudoMercado(cotacaoId)
      const html = gerarHtmlEstudoMercado(dados)
      const janela = window.open('', '_blank')
      janela.document.write(html)
      janela.document.close()
    } catch (err) {
      alert(`Erro ao gerar o Estudo de Mercado: ${err.message}`)
    } finally {
      setGerando(false)
    }
  }

  return (
    <button className={className} onClick={handleGerar} disabled={gerando || propostasConfirmadasCount === 0}>
      {gerando ? 'Gerando...' : `📊 Gerar Estudo Premium${propostasConfirmadasCount ? ` (${propostasConfirmadasCount})` : ''}`}
    </button>
  )
}
