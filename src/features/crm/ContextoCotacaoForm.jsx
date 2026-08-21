import { useEffect, useRef, useState } from 'react'
import { buscarFaixasEtariasDisponiveis } from '../../lib/crm/motorSmartQuoteService'
import { buscarRascunhoMulticalculo, salvarContextoRascunho } from '../../lib/crm/multicalculoRascunhoService'
import './contextoCotacao.css'

/**
 * Sprint 3, Passo 1 — Contexto da Cotação.
 *
 * Só coleta o que o motor (2A/2C) precisa pra buscar planos: região e
 * composição de vidas. As faixas do seletor vêm DIRETO do banco
 * (`buscarFaixasEtariasDisponiveis`) — nunca um array fixo — porque o
 * formato já varia entre fonte e resto do app (achado registrado:
 * "00-18" no Lifcare vs "0 a 18" na Biblioteca).
 *
 * Este componente só devolve o contexto pronto via `onContinuar` —
 * não decide operadora, não busca plano, não calcula preço. Isso é
 * responsabilidade dos passos seguintes (2 em diante).
 *
 * Sprint 3, Fase 1 (20/08) — rascunho persistido: ao montar, tenta
 * restaurar região + vidas de um rascunho salvo (`multicalculo_rascunhos`).
 * Enquanto o corretor mexe no formulário, salva de novo (com atraso,
 * pra não gravar a cada tecla). O corretor ainda precisa clicar em
 * "Buscar planos" pra continuar — restaurar só preenche o formulário,
 * nunca pula etapa sozinho.
 *
 * Sprint 3, Fase 2 (20/08) — card de vidas por faixa virou QUANTIDADE
 * AGREGADA (1 campo numérico por faixa etária), não mais 1 linha por
 * vida individual com seletor próprio. Motivo: corretor real digita
 * "10 vidas na faixa X" em 1 campo, não clica "+ adicionar vida" 10
 * vezes escolhendo a mesma faixa repetidamente.
 *
 * O CONTRATO EXTERNO NÃO MUDOU — `onContinuar` continua devolvendo
 * `faixasEtariasDasVidas` como array plano (1 item por vida, faixa
 * repetida N vezes), exatamente como antes. Por isso nenhuma mudança
 * foi necessária em `SelecaoPlanosMulticalculo.jsx`,
 * `multicalculoCotacaoService.js` nem no formato salvo no rascunho da
 * Fase 1 — só a forma de PREENCHER esse array mudou aqui dentro.
 */
