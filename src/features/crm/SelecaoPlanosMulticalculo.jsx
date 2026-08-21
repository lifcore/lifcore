import { useEffect, useRef, useState } from 'react'
import { montarCotacaoEstruturada, descreverSegmentacao } from '../../lib/crm/motorSmartQuoteService'
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
 * irreversível". Os dois toggles SÓ decidem o que aparece na grade
 * principal — nunca tocam em `selecionados`/`segmentacaoPorPlano`.
 *
 * Sprint 3b (21/08) — REDESENHO: operadoras por colapso + carrinho,
 * ideia do usuário depois de ver 12 operadoras reais na tela (Amil
 * sozinha já passava de 10 cards, virava parede). Duas mudanças de
 * comportamento importantes, combinadas explicitamente com o usuário:
 *
 *   1. Cada operadora agora é uma seção fechada por padrão — clica no
 *      cabeçalho pra abrir/fechar. Não é filtro, é só navegação (não
 *      esconde nada de `selecionados`).
 *   2. Plano ADICIONADO some da grade principal e vai pro carrinho —
 *      só volta pra grade se for removido do carrinho. Por causa disso,
 *      o seletor de segmentação (quando o plano tem mais de 1) MUDOU DE
 *      LUGAR: antes vivia dentro do card da grade, agora vive dentro do
 *      item do carrinho — o card já teria sumido antes do corretor
 *      conseguir escolher, se o seletor continuasse lá.
 *
 * O carrinho é só uma forma nova de MOSTRAR o mesmo estado de sempre
 * (`selecionados` + `segmentacaoPorPlano`) — nenhuma lógica de negócio
 * nova, nenhuma mudança no que é salvo no rascunho ou enviado pro
 * `criarCotacoesDoMulticalculo`.
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
  regiaoId,
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
  const [operadorasExpandidas, setOperadorasExpandidas] = useState(new Set())

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
    montarCotacaoEstruturada({ regiaoId, regiaoNome, operadoraCodigos, totalVidas })
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
  }, [regiaoId, regiaoNome, JSON.stringify(operadoraCodigos), totalVidas])

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

  /** Adiciona ao carrinho — plano some da grade principal a partir daqui. */
  function adicionarAoCarrinho(planoId) {
    setSelecionados((atual) => new Set(atual).add(planoId))
    // Auto-seleciona quando existe só 1 segmentação DENTRO DO BLOCO ATUAL
    // (respeitando o filtro de Coparticipação) — mesma regra de antes.
    const plano = planoPorId(planoId)
    const segmentacoesVisiveis =
      filtroCoparticipacao === 'Todas'
        ? plano?.precosPorSegmentacao ?? []
        : (plano?.precosPorSegmentacao ?? []).filter((g) => g.coparticipacaoTipo === filtroCoparticipacao)
    if (segmentacoesVisiveis.length === 1) {
      setSegmentacaoPorPlano((mapa) => new Map(mapa).set(planoId, segmentacoesVisiveis[0]))
    }
  }

  /** Remove do carrinho — plano volta a aparecer na grade principal. */
  function removerDoCarrinho(planoId) {
    setSelecionados((atual) => {
      const novo = new Set(atual)
      novo.delete(planoId)
      return novo
    })
    setSegmentacaoPorPlano((mapa) => {
      const novo = new Map(mapa)
      novo.delete(planoId)
      return novo
    })
  }

  function alternarOperadoraExpandida(nomeOperadora) {
    setOperadorasExpandidas((atual) => {
      const novo = new Set(atual)
      if (novo.has(nomeOperadora)) novo.delete(nomeOperadora)
      else novo.add(nomeOperadora)
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
        // fluxo de hoje = sempre 1 item só. A Cotação mista (vários
        // itens numa chamada) ainda não tem botão na tela — o service já
        // suporta, a interface pra isso é uma sub-entrega separada.
        itens: [{ faixasEtariasDasVidas, selecoes }],
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

      <Carrinho
        selecionados={selecionados}
        planoPorId={planoPorId}
        segmentacaoPorPlano={segmentacaoPorPlano}
        onRemover={removerDoCarrinho}
        onEscolherSegmentacao={escolherSegmentacao}
        todasSegmentacoesEscolhidas={todasSegmentacoesEscolhidas}
        onCriarCotacoes={handlePreparar}
        criando={criando}
      />

      {nomesOperadoras.map((nomeOperadora) => {
        // Filtros são só de EXIBIÇÃO — nunca mexem em selecionados/
        // segmentacaoPorPlano. Plano JÁ NO CARRINHO nunca aparece aqui,
        // independente do filtro (é assim que não duplica).
        const planosDoBloco = cotacao.operadoras[nomeOperadora].planos
          .filter((plano) => !selecionados.has(plano.planoId))
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

        const expandida = operadorasExpandidas.has(nomeOperadora)

        return (
          <section key={nomeOperadora} className="selecao-planos-operadora">
            <button
              type="button"
              className="selecao-planos-operadora-titulo selecao-planos-operadora-toggle"
              onClick={() => alternarOperadoraExpandida(nomeOperadora)}
              aria-expanded={expandida}
            >
              <span className={`selecao-planos-operadora-seta${expandida ? ' selecao-planos-operadora-seta-aberta' : ''}`}>▸</span>
              {nomeOperadora}
              <span className="selecao-planos-operadora-contagem">{planosDoBloco.length} plano{planosDoBloco.length === 1 ? '' : 's'}</span>
            </button>

            {expandida && (
              <div className="selecao-planos-grid">
                {planosDoBloco.map(({ plano, segmentacoesFiltradas }) => (
                  <PlanoCardGrade
                    key={plano.planoId}
                    plano={plano}
                    segmentacoesParaMostrar={segmentacoesFiltradas}
                    onAdicionar={() => adicionarAoCarrinho(plano.planoId)}
                  />
                ))}
              </div>
            )}
          </section>
        )
      })}

      {nomesOperadoras.every(
        (nome) =>
          !cotacao.operadoras[nome].planos.some(
            (plano) =>
              !selecionados.has(plano.planoId) &&
              (filtroAcomodacao === 'Todas' || classificarAcomodacao(plano.acomodacao) === filtroAcomodacao) &&
              (filtroCoparticipacao === 'Todas' || plano.precosPorSegmentacao.some((g) => g.coparticipacaoTipo === filtroCoparticipacao))
          )
      ) &&
        selecionados.size === 0 && (
          <p className="selecao-planos-status">
            Nenhum plano bate com esse filtro de Acomodação/Coparticipação — ajuste os blocos acima pra ver mais opções.
          </p>
        )}

      {erro && <p className="ls-modal-erro">{erro}</p>}
    </div>
  )
}

/** Card da grade principal — SÓ resumo + botão de adicionar. Não tem mais
 *  checkbox nem seletor de segmentação (isso mudou de casa pro carrinho,
 *  ver nota no topo do arquivo) — clicar em qualquer parte do card já
 *  adiciona ao carrinho, sem passo intermediário. */
function PlanoCardGrade({ plano, segmentacoesParaMostrar, onAdicionar }) {
  const menorValor = segmentacoesParaMostrar
    .flatMap((g) => g.faixas.map((f) => f.valor))
    .reduce((min, v) => (min === null || v < min ? v : min), null)

  return (
    <button type="button" className="selecao-plano-card selecao-plano-card-clicavel" onClick={onAdicionar}>
      <div className="selecao-plano-card-header">
        <div>
          <p className="selecao-plano-card-nome">{plano.nome}</p>
          <p className="selecao-plano-card-sub">
            {plano.acomodacao}
            {plano.linha ? ` · ${plano.linha}` : ''}
          </p>
        </div>
      </div>

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

      <span className="selecao-plano-card-adicionar">+ Adicionar</span>
    </button>
  )
}

/** O carrinho — sempre visível, mesmo vazio (pra não sumir e reaparecer
 *  de surpresa). É onde o corretor escolhe a segmentação quando o plano
 *  tem mais de 1 (esse seletor não existe mais na grade principal), e
 *  onde ele remove um plano (única forma de tirar do carrinho — clicar
 *  de novo na grade não funciona mais, porque o plano nem aparece lá
 *  enquanto estiver no carrinho). */
function Carrinho({
  selecionados,
  planoPorId,
  segmentacaoPorPlano,
  onRemover,
  onEscolherSegmentacao,
  todasSegmentacoesEscolhidas,
  onCriarCotacoes,
  criando,
}) {
  const itens = [...selecionados].map((planoId) => ({ planoId, plano: planoPorId(planoId) })).filter((i) => i.plano)

  return (
    <div className="selecao-planos-carrinho">
      <div className="selecao-planos-carrinho-cabecalho">
        <span>
          🛒 {itens.length} plano{itens.length === 1 ? '' : 's'} selecionado{itens.length === 1 ? '' : 's'}
        </span>
        <button
          className="ls-btn ls-btn-primary"
          onClick={onCriarCotacoes}
          disabled={itens.length === 0 || !todasSegmentacoesEscolhidas || criando}
        >
          {criando ? 'Criando cotações...' : 'Criar Cotações pra comparação'}
        </button>
      </div>

      {itens.length === 0 ? (
        <p className="selecao-planos-carrinho-vazio">Nenhum plano no carrinho ainda — clique num plano na lista abaixo pra adicionar.</p>
      ) : (
        <div className="selecao-planos-carrinho-itens">
          {itens.map(({ planoId, plano }) => {
            const segmentacaoEscolhida = segmentacaoPorPlano.get(planoId) ?? null
            const temMultiplasSegmentacoes = plano.precosPorSegmentacao.length > 1

            return (
              <div key={planoId} className="selecao-planos-carrinho-item">
                <div className="selecao-planos-carrinho-item-info">
                  <p className="selecao-planos-carrinho-item-nome">{plano.nome}</p>
                  <p className="selecao-planos-carrinho-item-sub">
                    {plano.operadora} · {plano.acomodacao}
                  </p>
                </div>

                {temMultiplasSegmentacoes ? (
                  <select
                    className="selecao-plano-card-segmentacao"
                    value={segmentacaoEscolhida?.segmentacao ?? ''}
                    onChange={(e) => onEscolherSegmentacao(planoId, e.target.value)}
                  >
                    <option value="">Escolha a segmentação (vidas/MEI/coparticipação)...</option>
                    {plano.precosPorSegmentacao.map((g) => (
                      <option key={g.segmentacao} value={g.segmentacao}>
                        {descreverSegmentacao(g)}
                      </option>
                    ))}
                  </select>
                ) : (
                  <span className="selecao-planos-carrinho-item-segmentacao">
                    {segmentacaoEscolhida ? descreverSegmentacao(segmentacaoEscolhida) : '—'}
                  </span>
                )}

                <button type="button" className="ls-btn ls-btn-ghost selecao-planos-carrinho-remover" onClick={() => onRemover(planoId)}>
                  Remover
                </button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
