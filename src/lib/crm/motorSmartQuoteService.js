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
 * @param {{ regiaoId?: string, regiaoNome?: string, operadoraCodigo?: string }} contexto
 *   regiaoId: id real de institucional.regioes_tarifarias — CAMINHO
 *     PREFERIDO (21/08). Filtra direto, sem nenhuma busca por nome no
 *     meio — elimina de vez a categoria inteira de bug que já vimos
 *     (acento, nome duplicado, região órfã) porque nunca compara texto.
 *   regiaoNome: mantido só por retrocompatibilidade — usado SÓ quando
 *     regiaoId não vier. Continua fazendo a busca por nome exato
 *     (ilike) como sempre fez.
 *   operadoraCodigo: nome/código da operadora pra filtrar uma só (opcional)
 */
export async function buscarPlanosElegiveis({ regiaoId = null, regiaoNome = null, operadoraCodigo = null } = {}) {
  let regiaoIdResolvido = regiaoId
  if (!regiaoId && regiaoNome) {
    // filtra depois de buscar o id, pra não depender de embed filtrável
    const { data: regiao, error: erroRegiao } = await institucional
      .from('regioes_tarifarias')
      .select('id')
      .ilike('nome', regiaoNome)
      .maybeSingle()
    if (erroRegiao) throw new Error(`Erro buscando região "${regiaoNome}": ${erroRegiao.message}`)
    if (!regiao) return { planos: [], motivo: `Nenhuma região tarifária encontrada com nome "${regiaoNome}".` }
    regiaoIdResolvido = regiao.id
  }

  let operadoraIdResolvido = null
  if (operadoraCodigo) {
    const { data: operadora, error: erroOperadora } = await institucional
      .from('operadoras')
      .select('id')
      .ilike('nome', `%${operadoraCodigo}%`)
      .eq('status', 'ativa')
      .maybeSingle()
    if (erroOperadora) throw new Error(`Erro buscando operadora "${operadoraCodigo}": ${erroOperadora.message}`)
    if (!operadora) return { planos: [], motivo: `Nenhuma operadora ativa encontrada com nome "${operadoraCodigo}".` }
    operadoraIdResolvido = operadora.id
  }

  // CORRIGIDO (25/08) — antes reaproveitava a mesma variável `query`
  // (builder já com filtros aplicados) em cada volta do loop de
  // paginação — arriscado, builder do Supabase não é garantidamente
  // seguro pra reusar depois de já ter sido resolvido numa consulta
  // anterior. Agora monta uma consulta NOVA a cada página, sempre com
  // os mesmos filtros (região/operadora já resolvidos acima, fora do
  // loop, pra não repetir aquelas idas ao banco a cada página).
  //
  // Também corrigido o `.range()` de tamanho fixo (mesmo padrão frágil
  // que já quebrou 2 vezes em buscarCotacoesEmLote): pagina de verdade,
  // continua buscando até a página vir menor que o pedido, em vez de
  // confiar que o catálogo nunca vai passar de um teto fixo.
  function montarConsultaPagina(inicio, fim) {
    let q = institucional
      .from('mercado_saude_planos')
      .select(
        `
        plano_id, nome, acomodacao, linha, status,
        operadoras:operadora_id ( id, nome, logo_url, logo_fundo_chip ),
        regioes_tarifarias:regiao_tarifaria_id ( id, nome )
      `
      )
      .eq('status', 'ativo')
    if (regiaoIdResolvido) q = q.eq('regiao_tarifaria_id', regiaoIdResolvido)
    if (operadoraIdResolvido) q = q.eq('operadora_id', operadoraIdResolvido)
    return q.order('nome').range(inicio, fim)
  }

  const PAGINA = 999
  let inicio = 0
  const todosPlanos = []
  while (true) {
    const { data: pagina, error } = await montarConsultaPagina(inicio, inicio + PAGINA - 1)
    if (error) throw new Error(`Erro buscando planos elegíveis: ${error.message}`)
    todosPlanos.push(...(pagina ?? []))
    if (!pagina || pagina.length < PAGINA) break
    inicio += PAGINA
  }

  return { planos: todosPlanos, motivo: null }
}

