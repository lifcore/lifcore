import { useEffect, useState } from 'react'
import { buscarFaixasEtariasDisponiveis } from '../../lib/crm/motorSmartQuoteService'
import './contextoCotacao.css'

/**
 * Sprint 3, Passo 1 — Contexto da Cotação.
 *
 * Só coleta o que o motor (2A/2C) precisa pra buscar planos: região e
 * composição de vidas (1 faixa etária por vida). As faixas do seletor
 * vêm DIRETO do banco (`buscarFaixasEtariasDisponiveis`) — nunca um
 * array fixo — porque o formato já varia entre fonte e resto do app
 * (achado registrado: "00-18" no Lifcare vs "0 a 18" na Biblioteca).
 *
 * Este componente só devolve o contexto pronto via `onContinuar` —
 * não decide operadora, não busca plano, não calcula preço. Isso é
 * responsabilidade dos passos seguintes (2 em diante).
 */
export default function ContextoCotacaoForm({ onContinuar }) {
  const [regiaoNome, setRegiaoNome] = useState('')
  const [vidas, setVidas] = useState([{ id: crypto.randomUUID(), faixaEtaria: '' }])
  const [faixasDisponiveis, setFaixasDisponiveis] = useState([])
  const [carregandoFaixas, setCarregandoFaixas] = useState(true)
  const [erro, setErro] = useState(null)

  useEffect(() => {
    buscarFaixasEtariasDisponiveis()
      .then(setFaixasDisponiveis)
      .catch((err) => setErro(`Erro carregando faixas etárias: ${err.message}`))
      .finally(() => setCarregandoFaixas(false))
  }, [])

  function adicionarVida() {
    setVidas((atual) => [...atual, { id: crypto.randomUUID(), faixaEtaria: '' }])
  }

  function removerVida(id) {
    setVidas((atual) => (atual.length > 1 ? atual.filter((v) => v.id !== id) : atual))
  }

  function atualizarFaixaDaVida(id, faixaEtaria) {
    setVidas((atual) => atual.map((v) => (v.id === id ? { ...v, faixaEtaria } : v)))
  }

  function handleContinuar() {
    if (!regiaoNome.trim()) {
      setErro('Informe a região da cotação.')
      return
    }
    if (vidas.some((v) => !v.faixaEtaria)) {
      setErro('Selecione a faixa etária de todas as vidas antes de continuar.')
      return
    }
    setErro(null)
    onContinuar({
      regiaoNome: regiaoNome.trim(),
      faixasEtariasDasVidas: vidas.map((v) => v.faixaEtaria),
    })
  }

  return (
    <div className="contexto-cotacao-form">
      <div className="contexto-cotacao-linha">
        <label>
          Região
          <input
            type="text"
            placeholder="Ex: Jundiaí"
            value={regiaoNome}
            onChange={(e) => setRegiaoNome(e.target.value)}
          />
        </label>
      </div>

      <div className="contexto-cotacao-vidas">
        <div className="contexto-cotacao-vidas-cabecalho">
          <span>Composição de vidas ({vidas.length})</span>
        </div>

        {vidas.map((vida, index) => (
          <div key={vida.id} className="contexto-cotacao-vida-linha">
            <span className="contexto-cotacao-vida-numero">{index + 1}</span>
            <select
              value={vida.faixaEtaria}
              onChange={(e) => atualizarFaixaDaVida(vida.id, e.target.value)}
              disabled={carregandoFaixas}
            >
              <option value="">{carregandoFaixas ? 'Carregando faixas...' : 'Selecione a faixa etária'}</option>
              {faixasDisponiveis.map((faixa) => (
                <option key={faixa} value={faixa}>
                  {faixa}
                </option>
              ))}
            </select>
            {vidas.length > 1 && (
              <button className="ls-btn ls-btn-ghost contexto-cotacao-remover-vida" onClick={() => removerVida(vida.id)}>
                ✕
              </button>
            )}
          </div>
        ))}

        <button className="ls-btn ls-btn-ghost contexto-cotacao-add-vida" onClick={adicionarVida}>
          + Adicionar vida
        </button>
      </div>

      {erro && <p className="ls-modal-erro">{erro}</p>}

      <div className="ls-modal-acoes">
        <button className="ls-btn ls-btn-primary" onClick={handleContinuar}>
          Buscar planos
        </button>
      </div>
    </div>
  )
}
