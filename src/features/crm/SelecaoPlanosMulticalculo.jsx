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
 * NOTA: o rascunho hoje só cobre o modo normal (1 item) — modo misto
 * ainda não persiste rascunho, ver pendência no fim do arquivo.
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
 *
 * Sprint 3b (21/08, entrega final) — COTAÇÃO MISTA. Aprovada com o
 * usuário: um contrato pode ter grupos de vidas diferentes em planos
 * diferentes (ex: 10 sócios num plano premium, 20 funcionários num
 * plano mais simples). O botão "Cotação mista" liga um modo onde a
 * composição de vidas do Passo 1 vira um BANCO COMPARTILHADO — cada
 * "Item" aloca uma parte desse banco (por faixa etária, igual o Passo 1
 * já faz), e tem seu PRÓPRIO carrinho de planos, elegível só pra vidas
 * que ESSE item tem alocadas. O modo normal (hoje) fica IDÊNTICO, sem
 * nenhuma mudança de comportamento — a mista é um caminho novo,
 * totalmente opcional, ligado por um toggle.
 *
 * Decisão de arquitetura: o modo misto busca a Biblioteca de Mercado
 * UMA VEZ, sem filtro de vidas (`totalVidas: null` pro motor — pega
 * TODAS as segmentações), e filtra por elegibilidade de vidas NO
 * CLIENTE, por item (`segmentacaoElegivelParaVidas`, réplica pequena e
 * deliberada da mesma regra que já existe no motor). Isso evita
 * refazer a busca no banco toda vez que o corretor muda a alocação de
 * um item — só refiltra em memória, instantâneo.
 */
function classificarAcomodacao(acomodacao) {
  const texto = (acomodacao || '').toLowerCase()
  if (texto.includes('enf')) return 'Enfermaria'
  if (texto.includes('quarto') || texto.includes('apart') || texto.includes('apto')) return 'Apartamento'
  return 'Outra'
}

/** Mesma regra de `segmentacaoElegivelPorVidas` no motor — réplica
 *  deliberada pro modo misto filtrar em memória, sem nova busca no
 *  banco a cada alocação. NULL em vidas_min/vidas_max nunca bloqueia
 *  (mesma regra de sempre: "fonte não informou limite" ≠ "não se
 *  aplica"). */
function segmentacaoElegivelParaVidas(grupo, totalVidas) {
  if (totalVidas == null || totalVidas === 0) return false
  if (grupo.vidasMin == null || grupo.vidasMax == null) return true
  return totalVidas >= grupo.vidasMin && totalVidas <= grupo.vidasMax
}

/**
 * Sprint 3b (21/08) — logo da operadora no cabeçalho. `logoFundoChip`
 * vem calculado no banco (luminância real do arquivo, não chutado) —
 * 'claro'/'escuro' colocam um chip atrás pra dar contraste (logo
 * desenhado assumindo fundo branco, texto escuro sumiria no card escuro
 * do app sem isso); 'nenhum' é pra logo autocontido (já tem o fundo da
 * própria marca, tipo o verde da Unimed ou o azul do Care Plus/Hapvida)
 * — nesse caso não põe chip nenhum, só mostra a imagem. Sem `logoUrl`
 * (operadora ainda sem logo cadastrado), não renderiza nada — o nome
 * em texto ao lado já cobre a identificação. */
function LogoOperadora({ logoUrl, logoFundoChip }) {
  if (!logoUrl) return null
  const classeChip =
    logoFundoChip === 'claro'
      ? 'selecao-planos-logo-chip selecao-planos-logo-chip-claro'
      : logoFundoChip === 'escuro'
        ? 'selecao-planos-logo-chip selecao-planos-logo-chip-escuro'
        : 'selecao-planos-logo-chip'
  return (
    <span className={classeChip}>
      <img src={logoUrl} alt="" className="selecao-planos-logo-img" />
    </span>
  )
}

