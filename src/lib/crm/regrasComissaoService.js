/**
 * SPRINT 1 (DOC-COM-001.1) — Cadastro Parametrizável de Regras de Comissão
 *
 * Modelo de 5 famílias completamente removido — não sobrou vestígio.
 *
 * Quatro responsabilidades:
 *   1. Regras de Comissão + Componentes — cadastro do Gestor
 *   2. Catálogo (produtos/operadoras) — leitura pros seletores da UI
 *   3. Comissão Sugerida — leitura/ajuste manual (exceção por apólice)
 *   4. calcularComissaoSugerida — motor de cálculo
 */

async function obterClientePadrao() {
  const { operacional } = await import('../supabaseSchemas')
  return operacional
}

async function obterClienteInstitucional() {
  const { institucional } = await import('../supabaseSchemas')
  return institucional
}

/**
 * Catálogo de produtos/operadoras pros seletores da tela de cadastro.
 * Lê direto de institucional — mesmo schema que regra_comissao.produto_id
 * e operadora_id referenciam de verdade (confirmado por inspeção).
 */
export async function listarProdutos(cliente = null) {
  const db = cliente || (await obterClienteInstitucional())
  const { data, error } = await db.from('produtos').select('id, nome, modulo, status').order('nome')
  if (error) throw new Error(`Erro ao listar produtos: ${error.message}`)
  return data ?? []
}

export async function listarOperadoras(cliente = null) {
  const db = cliente || (await obterClienteInstitucional())
  const { data, error } = await db.from('operadoras').select('id, nome').order('nome')
  if (error) throw new Error(`Erro ao listar operadoras: ${error.message}`)
  return data ?? []
}

const EVENTOS_VALIDOS = ['implantacao', 'primeira_parcela', 'parcela', 'mes_relativo', 'renovacao', 'recorrencia']
const TIPOS_VALOR_VALIDOS = ['percentual', 'valor_fixo', 'proporcional']
const BASES_CALCULO_COMPONENTE_VALIDAS = ['valor_base_venda', 'valor_liquido_recebimento']
const RECORRENCIAS_VALIDAS = ['unico', 'limitado_periodos', 'recorrente', 'vitalicio']

const MODELOS_RECEBIMENTO_VALIDOS = ['cascata', 'proporcional', 'desdobrada']
const BASES_CALCULO_REGRA_VALIDAS = ['premio_sem_iof', 'mensalidade', 'parcela_recebida', 'manual']
const ORIGENS_PERCENTUAL_VALIDAS = ['fixo', 'informado_por_apolice']

function primeiroDiaDoMes(data) {
  const d = new Date(data)
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)).toISOString().slice(0, 10)
}

function validarComponente(c, indice) {
  if (!EVENTOS_VALIDOS.includes(c.evento)) throw new Error(`Componente ${indice + 1}: evento inválido "${c.evento}"`)
  if (!TIPOS_VALOR_VALIDOS.includes(c.tipoValor)) throw new Error(`Componente ${indice + 1}: tipo de valor inválido "${c.tipoValor}"`)
  if (!RECORRENCIAS_VALIDAS.includes(c.recorrenciaTipo)) throw new Error(`Componente ${indice + 1}: recorrência inválida "${c.recorrenciaTipo}"`)
  if (!c.periodoInicio || c.periodoInicio < 1) throw new Error(`Componente ${indice + 1}: período de início deve ser >= 1`)
  if (c.periodoFim != null && c.periodoFim < c.periodoInicio) throw new Error(`Componente ${indice + 1}: período fim não pode ser menor que o início`)
  if (c.valor == null || Number(c.valor) < 0) throw new Error(`Componente ${indice + 1}: valor deve ser >= 0`)
  if (c.tipoValor === 'proporcional' && !BASES_CALCULO_COMPONENTE_VALIDAS.includes(c.baseCalculo)) {
    throw new Error(`Componente ${indice + 1}: tipo_valor proporcional exige base_calculo válida`)
  }
  if (c.tipoValor !== 'proporcional' && c.baseCalculo) {
    throw new Error(`Componente ${indice + 1}: base_calculo só se aplica a tipo_valor proporcional`)
  }
  if (c.recorrenciaTipo === 'limitado_periodos' && (!c.limitePeriodos || c.limitePeriodos < 1)) {
    throw new Error(`Componente ${indice + 1}: recorrência limitado_periodos exige limite_periodos >= 1`)
  }
  if (c.recorrenciaTipo !== 'limitado_periodos' && c.limitePeriodos) {
    throw new Error(`Componente ${indice + 1}: limite_periodos só se aplica a recorrência limitado_periodos`)
  }
}

/**
 * Validação de nível de regra (DOC-COM-003). Universal primeiro
 * (base/percentual/modelo/vitalício), depois específica por modelo:
 *   - Desdobrada: exige componentes, e a soma precisa bater com o
 *     percentual total informado (Seção 5.3 — "o sistema deve validar
 *     que o desdobramento corresponde ao percentual total")
 *   - Cascata/Proporcional: NUNCA tem componente — se vier algum, é erro
 */