/**
 * Sprint 3b (21/08) — versão EM LOTE de `buscarCotacaoDoPlano`, usada só
 * por `montarCotacaoEstruturada`. Achado real de performance (21/08):
 * com as 12 operadoras aparecendo de verdade agora (região corrigida +
 * BMR-006 completo), o número de planos elegíveis numa cotação saltou
 * de ~4 (só as 4 operadoras que tinham região certa) pra ~150+ — e o
 * código buscava cada plano em SEQUÊNCIA, com 4 consultas próprias
 * cada um (preços, contagem de rede, amostra de rede, regras). A
 * lentidão sentida é exatamente isso: centenas de idas ao banco, uma
 * atrás da outra, quando antes eram só ~16 (4 planos × 4 consultas).
 *
 * Dois achados que tornam essa versão MUITO mais rápida sem perder
 * nada: (1) regras são as MESMAS pra todos os planos da MESMA
 * operadora — buscar 1x por operadora em vez de 1x por plano evita
 * repetir a consulta idêntica dezenas de vezes; (2) "amostra" (10
 * prestadores de exemplo) nunca é usada pelo resultado final de
 * `montarCotacaoEstruturada` — só `totalPrestadores` é — então parei de
 * buscar amostra aqui (continua existindo em `buscarCotacaoDoPlano`,
 * pra quem realmente precisa dela numa tela de detalhe de 1 plano só).
 *
 * Resultado: ~3 consultas TOTAIS por chamada, não 4×N. Mesmo formato de
 * retorno de sempre (por plano_id) — quem consome não percebe diferença
 * nenhuma no dado, só na velocidade.
 */
/** Divide um array em pedaços de até `tamanho` itens — usado pra evitar
 *  estourar limite de tamanho de URL quando `.in()` recebe uma lista
 *  grande de valores (alguns `plano_id` passam de 70 caracteres). */
function dividirEmLotes(array, tamanho) {
  const lotes = []
  for (let i = 0; i < array.length; i += tamanho) {
    lotes.push(array.slice(i, i + tamanho))
  }
  return lotes
}

/** Roda a mesma consulta `.in(coluna, valores)` em vários lotes e junta
 *  os resultados — resiliente a listas grandes (evita estourar URL).
 *
 *  CORRIGIDO (25/08) — a versão antiga confiava num TAMANHO_LOTE fixo
 *  pra nunca passar do teto de 1000 linhas por resposta do Supabase
 *  (calculado pra caber a operadora mais densa da época, SulAmérica).
 *  Quebrou de novo ao adicionar a 13ª/14ª operadora — silencioso, sem
 *  erro nenhum, só sumindo planos/operadoras da tela (o mesmo sintoma
 *  de antes). Chutar um "tamanho seguro" não escala: cada operadora
 *  nova pode ser mais densa que a anterior, e o bug sempre volta.
 *
 *  Agora `montarConsulta` recebe também o início/fim do intervalo, e
 *  esta função pagina de verdade DENTRO de cada lote — continua
 *  buscando em janelas de 1000 até a resposta vir com MENOS linhas do
 *  que o pedido (só aí sabemos que não sobrou nada). Resolve o teto do
 *  servidor na raiz — não depende mais de adivinhar densidade por
 *  operadora, então não quebra de novo quando a 15ª/16ª/... operadora
 *  entrar no catálogo. */
async function buscarEmLotesDeValores(valores, tamanhoDoLote, montarConsulta) {
  const lotes = dividirEmLotes(valores, tamanhoDoLote)
  const PAGINA = 1000
  const linhas = []
  for (const lote of lotes) {
    let inicio = 0
    while (true) {
      const { data, error } = await montarConsulta(lote, inicio, inicio + PAGINA - 1)
      if (error) throw error
      linhas.push(...(data ?? []))
      if (!data || data.length < PAGINA) break
      inicio += PAGINA
    }
  }
  return linhas
}

