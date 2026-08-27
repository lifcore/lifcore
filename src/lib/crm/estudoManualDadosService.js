import { institucional, operacional } from '../supabaseSchemas'

/**
 * Etapa 5 do plano "Registro Manual + Estudo de Mercado" (21/08) —
 * núcleo de dado compartilhado pelos 2 modelos de PDF (Essencial e
 * Executivo/ex-Premium). Substitui o sistema antigo (propostas_estudo
 * extraídas de PDF importado via lotes_importacao_estudo) — agora lê
 * direto das Cotações que o corretor selecionou nos cards (criadas
 * pelo Multicálculo OU pelo Registro Manual), já com preço calculado
 * de verdade em `itens_cotacao`. Nenhuma extração automática no meio.
 *
 * Import de `institucional` e `operacional` juntos aqui de propósito —
 * `cotacoes`/`itens_cotacao`/`clientes_prospects` vivem em `operacional`,
 * a Biblioteca de Mercado (rede/regras/operadoras) vive em `institucional`.
 *
 * ATUALIZADO (26/08) — 3 pedidos do usuário pro primeiro Estudo
 * Essencial de verdade:
 *   1. Logo de cada operadora (Cenário Atual + cada proposta) — nova
 *      função `buscarLogosOperadoras`, mesmo padrão já usado no card
 *      de Cotação (ClienteDetailPage.jsx).
 *   2. Logo da LifitSeg na capa/fechamento — fica no arquivo de HTML
 *      (estudoEssencialPdfService.js), não precisa de dado do banco,
 *      é URL fixa.
 *   3. Contagem de prestadores por plano — reaproveita a mesma busca
 *      de rede que já existia (buscarRedeDoPlano), só passou a contar
 *      e guardar o total. Separação Hospital×Laboratório ainda não dá
 *      (coluna `categoria` não existe em `mercado_saude_rede_prestadores`
 *      hoje — achado real, 25/08) — fica só o total por enquanto,
 *      documentado como limitação conhecida, não escondido.
 *
 * Bônus (mesma atualização): `coparticipacao_tipo` estava fixo como
 * '—' — a Cotação já carrega esse dado real (coluna adicionada 25/08),
 * e já vinha junto no `select('*, ...')` de `buscarCotacoesParaEstudo`
 * sem custo extra de consulta — só não estava sendo lido.
 */

/** Busca as Cotações selecionadas pelo corretor nos cards, com os
 *  itens (faixa/quantidade/valor) já embutidos. */
export async function buscarCotacoesParaEstudo(cotacaoIds) {
  if (!cotacaoIds?.length) throw new Error('Nenhuma Cotação selecionada pro Estudo.')
  const { data, error } = await operacional
    .from('cotacoes')
    .select('*, itens_cotacao(*)')
    .in('id', cotacaoIds)
  if (error) throw new Error(`Erro ao buscar Cotações selecionadas: ${error.message}`)
  if (!data?.length) throw new Error('Nenhuma das Cotações selecionadas foi encontrada — pode ter sido excluída nesse meio tempo.')
  return data
}

/** Mesmo cálculo já usado no card de Cotação (ClienteDetailPage.jsx) —
 *  soma quantidade × valor por faixa, nunca o valor unitário puro. */
export function calcularTotaisCotacao(cot) {
  const itens = cot.itens_cotacao ?? []
  const totalMensal = itens.reduce((soma, item) => soma + (item.quantidade_vidas ?? 0) * Number(item.valor ?? 0), 0)
  const totalVidas = itens.reduce((soma, item) => soma + (item.quantidade_vidas ?? 0), 0)
  return { totalMensal, totalAnual: totalMensal * 12, totalVidas }
}

/**
 * Ordem confirmada com o usuário: Cenário Atual (coluna 1) → Recomendada
 * (coluna 2) → resto por valor total crescente. Cliente com mais de 1
 * plano ativo hoje → `atuais` vem com todas as Cotações marcadas,
 * `calcularTotalCombinado` soma o total real do que ele paga hoje.
 */
