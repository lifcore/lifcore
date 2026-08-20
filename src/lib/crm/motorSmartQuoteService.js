import { institucional } from '../supabaseSchemas'

/**
 * Sprint 2A — Motor determinístico do Smart Quote.
 *
 * Orientação do Chief (19/08): "Não implementar IA... Primeiro provar
 * que o motor recebe contexto de cotação e retorna corretamente os
 * planos, preços, rede e regras vinculados ao plano_id, respeitando
 * região tarifária e filtros objetivos." Este arquivo faz exatamente
 * isso — SQL/filtros determinísticos, zero geração de texto/IA.
 *
 * ESCOPO REAL DESTA ENTREGA (2A, não 2B):
 * `mercado_saude_precos.segmentacao` é texto livre por operadora — cada
 * uma descreve "quantidade de vidas + MEI + coparticipação" do seu
 * próprio jeito (ex: Amil usa "3a4 Parcial Não MEI", Porto usa um
 * tabela_id sem esse texto). Não existe hoje uma coluna estruturada
 * (faixa_vidas_min/max, mei boolean, coparticipacao_tipo) pra filtrar
 * isso de forma genérica entre operadoras — inventar esse parser aqui
 * seria arriscar casar contexto errado com preço errado. Por isso:
 *
 *   - `buscarPlanosElegiveis` filtra só pelo que JÁ é estruturado hoje
 *     (região tarifária, operadora, status ativo) — sem tentar
 *     adivinhar segmentação por vidas/MEI ainda.
 *   - `buscarCotacaoDoPlano` devolve TODAS as segmentações de preço
 *     disponíveis pro plano, agrupadas — o corretor escolhe a certa
 *     (a mesma decisão que ele já toma hoje olhando a Biblioteca).
 *
 * A seleção automática por vidas/MEI/coparticipação é Sprint 2B, e
 * depende de uma decisão de schema (estruturar `segmentacao` em
 * colunas) que ainda não foi tomada — não codificada aqui de propósito.
 */

/**
 * Lista os planos ativos de uma região (e, opcionalmente, operadora
 * específica) — o primeiro filtro objetivo do funil do Chief:
 * Região tarifária → Operadora → Planos elegíveis.
 *
 * @param {{ regiaoNome?: string, operadoraCodigo?: string }} contexto
 *   regiaoNome: nome exato em institucional.regioes_tarifarias.nome (ex: "Jundiaí")
 *   operadoraCodigo: nome/código da operadora pra filtrar uma só (opcional)
 */
export async function buscarPlanosElegiveis({ regiaoNome = null, operadoraCodigo = null } = {}) {
  let query = institucional
    .from('mercado_saude_planos')
    .select(
      `
      plano_id, nome, acomodacao, linha, status,
      operadoras:operadora_id ( id, nome ),
      regioes_tarifarias:regiao_tarifaria_id ( id, nome )
    `
    )
    .eq('status', 'ativo')

  if (regiaoNome) {
    // filtra depois de buscar o id, pra não depender de embed filtrável
    const { data: regiao, error: erroRegiao } = await institucional
      .from('regioes_tarifarias')
      .select('id')
      .ilike('nome', regiaoNome)
      .maybeSingle()
    if (erroRegiao) throw new Error(`Erro buscando região "${regiaoNome}": ${erroRegiao.message}`)
    if (!regiao) return { planos: [], motivo: `Nenhuma região tarifária encontrada com nome "${regiaoNome}".` }
    query = query.eq('regiao_tarifaria_id', regiao.id)
  }

  if (operadoraCodigo) {
    const { data: operadora, error: erroOperadora } = await institucional
      .from('operadoras')
      .select('id')
      .ilike('nome', `%${operadoraCodigo}%`)
      .eq('status', 'ativa')
      .maybeSingle()
    if (erroOperadora) throw new Error(`Erro buscando operadora "${operadoraCodigo}": ${erroOperadora.message}`)
    if (!operadora) return { planos: [], motivo: `Nenhuma operadora ativa encontrada com nome "${operadoraCodigo}".` }
    query = query.eq('operadora_id', operadora.id)
  }

  const { data: planos, error } = await query.order('nome')
  if (error) throw new Error(`Erro buscando planos elegíveis: ${error.message}`)

  return { planos: planos ?? [], motivo: null }
}