function validarRegra({ baseCalculo, percentual, modeloRecebimento, origemPercentual, vitalicio, vitalicioPercentual, vitalicioPeriodoInicio, componentes }) {
  if (!BASES_CALCULO_REGRA_VALIDAS.includes(baseCalculo)) throw new Error(`Base de cálculo inválida: "${baseCalculo}"`)
  if (!ORIGENS_PERCENTUAL_VALIDAS.includes(origemPercentual)) throw new Error(`Origem do percentual inválida: "${origemPercentual}"`)
  if (!MODELOS_RECEBIMENTO_VALIDOS.includes(modeloRecebimento)) throw new Error(`Modelo de recebimento inválido: "${modeloRecebimento}"`)

  if (origemPercentual === 'informado_por_apolice' && modeloRecebimento === 'desdobrada') {
    throw new Error('Desdobrada exige percentual fixo da regra (a soma dos componentes depende dele) — não suporta "informado por apólice".')
  }

  if (origemPercentual === 'fixo') {
    if (percentual == null || Number(percentual) <= 0) throw new Error('Informe o percentual (ou valor) da comissão, maior que zero.')
  } else if (percentual != null) {
    throw new Error('Percentual informado, mas a origem está marcada como "informado por apólice" — deixe o percentual da regra vazio.')
  }

  if (vitalicio) {
    if (vitalicioPercentual == null || Number(vitalicioPercentual) <= 0) throw new Error('Vitalício marcado — informe o percentual vitalício.')
    if (modeloRecebimento === 'desdobrada' && (vitalicioPeriodoInicio == null || vitalicioPeriodoInicio < 1)) {
      throw new Error('Vitalício em regra Desdobrada exige o período de início.')
    }
  } else if (vitalicioPercentual != null || vitalicioPeriodoInicio != null) {
    throw new Error('Percentual/período de vitalício informado, mas vitalício não está marcado como Sim.')
  }

  if (modeloRecebimento === 'desdobrada') {
    if (!componentes?.length) throw new Error('Modelo Desdobrada exige pelo menos 1 componente (parcela + percentual).')
    componentes.forEach(validarComponente)
    const somaComponentes = componentes.reduce((s, c) => s + Number(c.valor), 0)
    const diferenca = Math.round((somaComponentes - Number(percentual)) * 100) / 100
    if (Math.abs(diferenca) > 0.01) {
      throw new Error(
        `A soma dos componentes (${somaComponentes.toFixed(2)}%) não bate com o percentual total informado (${Number(percentual).toFixed(2)}%). Ajuste um dos dois antes de salvar.`
      )
    }
  } else if (componentes?.length) {
    throw new Error(`Modelo ${modeloRecebimento} não usa componentes — o percentual já é suficiente. Remova os componentes adicionados.`)
  }
}

// ============================================================
// 1. REGRAS DE COMISSÃO + COMPONENTES
// ============================================================

/**
 * Cria uma regra única (uso interno — a função pública é
 * criarRegraComissao, que faz fan-out pra múltiplos produtos/operadoras).
 */
async function criarRegraUnica(db, { produtoId, operadoraId, competenciaReferencia, descricao, baseCalculo, percentual, origemPercentual, modeloRecebimento, vitalicio, vitalicioPercentual, vitalicioPeriodoInicio, componentes, criadoPor, observacoes }) {
  const { data: regra, error: erroRegra } = await db
    .from('regras_comissao')
    .insert({
      produto_id: produtoId,
      operadora_id: operadoraId,
      competencia_referencia: primeiroDiaDoMes(competenciaReferencia),
      descricao,
      base_calculo: baseCalculo,
      percentual: origemPercentual === 'fixo' ? percentual : null,
      origem_percentual: origemPercentual,
      modelo_recebimento: modeloRecebimento,
      vitalicio: !!vitalicio,
      vitalicio_percentual: vitalicio ? vitalicioPercentual : null,
      vitalicio_periodo_inicio: vitalicio && modeloRecebimento === 'desdobrada' ? vitalicioPeriodoInicio : null,
      observacoes: observacoes || null,
      criado_por: criadoPor || null,
    })
    .select()
    .single()
  if (erroRegra) throw new Error(`Erro ao criar regra (produto ${produtoId}${operadoraId ? `, operadora ${operadoraId}` : ''}): ${erroRegra.message}`)

  if (modeloRecebimento !== 'desdobrada') {
    return { ...regra, componentes: [] }
  }

  const linhasComponentes = componentes.map((c, i) => ({
    regra_comissao_id: regra.id,
    ordem: i + 1,
    evento: c.evento,
    periodo_inicio: c.periodoInicio,
    periodo_fim: c.periodoFim ?? null,
    tipo_valor: c.tipoValor,
    valor: c.valor,
    base_calculo: c.baseCalculo ?? null,
    recorrencia_tipo: c.recorrenciaTipo,
    limite_periodos: c.limitePeriodos ?? null,
  }))

  const { data: comps, error: erroComps } = await db.from('regra_comissao_componentes').insert(linhasComponentes).select()
  if (erroComps) {
    await db.from('regras_comissao').delete().eq('id', regra.id)
    throw new Error(`Erro ao criar componentes — regra desfeita: ${erroComps.message}`)
  }

  return { ...regra, componentes: comps }
}

/**
 * Cria uma ou várias regras de uma vez (Seção 2.1 — "aplicar a
 * múltiplas operadoras e/ou múltiplos produtos"). Pro Gestor é uma
 * operação só; no banco, vira 1 linha por combinação produto×operadora
 * — fan-out feito aqui, sem tabela de junção nova.
 *
 * operadoraIds vazio/null = regra geral (1 por produto, operadora nula).
 * Se qualquer combinação falhar, desfaz TODAS as já criadas neste lote
 * (nenhuma regra parcial fica órfã).
 */