export function separarAtuaisEPropostas(cotacoesSelecionadas) {
  const atuais = cotacoesSelecionadas.filter((c) => c.eh_cenario_atual)
  const propostas = cotacoesSelecionadas.filter((c) => !c.eh_cenario_atual)

  const recomendada = propostas.find((c) => c.recomendada)
  const outras = propostas
    .filter((c) => !c.recomendada)
    .sort((a, b) => calcularTotaisCotacao(a).totalMensal - calcularTotaisCotacao(b).totalMensal)

  return { atuais, propostasOrdenadas: recomendada ? [recomendada, ...outras] : outras }
}

export function calcularTotalCombinado(cotacoesAtuais) {
  return cotacoesAtuais.reduce(
    (acc, c) => {
      const t = calcularTotaisCotacao(c)
      return { totalMensal: acc.totalMensal + t.totalMensal, totalVidas: acc.totalVidas + t.totalVidas }
    },
    { totalMensal: 0, totalVidas: 0 }
  )
}

/** Rede credenciada do plano vinculado na Biblioteca de Mercado — só
 *  existe quando `plano_biblioteca_id` foi escolhido no Registro Manual
 *  (vínculo opcional, ver CotacaoForm.jsx) OU vem do Multicálculo (já
 *  corrigido 25/08). Mesmo padrão de consulta já usado em
 *  `montarResumoRede` (motorSmartQuoteService.js). */
// NOVO (26/08) — lista fixa de município pra filtrar a rede exibida no
// Estudo, decisão do usuário (sessão de hoje) enquanto o sistema só tem
// Jundiaí homologada como região tarifária. Antes disso, a rede vinha
// sem filtro nenhum — centenas de prestadores de cidades que o cliente
// nunca vai usar, deixando o PDF gigante e ilegível (achado real, visto
// no primeiro Estudo Executivo de teste). Comparação por PREFIXO, não
// igualdade exata — município às vezes vem como "São Paulo - Centro"
// (subseção dentro da cidade), não só "São Paulo" puro.
const MUNICIPIOS_REDE_HOMOLOGADOS = ['Jundiaí', 'São Paulo', 'Campinas']

function pertenceAosMunicipiosHomologados(municipio) {
  const m = municipio ?? ''
  return MUNICIPIOS_REDE_HOMOLOGADOS.some((alvo) => m.startsWith(alvo))
}

export async function buscarRedeDoPlano(planoBibliotecaId) {
  if (!planoBibliotecaId) return []
  const { data, error } = await institucional
    .from('mercado_saude_rede_cobertura')
    .select('codigo_bruto, prestador:prestador_id ( nome, municipio )')
    .eq('plano_id', planoBibliotecaId)
  if (error) throw new Error(`Erro ao buscar rede do plano: ${error.message}`)
  return (data ?? []).filter((l) => pertenceAosMunicipiosHomologados(l.prestador?.municipio))
}

/** Regras da operadora — opt-in explícito (checkbox desmarcado por
 *  padrão), porque regra de venda não vale pro plano que o cliente já
 *  tem ativo (condições dele foram travadas na contratação original,
 *  confirmado com o usuário). */
export async function buscarRegrasDaOperadora(operadoraId) {
  if (!operadoraId) return []
  const { data, error } = await institucional
    .from('mercado_saude_regras')
    .select('tipo, conteudo')
    .eq('operadora_id', operadoraId)
  if (error) throw new Error(`Erro ao buscar regras da operadora: ${error.message}`)
  return data ?? []
}

/** NOVO (26/08) — logo de cada operadora envolvida no Estudo, em lote
 *  (1 consulta só, não 1 por coluna) — mesmo padrão do card de Cotação
 *  (ClienteDetailPage.jsx, `logosPorOperadoraId`). */