/**
 * Devolve o "pacote de cotação" completo de UM plano — preço (todas as
 * segmentações disponíveis, agrupadas), rede (resumo + amostra) e
 * regras da operadora — tudo cruzado por plano_id, como o Chief pediu
 * no teste ponta a ponta. Sem escolher segmentação sozinho (ver nota
 * no topo do arquivo) — devolve a lista pro corretor decidir.
 *
 * @param {string} planoId
 */
export async function buscarCotacaoDoPlano(planoId) {
  const { data: plano, error: erroPlano } = await institucional
    .from('mercado_saude_planos')
    .select(
      `
      plano_id, nome, acomodacao, linha, status,
      operadoras:operadora_id ( id, nome ),
      regioes_tarifarias:regiao_tarifaria_id ( id, nome )
    `
    )
    .eq('plano_id', planoId)
    .maybeSingle()
  if (erroPlano) throw new Error(`Erro buscando plano "${planoId}": ${erroPlano.message}`)
  if (!plano) return { encontrado: false, motivo: `plano_id "${planoId}" não existe na Biblioteca de Mercado.` }

  const [{ data: precos, error: erroPrecos }, resumoRede, { data: regras, error: erroRegras }] = await Promise.all([
    institucional
      .from('mercado_saude_precos')
      .select('segmentacao, familia_tarifaria, faixa_etaria, valor')
      .eq('plano_id', planoId)
      .order('segmentacao')
      .order('faixa_etaria'),
    montarResumoRede(planoId),
    institucional
      .from('mercado_saude_regras')
      .select('tipo, conteudo')
      .eq('operadora_id', plano.operadoras.id)
      .order('tipo'),
  ])
  if (erroPrecos) throw new Error(`Erro buscando preços do plano "${planoId}": ${erroPrecos.message}`)
  if (erroRegras) throw new Error(`Erro buscando regras da operadora: ${erroRegras.message}`)

  return {
    encontrado: true,
    plano,
    precosPorSegmentacao: agruparPrecosPorSegmentacao(precos ?? []),
    rede: resumoRede,
    regras: regras ?? [],
  }
}

/** Agrupa a lista plana de preços por segmentação — cada grupo já pronto pra virar 1 opção na tela. */
function agruparPrecosPorSegmentacao(precos) {
  const grupos = new Map()
  for (const p of precos) {
    if (!grupos.has(p.segmentacao)) {
      grupos.set(p.segmentacao, { segmentacao: p.segmentacao, familiaTarifaria: p.familia_tarifaria, faixas: [] })
    }
    grupos.get(p.segmentacao).faixas.push({ faixaEtaria: p.faixa_etaria, valor: p.valor })
  }
  return [...grupos.values()]
}

async function montarResumoRede(planoId) {
  const { count, error } = await institucional
    .from('mercado_saude_rede_cobertura')
    .select('id', { count: 'exact', head: true })
    .eq('plano_id', planoId)
  if (error) throw new Error(`Erro contando rede do plano "${planoId}": ${error.message}`)

  const { data: amostra, error: erroAmostra } = await institucional
    .from('mercado_saude_rede_cobertura')
    .select('codigo_bruto, prestador:prestador_id ( nome, municipio )')
    .eq('plano_id', planoId)
    .limit(10)
  if (erroAmostra) throw new Error(`Erro buscando amostra de rede do plano "${planoId}": ${erroAmostra.message}`)

  return { totalPrestadores: count ?? 0, amostra: amostra ?? [] }
}

/**
 * Calcula a mensalidade total pra uma composição de vidas (faixas
 * etárias já escolhidas pelo corretor), dentro de UMA segmentação já
 * escolhida — o passo final determinístico do funil do Chief. Nunca
 * escolhe segmentação sozinho; recebe ela pronta.
 *
 * @param {{ segmentacao: string, faixas: {faixaEtaria: string, valor: number}[] }} grupoSegmentacao
 *   (um item de `precosPorSegmentacao`, vindo de buscarCotacaoDoPlano)
 * @param {string[]} faixasEtariasDasVidas — 1 entrada por vida, ex: ['24 a 28', '29 a 33', '44 a 48']
 */
