import { useEffect, useRef, useState } from 'react'
import { montarCotacaoEstruturada } from '../../lib/crm/motorSmartQuoteService'
import { criarCotacoesDoMulticalculo } from '../../lib/crm/multicalculoCotacaoService'
import { buscarRascunhoMulticalculo, salvarSelecoesRascunho } from '../../lib/crm/multicalculoRascunhoService'
import './selecaoPlanosMulticalculo.css'

/**
 * Sprint 2D/3 — Seleção de planos (Multicálculo).
 *
 * Consome o retorno de `motorSmartQuoteService.js` (2A/2C) — nenhuma
 * lógica nova de elegibilidade, preço, rede ou regras aqui. A única
 * decisão que ESTE componente introduz é: qual segmentação de preço
 * (contexto de vidas/MEI/coparticipação) se aplica a cada plano — e
 * mesmo essa decisão NUNCA é automática quando há mais de uma opção,
 * é sempre o corretor escolhendo num seletor (nota em
 * motorSmartQuoteService.js sobre `segmentacao` ser texto livre).
 *
 * "Preparar comparação" agora cria as Cotações de verdade
 * (`criarCotacoesDoMulticalculo`) — reaproveita 100% do Ciclo
 * Comercial já existente (mesmo `criarCotacao`, mesmo
 * `grupo_comparacao_id` que `recusarSiblingsDoGrupo` já usa). Depois
 * de criar, quem mostra o resultado é o card de Cotações que já existe
 * em `ClienteDetailPage.jsx` — este componente não duplica essa UI.
 *
 * Sprint 3, Fase 1 (20/08) — rascunho persistido: assim que os planos
 * terminam de carregar, tenta restaurar quais estavam marcados e qual
 * segmentação foi escolhida pra cada um (rascunho salvo em
 * `multicalculo_rascunhos`, Passo 1 fica em ContextoCotacaoForm). Plano
 * que não existe mais na busca atual (região mudou, etc.) é ignorado
 * silenciosamente — nunca falha por isso. Salva de novo (com atraso) a
 * cada seleção ou escolha de segmentação. O rascunho inteiro é apagado
 * só quando `criarCotacoesDoMulticalculo` cria as Cotações de verdade.
 *
 * Sprint 3, Fase 3b (20/08) — elegibilidade por vidas: `totalVidas` (soma
 * das faixas etárias do Passo 1) vai direto pro motor, que já devolve só
 * operadoras/planos com pelo menos 1 segmentação elegível — nenhum
 * filtro novo aqui, só repassa o parâmetro. Acima de 99 vidas, o motor
 * devolve `motivoBloqueio` em vez de lista vazia sem explicação.
 *
 * Sprint 3, Fase 3b sub-2 (20/08) — blocos visuais (Acomodação/
 * Coparticipação), pedido do Chief: "blocos são navegação, nunca filtro
 * irreversível". Os dois toggles abaixo SÓ decidem o que aparece na
 * tela — nunca tocam em `selecionados`/`segmentacaoPorPlano`. Por isso um
 * plano marcado continua contando pro "Criar Cotações" mesmo escondido
 * atrás de outro bloco, e a segmentação já escolhida nunca some do
 * seletor do card, mesmo que o filtro de coparticipação atual não bata
 * com ela — só entra escondida junto das outras opções que não batem.
 */
function classificarAcomodacao(acomodacao) {
  const texto = (acomodacao || '').toLowerCase()
  if (texto.includes('enf')) return 'Enfermaria'
  if (texto.includes('quarto') || texto.includes('apart') || texto.includes('apto')) return 'Apartamento'
  return 'Outra'
}