export default function ContextoCotacaoForm({ clienteProspectId, onContinuar }) {
  const [regiaoNome, setRegiaoNome] = useState('')
  const [quantidadesPorFaixa, setQuantidadesPorFaixa] = useState(new Map())
  const [faixasDisponiveis, setFaixasDisponiveis] = useState([])
  const [carregandoFaixas, setCarregandoFaixas] = useState(true)
  const [erro, setErro] = useState(null)
  const [rascunhoRestaurado, setRascunhoRestaurado] = useState(false)

  // Só liga o autosave DEPOIS da tentativa de restaurar terminar — sem
  // isso, o primeiro render (formulário vazio) salvaria por cima de um
  // rascunho que ainda nem terminou de carregar.
  const prontoParaAutosave = useRef(false)
  const timeoutAutosave = useRef(null)

  useEffect(() => {
    buscarFaixasEtariasDisponiveis()
      .then(setFaixasDisponiveis)
      .catch((err) => setErro(`Erro carregando faixas etárias: ${err.message}`))
      .finally(() => setCarregandoFaixas(false))
  }, [])

  useEffect(() => {
    if (!clienteProspectId) {
      prontoParaAutosave.current = true
      return
    }
    buscarRascunhoMulticalculo(clienteProspectId)
      .then((rascunho) => {
        if (rascunho?.contexto?.faixasEtariasDasVidas?.length) {
          setRegiaoNome(rascunho.contexto.regiaoNome ?? '')
          // Array plano salvo (1 item por vida) → agrega de volta em
          // quantidade por faixa, pro campo numérico ser preenchido.
          const mapa = new Map()
          for (const faixa of rascunho.contexto.faixasEtariasDasVidas) {
            mapa.set(faixa, (mapa.get(faixa) ?? 0) + 1)
          }
          setQuantidadesPorFaixa(mapa)
          setRascunhoRestaurado(true)
        }
      })
      .catch((err) => setErro(`Erro carregando rascunho salvo: ${err.message}`))
      .finally(() => {
        prontoParaAutosave.current = true
      })
  }, [clienteProspectId])

  useEffect(() => {
    if (!prontoParaAutosave.current || !clienteProspectId) return
    const temAlgoPraSalvar = regiaoNome.trim() || quantidadesPorFaixa.size > 0
    if (!temAlgoPraSalvar) return

    if (timeoutAutosave.current) clearTimeout(timeoutAutosave.current)
    timeoutAutosave.current = setTimeout(() => {
      salvarContextoRascunho({
        clienteProspectId,
        contexto: { regiaoNome: regiaoNome.trim(), faixasEtariasDasVidas: expandirParaArrayPlano(quantidadesPorFaixa) },
      }).catch((err) => console.error('Erro salvando rascunho do contexto:', err.message))
    }, 800)

    return () => clearTimeout(timeoutAutosave.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [regiaoNome, quantidadesPorFaixa, clienteProspectId])

  function atualizarQuantidade(faixa, valorDigitado) {
    const quantidade = Math.max(0, Math.floor(Number(valorDigitado) || 0))
    setQuantidadesPorFaixa((atual) => {
      const novo = new Map(atual)
      if (quantidade === 0) novo.delete(faixa)
      else novo.set(faixa, quantidade)
      return novo
    })
  }

  const totalVidas = [...quantidadesPorFaixa.values()].reduce((soma, qtd) => soma + qtd, 0)

  function handleContinuar() {
    if (!regiaoNome.trim()) {
      setErro('Informe a região da cotação.')
      return
    }
    if (totalVidas === 0) {
      setErro('Informe ao menos 1 vida em alguma faixa etária.')
      return
    }
    setErro(null)
    onContinuar({
      regiaoNome: regiaoNome.trim(),
      faixasEtariasDasVidas: expandirParaArrayPlano(quantidadesPorFaixa),
    })
  }

  return (
    <div className="contexto-cotacao-form">
      {rascunhoRestaurado && (
        <p className="contexto-cotacao-rascunho-aviso">Rascunho salvo restaurado — confira antes de continuar.</p>
      )}

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
          <span>Composição de vidas ({totalVidas})</span>
        </div>

        {carregandoFaixas ? (
          <p className="selecao-planos-status">Carregando faixas etárias...</p>
        ) : (
          faixasDisponiveis.map((faixa) => (
            <div key={faixa} className="contexto-cotacao-faixa-linha">
              <span className="contexto-cotacao-faixa-label">{faixa}</span>
              <input
                type="number"
                min="0"
                inputMode="numeric"
                className="contexto-cotacao-faixa-quantidade"
                value={quantidadesPorFaixa.get(faixa) ?? 0}
                onChange={(e) => atualizarQuantidade(faixa, e.target.value)}
              />
            </div>
          ))
        )}
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

/** Converte {faixa: quantidade} num array plano (1 item por vida, faixa
 *  repetida N vezes) — é o formato que `onContinuar`/o rascunho/o resto
 *  do wizard já esperam, sem precisar mudar mais nada. */
function expandirParaArrayPlano(quantidadesPorFaixa) {
  const array = []
  for (const [faixa, quantidade] of quantidadesPorFaixa) {
    for (let i = 0; i < quantidade; i++) array.push(faixa)
  }
  return array
}