async function buscarCotacoesEmLote(planosBase) {
  const planoIds = planosBase.map((p) => p.plano_id)
  if (planoIds.length === 0) return new Map()

  // ACHADO (21/08): mandar TODOS os plano_id numa única .in() estourava
  // o tamanho da URL da consulta com ~150 planos (vários plano_id têm
  // 70+ caracteres, ex: operadoras com slug técnico longo) — a consulta
  // falhava e "buscar planos" parava de achar qualquer coisa.
  //
  // ATUALIZADO (21/08, 2ª correção) — achado mais sério: o teto de 1000
  // linhas por resposta é do SERVIDOR (Supabase), não algo que dá pra
  // sobrescrever só pedindo `.range()` maior do lado do código.
  //
  // ATUALIZADO (25/08, 3ª correção) — a 2ª correção (lote de 5 planos)
  // quebrou de novo com a 13ª/14ª operadora, mais densa que a
  // SulAmérica (a mais densa até então). `buscarEmLotesDeValores` agora
  // pagina de verdade dentro de cada lote (ver comentário na função) —
  // TAMANHO_LOTE aqui só existe pra não estourar o tamanho da URL
  // (motivo original da 1ª correção), não precisa mais ser pequeno o
  // suficiente pra nunca passar de 1000 linhas — isso quem resolve
  // agora é a paginação, não o tamanho do lote.
  const TAMANHO_LOTE = 5
  let todosPrecos, todaRede
  try {
    // Sequencial (não Promise.all) — eliminado paralelismo enquanto
    // investigávamos outra hipótese; mantido por segurança.
    todosPrecos = await buscarEmLotesDeValores(planoIds, TAMANHO_LOTE, (lote, inicio, fim) =>
      institucional
        .from('mercado_saude_precos')
        .select(
          'plano_id, segmentacao, familia_tarifaria, faixa_etaria, valor, vidas_min, vidas_max, mei, coparticipacao_tipo, tipo_contratacao'
        )
        .in('plano_id', lote)
        .range(inicio, fim)
    )
    todaRede = await buscarEmLotesDeValores(planoIds, TAMANHO_LOTE, (lote, inicio, fim) =>
      institucional.from('mercado_saude_rede_cobertura').select('plano_id').in('plano_id', lote).range(inicio, fim)
    )
  } catch (erro) {
    throw new Error(`Erro buscando preços/rede em lote: ${erro.message}`)
  }
  // Ordenação que antes vinha do banco (order('plano_id').order('segmentacao')...)
  // agora é feita aqui, já que os lotes voltam em paralelo sem ordem
  // garantida entre si.
  todosPrecos.sort(
    (a, b) =>
      a.plano_id.localeCompare(b.plano_id) ||
      a.segmentacao.localeCompare(b.segmentacao) ||
      a.faixa_etaria.localeCompare(b.faixa_etaria)
  )

  const precosPorPlano = new Map()
  for (const p of todosPrecos) {
    if (!precosPorPlano.has(p.plano_id)) precosPorPlano.set(p.plano_id, [])
    precosPorPlano.get(p.plano_id).push(p)
  }

  // Supabase/PostgREST não agrupa COUNT nativamente por essa via — conta
  // em memória mesmo, ainda assim é poucas consultas pra todos os planos.
  const totalPrestadoresPorPlano = new Map()
  for (const r of todaRede) {
    totalPrestadoresPorPlano.set(r.plano_id, (totalPrestadoresPorPlano.get(r.plano_id) ?? 0) + 1)
  }

  const operadoraIdsUnicos = [...new Set(planosBase.map((p) => p.operadoras?.id).filter(Boolean))]
  // CORRIGIDO (25/08) — mesmo padrão dos outros pontos deste arquivo:
  // `.range(0, 4999)` não é garantia real contra o teto de 1000 linhas
  // por resposta do servidor. Regras são poucas linhas por operadora
  // hoje, risco baixo na prática, mas paginado por consistência — não
  // custa nada e evita reabrir essa investigação de novo no futuro.
  let todasRegras = []
  if (operadoraIdsUnicos.length > 0) {
    const PAGINA_REGRAS = 1000
    let inicioRegras = 0
    while (true) {
      const { data: paginaRegras, error: erroRegras } = await institucional
        .from('mercado_saude_regras')
        .select('operadora_id, tipo, conteudo')
        .in('operadora_id', operadoraIdsUnicos)
        .order('tipo')
        .range(inicioRegras, inicioRegras + PAGINA_REGRAS - 1)
      if (erroRegras) throw new Error(`Erro buscando regras em lote: ${erroRegras.message}`)
      todasRegras.push(...(paginaRegras ?? []))
      if (!paginaRegras || paginaRegras.length < PAGINA_REGRAS) break
      inicioRegras += PAGINA_REGRAS
    }
  }

  const regrasPorOperadora = new Map()
  for (const r of todasRegras ?? []) {
    if (!regrasPorOperadora.has(r.operadora_id)) regrasPorOperadora.set(r.operadora_id, [])
    regrasPorOperadora.get(r.operadora_id).push(r)
  }

  const resultado = new Map()
  for (const plano of planosBase) {
    resultado.set(plano.plano_id, {
      encontrado: true,
      plano,
      precosPorSegmentacao: agruparPrecosPorSegmentacao(precosPorPlano.get(plano.plano_id) ?? []),
      rede: { totalPrestadores: totalPrestadoresPorPlano.get(plano.plano_id) ?? 0 },
      regras: regrasPorOperadora.get(plano.operadoras?.id) ?? [],
    })
  }
  return resultado
}

