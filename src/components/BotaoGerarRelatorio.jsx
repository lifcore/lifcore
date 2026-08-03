import { useState } from 'react'
import { montarDadosDocumentoCliente, gerarHtmlDocumentoCliente } from '../lib/crm/documentoClienteService'

/**
 * Botão único de "Gerar Relatório" — reutilizável pelos 5 módulos.
 * Busca os dados via documentoClienteService (Report Center), monta o
 * HTML e abre numa janela pronta pra imprimir/salvar como PDF — mesmo
 * padrão já usado no "Imprimir/Comparativo" do Cotador do Lifleet.
 */
export default function BotaoGerarRelatorio({ clienteId, className = 'ls-btn ls-btn-ghost' }) {
  const [gerando, setGerando] = useState(false)

  async function handleGerar() {
    setGerando(true)
    try {
      const dados = await montarDadosDocumentoCliente(clienteId)
      const html = gerarHtmlDocumentoCliente(dados)
      const janela = window.open('', '_blank')
      janela.document.write(html)
      janela.document.close()
    } catch (err) {
      alert(`Erro ao gerar relatório: ${err.message}`)
    } finally {
      setGerando(false)
    }
  }

  return (
    <button className={className} onClick={handleGerar} disabled={gerando}>
      {gerando ? 'Gerando...' : '📄 Relatório'}
    </button>
  )
}