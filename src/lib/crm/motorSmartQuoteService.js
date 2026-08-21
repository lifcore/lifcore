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
 *
 * ATUALIZADO (Sprint 3b, 20/08) — a decisão de schema acima FOI tomada
 * (BMR-006/009: `vidas_min`/`vidas_max`/`mei`/`coparticipacao_tipo`/
 * `tipo_contratacao`), e as 12 operadoras já estão gravadas de verdade.
 * `montarCotacaoEstruturada` agora aceita `totalVidas` opcional e filtra
 * por ele — é o primeiro corte da cascata que o Chief desenhou ("Vidas +
 * Região + Regras → Operadoras elegíveis"). Continua SEM filtrar por
 * MEI/coparticipação automaticamente (o formulário de Contexto ainda não
 * pergunta isso) e SEM usar "Regras" como filtro — texto livre em
 * `mercado_saude_regras.conteudo`, vira informativo, nunca corte de
 * elegibilidade (decisão do usuário, mesma linha do "titulares mínimo"
 * da Bradesco).
 */

// Acima disso, contratos não seguem tabela fixa — viram negociação direta
// com a seguradora (Estudo Corporativo, Sprint 4). Decisão de produto
// confirmada pelo usuário, não limite técnico das tabelas atuais.
const LIMITE_VIDAS_MULTICALCULO = 99

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
      .select(
        'segmentacao, familia_tarifaria, faixa_etaria, valor, vidas_min, vidas_max, mei, coparticipacao_tipo, tipo_contratacao'
      )
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

/** Agrupa a lista plana de preços por segmentação — cada grupo já pronto pra
 *  virar 1 opção na tela. vidas_min/vidas_max/mei/coparticipacao_tipo/
 *  tipo_contratacao são iguais em todas as linhas de uma mesma segmentação
 *  (1 valor por faixa etária, mesma regra de elegibilidade) — pega do
 *  primeiro registro do grupo. */
function agruparPrecosPorSegmentacao(precos) {
  const grupos = new Map()
  for (const p of precos) {
    if (!grupos.has(p.segmentacao)) {
      grupos.set(p.segmentacao, {
        segmentacao: p.segmentacao,
        familiaTarifaria: p.familia_tarifaria,
        vidasMin: p.vidas_min,
        vidasMax: p.vidas_max,
        mei: p.mei,
        coparticipacaoTipo: p.coparticipacao_tipo,
        tipoContratacao: p.tipo_contratacao,
        faixas: [],
      })
    }
    grupos.get(p.segmentacao).faixas.push({ faixaEtaria: p.faixa_etaria, valor: p.valor })
  }
  return [...grupos.values()]
}

/** Uma segmentação é elegível pro total de vidas informado quando o total
 *  cai dentro de [vidas_min, vidas_max]. vidas_min OU vidas_max NULL
 *  significa "fonte não informou limite" — nunca bloqueia por conta
 *  própria (regra confirmada com o usuário: NULL não é "não se aplica"
 *  quando a coluna é vidas_min/vidas_max, é "não sabemos", e "não
 *  sabemos" não pode virar exclusão automática). */
function segmentacaoElegivelPorVidas(grupo, totalVidas) {
  if (totalVidas == null) return true
  if (grupo.vidasMin == null || grupo.vidasMax == null) return true
  return totalVidas >= grupo.vidasMin && totalVidas <= grupo.vidasMax
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
 * @param {{ regiaoNome?: string, operadoraCodigos?: string[], totalVidas?: number }} contexto
 *   totalVidas: soma de vidas da cotação (Sprint 3b) — quando informado,
 *   filtra as segmentações elegíveis por vidas_min/vidas_max (BMR-006).
 *   Plano sem nenhuma segmentação elegível não entra no resultado — é
 *   assim que uma operadora inteira "some" quando nenhum plano dela bate
 *   o critério, como o Chief pediu na cascata.
 */
export async function montarCotacaoEstruturada({ regiaoNome = null, operadoraCodigos = null, totalVidas = null } = {}) {
  const filtrosAplicados = { regiaoNome, operadoraCodigos: operadoraCodigos ?? 'todas', totalVidas }

  if (totalVidas != null && totalVidas > LIMITE_VIDAS_MULTICALCULO) {
    return {
      contexto: { regiaoNome, totalVidas },
      operadoras: {},
      filtrosAplicados,
      motivoBloqueio:
        `Acima de ${LIMITE_VIDAS_MULTICALCULO} vidas o Multicálculo não se aplica — contratos desse porte ` +
        `são negociados diretamente com a seguradora (Estudo Corporativo).`,
    }
  }

  const codigos = operadoraCodigos?.length ? operadoraCodigos : [null]
  const operadorasResultado = {}

  for (const codigo of codigos) {
    const { planos, motivo } = await buscarPlanosElegiveis({ regiaoNome, operadoraCodigo: codigo })
    if (motivo) continue // operadora/região não encontrada — pula, não quebra a cotação inteira

    for (const planoBase of planos) {
      const nomeOperadora = planoBase.operadoras?.nome ?? 'sem operadora'
      const pacote = await buscarCotacaoDoPlano(planoBase.plano_id)
      if (!pacote.encontrado) continue

      const precosElegiveis =
        totalVidas != null
          ? pacote.precosPorSegmentacao.filter((g) => segmentacaoElegivelPorVidas(g, totalVidas))
          : pacote.precosPorSegmentacao

      if (totalVidas != null && precosElegiveis.length === 0) continue

      if (!operadorasResultado[nomeOperadora]) operadorasResultado[nomeOperadora] = { planos: [] }

      operadorasResultado[nomeOperadora].planos.push({
        planoId: pacote.plano.plano_id,
        nome: pacote.plano.nome,
        operadora: nomeOperadora,
        operadoraId: pacote.plano.operadoras?.id ?? null,
        acomodacao: pacote.plano.acomodacao,
        linha: pacote.plano.linha,
        precosPorSegmentacao: precosElegiveis,
        redeDisponivel: { totalPrestadores: pacote.rede.totalPrestadores },
        regrasDisponiveis: pacote.regras.map((r) => r.conteudo?.titulo ?? r.tipo),
      })
    }
  }

  return { contexto: { regiaoNome, totalVidas }, operadoras: operadorasResultado, filtrosAplicados, motivoBloqueio: null }
}