function criarItemMisto() {
  return {
    id: crypto.randomUUID(),
    quantidadesPorFaixa: new Map(),
    selecionados: new Set(),
    segmentacaoPorPlano: new Map(),
    filtroAcomodacao: 'Todas',
    filtroCoparticipacao: 'Todas',
    operadorasExpandidas: new Set(),
  }
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

  // ===== Cotação mista =====
  const [modoMisto, setModoMisto] = useState(false)
  const [cotacaoBruta, setCotacaoBruta] = useState(null) // sem filtro de vidas
  const [carregandoBruta, setCarregandoBruta] = useState(false)
  const [itensMistos, setItensMistos] = useState(() => [criarItemMisto()])
  const [itemAtivoId, setItemAtivoId] = useState(null)

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

  // Busca a Biblioteca de Mercado SEM filtro de vidas, só quando o modo
  // misto é ligado pela primeira vez — cada item filtra em memória a
  // partir daqui (ver nota no topo do arquivo).
  useEffect(() => {
    if (!modoMisto || cotacaoBruta || carregandoBruta) return
    let ativo = true
    setCarregandoBruta(true)
    montarCotacaoEstruturada({ regiaoId, regiaoNome, operadoraCodigos, totalVidas: null })
      .then((resultado) => {
        if (ativo) setCotacaoBruta(resultado)
      })
      .catch((err) => {
        if (ativo) setErro(err.message)
      })
      .finally(() => {
        if (ativo) setCarregandoBruta(false)
      })
    return () => {
      ativo = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modoMisto])

  useEffect(() => {
    if (itensMistos.length > 0 && !itemAtivoId) setItemAtivoId(itensMistos[0].id)
  }, [itensMistos, itemAtivoId])

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
    if (!restaurouRascunho.current || !clienteProspectId || modoMisto) return
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
  }, [selecionados, segmentacaoPorPlano, clienteProspectId, modoMisto])

  function planoPorId(planoId, fonte = cotacao) {
    for (const operadora of Object.values(fonte?.operadoras ?? {})) {
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
        itens: [{ faixasEtariasDasVidas, selecoes }],
      })
      onCotacoesCriadas?.(resultado)
    } catch (err) {
      setErro(err.message)
    } finally {
      setCriando(false)
    }
  }

  // ===== Funções do modo misto =====

  const totalPorFaixaDisponivel = new Map()
  for (const faixa of faixasEtariasDasVidas ?? []) {
    totalPorFaixaDisponivel.set(faixa, (totalPorFaixaDisponivel.get(faixa) ?? 0) + 1)
  }

  function atualizarItemMisto(itemId, atualizador) {
    setItensMistos((atual) => atual.map((item) => (item.id === itemId ? atualizador(item) : item)))
  }

  function alocadoEmOutrosItens(itemId, faixa) {
    let soma = 0
    for (const item of itensMistos) {
      if (item.id === itemId) continue
      soma += item.quantidadesPorFaixa.get(faixa) ?? 0
    }
    return soma
  }

  function disponivelParaItem(itemId, faixa) {
    return (totalPorFaixaDisponivel.get(faixa) ?? 0) - alocadoEmOutrosItens(itemId, faixa)
  }

  function totalVidasDoItem(item) {
    return [...item.quantidadesPorFaixa.values()].reduce((s, q) => s + q, 0)
  }

  function totalNaoAlocado() {
    let soma = 0
    for (const [faixa, total] of totalPorFaixaDisponivel) {
      const alocadoTodos = itensMistos.reduce((s, item) => s + (item.quantidadesPorFaixa.get(faixa) ?? 0), 0)
      soma += Math.max(0, total - alocadoTodos)
    }
    return soma
  }

  function atualizarQuantidadeItem(itemId, faixa, valorDigitado) {
    const max = disponivelParaItem(itemId, faixa)
    const quantidade = Math.max(0, Math.min(max, Math.floor(Number(valorDigitado) || 0)))
    atualizarItemMisto(itemId, (item) => {
      const novo = new Map(item.quantidadesPorFaixa)
      if (quantidade === 0) novo.delete(faixa)
      else novo.set(faixa, quantidade)
      return { ...item, quantidadesPorFaixa: novo }
    })
  }

  function adicionarItemMisto() {
    const novoItem = criarItemMisto()
    setItensMistos((atual) => [...atual, novoItem])
    setItemAtivoId(novoItem.id)
  }

  function removerItemMisto(itemId) {
    setItensMistos((atual) => {
      if (atual.length <= 1) return atual
      const novo = atual.filter((item) => item.id !== itemId)
      if (itemAtivoId === itemId) setItemAtivoId(novo[0].id)
      return novo
    })
  }

  function adicionarAoCarrinhoItem(itemId, planoId) {
    atualizarItemMisto(itemId, (item) => {
      const novoSelecionados = new Set(item.selecionados).add(planoId)
      let novaSegmentacaoPorPlano = item.segmentacaoPorPlano
      const plano = planoPorId(planoId, cotacaoBruta)
      const totalVidasItem = totalVidasDoItem(item)
      const segmentacoesElegiveis = (plano?.precosPorSegmentacao ?? []).filter((g) => segmentacaoElegivelParaVidas(g, totalVidasItem))
      const segmentacoesVisiveis =
        item.filtroCoparticipacao === 'Todas'
          ? segmentacoesElegiveis
          : segmentacoesElegiveis.filter((g) => g.coparticipacaoTipo === item.filtroCoparticipacao)
      if (segmentacoesVisiveis.length === 1) {
        novaSegmentacaoPorPlano = new Map(item.segmentacaoPorPlano).set(planoId, segmentacoesVisiveis[0])
      }
      return { ...item, selecionados: novoSelecionados, segmentacaoPorPlano: novaSegmentacaoPorPlano }
    })
  }

  function removerDoCarrinhoItem(itemId, planoId) {
    atualizarItemMisto(itemId, (item) => {
      const novoSelecionados = new Set(item.selecionados)
      novoSelecionados.delete(planoId)
      const novaSegmentacaoPorPlano = new Map(item.segmentacaoPorPlano)
      novaSegmentacaoPorPlano.delete(planoId)
      return { ...item, selecionados: novoSelecionados, segmentacaoPorPlano: novaSegmentacaoPorPlano }
    })
  }

  function escolherSegmentacaoItem(itemId, planoId, segmentacaoTexto) {
    const plano = planoPorId(planoId, cotacaoBruta)
    const grupo = plano?.precosPorSegmentacao.find((g) => g.segmentacao === segmentacaoTexto) ?? null
    atualizarItemMisto(itemId, (item) => {
      const novo = new Map(item.segmentacaoPorPlano)
      if (grupo) novo.set(planoId, grupo)
      else novo.delete(planoId)
      return { ...item, segmentacaoPorPlano: novo }
    })
  }

  function alternarOperadoraExpandidaItem(itemId, nomeOperadora) {
    atualizarItemMisto(itemId, (item) => {
      const novo = new Set(item.operadorasExpandidas)
      if (novo.has(nomeOperadora)) novo.delete(nomeOperadora)
      else novo.add(nomeOperadora)
      return { ...item, operadorasExpandidas: novo }
    })
  }

  const todosItensProntos = itensMistos.every(
    (item) => item.selecionados.size > 0 && [...item.selecionados].every((id) => item.segmentacaoPorPlano.has(id))
  )
  const podeCriarMista = totalNaoAlocado() === 0 && todosItensProntos && itensMistos.some((item) => item.selecionados.size > 0)

  async function handlePrepararMista() {
    if (!clienteProspectId) {
      setErro('Cliente não identificado — não é possível criar a Cotação.')
      return
    }
    const itens = itensMistos.map((item) => ({
      faixasEtariasDasVidas: [...item.quantidadesPorFaixa.entries()].flatMap(([faixa, qtd]) => Array(qtd).fill(faixa)),
      selecoes: [...item.selecionados].map((planoId) => ({
        plano: planoPorId(planoId, cotacaoBruta),
        grupoSegmentacao: item.segmentacaoPorPlano.get(planoId),
      })),
    }))

    setCriando(true)
    setErro(null)
    try {
      const resultado = await criarCotacoesDoMulticalculo({ clienteProspectId, itens })
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
      <div className="selecao-planos-modo-toggle">
        <button
          type="button"
          className={`selecao-planos-bloco-btn${!modoMisto ? ' selecao-planos-bloco-btn-ativo' : ''}`}
          onClick={() => setModoMisto(false)}
        >
          Cotação única
        </button>
        <button
          type="button"
          className={`selecao-planos-bloco-btn${modoMisto ? ' selecao-planos-bloco-btn-ativo' : ''}`}
          onClick={() => setModoMisto(true)}
        >
          🔀 Cotação mista (planos diferentes por grupo de vidas)
        </button>
      </div>

      {modoMisto ? (
        carregandoBruta || !cotacaoBruta ? (
          <p className="selecao-planos-status">Carregando planos pra montar a cotação mista...</p>
        ) : (
          <ModoMisto
            itensMistos={itensMistos}
            itemAtivoId={itemAtivoId}
            setItemAtivoId={setItemAtivoId}
            cotacaoBruta={cotacaoBruta}
            totalPorFaixaDisponivel={totalPorFaixaDisponivel}
            totalNaoAlocado={totalNaoAlocado()}
            disponivelParaItem={disponivelParaItem}
            totalVidasDoItem={totalVidasDoItem}
            onAtualizarQuantidade={atualizarQuantidadeItem}
            onAdicionarItem={adicionarItemMisto}
            onRemoverItem={removerItemMisto}
            onSetFiltroAcomodacao={(itemId, valor) => atualizarItemMisto(itemId, (item) => ({ ...item, filtroAcomodacao: valor }))}
            onSetFiltroCoparticipacao={(itemId, valor) => atualizarItemMisto(itemId, (item) => ({ ...item, filtroCoparticipacao: valor }))}
            onAlternarOperadora={alternarOperadoraExpandidaItem}
            onAdicionarAoCarrinho={adicionarAoCarrinhoItem}
            onRemoverDoCarrinho={removerDoCarrinhoItem}
            onEscolherSegmentacao={escolherSegmentacaoItem}
            planoPorId={(id) => planoPorId(id, cotacaoBruta)}
            podeCriarMista={podeCriarMista}
            onCriarCotacoesMistas={handlePrepararMista}
            criando={criando}
          />
        )
      ) : (
        <>
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
                  <LogoOperadora logoUrl={cotacao.operadoras[nomeOperadora].logoUrl} logoFundoChip={cotacao.operadoras[nomeOperadora].logoFundoChip} />
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
        </>
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
 *  enquanto estiver no carrinho).
 *
 *  Sprint 3b (21/08) — `mostrarBotaoCriar` (default true) permite
 *  reaproveitar este mesmo componente dentro de cada Item do modo
 *  misto, escondendo o botão de criar (que ali vive 1 vez só, no fim,
 *  depois de todos os itens prontos) sem duplicar toda a lista/visual
 *  do carrinho. */
function Carrinho({
  selecionados,
  planoPorId,
  segmentacaoPorPlano,
  onRemover,
  onEscolherSegmentacao,
  todasSegmentacoesEscolhidas,
  onCriarCotacoes,
  criando,
  mostrarBotaoCriar = true,
  tituloCarrinho,
}) {
  const itens = [...selecionados].map((planoId) => ({ planoId, plano: planoPorId(planoId) })).filter((i) => i.plano)

  return (
    <div className="selecao-planos-carrinho">
      <div className="selecao-planos-carrinho-cabecalho">
        <span>
          🛒 {tituloCarrinho ?? `${itens.length} plano${itens.length === 1 ? '' : 's'} selecionado${itens.length === 1 ? '' : 's'}`}
        </span>
        {mostrarBotaoCriar && (
          <button
            className="ls-btn ls-btn-primary"
            onClick={onCriarCotacoes}
            disabled={itens.length === 0 || !todasSegmentacoesEscolhidas || criando}
          >
            {criando ? 'Criando cotações...' : 'Criar Cotações pra comparação'}
          </button>
        )}
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

/**
 * Sprint 3b (21/08) — modo misto. Abas de "Item" no topo (1 por grupo de
 * vidas/plano), cada uma com: (1) quanto de cada faixa etária esse item
 * aloca do banco compartilhado, limitado ao que sobra depois do que os
 * OUTROS itens já pegaram; (2) blocos de filtro + grade de planos,
 * elegível só pras vidas QUE ESSE ITEM tem alocadas (filtrado em
 * memória a partir de `cotacaoBruta`, sem nova busca no banco); (3) seu
 * próprio carrinho (reaproveita o componente `Carrinho`, sem o botão de
 * criar — esse fica só uma vez, no rodapé, depois de todos os itens
 * prontos).
 */
function ModoMisto({
  itensMistos,
  itemAtivoId,
  setItemAtivoId,
  cotacaoBruta,
  totalPorFaixaDisponivel,
  totalNaoAlocado,
  disponivelParaItem,
  totalVidasDoItem,
  onAtualizarQuantidade,
  onAdicionarItem,
  onRemoverItem,
  onSetFiltroAcomodacao,
  onSetFiltroCoparticipacao,
  onAlternarOperadora,
  onAdicionarAoCarrinho,
  onRemoverDoCarrinho,
  onEscolherSegmentacao,
  planoPorId,
  podeCriarMista,
  onCriarCotacoesMistas,
  criando,
}) {
  const itemAtivo = itensMistos.find((item) => item.id === itemAtivoId) ?? itensMistos[0]
  const indiceAtivo = itensMistos.findIndex((item) => item.id === itemAtivo.id)
  const totalVidasItemAtivo = totalVidasDoItem(itemAtivo)

  const nomesOperadoras = Object.keys(cotacaoBruta?.operadoras ?? {})

  return (
    <div className="selecao-planos-misto">
      <div className="selecao-planos-misto-resumo">
        {totalNaoAlocado > 0 ? (
          <span className="selecao-planos-misto-aviso">
            ⚠️ {totalNaoAlocado} vida{totalNaoAlocado === 1 ? '' : 's'} ainda não alocada{totalNaoAlocado === 1 ? '' : 's'} em nenhum item
          </span>
        ) : (
          <span className="selecao-planos-misto-ok">✓ Todas as vidas alocadas</span>
        )}
      </div>

      <div className="selecao-planos-misto-abas">
        {itensMistos.map((item, index) => (
          <button
            key={item.id}
            type="button"
            className={`selecao-planos-misto-aba${item.id === itemAtivo.id ? ' selecao-planos-misto-aba-ativa' : ''}`}
            onClick={() => setItemAtivoId(item.id)}
          >
            Item {index + 1} ({totalVidasDoItem(item)} vida{totalVidasDoItem(item) === 1 ? '' : 's'})
            {item.selecionados.size > 0 && ` · ${item.selecionados.size} plano${item.selecionados.size === 1 ? '' : 's'}`}
          </button>
        ))}
        <button type="button" className="selecao-planos-misto-aba selecao-planos-misto-aba-adicionar" onClick={onAdicionarItem}>
          + Item
        </button>
      </div>

      <div className="selecao-planos-misto-item">
        <div className="selecao-planos-misto-item-header">
          <strong>Item {indiceAtivo + 1} — de quantas vidas é esse grupo?</strong>
          {itensMistos.length > 1 && (
            <button type="button" className="ls-btn ls-btn-ghost" onClick={() => onRemoverItem(itemAtivo.id)}>
              Excluir este item
            </button>
          )}
        </div>

        <div className="selecao-planos-misto-faixas">
          {[...totalPorFaixaDisponivel.keys()].map((faixa) => {
            const max = disponivelParaItem(itemAtivo.id, faixa)
            const totalFaixa = totalPorFaixaDisponivel.get(faixa)
            if (totalFaixa === 0) return null
            return (
              <div key={faixa} className="contexto-cotacao-faixa-linha">
                <span className="contexto-cotacao-faixa-label">
                  {faixa} <small>(até {max})</small>
                </span>
                <input
                  type="number"
                  min="0"
                  max={max}
                  inputMode="numeric"
                  className="contexto-cotacao-faixa-quantidade"
                  value={itemAtivo.quantidadesPorFaixa.get(faixa) ?? 0}
                  onChange={(e) => onAtualizarQuantidade(itemAtivo.id, faixa, e.target.value)}
                />
              </div>
            )
          })}
        </div>

        {totalVidasItemAtivo === 0 ? (
          <p className="selecao-planos-status">Aloque ao menos 1 vida acima pra ver os planos elegíveis desse item.</p>
        ) : (
          <>
            <div className="selecao-planos-blocos">
              <div className="selecao-planos-bloco-grupo">
                <span className="selecao-planos-bloco-label">Acomodação</span>
                <div className="selecao-planos-bloco-toggle">
                  {['Todas', 'Enfermaria', 'Apartamento'].map((opcao) => (
                    <button
                      key={opcao}
                      type="button"
                      className={`selecao-planos-bloco-btn${itemAtivo.filtroAcomodacao === opcao ? ' selecao-planos-bloco-btn-ativo' : ''}`}
                      onClick={() => onSetFiltroAcomodacao(itemAtivo.id, opcao)}
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
                      className={`selecao-planos-bloco-btn${itemAtivo.filtroCoparticipacao === opcao ? ' selecao-planos-bloco-btn-ativo' : ''}`}
                      onClick={() => onSetFiltroCoparticipacao(itemAtivo.id, opcao)}
                    >
                      {opcao}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <Carrinho
              selecionados={itemAtivo.selecionados}
              planoPorId={planoPorId}
              segmentacaoPorPlano={itemAtivo.segmentacaoPorPlano}
              onRemover={(planoId) => onRemoverDoCarrinho(itemAtivo.id, planoId)}
              onEscolherSegmentacao={(planoId, texto) => onEscolherSegmentacao(itemAtivo.id, planoId, texto)}
              mostrarBotaoCriar={false}
              tituloCarrinho={`Item ${indiceAtivo + 1} — ${itemAtivo.selecionados.size} plano${itemAtivo.selecionados.size === 1 ? '' : 's'} selecionado${itemAtivo.selecionados.size === 1 ? '' : 's'}`}
            />

            {nomesOperadoras.map((nomeOperadora) => {
              const planosDoBloco = cotacaoBruta.operadoras[nomeOperadora].planos
                .filter((plano) => !itemAtivo.selecionados.has(plano.planoId))
                .filter((plano) => itemAtivo.filtroAcomodacao === 'Todas' || classificarAcomodacao(plano.acomodacao) === itemAtivo.filtroAcomodacao)
                .map((plano) => {
                  const elegiveis = plano.precosPorSegmentacao.filter((g) => segmentacaoElegivelParaVidas(g, totalVidasItemAtivo))
                  const segmentacoesFiltradas =
                    itemAtivo.filtroCoparticipacao === 'Todas'
                      ? elegiveis
                      : elegiveis.filter((g) => g.coparticipacaoTipo === itemAtivo.filtroCoparticipacao)
                  return { plano, segmentacoesFiltradas }
                })
                .filter(({ segmentacoesFiltradas }) => segmentacoesFiltradas.length > 0)

              if (planosDoBloco.length === 0) return null

              const expandida = itemAtivo.operadorasExpandidas.has(nomeOperadora)

              return (
                <section key={nomeOperadora} className="selecao-planos-operadora">
                  <button
                    type="button"
                    className="selecao-planos-operadora-titulo selecao-planos-operadora-toggle"
                    onClick={() => onAlternarOperadora(itemAtivo.id, nomeOperadora)}
                    aria-expanded={expandida}
                  >
                    <span className={`selecao-planos-operadora-seta${expandida ? ' selecao-planos-operadora-seta-aberta' : ''}`}>▸</span>
                    <LogoOperadora logoUrl={cotacaoBruta.operadoras[nomeOperadora].logoUrl} logoFundoChip={cotacaoBruta.operadoras[nomeOperadora].logoFundoChip} />
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
                          onAdicionar={() => onAdicionarAoCarrinho(itemAtivo.id, plano.planoId)}
                        />
                      ))}
                    </div>
                  )}
                </section>
              )
            })}
          </>
        )}
      </div>

      <div className="selecao-planos-misto-rodape">
        <button className="ls-btn ls-btn-primary" onClick={onCriarCotacoesMistas} disabled={!podeCriarMista || criando}>
          {criando ? 'Criando cotações...' : `Criar Cotação Mista (${itensMistos.length} itens)`}
        </button>
        {!podeCriarMista && (
          <p className="selecao-planos-misto-pendencia">
            Antes de criar: aloque todas as vidas, e escolha ao menos 1 plano (com segmentação definida) em cada item.
          </p>
        )}
      </div>
    </div>
  )
}