const OPCOES_COPARTICIPACAO = ['Todas', 'Sem Coparticipação', 'Parcial', 'Completa']
export default function SelecaoPlanosMulticalculo({
  clienteProspectId,
  regiaoNome,
  operadoraCodigos = null,
  faixasEtariasDasVidas,
  onCotacoesCriadas,
}) {
  const [cotacao, setCotacao] = useState(null)
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState(null)
  const [selecionados, setSelecionados] = useState(new Set())
  const [segmentacaoPorPlano, setSegmentacaoPorPlano] = useState(new Map())
  const [criando, setCriando] = useState(false)
  const [filtroAcomodacao, setFiltroAcomodacao] = useState('Todas')
  const [filtroCoparticipacao, setFiltroCoparticipacao] = useState('Todas')

  const totalVidas = faixasEtariasDasVidas?.length ?? null

  // Restaura só 1 vez por montagem do componente, assim que os planos
  // terminarem de carregar — sem isso, o autosave (mais abaixo) salvaria
  // um estado vazio por cima do rascunho antes dele ser lido.
  const restaurouRascunho = useRef(false)
  const timeoutAutosave = useRef(null)

  useEffect(() => {
    let ativo = true
    setCarregando(true)
    setErro(null)
    montarCotacaoEstruturada({ regiaoNome, operadoraCodigos, totalVidas })
      .then((resultado) => {
        if (ativo) setCotacao(resultado)
      })
      .catch((err) => {
        if (ativo) setErro(err.message)
      })
      .finally(() => {
        if (ativo) setCarregando(false)
      })
    return () => {
      ativo = false
    }
  }, [regiaoNome, JSON.stringify(operadoraCodigos), totalVidas])

  useEffect(() => {
    if (carregando || !cotacao || restaurouRascunho.current || !clienteProspectId) return
    restaurouRascunho.current = true

    buscarRascunhoMulticalculo(clienteProspectId)
      .then((rascunho) => {
        if (!rascunho?.selecoes?.length) return
        const novosSelecionados = new Set()
        const novaSegmentacaoPorPlano = new Map()
        for (const item of rascunho.selecoes) {
          const plano = planoPorId(item.planoId)
          if (!plano) continue // plano não existe mais nessa busca — ignora, sem erro
          novosSelecionados.add(item.planoId)
          if (item.segmentacao) {
            const grupo = plano.precosPorSegmentacao.find((g) => g.segmentacao === item.segmentacao)
            if (grupo) novaSegmentacaoPorPlano.set(item.planoId, grupo)
          }
        }
        if (novosSelecionados.size > 0) {
          setSelecionados(novosSelecionados)
          setSegmentacaoPorPlano(novaSegmentacaoPorPlano)
        }
      })
      .catch((err) => console.error('Erro carregando rascunho de seleções:', err.message))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [carregando, cotacao, clienteProspectId])

  useEffect(() => {
    if (!restaurouRascunho.current || !clienteProspectId) return
    if (timeoutAutosave.current) clearTimeout(timeoutAutosave.current)
    timeoutAutosave.current = setTimeout(() => {
      const selecoesParaSalvar = [...selecionados].map((planoId) => ({
        planoId,
        segmentacao: segmentacaoPorPlano.get(planoId)?.segmentacao ?? null,
      }))
      salvarSelecoesRascunho({ clienteProspectId, selecoes: selecoesParaSalvar }).catch((err) =>
        console.error('Erro salvando rascunho de seleções:', err.message)
      )
    }, 800)
    return () => clearTimeout(timeoutAutosave.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selecionados, segmentacaoPorPlano, clienteProspectId])

  function planoPorId(planoId) {
    for (const operadora of Object.values(cotacao?.operadoras ?? {})) {
      const achado = operadora.planos.find((p) => p.planoId === planoId)
      if (achado) return achado
    }
    return null
  }

  function alternarSelecao(planoId) {
    setSelecionados((atual) => {
      const novo = new Set(atual)
      if (novo.has(planoId)) {
        novo.delete(planoId)
      } else {
        novo.add(planoId)
        // se o plano só tem 1 segmentação, já pré-seleciona (sem
        // ambiguidade nenhuma) — se tiver mais de 1, fica sem escolha
        // até o corretor decidir no seletor do card
        const plano = planoPorId(planoId)
        if (plano?.precosPorSegmentacao.length === 1) {
          setSegmentacaoPorPlano((mapa) => new Map(mapa).set(planoId, plano.precosPorSegmentacao[0]))
        }
      }
      return novo
    })
  }

  function escolherSegmentacao(planoId, segmentacaoTexto) {
    const plano = planoPorId(planoId)
    const grupo = plano?.precosPorSegmentacao.find((g) => g.segmentacao === segmentacaoTexto) ?? null
    setSegmentacaoPorPlano((mapa) => {
      const novo = new Map(mapa)
      if (grupo) novo.set(planoId, grupo)
      else novo.delete(planoId)
      return novo
    })
  }

  const todasSegmentacoesEscolhidas = [...selecionados].every((id) => segmentacaoPorPlano.has(id))

  async function handlePreparar() {
    if (!clienteProspectId) {
      setErro('Cliente não identificado — não é possível criar a Cotação.')
      return
    }
    const selecoes = [...selecionados].map((planoId) => ({
      plano: planoPorId(planoId),
      grupoSegmentacao: segmentacaoPorPlano.get(planoId),
    }))

    setCriando(true)
    setErro(null)
    try {
      const resultado = await criarCotacoesDoMulticalculo({
        clienteProspectId,
        selecoes,
        faixasEtariasDasVidas,
      })
      onCotacoesCriadas?.(resultado)
    } catch (err) {
      setErro(err.message)
    } finally {
      setCriando(false)
    }
  }

  if (carregando) {
    return <p className="selecao-planos-status">Buscando planos na Biblioteca de Mercado...</p>
  }

  if (erro) {
    return <p className="ls-modal-erro">{erro}</p>
  }

  if (cotacao?.motivoBloqueio) {
    return <p className="ls-modal-erro">{cotacao.motivoBloqueio}</p>
  }

  const nomesOperadoras = Object.keys(cotacao?.operadoras ?? {})

  if (nomesOperadoras.length === 0) {
    return (
      <p className="selecao-planos-status">
        Nenhum plano elegível encontrado para {regiaoNome ?? 'essa região'}
        {totalVidas != null ? ` com ${totalVidas} vida${totalVidas === 1 ? '' : 's'}` : ''}
        {operadoraCodigos?.length ? ` nas operadoras selecionadas` : ''}.
      </p>
    )
  }

  return (
    <div className="selecao-planos-multicalculo">
      <div className="selecao-planos-blocos">
        <div className="selecao-planos-bloco-grupo">
          <span className="selecao-planos-bloco-label">Acomodação</span>
          <div className="selecao-planos-bloco-toggle">
            {['Todas', 'Enfermaria', 'Apartamento'].map((opcao) => (
              <button
                key={opcao}
                type="button"
                className={`selecao-planos-bloco-btn${filtroAcomodacao === opcao ? ' selecao-planos-bloco-btn-ativo' : ''}`}
                onClick={() => setFiltroAcomodacao(opcao)}
              >
                {opcao}
              </button>
            ))}
          </div>
        </div>
        <div className="selecao-planos-bloco-grupo">
          <span className="selecao-planos-bloco-label">Coparticipação</span>
          <div className="selecao-planos-bloco-toggle">
            {OPCOES_COPARTICIPACAO.map((opcao) => (
              <button
                key={opcao}
                type="button"
                className={`selecao-planos-bloco-btn${filtroCoparticipacao === opcao ? ' selecao-planos-bloco-btn-ativo' : ''}`}
                onClick={() => setFiltroCoparticipacao(opcao)}
              >
                {opcao}
              </button>
            ))}
          </div>
        </div>
      </div>

      {nomesOperadoras.map((nomeOperadora) => {
        // Filtro é só de EXIBIÇÃO — nunca mexe em selecionados/segmentacaoPorPlano.
        const planosDoBloco = cotacao.operadoras[nomeOperadora].planos
          .filter((plano) => filtroAcomodacao === 'Todas' || classificarAcomodacao(plano.acomodacao) === filtroAcomodacao)
          .map((plano) => {
            const segmentacoesFiltradas =
              filtroCoparticipacao === 'Todas'
                ? plano.precosPorSegmentacao
                : plano.precosPorSegmentacao.filter((g) => g.coparticipacaoTipo === filtroCoparticipacao)
            return { plano, segmentacoesFiltradas }
          })
          .filter(({ segmentacoesFiltradas }) => segmentacoesFiltradas.length > 0)

        if (planosDoBloco.length === 0) return null

        return (
          <section key={nomeOperadora} className="selecao-planos-operadora">
            <h3 className="selecao-planos-operadora-titulo">{nomeOperadora}</h3>

            <div className="selecao-planos-grid">
              {planosDoBloco.map(({ plano, segmentacoesFiltradas }) => (
                <PlanoCard
                  key={plano.planoId}
                  plano={plano}
                  segmentacoesParaMostrar={segmentacoesFiltradas}
                  selecionado={selecionados.has(plano.planoId)}
                  onSelecionar={() => alternarSelecao(plano.planoId)}
                  segmentacaoEscolhida={segmentacaoPorPlano.get(plano.planoId) ?? null}
                  onEscolherSegmentacao={(texto) => escolherSegmentacao(plano.planoId, texto)}
                />
              ))}
            </div>
          </section>
        )
      })}

      {nomesOperadoras.every(
        (nome) =>
          !cotacao.operadoras[nome].planos.some(
            (plano) =>
              (filtroAcomodacao === 'Todas' || classificarAcomodacao(plano.acomodacao) === filtroAcomodacao) &&
              (filtroCoparticipacao === 'Todas' || plano.precosPorSegmentacao.some((g) => g.coparticipacaoTipo === filtroCoparticipacao))
          )
      ) && (
        <p className="selecao-planos-status">
          Nenhum plano bate com esse filtro de Acomodação/Coparticipação — os planos elegíveis continuam selecionados,
          só ajuste os blocos acima pra vê-los de novo.
        </p>
      )}

      <div className="ls-modal-acoes selecao-planos-rodape">
        <span className="selecao-planos-contador">
          {selecionados.size} plano{selecionados.size === 1 ? '' : 's'} selecionado{selecionados.size === 1 ? '' : 's'}
          {selecionados.size > 0 && !todasSegmentacoesEscolhidas && ' — escolha a segmentação de todos antes de continuar'}
        </span>
        <button
          className="ls-btn ls-btn-primary"
          onClick={handlePreparar}
          disabled={selecionados.size === 0 || !todasSegmentacoesEscolhidas || criando}
        >
          {criando ? 'Criando cotações...' : 'Criar Cotações pra comparação'}
        </button>
      </div>
    </div>
  )
}

/** 1 card por plano — resumo do que o motor já trouxe, sem calcular nada novo.
 *  `segmentacoesParaMostrar` já vem filtrada pelo bloco de Coparticipação —
 *  mas se a segmentação JÁ escolhida não estiver nela (corretor trocou de
 *  bloco depois de escolher), ela entra igual no seletor, escondida junto
 *  das outras que não batem no filtro atual — nunca some da tela sozinha. */
function PlanoCard({ plano, segmentacoesParaMostrar, selecionado, onSelecionar, segmentacaoEscolhida, onEscolherSegmentacao }) {
  const opcoesDoSeletor =
    segmentacaoEscolhida && !segmentacoesParaMostrar.some((g) => g.segmentacao === segmentacaoEscolhida.segmentacao)
      ? [segmentacaoEscolhida, ...segmentacoesParaMostrar]
      : segmentacoesParaMostrar

  const temMultiplasSegmentacoes = opcoesDoSeletor.length > 1

  // "A partir de" = menor valor entre as segmentações visíveis no bloco
  // atual — só referência visual até uma ser escolhida.
  const menorValor = opcoesDoSeletor
    .flatMap((g) => g.faixas.map((f) => f.valor))
    .reduce((min, v) => (min === null || v < min ? v : min), null)

  return (
    <div className={`selecao-plano-card${selecionado ? ' selecao-plano-card-ativo' : ''}`}>
      <label className="selecao-plano-card-header">
        <input type="checkbox" checked={selecionado} onChange={onSelecionar} />
        <div>
          <p className="selecao-plano-card-nome">{plano.nome}</p>
          <p className="selecao-plano-card-sub">
            {plano.acomodacao}
            {plano.linha ? ` · ${plano.linha}` : ''}
          </p>
        </div>
      </label>

      {selecionado && temMultiplasSegmentacoes && (
        <select
          className="selecao-plano-card-segmentacao"
          value={segmentacaoEscolhida?.segmentacao ?? ''}
          onChange={(e) => onEscolherSegmentacao(e.target.value)}
        >
          <option value="">Escolha a segmentação (vidas/MEI/coparticipação)...</option>
          {opcoesDoSeletor.map((g) => (
            <option key={g.segmentacao} value={g.segmentacao}>
              {g.segmentacao}
            </option>
          ))}
        </select>
      )}

      <div className="selecao-plano-card-corpo">
        <div className="selecao-plano-card-linha">
          <span>A partir de</span>
          <strong>{menorValor !== null ? `R$ ${menorValor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : '—'}</strong>
        </div>
        <div className="selecao-plano-card-linha">
          <span>Rede credenciada</span>
          <strong>{plano.redeDisponivel.totalPrestadores} prestadores</strong>
        </div>
        <div className="selecao-plano-card-linha">
          <span>Regras disponíveis</span>
          <strong>{plano.regrasDisponiveis.length}</strong>
        </div>
      </div>
    </div>
  )
}
