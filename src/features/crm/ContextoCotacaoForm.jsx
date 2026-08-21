import { useEffect, useRef, useState } from 'react'
import { buscarFaixasEtariasDisponiveis, buscarRegioesTarifariasDisponiveis } from '../../lib/crm/motorSmartQuoteService'
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
 * foi necessária em `multicalculoCotacaoService.js` nem no formato
 * salvo no rascunho da Fase 1 — só a forma de PREENCHER esse array
 * mudou aqui dentro.
 *
 * Sprint 3b (21/08) — Região virou SELECT direto pelo `regiao_id` real
 * do banco, não mais texto digitado. Achado real (20/08): mesmo com
 * autocomplete + resolução por nome sem acento, ainda existia uma
 * categoria inteira de risco (nome duplicado, região órfã aparecendo
 * na lista, digitação) só por depender de comparar TEXTO em algum
 * ponto do fluxo. Decisão do usuário: eliminar isso de vez — o valor
 * que sai daqui e viaja por todo o wizard é sempre o `id` (uuid), nunca
 * mais o nome. `onContinuar` agora devolve `regiaoId` (novo, é o que o
 * motor usa pra buscar) + `regiaoNome` (só pra exibição em telas
 * seguintes, tipo "Nenhum plano elegível para Jundiaí").
 */
export default function ContextoCotacaoForm({ clienteProspectId, onContinuar }) {
  const [regiaoId, setRegiaoId] = useState('')
  const [quantidadesPorFaixa, setQuantidadesPorFaixa] = useState(new Map())
  const [faixasDisponiveis, setFaixasDisponiveis] = useState([])
  const [regioesDisponiveis, setRegioesDisponiveis] = useState([])
  const [carregandoFaixas, setCarregandoFaixas] = useState(true)
  const [carregandoRegioes, setCarregandoRegioes] = useState(true)
  const [erro, setErro] = useState(null)
  const [rascunhoRestaurado, setRascunhoRestaurado] = useState(false)
  const [erroSalvandoRascunho, setErroSalvandoRascunho] = useState(false)

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
    buscarRegioesTarifariasDisponiveis()
      .then(setRegioesDisponiveis)
      .catch((err) => setErro(`Erro carregando regiões: ${err.message}`))
      .finally(() => setCarregandoRegioes(false))
  }, [])

  useEffect(() => {
    if (!clienteProspectId) {
      prontoParaAutosave.current = true
      return
    }
    buscarRascunhoMulticalculo(clienteProspectId)
      .then((rascunho) => {
        if (rascunho?.contexto?.faixasEtariasDasVidas?.length) {
          // ACHADO (21/08): se clienteProspectId chegar atrasado (cliente
          // ainda carregando no componente pai), esse efeito roda de novo
          // quando o ID "chega de verdade" — e sem essa trava, sobrescrevia
          // o que o corretor já tinha digitado nesse meio-tempo com o
          // rascunho salvo antes ("mudou sozinho"). Só restaura se o
          // formulário ainda estiver intocado (nada digitado ainda) —
          // depois que o corretor mexeu em algo, a restauração nunca mais
          // pisa em cima.
          const formularioAindaIntocado = !regiaoId && quantidadesPorFaixa.size === 0
          if (!formularioAindaIntocado) return

          // Rascunhos antigos (antes de 21/08) só têm regiaoNome salvo,
          // não regiaoId — restaura pelo nome nesse caso, sem quebrar
          // rascunhos já existentes.
          if (rascunho.contexto.regiaoId) {
            setRegiaoId(rascunho.contexto.regiaoId)
          }
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clienteProspectId])

  useEffect(() => {
    if (!prontoParaAutosave.current || !clienteProspectId) return
    const temAlgoPraSalvar = regiaoId || quantidadesPorFaixa.size > 0
    if (!temAlgoPraSalvar) return

    if (timeoutAutosave.current) clearTimeout(timeoutAutosave.current)
    timeoutAutosave.current = setTimeout(() => {
      const regiaoEscolhida = regioesDisponiveis.find((r) => r.id === regiaoId)
      salvarContextoRascunho({
        clienteProspectId,
        contexto: {
          regiaoId: regiaoId || null,
          regiaoNome: regiaoEscolhida?.nome ?? null,
          faixasEtariasDasVidas: expandirParaArrayPlano(quantidadesPorFaixa),
        },
      })
        .then(() => setErroSalvandoRascunho(false))
        .catch((err) => {
          // ACHADO (21/08): antes, uma falha aqui era 100% silenciosa (só
          // console.error) — o corretor digitava, achava que tinha salvo,
          // e só descobria que não salvou ao dar F5 depois. Agora mostra
          // um aviso discreto sem interromper o preenchimento.
          console.error('Erro salvando rascunho do contexto:', err.message)
          setErroSalvandoRascunho(true)
        })
    }, 800)

    return () => clearTimeout(timeoutAutosave.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [regiaoId, quantidadesPorFaixa, clienteProspectId, regioesDisponiveis])

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
    if (!regiaoId) {
      setErro('Selecione a região da cotação.')
      return
    }
    if (totalVidas === 0) {
      setErro('Informe ao menos 1 vida em alguma faixa etária.')
      return
    }
    setErro(null)
    const regiaoEscolhida = regioesDisponiveis.find((r) => r.id === regiaoId)
    onContinuar({
      regiaoId,
      regiaoNome: regiaoEscolhida?.nome ?? null,
      faixasEtariasDasVidas: expandirParaArrayPlano(quantidadesPorFaixa),
    })
  }

  return (
    <div className="contexto-cotacao-form">
      {rascunhoRestaurado && (
        <p className="contexto-cotacao-rascunho-aviso">Rascunho salvo restaurado — confira antes de continuar.</p>
      )}
      {erroSalvandoRascunho && (
        <p className="ls-modal-erro">
          Não consegui salvar o rascunho agora — seu preenchimento continua na tela, mas pode se perder se você sair sem
          concluir. Pode continuar preenchendo.
        </p>
      )}

      <div className="contexto-cotacao-linha">
        <label>
          Região
          <select value={regiaoId} onChange={(e) => setRegiaoId(e.target.value)} disabled={carregandoRegioes}>
            <option value="">{carregandoRegioes ? 'Carregando regiões...' : 'Selecione a região...'}</option>
            {regioesDisponiveis.map((r) => (
              <option key={r.id} value={r.id}>
                {r.nome}
              </option>
            ))}
          </select>
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