/**
 * Devolve o "pacote de cotação" completo de UM plano — preço (todas as
 * segmentações disponíveis, agrupadas), rede (resumo + amostra) e
 * regras da operadora — tudo cruzado por plano_id, como o Chief pediu
 * no teste ponta a ponta. Sem escolher segmentação sozinho (ver nota
 * no topo do arquivo) — devolve a lista pro corretor decidir.
 *
 * Pra buscar VÁRIOS planos de uma vez (ex: a cascata inteira), use
 * `montarCotacaoEstruturada` — ela usa a versão em lote internamente,
 * bem mais rápida que chamar esta função várias vezes em sequência.
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

/**
 * Sprint 3b (21/08) — rótulo amigável pra segmentação, pro seletor do
 * corretor. Achado real: várias operadoras usam `tabela_XX` opaco como
 * texto de segmentação (Bradesco, Hapvida, Porto, Sobam, Unimed) —
 * ilegível pro corretor decidir qual escolher.
 *
 * DE PROPÓSITO monta o rótulo só a partir das colunas do BMR-006
 * (vidas_min/max, mei, coparticipacao_tipo, tipo_contratacao) — a MESMA
 * fonte de verdade já validada linha a linha ontem contra as fontes
 * originais e, em vários casos, contra o Painel do Corretor real. Não
 * tenta decodificar/embelezar o texto opaco `tabela_XX` em si (isso
 * exigiria lógica nova por operadora, arriscando afirmar algo que a
 * fonte não confirma). Cai no texto bruto só se as 4 colunas vierem
 * todas vazias (não deveria acontecer, BMR-006 está completo nas 12).
 */