export async function criarRegraComissao(
  { produtoIds, operadoraIds = [], competenciaReferencia, descricao, baseCalculo, percentual, origemPercentual = 'fixo', modeloRecebimento, vitalicio = false, vitalicioPercentual, vitalicioPeriodoInicio, componentes = [], criadoPor, observacoes },
  cliente = null
) {
  const db = cliente || (await obterClientePadrao())
  if (!produtoIds?.length) throw new Error('Selecione pelo menos 1 produto.')
  if (!competenciaReferencia) throw new Error('Informe a competência de referência.')
  if (!descricao?.trim()) throw new Error('Informe a descrição da regra.')

  validarRegra({ baseCalculo, percentual, modeloRecebimento, origemPercentual, vitalicio, vitalicioPercentual, vitalicioPeriodoInicio, componentes })

  const operadorasParaFanOut = operadoraIds?.length ? operadoraIds : [null]
  const criadas = []

  try {
    for (const produtoId of produtoIds) {
      for (const operadoraId of operadorasParaFanOut) {
        const regra = await criarRegraUnica(db, {
          produtoId,
          operadoraId,
          competenciaReferencia,
          descricao,
          baseCalculo,
          percentual,
          origemPercentual,
          modeloRecebimento,
          vitalicio,
          vitalicioPercentual,
          vitalicioPeriodoInicio,
          componentes,
          criadoPor,
          observacoes,
        })
        criadas.push(regra)
      }
    }
  } catch (e) {
    // Desfaz tudo que já foi criado neste lote — não deixar fan-out pela metade
    for (const regra of criadas) {
      await db.from('regra_comissao_componentes').delete().eq('regra_comissao_id', regra.id)
      await db.from('regras_comissao').delete().eq('id', regra.id)
    }
    throw e
  }

  return criadas
}

/**
 * Lista regras com seus componentes já embutidos (join), pra tela de
 * consulta não precisar de N+1 chamadas.
 */
export async function listarRegrasComissao({ produtoId, operadoraId, competenciaReferencia, status } = {}, cliente = null) {
  const db = cliente || (await obterClientePadrao())
  let query = db
    .from('regras_comissao')
    .select('*, componentes:regra_comissao_componentes(*)')
    .order('competencia_referencia', { ascending: false })

  if (produtoId) query = query.eq('produto_id', produtoId)
  if (operadoraId) query = query.eq('operadora_id', operadoraId)
  if (competenciaReferencia) query = query.eq('competencia_referencia', primeiroDiaDoMes(competenciaReferencia))
  if (status) query = query.eq('status', status)

  const { data, error } = await query
  if (error) throw new Error(`Erro ao listar regras: ${error.message}`)
  return data ?? []
}

/**
 * Resolução determinística (Seção 13): se existir regra específica pra
 * operadora, usa ela; senão, cai pra regra geral do produto (operadora
 * IS NULL). Nenhum outro nível de prioridade.
 */
export async function buscarRegraVigente(produtoId, operadoraId, competenciaReferencia, cliente = null) {
  const db = cliente || (await obterClientePadrao())
  const competencia = primeiroDiaDoMes(competenciaReferencia)

  if (operadoraId) {
    const { data: especifica, error: erroEspecifica } = await db
      .from('regras_comissao')
      .select('*, componentes:regra_comissao_componentes(*)')
      .eq('produto_id', produtoId)
      .eq('operadora_id', operadoraId)
      .eq('competencia_referencia', competencia)
      .eq('status', 'ativo')
      .maybeSingle()
    if (erroEspecifica) throw new Error(`Erro ao buscar regra específica: ${erroEspecifica.message}`)
    if (especifica) return especifica
  }

  const { data: geral, error: erroGeral } = await db
    .from('regras_comissao')
    .select('*, componentes:regra_comissao_componentes(*)')
    .eq('produto_id', produtoId)
    .is('operadora_id', null)
    .eq('competencia_referencia', competencia)
    .eq('status', 'ativo')
    .maybeSingle()
  if (erroGeral) throw new Error(`Erro ao buscar regra geral: ${erroGeral.message}`)
  return geral // pode ser null — produto pode não ter regra cadastrada
}

/**
 * Ativa/inativa uma regra. Se a regra já foi usada por alguma
 * comissao_sugerida, o trigger de imutabilidade do banco vai rejeitar
 * — inclusive essa troca de status. É o comportamento correto e
 * esperado (Seção 15 é literal: nenhum UPDATE em regra utilizada).
 */
export async function alterarStatusRegra(regraId, novoStatus, cliente = null) {
  const db = cliente || (await obterClientePadrao())
  if (!['ativo', 'inativo'].includes(novoStatus)) throw new Error(`Status inválido: ${novoStatus}`)

  const { data, error } = await db
    .from('regras_comissao')
    .update({ status: novoStatus, atualizado_em: new Date().toISOString() })
    .eq('id', regraId)
    .select()
    .single()

  if (error) throw new Error(`Erro ao alterar status — se a regra já foi utilizada, isso é esperado e correto (Seção 15): ${error.message}`)
  return data
}

// ============================================================
// 2. COMISSÃO SUGERIDA — leitura e ajuste manual (exceção por apólice)
// ============================================================