export async function buscarLogosOperadoras(operadoraIds) {
  const idsUnicos = [...new Set((operadoraIds ?? []).filter(Boolean))]
  if (idsUnicos.length === 0) return new Map()
  const { data, error } = await institucional
    .from('operadoras')
    .select('id, nome, logo_url, logo_fundo_chip')
    .in('id', idsUnicos)
  if (error) throw new Error(`Erro ao buscar logos das operadoras: ${error.message}`)
  return new Map((data ?? []).map((o) => [o.id, o]))
}

export async function buscarClienteDoEstudo(clienteProspectId) {
  const { data, error } = await operacional
    .from('clientes_prospects')
    .select('razao_social, cnpj, cpf')
    .eq('id', clienteProspectId)
    .single()
  if (error) throw new Error(`Erro ao buscar cliente: ${error.message}`)
  return data
}

/** NOVO (26/08) — extraído pra nível de módulo (antes vivia só dentro
 *  de `montarDadosEstudoEssencial`) porque `montarDadosEstudoExecutivo`
 *  também precisa — evita duplicar a mesma consulta em 2 lugares. */
export async function buscarAcomodacao(planoBibliotecaId) {
  if (!planoBibliotecaId) return '—'
  const { data } = await institucional.from('mercado_saude_planos').select('acomodacao').eq('plano_id', planoBibliotecaId).maybeSingle()
  return data?.acomodacao ?? '—'
}

/** NOVO (26/08) — total de prestadores na rede do plano, reaproveita a
 *  mesma busca que já existia pra montar a rede por região. Extraído
 *  pra nível de módulo pelo mesmo motivo de `buscarAcomodacao` acima.
 *  `incluirRede` passado explícito (não é mais closure) — só busca de
 *  verdade quando a opção está ligada, senão não faz sentido gastar
 *  consulta com algo que não vai aparecer no PDF. Sem separação
 *  Hospital×Laboratório ainda (coluna `categoria` não existe em
 *  `mercado_saude_rede_prestadores` hoje — achado real, 25/08). */
export async function contarPrestadores(planoBibliotecaId, incluirRede) {
  if (!incluirRede || !planoBibliotecaId) return null
  const rede = await buscarRedeDoPlano(planoBibliotecaId)
  return new Set(rede.map((r) => r.prestador?.nome).filter(Boolean)).size
}

/**
 * Monta `dados` no formato que `gerarHtmlEstudoEssencial` já espera
 * (estudoEssencialPdfService.js — esse arquivo não muda nada na
 * estrutura, só a fonte do dado e o que cada célula recebe).
 *
 * Achado (21/08): o Registro Manual (CotacaoForm.jsx) não coleta mais
 * reembolso/carência/abrangência como texto livre (existiam no antigo
 * CenarioAtualForm embutido, removido na Etapa 2) — por isso ficam "—"
 * quando não dá pra derivar do `plano_biblioteca_id` vinculado. Isso
 * continua sendo limitação conhecida, registrada aqui — não inventa
 * dado pra preencher.
 */