/**
 * Sprint 3b (21/08) — rótulo amigável pra segmentação, pro seletor do
 * corretor. Achado real: várias operadoras usam `tabela_XX` opaco como
 * texto de segmentação (Bradesco, Hapvida, Porto, Sobam, Unimed) —
 * ilegível pro corretor decidir qual escolher.
 *
 * DE PROPÓSITO monta o rótulo só a partir das colunas do BMR-006
 * (vidas_min/max, mei, coparticipacao_tipo, tipo_contratacao) — a MESMA
 * fonte de verdade já validada linha a linha ontem contra as fontes
 * originais e, em vários casos, contra o Painel do Corretor real. Não
 * tenta decodificar/embelezar o texto opaco `tabela_XX` em si (isso
 * exigiria lógica nova por operadora, arriscando afirmar algo que a
 * fonte não confirma). Cai no texto bruto só se as 4 colunas vierem
 * todas vazias (não deveria acontecer, BMR-006 está completo nas 12).
 *
 * ATUALIZADO (21/08, achado real) — SulAmérica tem 2 tabelas de preço
 * genuinamente diferentes (vigência 12 meses vs 24 meses, valores
 * diferentes de verdade — 24m sai mais barato) que batem igual nas 4
 * colunas acima, então pareciam duplicadas no seletor sem essa parte.
 * A vigência não é uma coluna própria no BMR-006 (não fazia parte do
 * mapeamento original), mas já vem embutida no texto de `segmentacao`
 * de quem usa esse padrão (ex: "..._12m_...", "..._24m_..."). Detecta
 * esse padrão e acrescenta ao rótulo só quando encontra — não afeta
 * operadoras que não usam essa convenção.
 */
export function descreverSegmentacao(grupo) {
  const partes = []
  if (grupo.vidasMin != null && grupo.vidasMax != null) {
    partes.push(
      grupo.vidasMin === grupo.vidasMax ? `${grupo.vidasMin} vida${grupo.vidasMin === 1 ? '' : 's'}` : `${grupo.vidasMin} a ${grupo.vidasMax} vidas`
    )
  }
  if (grupo.mei != null) partes.push(grupo.mei ? 'MEI' : 'Não MEI')
  if (grupo.coparticipacaoTipo) partes.push(grupo.coparticipacaoTipo)
  if (grupo.tipoContratacao) partes.push(grupo.tipoContratacao)

  const vigenciaEncontrada = grupo.segmentacao?.match(/_(\d{1,2})m_/)
  if (vigenciaEncontrada) partes.push(`Vigência ${vigenciaEncontrada[1]} meses`)

  return partes.length > 0 ? partes.join(' · ') : grupo.segmentacao
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
  // CORRIGIDO (25/08) — mesmo engano já corrigido em outros pontos deste
  // arquivo: `.range(0, 19999)` NÃO sobrescreve o teto de 1000 linhas
  // por resposta do Supabase. Sem paginação de verdade, uma operadora
  // nova cujas linhas de preço ficassem fora das primeiras 1000
  // poderia introduzir uma faixa etária nova que nunca apareceria no
  // seletor — silencioso, sem erro. Pagina de verdade, igual ao resto.
  const PAGINA = 1000
  let inicio = 0
  const todasFaixas = []
  while (true) {
    const { data, error } = await institucional
      .from('mercado_saude_precos')
      .select('faixa_etaria')
      .range(inicio, inicio + PAGINA - 1)
    if (error) throw new Error(`Erro buscando faixas etárias: ${error.message}`)
    todasFaixas.push(...(data ?? []))
    if (!data || data.length < PAGINA) break
    inicio += PAGINA
  }

  const unicas = [...new Set(todasFaixas.map((r) => r.faixa_etaria))]
  // ordena pelo primeiro número da faixa (funciona pros formatos "0 a 18" e "00-18")
  return unicas.sort((a, b) => (parseInt(a, 10) || 0) - (parseInt(b, 10) || 0))
}

/**
 * Sprint 3b (20/08) — lista as regiões tarifárias reais cadastradas, pro
 * autocomplete do Passo 1 (ContextoCotacaoForm). Achado real: corretor
 * digitando "Jundiaí" de cabeça (sem saber se tem acento/hífen no banco)
 * batia em nenhuma operadora — a busca (`buscarPlanosElegiveis`) usa nome
 * exato. Com a lista vindo direto daqui, o formulário sempre manda o
 * texto EXATO que está no banco, nunca o que o corretor digitou de
 * memória.
 *
 * ATUALIZADO (21/08) — só lista região com pelo menos 1 plano de
 * verdade vinculado. Achado: depois de corrigir o vínculo de 8
 * operadoras pra "Jundiaí" (20/08), sobraram 3 linhas órfãs em
 * `regioes_tarifarias` ("São Paulo (Interior I)", "Interior I", "SP
 * Interior I") sem nenhum plano apontando mais pra elas — apareciam no
 * autocomplete mesmo sem servir pra nada ainda. Filtra pelo join em vez
 * de apagar as linhas — se um dia precisar reaproveitar alguma (ex:
 * quando "São Paulo" virar região de verdade), ela já existe, só não
 * aparece enquanto não tiver uso real.
 */
