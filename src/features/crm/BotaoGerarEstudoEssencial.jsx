import { useState } from 'react'
import { montarDadosEstudoEssencial } from '../../lib/crm/estudoEssencialService'
import { gerarHtmlEstudoEssencial } from '../../lib/crm/estudoEssencialPdfService'

/**
 * SPEC-003 — Estudo Essencial. Mesmo mecanismo de janela+impressão do
 * Report Center e do antigo BotaoGerarEstudoPremium.
 *
 * CORREÇÃO (17/08, achada no teste): a seleção de regra de preço só é
 * segura se região/segmento forem informados — regra que exige uma
 * dimensão não confirmada NUNCA é escolhida (ver smartQuoteLogica.js).
 * Por isso este botão agora pergunta antes de gerar, em vez de gerar
 * direto com contexto vazio (o que faria qualquer regra segmentada
 * ficar sempre de fora, mesmo quando aplicável).
 */
export default function BotaoGerarEstudoEssencial({ cotacaoId, propostasConfirmadasCount = 0, className = 'ls-btn ls-btn-primary' }) {
  const [gerando, setGerando] = useState(false)
  const [mostrarContexto, setMostrarContexto] = useState(false)
  const [segmento, setSegmento] = useState('')
  const [regiao, setRegiao] = useState('')

  async function handleGerar() {
    setGerando(true)
    try {
      const dados = await montarDadosEstudoEssencial(cotacaoId, { segmento: segmento || null, regiao: regiao || null })
      if (dados.prontidao.prontas.length === 0) {
        alert(
          'Nenhuma proposta ficou pronta com o segmento/região informados — ou o preço não é aplicável a esse contexto, ' +
          'ou a regra é ambígua (duas regras igualmente específicas). Revise em "Propostas de Mercado" ou ajuste segmento/região.'
        )
        return
      }
      const html = gerarHtmlEstudoEssencial(dados)
      const janela = window.open('', '_blank')
      janela.document.write(html)
      janela.document.close()
      setMostrarContexto(false)
    } catch (err) {
      alert(`Erro ao gerar o Estudo Essencial: ${err.message}`)
    } finally {
      setGerando(false)
    }
  }

  if (!mostrarContexto) {
    return (
      <button className={className} onClick={() => setMostrarContexto(true)} disabled={propostasConfirmadasCount === 0}>
        📊 Gerar Estudo Essencial{propostasConfirmadasCount ? ` (${propostasConfirmadasCount})` : ''}
      </button>
    )
  }

  return (
    <div className="ls-card" style={{ padding: '0.75rem', display: 'inline-block' }}>
      <p className="config-instrucao" style={{ marginTop: 0 }}>
        Informe o segmento/região do cliente para o Smart Quote escolher a regra de preço certa — sem isso, só regras sem
        restrição de segmento/região entram no comparativo.
      </p>
      <div className="cotacao-form-linha">
        <div>
          <label>Segmento (opcional)</label>
          <input value={segmento} onChange={(e) => setSegmento(e.target.value)} placeholder="Ex: MEI, ME, PME..." />
        </div>
        <div>
          <label>Região (opcional)</label>
          <input value={regiao} onChange={(e) => setRegiao(e.target.value)} placeholder="Ex: SP, Interior..." />
        </div>
      </div>
      <div className="ls-modal-acoes">
        <button className="ls-btn ls-btn-ghost" onClick={() => setMostrarContexto(false)}>Cancelar</button>
        <button className="ls-btn ls-btn-primary" onClick={handleGerar} disabled={gerando}>
          {gerando ? 'Gerando...' : 'Confirmar e Gerar'}
        </button>
      </div>
    </div>
  )
}