export async function listarSugestoesPorVenda(vendaId, cliente = null) {
  const db = cliente || (await obterClientePadrao())
  const { data, error } = await db
    .from('comissao_sugerida')
    .select('*')
    .eq('venda_id', vendaId)
    .order('competencia_referencia', { ascending: true })
  if (error) throw new Error(`Erro ao listar sugestões da venda: ${error.message}`)
  return data ?? []
}

/**
 * Exceção individual (Seção 17): ajusta o valor sugerido de UMA venda
 * numa competência, sem tocar na regra. Preserva o valor calculado
 * original na primeira vez que o ajuste acontece — chamadas
 * subsequentes não sobrescrevem o original, só o valor final.
 */
export async function ajustarComissaoSugeridaManualmente(comissaoSugeridaId, novoValor, usuarioId, cliente = null) {
  const db = cliente || (await obterClientePadrao())
  if (novoValor == null || Number(novoValor) < 0) throw new Error('Informe um valor válido (>= 0).')

  const { data: atual, error: erroAtual } = await db
    .from('comissao_sugerida')
    .select('*')
    .eq('id', comissaoSugeridaId)
    .single()
  if (erroAtual) throw new Error(`Erro ao buscar comissão sugerida: ${erroAtual.message}`)

  const valorOriginalPreservado = atual.ajustado_manualmente ? atual.valor_calculado_original : atual.valor_sugerido

  const { data, error } = await db
    .from('comissao_sugerida')
    .update({
      valor_sugerido: novoValor,
      ajustado_manualmente: true,
      valor_calculado_original: valorOriginalPreservado,
      ajustado_por: usuarioId,
      ajustado_em: new Date().toISOString(),
      atualizado_em: new Date().toISOString(),
    })
    .eq('id', comissaoSugeridaId)
    .select()
    .single()

  if (error) throw new Error(`Erro ao ajustar comissão sugerida: ${error.message}`)
  return data
}

/**
 * VALIDAÇÃO (Etapa 4, Peça 1 — aprovado pelo Chief).
 *
 * Marca a expectativa daquela venda+competência como "cenário
 * validado" — a partir daqui, ela vira a referência oficial pra
 * Conciliação, e o motor de geração NUNCA mais pode sobrescrevê-la
 * silenciosamente (ver trava em `upsertSugestao`, mais abaixo).
 *
 * Validar não exige ajuste prévio: uma sugestão que já calculou certo
 * também precisa de validação explícita do Gestor — "calculado certo"
 * e "confirmado pelo Gestor" são coisas diferentes.
 */
export async function validarComissaoSugerida(comissaoSugeridaId, usuarioId, cliente = null) {
  const db = cliente || (await obterClientePadrao())
  if (!usuarioId) throw new Error('Validação exige um usuário identificado.')

  const { data, error } = await db
    .from('comissao_sugerida')
    .update({
      status_validacao: 'validado',
      validado_por: usuarioId,
      validado_em: new Date().toISOString(),
      atualizado_em: new Date().toISOString(),
    })
    .eq('id', comissaoSugeridaId)
    .select()
    .single()

  if (error) throw new Error(`Erro ao validar comissão sugerida: ${error.message}`)
  return data
}

/**
 * Desfaz uma validação feita por engano — devolve a linha pro estado
 * "pendente", liberando o motor de geração pra recalculá-la de novo se
 * "Gerar Sugestões" for rodado. Não apaga `ajustado_manualmente` nem o
 * valor ajustado — só o status de validação em si.
 */
export async function desvalidarComissaoSugerida(comissaoSugeridaId, cliente = null) {
  const db = cliente || (await obterClientePadrao())

  const { data, error } = await db
    .from('comissao_sugerida')
    .update({
      status_validacao: 'pendente',
      validado_por: null,
      validado_em: null,
      atualizado_em: new Date().toISOString(),
    })
    .eq('id', comissaoSugeridaId)
    .select()
    .single()

  if (error) throw new Error(`Erro ao desvalidar comissão sugerida: ${error.message}`)
  return data
}

// ============================================================
// 3. calcularComissaoSugerida — motor de cálculo
// ============================================================

/**
 * Calcula (ou recalcula) a comissão sugerida de uma venda numa
 * competência. Percorre os componentes da regra vigente e aplica o
 * que corresponde ao "mês relativo" da venda naquela competência.
 *
 * Referência de vigência (mês 1, 2, 3...): `apolices.vigencia_inicio`
 * ou `contratos.vigencia_inicio`, conforme a venda tenha apolice_id ou
 * contrato_id — confirmado por inspeção real, não suposição.
 *
 * Nunca sobrescreve um valor que o Gestor já ajustou manualmente OU já
 * validou (Etapa 4, Peça 1) — as duas são travas equivalentes.
 * (Seção 17) — recalcular não pode apagar uma exceção registrada.
 */
