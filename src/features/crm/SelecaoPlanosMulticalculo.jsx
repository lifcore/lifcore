import { useEffect, useState } from 'react'
import { montarCotacaoEstruturada } from '../../lib/crm/motorSmartQuoteService'
import { criarCotacoesDoMulticalculo } from '../../lib/crm/multicalculoCotacaoService'
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
 */
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

  useEffect(() => {
    let ativo = true
    setCarregando(true)
    setErro(null)
    montarCotacaoEstruturada({ regiaoNome, operadoraCodigos })
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
  }, [regiaoNome, JSON.stringify(operadoraCodigos)])

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

  const nomesOperadoras = Object.keys(cotacao?.operadoras ?? {})

  if (nomesOperadoras.length === 0) {
    return (
      <p className="selecao-planos-status">
        Nenhum plano ativo encontrado para {regiaoNome ?? 'essa região'}
        {operadoraCodigos?.length ? ` nas operadoras selecionadas` : ''}.
      </p>
    )
  }

  return (
    <div className="selecao-planos-multicalculo">
      {nomesOperadoras.map((nomeOperadora) => (
        <section key={nomeOperadora} className="selecao-planos-operadora">
          <h3 className="selecao-planos-operadora-titulo">{nomeOperadora}</h3>

          <div className="selecao-planos-grid">
            {cotacao.operadoras[nomeOperadora].planos.map((plano) => (
              <PlanoCard
                key={plano.planoId}
                plano={plano}
                selecionado={selecionados.has(plano.planoId)}
                onSelecionar={() => alternarSelecao(plano.planoId)}
                segmentacaoEscolhida={segmentacaoPorPlano.get(plano.planoId) ?? null}
                onEscolherSegmentacao={(texto) => escolherSegmentacao(plano.planoId, texto)}
              />
            ))}
          </div>
        </section>
      ))}

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

/** 1 card por plano — resumo do que o motor já trouxe, sem calcular nada novo. */
function PlanoCard({ plano, selecionado, onSelecionar, segmentacaoEscolhida, onEscolherSegmentacao }) {
  const temMultiplasSegmentacoes = plano.precosPorSegmentacao.length > 1

  // "A partir de" = menor valor entre TODAS as segmentações/faixas —
  // só referência visual até uma segmentação ser escolhida. Depois de
  // escolhida, mostra a soma real dessa segmentação específica.
  const menorValor = plano.precosPorSegmentacao
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
          {plano.precosPorSegmentacao.map((g) => (
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