/**
 * Lista as faixas etárias que REALMENTE existem em mercado_saude_precos
 * — nunca assume um padrão fixo (ex: "00-18" vs "0 a 18"), porque já
 * vimos formato divergir entre fonte e o resto do app (CotacaoForm.jsx
 * usa "00-18"/"19-23"; a Biblioteca importou "0 a 18"/"24 a 28"). O
 * formulário de contexto (Sprint 3) usa isso pra montar o seletor de
 * idade sem arriscar um valor que não bate com o banco.
 */
export async function buscarFaixasEtariasDisponiveis() {
  const { data, error } = await institucional.from('mercado_saude_precos').select('faixa_etaria')
  if (error) throw new Error(`Erro buscando faixas etárias: ${error.message}`)

  const unicas = [...new Set((data ?? []).map((r) => r.faixa_etaria))]
  // ordena pelo primeiro número da faixa (funciona pros formatos "0 a 18" e "00-18")
  return unicas.sort((a, b) => (parseInt(a, 10) || 0) - (parseInt(b, 10) || 0))
}

export function calcularMensalidade(grupoSegmentacao, faixasEtariasDasVidas) {
  const porFaixa = new Map(grupoSegmentacao.faixas.map((f) => [f.faixaEtaria, f.valor]))
  const naoEncontradas = []
  let total = 0

  for (const faixa of faixasEtariasDasVidas) {
    const valor = porFaixa.get(faixa)
    if (valor === undefined) {
      naoEncontradas.push(faixa)
      continue
    }
    total += valor
  }

  if (naoEncontradas.length > 0) {
    return {
      sucesso: false,
      total: null,
      motivo: `Faixa(s) etária(s) sem preço nesta segmentação: ${naoEncontradas.join(', ')}.`,
    }
  }

  return { sucesso: true, total, motivo: null }
}

/**
 * Sprint 2C — Modelo de retorno estruturado, no formato que o Chief
 * desenhou: COTAÇÃO { contexto, operadoras: { [nome]: { planos } },
 * filtros_aplicados }. Monta em cima de `buscarPlanosElegiveis` +
 * `buscarCotacaoDoPlano` — não introduz filtro novo nenhum (2B
 * continua pendente da decisão de schema, ver nota no topo do
 * arquivo). Isso já é o formato pronto pra alimentar a próxima camada
 * visual (cards por operadora, comparação, seleção múltipla).
 *
 * @param {{ regiaoNome?: string, operadoraCodigos?: string[] }} contexto
 */
export async function montarCotacaoEstruturada({ regiaoNome = null, operadoraCodigos = null } = {}) {
  const codigos = operadoraCodigos?.length ? operadoraCodigos : [null]
  const operadorasResultado = {}
  const filtrosAplicados = { regiaoNome, operadoraCodigos: operadoraCodigos ?? 'todas' }

  for (const codigo of codigos) {
    const { planos, motivo } = await buscarPlanosElegiveis({ regiaoNome, operadoraCodigo: codigo })
    if (motivo) continue // operadora/região não encontrada — pula, não quebra a cotação inteira

    for (const planoBase of planos) {
      const nomeOperadora = planoBase.operadoras?.nome ?? 'sem operadora'
      const pacote = await buscarCotacaoDoPlano(planoBase.plano_id)
      if (!pacote.encontrado) continue

      if (!operadorasResultado[nomeOperadora]) operadorasResultado[nomeOperadora] = { planos: [] }

      operadorasResultado[nomeOperadora].planos.push({
        planoId: pacote.plano.plano_id,
        nome: pacote.plano.nome,
        operadora: nomeOperadora,
        operadoraId: pacote.plano.operadoras?.id ?? null,
        acomodacao: pacote.plano.acomodacao,
        linha: pacote.plano.linha,
        precosPorSegmentacao: pacote.precosPorSegmentacao,
        redeDisponivel: { totalPrestadores: pacote.rede.totalPrestadores },
        regrasDisponiveis: pacote.regras.map((r) => r.conteudo?.titulo ?? r.tipo),
      })
    }
  }

  return { contexto: { regiaoNome }, operadoras: operadorasResultado, filtrosAplicados }
}