export async function montarDadosEstudoEssencial({ cotacaoIds, incluirRede = true, incluirRegras = false }) {
  const cotacoesSelecionadas = await buscarCotacoesParaEstudo(cotacaoIds)
  const cliente = await buscarClienteDoEstudo(cotacoesSelecionadas[0].cliente_prospect_id)
  const { atuais, propostasOrdenadas } = separarAtuaisEPropostas(cotacoesSelecionadas)

  const operadoraIdsEnvolvidas = [...atuais, ...propostasOrdenadas].map((c) => c.operadora_id).filter(Boolean)
  const logosPorOperadora = await buscarLogosOperadoras(operadoraIdsEnvolvidas)

  let colunaAtual = null
  if (atuais.length === 1) {
    const c = atuais[0]
    const t = calcularTotaisCotacao(c)
    const totalPrestadores = await contarPrestadores(c.plano_biblioteca_id, incluirRede)
    const logo = logosPorOperadora.get(c.operadora_id) ?? null
    colunaAtual = {
      operadoraPlano: `${c.operadora_nome_livre}${c.plano ? ' — ' + c.plano : ''}`,
      custoMensal: t.totalMensal,
      custoAnual: t.totalAnual,
      acomodacao: await buscarAcomodacao(c.plano_biblioteca_id),
      coparticipacao: c.coparticipacao_tipo ?? '—',
      reembolso: '—',
      carencia: '—',
      abrangencia: '—',
      redeResumo: totalPrestadores != null ? `${totalPrestadores} prestador${totalPrestadores === 1 ? '' : 'es'} na rede` : '—',
      logoUrl: logo?.logo_url ?? null,
      logoFundo: logo?.logo_fundo_chip ?? null,
    }
  } else if (atuais.length > 1) {
    const total = calcularTotalCombinado(atuais)
    colunaAtual = {
      operadoraPlano: `${atuais.length} planos combinados (${atuais.map((c) => c.operadora_nome_livre).join(' + ')})`,
      custoMensal: total.totalMensal,
      custoAnual: total.totalMensal * 12,
      acomodacao: '—',
      coparticipacao: '—',
      reembolso: '—',
      carencia: '—',
      abrangencia: '—',
      redeResumo: '—',
      // Vários planos combinados = vários operadoras = sem 1 logo
      // único pra representar a coluna. Fica sem logo, de propósito.
      logoUrl: null,
      logoFundo: null,
    }
  }

  const colunasPropostas = []
  for (const cot of propostasOrdenadas) {
    const t = calcularTotaisCotacao(cot)
    const totalPrestadores = await contarPrestadores(cot.plano_biblioteca_id, incluirRede)
    const logo = logosPorOperadora.get(cot.operadora_id) ?? null
    colunasPropostas.push({
      operadoraPlano: `${cot.operadora_nome_livre}${cot.plano ? ' — ' + cot.plano : ''}`,
      papel: cot.recomendada ? 'recomendada' : 'outra',
      custoMensal: t.totalMensal,
      custoAnual: t.totalAnual,
      fontePreco: cot.plano_biblioteca_id ? 'Biblioteca de Mercado' : 'Digitado manualmente',
      acomodacao: await buscarAcomodacao(cot.plano_biblioteca_id),
      coparticipacao: cot.coparticipacao_tipo ?? '—',
      reembolso: '—',
      carencia: '—',
      abrangencia: '—',
      redeResumo: totalPrestadores != null ? `${totalPrestadores} prestador${totalPrestadores === 1 ? '' : 'es'} na rede` : '—',
      statusPrecificacao: 'aplicavel',
      motivoPrecificacao: null,
      avisoVinculo: cot.plano_biblioteca_id
        ? null
        : 'Sem vínculo com a Biblioteca de Mercado — preço digitado manualmente, sem rede vinculada.',
      planoVarianteId: cot.plano_biblioteca_id ?? cot.id,
      operadoraId: cot.operadora_id ?? null,
      logoUrl: logo?.logo_url ?? null,
      logoFundo: logo?.logo_fundo_chip ?? null,
    })
  }

  let redePorRegiao = { regioes: [], notaValidacao: 'Rede não incluída neste Estudo (opção desmarcada na seleção).' }
  if (incluirRede) {
    const porRegiao = {}
    let algumSemVinculo = false
    for (let i = 0; i < propostasOrdenadas.length; i++) {
      const cot = propostasOrdenadas[i]
      const coluna = colunasPropostas[i]
      if (!cot.plano_biblioteca_id) {
        algumSemVinculo = true
        continue
      }
      const rede = await buscarRedeDoPlano(cot.plano_biblioteca_id)
      for (const linha of rede) {
        const regiao = linha.prestador?.municipio ?? 'Não informado'
        const nomePrestador = linha.prestador?.nome ?? linha.codigo_bruto
        if (!porRegiao[regiao]) porRegiao[regiao] = {}
        if (!porRegiao[regiao][nomePrestador]) porRegiao[regiao][nomePrestador] = {}
        porRegiao[regiao][nomePrestador][coluna.planoVarianteId] = 'Credenciado'
      }
    }
    redePorRegiao = {
      regioes: Object.entries(porRegiao).map(([regiao, prestadoresMap]) => ({
        regiao,
        prestadores: Object.entries(prestadoresMap).map(([nome, porPlano]) => ({ nome, porPlano })),
      })),
      notaValidacao: algumSemVinculo
        ? 'Uma ou mais propostas não têm vínculo com a Biblioteca de Mercado — rede não disponível pra elas.'
        : 'Rede extraída da Biblioteca de Mercado, referencial no momento da geração — confirme especialidades e coberturas com a operadora antes da contratação.',
    }
  }

  // Regras (opt-in): sem seção própria no Essencial, entram como pontos
  // de atenção extras — reaproveita a mesma área já usada pra avisos.
  const pontosAtencaoExtras = []
  if (incluirRegras) {
    const operadoraIdsUnicos = [...new Set(colunasPropostas.map((c) => c.operadoraId).filter(Boolean))]
    for (const operadoraId of operadoraIdsUnicos) {
      const regras = await buscarRegrasDaOperadora(operadoraId)
      for (const r of regras) {
        pontosAtencaoExtras.push(`Regra (${r.tipo}): ${r.conteudo?.titulo ?? r.conteudo?.descricao ?? JSON.stringify(r.conteudo)}`)
      }
    }
  }

  return {
    geradoEm: new Date().toISOString(),
    cliente,
    colunaAtual,
    colunasPropostas,
    redePorRegiao,
    prontidao: { prontas: propostasOrdenadas, precisamAtencao: [] },
    pontosAtencaoExtras,
  }
}