export async function calcularComissaoSugerida({ vendaId, competenciaReferencia }, cliente = null) {
  const db = cliente || (await obterClientePadrao())
  const competencia = primeiroDiaDoMes(competenciaReferencia)

  const { data: venda, error: erroVenda } = await db
    .from('vendas')
    .select('id, produto_id, operadora_id, valor_base, apolice_id, contrato_id')
    .eq('id', vendaId)
    .single()
  if (erroVenda) throw new Error(`Erro ao buscar venda: ${erroVenda.message}`)

  // Não dá pra calcular sem saber o produto — sugestão fica "não definida"
  if (!venda.produto_id) {
    return upsertSugestao(db, { vendaId, competencia, regraId: null, valor: null, status: 'nao_definida' })
  }

  // Data de vigência: apólice ou contrato, o que a venda tiver
  let vigenciaInicio = null
  if (venda.apolice_id) {
    const { data } = await db.from('apolices').select('vigencia_inicio').eq('id', venda.apolice_id).maybeSingle()
    vigenciaInicio = data?.vigencia_inicio ?? null
  } else if (venda.contrato_id) {
    const { data } = await db.from('contratos').select('vigencia_inicio').eq('id', venda.contrato_id).maybeSingle()
    vigenciaInicio = data?.vigencia_inicio ?? null
  }
  if (!vigenciaInicio) {
    return upsertSugestao(db, { vendaId, competencia, regraId: null, valor: null, status: 'nao_definida' })
  }

  const regra = await buscarRegraVigente(venda.produto_id, venda.operadora_id, competencia, db)
  if (!regra) {
    // Seção 5.1: produto pode não ter regra cadastrada — sugestão fica não definida, não é erro
    return upsertSugestao(db, { vendaId, competencia, regraId: null, valor: null, status: 'nao_definida' })
  }

  if (regra.modelo_recebimento === 'desdobrada') {
    return calcularSugestaoDesdobrada(db, { vendaId, competencia, venda, regra, vigenciaInicio })
  }
  return calcularSugestaoCascataOuProporcional(db, { vendaId, competencia, venda, regra })
}

/**
 * Desdobrada — igual ao motor original: percorre componentes conforme
 * o mês relativo da venda.
 */
async function calcularSugestaoDesdobrada(db, { vendaId, competencia, venda, regra, vigenciaInicio }) {
  const mesRelativo = calcularMesRelativo(vigenciaInicio, competencia)
  const componente = (regra.componentes ?? [])
    .slice()
    .sort((a, b) => a.ordem - b.ordem)
    .find((c) => {
      const fimEfetivo =
        c.periodo_fim ?? (c.recorrencia_tipo === 'limitado_periodos' ? c.periodo_inicio + c.limite_periodos - 1 : null)
      return mesRelativo >= c.periodo_inicio && (fimEfetivo === null || mesRelativo <= fimEfetivo)
    })

  if (!componente) {
    return upsertSugestao(db, { vendaId, competencia, regraId: regra.id, valor: null, status: 'nao_definida' })
  }

  let baseValor = null
  if (componente.tipo_valor === 'proporcional') {
    if (componente.base_calculo === 'valor_base_venda') {
      baseValor = Number(venda.valor_base)
    } else if (componente.base_calculo === 'valor_liquido_recebimento') {
      const { data: recebimento } = await db
        .from('recebimentos_comissao')
        .select('valor_liquido')
        .eq('venda_id', vendaId)
        .eq('competencia_referencia', competencia)
        .maybeSingle()
      if (!recebimento) {
        return upsertSugestao(db, { vendaId, competencia, regraId: regra.id, valor: null, status: 'pendente_parametro' })
      }
      baseValor = Number(recebimento.valor_liquido)
    }
  }

  let valorCalculado
  if (componente.tipo_valor === 'valor_fixo') {
    valorCalculado = Number(componente.valor)
  } else if (componente.tipo_valor === 'percentual') {
    valorCalculado = Number(((Number(venda.valor_base) * Number(componente.valor)) / 100).toFixed(2))
  } else {
    valorCalculado = Number(((baseValor * Number(componente.valor)) / 100).toFixed(2))
  }

  return upsertSugestao(db, { vendaId, competencia, regraId: regra.id, valor: valorCalculado, status: 'calculada' })
}

/**
 * Cascata / Proporcional (DOC-COM-003, Seção 8) — calcula a EXPECTATIVA
 * TOTAL na Etapa 2, sem componente nenhum.
 *
 * origem_percentual = 'informado_por_apolice' (extensão pontual
 * aprovada): em vez do percentual da regra, usa
 * `apolices.comissionamento_percentual` da venda específica — pra
 * produtos como Auto, onde o percentual é negociado apólice por
 * apólice, não padronizado pela seguradora. Se a apólice não tiver
 * esse campo preenchido, fica pendente_parametro — nunca assume valor.
 *
 * LIMITE HONESTO (já registrado antes): só calculo com segurança
 * quando base_calculo = 'premio_sem_iof' — é o único valor confirmado
 * em vendas.valor_base. Outras bases ficam pendente_parametro.
 *
 * ATUALIZADO (Bloco D, aprovado pelo Chief — 15/08): quando
 * base_calculo = 'manual', cair em pendente_parametro é o
 * comportamento CORRETO e definitivo, não um gap a fechar depois — por
 * definição, "Manual" significa que o Gestor informa o valor da
 * comissão daquela apólice, sem o motor tentar calcular nada (sem
 * inventar percentual, sem inferência). O mecanismo que já existia,
 * `ajustarComissaoSugeridaManualmente` (Seção 17, "Exceção individual"
 * acima), é exatamente esse caminho — não foi preciso criar nada novo,
 * só conectar a tela (FinanceiroPage.jsx) pra orientar o Gestor a usar
 * o campo "Ajuste manual" quando a base for 'manual', em vez de mostrar
 * mensagem genérica de "sem regra".
 */