export async function buscarRegioesTarifariasDisponiveis() {
  const { data, error } = await institucional
    .from('regioes_tarifarias')
    .select('id, nome, mercado_saude_planos!inner(plano_id)')
    .order('nome')
  if (error) throw new Error(`Erro buscando regiões tarifárias: ${error.message}`)

  // O join !inner pode devolver 1 linha por combinação região×plano —
  // desduplica por id antes de devolver (o formulário só quer {id, nome}).
  const vistos = new Set()
  const regioesUnicas = []
  for (const r of data ?? []) {
    if (vistos.has(r.id)) continue
    vistos.add(r.id)
    regioesUnicas.push({ id: r.id, nome: r.nome })
  }
  return regioesUnicas
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
 * @param {{ regiaoId?: string, regiaoNome?: string, operadoraCodigos?: string[], totalVidas?: number }} contexto
 *   regiaoId: caminho preferido (21/08) — filtra direto por id, sem
 *   busca por nome. regiaoNome fica só de retrocompatibilidade/exibição.
 *   totalVidas: soma de vidas da cotação (Sprint 3b) — quando informado,
 *   filtra as segmentações elegíveis por vidas_min/vidas_max (BMR-006).
 *   Plano sem nenhuma segmentação elegível não entra no resultado — é
 *   assim que uma operadora inteira "some" quando nenhum plano dela bate
 *   o critério, como o Chief pediu na cascata.
 */
export async function montarCotacaoEstruturada({
  regiaoId = null,
  regiaoNome = null,
  operadoraCodigos = null,
  totalVidas = null,
} = {}) {
  const filtrosAplicados = { regiaoId, regiaoNome, operadoraCodigos: operadoraCodigos ?? 'todas', totalVidas }

  if (totalVidas != null && totalVidas > LIMITE_VIDAS_MULTICALCULO) {
    return {
      contexto: { regiaoId, regiaoNome, totalVidas },
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
    const { planos, motivo } = await buscarPlanosElegiveis({ regiaoId, regiaoNome, operadoraCodigo: codigo })
    if (motivo) continue // operadora/região não encontrada — pula, não quebra a cotação inteira

    // Achado de performance (21/08): buscar plano por plano em sequência
    // (4 consultas cada) virou centenas de idas ao banco assim que as 12
    // operadoras passaram a aparecer de verdade. `buscarCotacoesEmLote`
    // faz tudo em poucas consultas em lote — ver nota na função.
    const pacotesPorPlano = await buscarCotacoesEmLote(planos)

    for (const planoBase of planos) {
      const nomeOperadora = planoBase.operadoras?.nome ?? 'sem operadora'
      const pacote = pacotesPorPlano.get(planoBase.plano_id)
      if (!pacote?.encontrado) continue

      const precosElegiveis =
        totalVidas != null
          ? pacote.precosPorSegmentacao.filter((g) => segmentacaoElegivelPorVidas(g, totalVidas))
          : pacote.precosPorSegmentacao

      if (totalVidas != null && precosElegiveis.length === 0) {
        continue
      }

      if (!operadorasResultado[nomeOperadora]) {
        operadorasResultado[nomeOperadora] = {
          planos: [],
          logoUrl: pacote.plano.operadoras?.logo_url ?? null,
          logoFundoChip: pacote.plano.operadoras?.logo_fundo_chip ?? null,
        }
      }

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

  return { contexto: { regiaoId, regiaoNome, totalVidas }, operadoras: operadorasResultado, filtrosAplicados, motivoBloqueio: null }
}