/**
 * Monta `dados` no formato que `gerarHtmlEstudoMercado` já espera
 * (estudoMercadoPdfService.js). Mesma ideia do Essencial acima — só a
 * fonte do dado muda, o HTML/visual não é tocado por este arquivo
 * (redesenho visual, quando existir, vive só em
 * estudoMercadoPdfService.js).
 *
 * ATUALIZADO (26/08) — mesmo enriquecimento que o Essencial já tinha:
 * acomodação, coparticipação, logo da operadora e contagem de
 * prestadores por proposta (e pro Cenário Atual, quando ele é 1 plano
 * só). Antes esses campos não eram preenchidos e o template sempre
 * mostrava "—" mesmo tendo o dado disponível.
 */
export async function montarDadosEstudoExecutivo({ cotacaoIds, incluirRede = true, incluirRegras = false }) {
  const cotacoesSelecionadas = await buscarCotacoesParaEstudo(cotacaoIds)
  const cliente = await buscarClienteDoEstudo(cotacoesSelecionadas[0].cliente_prospect_id)
  const { atuais, propostasOrdenadas } = separarAtuaisEPropostas(cotacoesSelecionadas)
  const totalCenarioAtual = calcularTotalCombinado(atuais)

  const operadoraIdsEnvolvidas = [...atuais, ...propostasOrdenadas].map((c) => c.operadora_id).filter(Boolean)
  const logosPorOperadora = await buscarLogosOperadoras(operadoraIdsEnvolvidas)

  const cenarioAtual = []
  for (const c of atuais) {
    const t = calcularTotaisCotacao(c)
    const logo = logosPorOperadora.get(c.operadora_id) ?? null
    cenarioAtual.push({
      operadora_nome: c.operadora_nome_livre,
      operadora_nome_livre: c.operadora_nome_livre,
      plano: c.plano,
      quantidade_vidas_informada: t.totalVidas,
      mensalidade_informada: t.totalMensal,
      // Só faz sentido acomodação/coparticipação por linha quando é 1
      // plano — com vários planos combinados, cada linha já É 1 plano
      // individual (essa tabela sempre lista 1 linha por Cotação
      // marcada Cenário Atual, nunca soma), então sempre dá pra tentar.
      acomodacao: await buscarAcomodacao(c.plano_biblioteca_id),
      coparticipacao: c.coparticipacao_tipo ?? '—',
      logoUrl: logo?.logo_url ?? null,
      logoFundo: logo?.logo_fundo_chip ?? null,
    })
  }

  const propostasSelecionadas = []
  for (const cot of propostasOrdenadas) {
    const t = calcularTotaisCotacao(cot)
    const impactoMensal = totalCenarioAtual.totalMensal > 0 ? t.totalMensal - totalCenarioAtual.totalMensal : null
    const totalPrestadores = await contarPrestadores(cot.plano_biblioteca_id, incluirRede)
    const logo = logosPorOperadora.get(cot.operadora_id) ?? null
    propostasSelecionadas.push({
      id: cot.id,
      plano: cot.plano ?? cot.operadora_nome_livre,
      operadora_nome: cot.operadora_nome_livre,
      papel_selecao: cot.recomendada ? 'recomendada' : null,
      valorMensalCalculado: t.totalMensal,
      comparativo: {
        impactoMensal,
        impactoAnual: impactoMensal != null ? impactoMensal * 12 : null,
        tipo: impactoMensal == null ? null : impactoMensal < 0 ? 'economia' : 'acrescimo',
      },
      custoPorVida: t.totalVidas > 0 ? t.totalMensal / t.totalVidas : null,
      faixasFaltantes: [], // Cotação já criada sempre tem preço completo — nunca falta faixa aqui
      planoBibliotecaId: cot.plano_biblioteca_id ?? null,
      operadoraId: cot.operadora_id ?? null,
      acomodacao: await buscarAcomodacao(cot.plano_biblioteca_id),
      coparticipacao: cot.coparticipacao_tipo ?? '—',
      totalPrestadores,
      logoUrl: logo?.logo_url ?? null,
      logoFundo: logo?.logo_fundo_chip ?? null,
    })
  }

  let rede = []
  if (incluirRede) {
    for (const p of propostasSelecionadas) {
      if (!p.planoBibliotecaId) continue
      const linhas = await buscarRedeDoPlano(p.planoBibliotecaId)
      for (const linha of linhas) {
        rede.push({ prestador: linha.prestador?.nome ?? linha.codigo_bruto, proposta_estudo_id: p.id })
      }
    }
  }

  // Regras (opt-in) — seção própria no Executivo, ver nota em
  // estudoMercadoPdfService.js (não existia antes, adicionada agora
  // porque o checkbox de regras precisa aparecer em algum lugar real).
  let regrasIncluidas = []
  if (incluirRegras) {
    const operadoraIdsUnicos = [...new Set(propostasSelecionadas.map((p) => p.operadoraId).filter(Boolean))]
    for (const operadoraId of operadoraIdsUnicos) {
      const nomeOperadora = propostasSelecionadas.find((p) => p.operadoraId === operadoraId)?.operadora_nome ?? '—'
      const regras = await buscarRegrasDaOperadora(operadoraId)
      for (const r of regras) {
        regrasIncluidas.push({ operadora: nomeOperadora, tipo: r.tipo, descricao: r.conteudo?.titulo ?? r.conteudo?.descricao ?? JSON.stringify(r.conteudo) })
      }
    }
  }

  return {
    geradoEm: new Date().toISOString(),
    cliente,
    cenarioAtual,
    totalCenarioAtual,
    propostasSelecionadas,
    rede,
    legenda: [], // "legenda de códigos de rede" — sem fonte pra isso no modelo novo, fica vazio (mensagem existente do template já cobre isso com honestidade)
    regrasIncluidas,
  }
}