async function calcularSugestaoCascataOuProporcional(db, { vendaId, competencia, venda, regra }) {
  let percentualAplicavel = regra.percentual

  if (regra.origem_percentual === 'informado_por_apolice') {
    if (!venda.apolice_id) {
      return upsertSugestao(db, { vendaId, competencia, regraId: regra.id, valor: null, status: 'pendente_parametro' })
    }
    const { data: apolice } = await db
      .from('apolices')
      .select('comissionamento_percentual')
      .eq('id', venda.apolice_id)
      .maybeSingle()
    if (!apolice?.comissionamento_percentual) {
      return upsertSugestao(db, { vendaId, competencia, regraId: regra.id, valor: null, status: 'pendente_parametro' })
    }
    percentualAplicavel = Number(apolice.comissionamento_percentual)
  }

  if (regra.base_calculo !== 'premio_sem_iof') {
    return upsertSugestao(db, { vendaId, competencia, regraId: regra.id, valor: null, status: 'pendente_parametro' })
  }

  const valorCalculado = Number(((Number(venda.valor_base) * percentualAplicavel) / 100).toFixed(2))
  return upsertSugestao(db, { vendaId, competencia, regraId: regra.id, valor: valorCalculado, status: 'calculada' })
}

function calcularMesRelativo(vigenciaInicio, competenciaReferencia) {
  const vig = new Date(vigenciaInicio)
  const comp = new Date(competenciaReferencia)
  return (comp.getUTCFullYear() - vig.getUTCFullYear()) * 12 + (comp.getUTCMonth() - vig.getUTCMonth()) + 1
}

/**
 * Soma N meses (mesRelativo, começando em 1 = o próprio mês de
 * vigência) a partir de uma data base, sempre devolvendo o dia 1 do
 * mês resultante — mesma convenção de `primeiroDiaDoMes`.
 */
function somarMesesRelativo(dataBaseISO, mesRelativo) {
  const d = new Date(dataBaseISO)
  const resultado = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + (mesRelativo - 1), 1))
  return resultado.toISOString().slice(0, 10)
}

// ============================================================
// PROJEÇÃO DE CALENDÁRIO (Etapa 4, Peça 1 revisada — aprovado pelo
// Chief, corrigido 2x antes de codificar: idempotência por
// venda+competência, critério de elegibilidade por dado+regra, nunca
// por módulo/FK).
// ============================================================

/**
 * Elegibilidade pra projeção de calendário completo. Só roda quando
 * TUDO bate: base_calculo = 'premio_sem_iof', modelo_recebimento em
 * ('cascata','proporcional'), e o documento de origem da venda tem
 * premio + forma_pagamento_vezes preenchidos (>0).
 *
 * Critério é por DADO e por REGRA — nunca por módulo ou por
 * apolice_id/contrato_id como atalho de negócio escondido (correção
 * explícita do Chief). Na prática, hoje só `apolices` tem essas duas
 * colunas — `contratos` (Lifcare) ainda não. Não é hardcode: no dia em
 * que `contratos` ganhar as mesmas colunas, basta adicionar a mesma
 * consulta abaixo pra essa tabela — nenhuma outra peça do motor muda.
 */
async function buscarDadosParaProjecao(db, venda) {
  if (!venda.apolice_id) return null
  const { data: apolice, error } = await db
    .from('apolices')
    .select('premio, forma_pagamento_vezes, vigencia_inicio, comissionamento_percentual')
    .eq('id', venda.apolice_id)
    .maybeSingle()
  if (error) throw new Error(`Erro ao buscar apólice para projeção de calendário: ${error.message}`)
  if (!apolice?.premio || !apolice?.forma_pagamento_vezes || Number(apolice.forma_pagamento_vezes) <= 0) return null
  if (!apolice?.vigencia_inicio) return null
  return apolice
}

/**
 * Gera as linhas do calendário — puramente matemático, sem tocar
 * banco. Mecânica validada numericamente pelo Chief em 3 exemplos
 * (R$2.000/12x/20%, R$1.500/10%, R$5.000 mensalidade):
 *
 * Cascata: `passo` (premio ÷ parcelas) é o LIMITE de comissão
 * consumido por competência, abatendo do saldo total da comissão
 * (premio × percentual / 100) até zerar — não é o passo multiplicado
 * pelo percentual de novo, é o próprio passo usado como teto de
 * consumo do saldo já calculado. Para antes das N parcelas se a
 * comissão total esgotar primeiro (é o comportamento correto e
 * esperado, não um bug).
 *
 * Proporcional: percorre as N parcelas inteiras, cada uma recebendo
 * `passo × percentual / 100` — nunca esgota antes do fim. Última
 * parcela fecha o residual exato, evitando erro de arredondamento.
 */
function projetarLinhasCalendario({ premio, percentual, parcelas, modeloRecebimento }) {
  const totalComissao = Number(((Number(premio) * Number(percentual)) / 100).toFixed(2))
  const passo = Number(premio) / Number(parcelas)
  const linhas = []

  if (modeloRecebimento === 'cascata') {
    let saldo = totalComissao
    for (let mes = 1; mes <= Number(parcelas) && saldo > 0.004; mes++) {
      const valor = Number(Math.min(passo, saldo).toFixed(2))
      linhas.push({ mesRelativo: mes, valor })
      saldo = Number((saldo - valor).toFixed(2))
    }
  } else {
    // proporcional
    let somaParcial = 0
    for (let mes = 1; mes <= Number(parcelas); mes++) {
      const ehUltima = mes === Number(parcelas)
      const valor = ehUltima
        ? Number((totalComissao - somaParcial).toFixed(2))
        : Number(((passo * Number(percentual)) / 100).toFixed(2))
      somaParcial += valor
      linhas.push({ mesRelativo: mes, valor })
    }
  }

  return linhas
}

/**
 * Escrita idempotente por (venda_id, competencia) — correção do
 * Chief ao ponto 3: nunca "se existe qualquer linha, pula a venda
 * inteira" (isso deixaria calendário incompleto parecer completo se
 * uma execução anterior falhasse no meio). A regra é por LINHA:
 * não existe → cria; existe pendente (nem ajustada, nem validada) →
 * recompõe; existe ajustada OU validada → nunca sobrescreve.
 */
async function upsertLinhaCalendario(db, { vendaId, competencia, regraId, valor }) {
  const { data: existente, error: erroExistente } = await db
    .from('comissao_sugerida')
    .select('id, ajustado_manualmente, status_validacao')
    .eq('venda_id', vendaId)
    .eq('competencia_referencia', competencia)
    .maybeSingle()
  if (erroExistente) throw new Error(`Erro ao verificar linha existente do calendário: ${erroExistente.message}`)

  if (existente?.ajustado_manualmente || existente?.status_validacao === 'validado') {
    return 'preservada'
  }

  const { error } = await db.from('comissao_sugerida').upsert(
    {
      venda_id: vendaId,
      regra_comissao_id: regraId,
      competencia_referencia: competencia,
      valor_sugerido: valor,
      status_calculo: 'calculada',
      atualizado_em: new Date().toISOString(),
    },
    { onConflict: 'venda_id,competencia_referencia' }
  )
  if (error) throw new Error(`Erro ao gravar linha do calendário: ${error.message}`)

  return existente ? 'atualizada' : 'criada'
}

/**
 * Ponto de entrada da projeção — chamado por `gerarSugestoesCompetencia`
 * ANTES do caminho antigo (calcularComissaoSugerida, mês a mês). Se a
 * venda não for elegível (falta prêmio/parcelas, base diferente de
 * premio_sem_iof, ou modelo Desdobrada), devolve `elegivel: false` e
 * quem chamou cai automaticamente no comportamento antigo — nada
 * quebra pra quem não usa esta mecânica nova.
 */
export async function projetarCalendarioSeElegivel({ vendaId }, cliente = null) {
  const db = cliente || (await obterClientePadrao())

  const { data: venda, error: erroVenda } = await db
    .from('vendas')
    .select('id, produto_id, operadora_id, apolice_id, contrato_id')
    .eq('id', vendaId)
    .single()
  if (erroVenda) throw new Error(`Erro ao buscar venda: ${erroVenda.message}`)
  if (!venda.produto_id) return { elegivel: false }

  const apolice = await buscarDadosParaProjecao(db, venda)
  if (!apolice) return { elegivel: false }

  const competenciaAncora = primeiroDiaDoMes(apolice.vigencia_inicio)
  const regra = await buscarRegraVigente(venda.produto_id, venda.operadora_id, competenciaAncora, db)
  if (!regra) return { elegivel: false }
  if (regra.base_calculo !== 'premio_sem_iof') return { elegivel: false }
  if (!['cascata', 'proporcional'].includes(regra.modelo_recebimento)) return { elegivel: false }

  let percentualAplicavel = regra.percentual
  if (regra.origem_percentual === 'informado_por_apolice') {
    if (!apolice.comissionamento_percentual) return { elegivel: false } // cai no caminho antigo (pendente_parametro)
    percentualAplicavel = Number(apolice.comissionamento_percentual)
  }

  const linhas = projetarLinhasCalendario({
    premio: apolice.premio,
    percentual: percentualAplicavel,
    parcelas: apolice.forma_pagamento_vezes,
    modeloRecebimento: regra.modelo_recebimento,
  })

  let criadas = 0
  let atualizadas = 0
  let preservadas = 0

  for (const linha of linhas) {
    const competencia = somarMesesRelativo(apolice.vigencia_inicio, linha.mesRelativo)
    const resultado = await upsertLinhaCalendario(db, {
      vendaId,
      competencia,
      regraId: regra.id,
      valor: linha.valor,
    })
    if (resultado === 'criada') criadas++
    else if (resultado === 'atualizada') atualizadas++
    else preservadas++
  }

  return { elegivel: true, totalLinhas: linhas.length, criadas, atualizadas, preservadas }
}

async function upsertSugestao(db, { vendaId, competencia, regraId, valor, status }) {
  // Nunca sobrescreve exceção manual já registrada (Seção 17) NEM
  // cenário já validado pelo Gestor (Etapa 4, Peça 1) — validação é
  // uma trava tão forte quanto ajuste manual: uma vez que o Gestor
  // confirmou aquela expectativa, ela vira referência da Conciliação e
  // nenhuma nova execução de "Gerar Sugestões" pode mudar isso por
  // baixo dos panos.
  const { data: existente } = await db
    .from('comissao_sugerida')
    .select('id, ajustado_manualmente, status_validacao')
    .eq('venda_id', vendaId)
    .eq('competencia_referencia', competencia)
    .maybeSingle()

  if (existente?.ajustado_manualmente || existente?.status_validacao === 'validado') {
    return existente // preserva a exceção do Gestor ou o cenário validado, não recalcula por cima
  }

  const { data, error } = await db
    .from('comissao_sugerida')
    .upsert(
      {
        venda_id: vendaId,
        regra_comissao_id: regraId,
        competencia_referencia: competencia,
        valor_sugerido: valor,
        status_calculo: status,
        atualizado_em: new Date().toISOString(),
      },
      { onConflict: 'venda_id,competencia_referencia' }
    )
    .select()
    .single()

  if (error) throw new Error(`Erro ao gravar comissão sugerida: ${error.message}`)
  return data
}

// ============================================================
// 4. COMISSÕES SUGERIDAS — geração em lote + leitura detalhada pra UI
// ============================================================

/**
 * Vendas candidatas a ter sugestão calculada: fechadas e com produto
 * vinculado. Vendas sem produto_id ficam de fora daqui de propósito —
 * aparecem como "sem produto" na tela, não como erro.
 */
async function listarVendasFechadasComProduto(cliente) {
  const db = cliente || (await obterClientePadrao())
  const { data, error } = await db.from('vendas').select('id').eq('status', 'fechada').not('produto_id', 'is', null)
  if (error) throw new Error(`Erro ao listar vendas: ${error.message}`)
  return data ?? []
}

/**
 * Roda calcularComissaoSugerida pra todas as vendas elegíveis, numa
 * competência. Não é lógica nova — só chama a função já existente em
 * lote. Sequencial (não Promise.all) pra não sobrecarregar o Supabase
 * com uma rajada de requisições numa base grande.
 */
export async function gerarSugestoesCompetencia(competenciaReferencia, cliente = null) {
  const db = cliente || (await obterClientePadrao())
  const vendas = await listarVendasFechadasComProduto(db)

  let processadas = 0
  const erros = []
  for (const v of vendas) {
    try {
      // Etapa 4, Peça 1 revisada: tenta projetar o calendário completo
      // primeiro (Cascata/Proporcional com premio_sem_iof). Se a venda
      // não for elegível, cai no caminho antigo (calcula só a
      // competência selecionada) — comportamento idêntico ao de antes
      // pra qualquer venda que não use essa mecânica nova.
      const resultadoProjecao = await projetarCalendarioSeElegivel({ vendaId: v.id }, db)
      if (!resultadoProjecao.elegivel) {
        await calcularComissaoSugerida({ vendaId: v.id, competenciaReferencia }, db)
      }
      processadas++
    } catch (e) {
      erros.push({ vendaId: v.id, erro: e.message })
    }
  }
  return { totalVendas: vendas.length, processadas, erros }
}

/**
 * Leitura completa pra tela: comissao_sugerida + venda + apólice/contrato
 * (pra número e cliente) + regra com seus componentes — tudo dentro do
 * schema operacional, que suporta select aninhado via FK. Nomes de
 * produto/operadora vêm de institucional à parte (schemas diferentes
 * não dão join direto num único select) e são mesclados aqui.
 */
/**
 * CORREÇÃO (Etapa 4, Peça 1 revisada — aprovado pelo Chief): deixou de
 * filtrar por uma única competência. Com o calendário completo sendo
 * projetado de uma vez (Cascata/Proporcional), filtrar por mês
 * escondia o resto do cronograma da mesma venda — o Gestor precisa ver
 * tudo simultaneamente pra validar o cenário inteiro, não mês a mês.
 * A tela agora agrupa por `venda_id` e ordena por competência dentro
 * de cada grupo. `forma_pagamento_vezes` foi adicionado ao select da
 * apólice pra tela conseguir avisar quando o calendário não foi
 * projetado por falta desse dado (sem esconder isso do Gestor).
 */
export async function listarComissoesSugeridasDetalhado(cliente = null) {
  const db = cliente || (await obterClientePadrao())

  const { data: linhas, error } = await db
    .from('comissao_sugerida')
    .select(
      `*,
       venda:vendas(id, produto_id, operadora_id, valor_base, apolice_id, contrato_id,
         apolice:apolices(numero_apolice, nome_cliente, forma_pagamento_vezes),
         contrato:contratos(numero_apolice)),
       regra:regras_comissao(id, descricao, base_calculo, modelo_recebimento, percentual, origem_percentual, componentes:regra_comissao_componentes(*))`
    )
    .order('venda_id', { ascending: true })
    .order('competencia_referencia', { ascending: true })
  if (error) throw new Error(`Erro ao listar comissões sugeridas: ${error.message}`)

  const produtoIds = [...new Set((linhas ?? []).map((l) => l.venda?.produto_id).filter(Boolean))]
  const operadoraIds = [...new Set((linhas ?? []).map((l) => l.venda?.operadora_id).filter(Boolean))]

  const [produtos, operadoras] = await Promise.all([
    produtoIds.length ? listarProdutos() : Promise.resolve([]),
    operadoraIds.length ? listarOperadoras() : Promise.resolve([]),
  ])
  const produtoPorId = Object.fromEntries(produtos.map((p) => [p.id, p.nome]))
  const operadoraPorId = Object.fromEntries(operadoras.map((o) => [o.id, o.nome]))

  return (linhas ?? []).map((l) => ({
    ...l,
    nomeProduto: l.venda?.produto_id ? (produtoPorId[l.venda.produto_id] ?? '—') : '—',
    nomeOperadora: l.venda?.operadora_id ? (operadoraPorId[l.venda.operadora_id] ?? '—') : '—',
    numeroApolice: l.venda?.apolice?.numero_apolice ?? l.venda?.contrato?.numero_apolice ?? '—',
    nomeCliente: l.venda?.apolice?.nome_cliente ?? '—',
  }))
}
