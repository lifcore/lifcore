/**
 * Import do client padrão feito de forma LAZY (dinâmica), nunca no
 * topo do arquivo. Motivo: quando quem chama já passa um `cliente`
 * explícito (ex.: o harness de homologação, rodando em Node puro fora
 * do Vite), este arquivo não deve nem tentar carregar
 * `supabaseSchemas.js` — esse arquivo depende de variáveis de
 * ambiente do Vite (`import.meta.env`) que não existem em Node puro,
 * e quebraria o script de teste mesmo sem nunca ser realmente usado.
 */
async function obterClientePadrao() {
  const { operacional } = await import('../supabaseSchemas')
  return operacional
}

/**
 * FASE 2 — Motor Financeiro Real (COM-01, arquitetura definitiva pós-pivô, 13/08)
 *
 * Três responsabilidades estritamente separadas, por exigência do Chief:
 *   1. lancarComissaoRecebida — RECEBIMENTO: quanto realmente entrou?
 *   2. conciliarRecebimento    — CONCILIAÇÃO: a qual venda pertence?
 *   3. distribuirRecebimento   — DISTRIBUIÇÃO: como divide entre participantes?
 *
 * Princípio fundamental: PREVISÃO NÃO É FATO FINANCEIRO. RECEBIMENTO
 * INFORMADO/CONCILIADO É FATO FINANCEIRO. O motor nunca prevê, nunca
 * aplica lógica de ramo (Auto/Vida/Saúde) — é inteiramente
 * ramo-agnóstico. Cada recebimento é um fato isolado informado pela
 * operadora; o motor só multiplica valor líquido por percentual de
 * composição. A "cascata" do Auto, a "proporção" do Vida, o
 * "implantação+vitalício aberto" do Saúde são, do ponto de vista deste
 * motor, apenas múltiplos recebimentos de valores diferentes ao longo
 * do tempo — nunca lógica especial por produto.
 *
 * Todas as três funções aceitam um segundo/terceiro parâmetro opcional
 * `cliente` — o client Supabase a usar (schema `operacional`). Default
 * é o client da aplicação (`operacionalPadrao`, anon-key + RLS). Isso
 * existe pra permitir o harness de homologação (scripts/) injetar um
 * client com service_role, sem duplicar nenhuma linha de lógica.
 */

export const TIPOS_RECEBIMENTO_VALIDOS = ['implantacao', 'recorrente', 'vitalicio', 'renovacao']

/**
 * 1. RECEBIMENTO — registra que a operadora informou um pagamento.
 * NUNCA recebe venda_id/apolice_id/contrato_id — vincular é
 * responsabilidade exclusiva de conciliarRecebimento. Separação
 * estrita, não um atalho de conveniência.
 */
export async function lancarComissaoRecebida(
  {
    operadoraId,
    numeroApoliceInformado,
    seguradoInformado,
    dataRecebimento,
    competenciaReferencia,
    valorBruto,
    valorDescontos = 0,
    documentoOrigem,
    tipoRecebimento,
    observacoes,
    criadoPor,
  },
  cliente = null
) {
  const db = cliente || (await obterClientePadrao())
  if (!dataRecebimento) throw new Error('Informe a data do recebimento.')
  if (valorBruto === undefined || valorBruto === null || Number(valorBruto) <= 0) {
    throw new Error('Informe o valor bruto recebido (deve ser maior que zero).')
  }
  if (Number(valorDescontos) < 0) throw new Error('O desconto não pode ser negativo.')
  if (Number(valorDescontos) > Number(valorBruto)) {
    throw new Error('O desconto não pode ser maior que o valor bruto.')
  }
  if (tipoRecebimento && !TIPOS_RECEBIMENTO_VALIDOS.includes(tipoRecebimento)) {
    throw new Error(`Tipo de recebimento inválido: ${tipoRecebimento}`)
  }

  const { data, error } = await db
    .from('recebimentos_comissao')
    .insert({
      operadora_id: operadoraId || null,
      numero_apolice_informado: numeroApoliceInformado || null,
      segurado_informado: seguradoInformado || null,
      data_recebimento: dataRecebimento,
      competencia_referencia: competenciaReferencia || null,
      valor_bruto: valorBruto,
      valor_descontos: valorDescontos,
      documento_origem: documentoOrigem || null,
      tipo_recebimento: tipoRecebimento || null,
      observacoes: observacoes || null,
      criado_por: criadoPor || null,
      // status fica no default 'importado'; venda/apolice/contrato ficam null aqui de propósito
    })
    .select()
    .single()

  if (error) throw new Error(`Erro ao lançar recebimento: ${error.message}`)
  return data
}

/**
 * 2. CONCILIAÇÃO — vincula um recebimento importado a uma Venda real.
 * Só aceita recebimentos com status 'importado'. Reconciliar algo já
 * conciliado/distribuído é um caso de estorno/ajuste, fora do escopo
 * da Fase 2 (não implementado aqui de propósito).
 */
export async function conciliarRecebimento(recebimentoId, { vendaId, apoliceId, contratoId }, usuarioId, cliente = null) {
  const db = cliente || (await obterClientePadrao())
  if (!vendaId) throw new Error('É necessário informar a Venda para conciliar o recebimento.')

  const { data: recebimento, error: erroRecebimento } = await db
    .from('recebimentos_comissao')
    .select('status, competencia_referencia')
    .eq('id', recebimentoId)
    .single()
  if (erroRecebimento) throw new Error(`Erro ao buscar recebimento: ${erroRecebimento.message}`)
  if (recebimento.status !== 'importado') {
    throw new Error('Só é possível conciliar um recebimento que esteja com status "importado".')
  }

  /**
   * TRAVA DE DUPLICIDADE (achado do Raphael, 15/08 — confirmado:
   * bloquear, não só avisar). Antes não existia nenhuma checagem: dava
   * pra conciliar quantos recebimentos quisesse na mesma venda+
   * competência, inflando o "Recebido" no confronto (foi exatamente o
   * que gerou o R$1.133,32 absurdo — 4 recebimentos de teste
   * empilhados na mesma competência). Bloqueia aqui, na origem, não só
   * na tela.
   */
  if (recebimento.competencia_referencia) {
    const { count: qtdJaConciliado, error: erroDuplicidade } = await db
      .from('recebimentos_comissao')
      .select('id', { count: 'exact', head: true })
      .eq('venda_id', vendaId)
      .eq('competencia_referencia', recebimento.competencia_referencia)
      .in('status', ['conciliado', 'distribuido'])
    if (erroDuplicidade) throw new Error(`Erro ao verificar conciliação duplicada: ${erroDuplicidade.message}`)
    if (qtdJaConciliado > 0) {
      throw new Error(
        'Já existe um recebimento conciliado para esta Venda nesta competência. Não é possível conciliar em duplicidade — verifique se este recebimento não é um lançamento repetido.'
      )
    }
  }

  const { data: venda, error: erroVenda } = await db
    .from('vendas')
    .select('id, apolice_id, contrato_id')
    .eq('id', vendaId)
    .single()
  if (erroVenda) throw new Error(`Erro ao buscar venda: ${erroVenda.message}`)

  const { error } = await db
    .from('recebimentos_comissao')
    .update({
      venda_id: vendaId,
      apolice_id: apoliceId ?? venda.apolice_id ?? null,
      contrato_id: contratoId ?? venda.contrato_id ?? null,
      status: 'conciliado',
      conciliado_por: usuarioId,
      conciliado_em: new Date().toISOString(),
    })
    .eq('id', recebimentoId)

  // 23505 = unique_violation — reforço no banco (índice único real,
  // ver migration), além da checagem em JS acima. Cobre qualquer
  // brecha que a checagem em aplicação sozinha deixasse passar (deploy
  // defasado, corrida entre 2 requisições simultâneas, etc.) — mesmo
  // padrão já usado em `vendasService.criarVendaSeElegivel`.
  if (error?.code === '23505') {
    throw new Error('Já existe um recebimento conciliado para esta Venda nesta competência (bloqueado pelo banco). Não é possível conciliar em duplicidade.')
  }
  if (error) throw new Error(`Erro ao conciliar recebimento: ${error.message}`)
}

/**
 * 3. DISTRIBUIÇÃO — divide o valor líquido de um recebimento conciliado
 * entre os participantes da composição da Venda. Ramo-agnóstico por
 * design: nunca decide "quanto" com base no produto — só multiplica
 * valor líquido × percentual, participante por participante.
 *
 * Arredondamento: o último participante (ordem estável por criado_em)
 * recebe o resíduo — a soma das partes SEMPRE fecha exatamente com o
 * valor líquido do recebimento, nunca sobra nem falta centavo por
 * arredondamento de ponto flutuante.
 */
export async function distribuirRecebimento(recebimentoId, usuarioId, cliente = null) {
  const db = cliente || (await obterClientePadrao())
  const { data: recebimento, error: erroRecebimento } = await db
    .from('recebimentos_comissao')
    .select('*')
    .eq('id', recebimentoId)
    .single()
  if (erroRecebimento) throw new Error(`Erro ao buscar recebimento: ${erroRecebimento.message}`)
  if (recebimento.status !== 'conciliado') {
    throw new Error('Só é possível distribuir um recebimento que esteja "conciliado".')
  }

  const { data: venda, error: erroVenda } = await db
    .from('vendas')
    .select('*')
    .eq('id', recebimento.venda_id)
    .single()
  if (erroVenda) throw new Error(`Erro ao buscar venda: ${erroVenda.message}`)
  if (venda.status !== 'fechada') {
    throw new Error('A venda vinculada precisa estar fechada (composição validada em 100%) antes de distribuir.')
  }

  const { data: composicao, error: erroComposicao } = await db
    .from('venda_composicao')
    .select('*')
    .eq('venda_id', venda.id)
    .order('criado_em', { ascending: true })
  if (erroComposicao) throw new Error(`Erro ao buscar composição da venda: ${erroComposicao.message}`)
  if (!composicao?.length) {
    throw new Error('Esta venda não possui composição comercial cadastrada — não é possível distribuir.')
  }

  const { data: org, error: erroOrg } = await db.from('organizacoes').select('id').limit(1).single()
  if (erroOrg || !org) throw new Error('Erro ao buscar organização.')

  const valorLiquido = Number(recebimento.valor_liquido)
  const linhas = []
  let somaParcial = 0

  composicao.forEach((participante, indice) => {
    const ehUltimo = indice === composicao.length - 1
    const valorComissao = ehUltimo
      ? Number((valorLiquido - somaParcial).toFixed(2))
      : Number(((valorLiquido * Number(participante.percentual)) / 100).toFixed(2))
    somaParcial += valorComissao

    linhas.push({
      organizacao_id: org.id,
      operadora_id: venda.operadora_id,
      apolice_id: venda.apolice_id,
      contrato_id: venda.contrato_id,
      venda_id: venda.id,
      recebimento_comissao_id: recebimento.id,
      modulo: venda.modulo,
      valor_premio: venda.valor_base,
      valor_comissao: valorComissao,
      percentual_aplicado: participante.percentual,
      participante_tipo: participante.participante_tipo,
      papel: participante.papel,
      corretor_id: participante.corretor_id,
      parceiro_comercial_id: participante.parceiro_comercial_id,
      status_recebimento: 'recebido',
      data_recebimento: recebimento.data_recebimento,
      status_repasse: participante.participante_tipo === 'lifitseg' ? 'nao_aplicavel' : 'pendente',
      valor_repasse_corretor: participante.participante_tipo === 'lifitseg' ? null : valorComissao,
      status_confirmacao: 'confirmada',
      detalhes_calculo: `Distribuição automática — recebimento ${recebimento.id}, ${participante.percentual}% (${participante.papel})`,
    })
  })

  const { data: linhasCriadas, error: erroInsert } = await db.from('comissoes').insert(linhas).select()
  if (erroInsert) throw new Error(`Erro ao distribuir comissões: ${erroInsert.message}`)

  const { error: erroStatus } = await db
    .from('recebimentos_comissao')
    .update({ status: 'distribuido' })
    .eq('id', recebimento.id)
  if (erroStatus) throw new Error(`Erro ao atualizar status do recebimento: ${erroStatus.message}`)

  return linhasCriadas
}

/**
 * FASE 3.1 — Leituras para a aba Conciliação (Financeiro)
 *
 * As duas funções abaixo NÃO fazem parte do motor de 3 responsabilidades
 * acima (lancarComissaoRecebida / conciliarRecebimento / distribuirRecebimento)
 * — são leitura pura, exclusivas para alimentar a UI da fila de
 * conciliação. Nenhuma das 3 funções do motor foi alterada.
 */

// ============================================================
// CONCILIAÇÃO AGREGADA — Nível B (Etapa 4, Peça 4 — aprovado pelo
// Chief). Pra relatório sem apólice identificável: confronta o total
// informado contra a soma do cenário validado daquela seguradora +
// competência, sem tentar inventar qual venda específica é a
// responsável pela diferença. Exige migration prévia (novo status
// 'conciliado_agregado', liberado a existir sem venda_id).
// ============================================================

/**
 * Concilia um recebimento como FECHAMENTO AGREGADO — nunca vincula a
 * uma Venda específica (`venda_id`/`apolice_id`/`contrato_id` ficam
 * nulos, de propósito: não existe apólice identificável nesse
 * relatório, e o sistema não inventa isso). Grava só `operadora_id` e
 * `competencia_referencia`, que é o nível de granularidade que o
 * documento realmente tem.
 */
export async function conciliarFechamentoAgregado(recebimentoId, { operadoraId, competenciaReferencia }, usuarioId, cliente = null) {
  const db = cliente || (await obterClientePadrao())
  if (!operadoraId) throw new Error('Informe a seguradora do fechamento agregado.')
  if (!competenciaReferencia) throw new Error('Informe a competência do fechamento agregado.')

  const { data: recebimento, error: erroRecebimento } = await db
    .from('recebimentos_comissao')
    .select('status')
    .eq('id', recebimentoId)
    .single()
  if (erroRecebimento) throw new Error(`Erro ao buscar recebimento: ${erroRecebimento.message}`)
  if (recebimento.status !== 'importado') {
    throw new Error('Só é possível conciliar (agregado) um recebimento que esteja com status "importado".')
  }

  const { error } = await db
    .from('recebimentos_comissao')
    .update({
      operadora_id: operadoraId,
      competencia_referencia: competenciaReferencia,
      status: 'conciliado_agregado',
      conciliado_por: usuarioId,
      conciliado_em: new Date().toISOString(),
    })
    .eq('id', recebimentoId)

  if (error?.code === '23514') {
    // check_violation — a migration do status novo ainda não rodou no banco
    throw new Error('O banco ainda não reconhece o status "conciliado_agregado" — confirme se a migration desta Peça já foi aplicada.')
  }
  if (error) throw new Error(`Erro ao conciliar fechamento agregado: ${error.message}`)
}

/** LEITURA — fechamentos agregados já conciliados, mais recentes primeiro. */
export async function listarFechamentosAgregados(cliente = null) {
  const db = cliente || (await obterClientePadrao())
  const { data, error } = await db
    .from('recebimentos_comissao')
    .select('*')
    .eq('status', 'conciliado_agregado')
    .order('conciliado_em', { ascending: false })
  if (error) throw new Error(`Erro ao listar fechamentos agregados: ${error.message}`)
  return data ?? []
}
/**
 * LEITURA — recebimentos já conciliados (vinculados a uma Venda), mas
 * ainda não distribuídos. Corrige achado do Raphael (15/08): a lista
 * "Conciliados nesta sessão" só existia em memória do navegador
 * (useState) — atualizar a página perdia a visão inteira, mesmo o
 * dado continuando salvo e correto no banco. Agora a tela busca isso
 * do banco no carregamento, não depende mais de sessão.
 */
export async function listarRecebimentosConciliadosAguardandoDistribuicao(cliente = null) {
  const db = cliente || (await obterClientePadrao())
  const { data, error } = await db
    .from('recebimentos_comissao')
    .select('*, venda:vendas(id, apolice_id, contrato_id, modulo)')
    .eq('status', 'conciliado')
    .order('conciliado_em', { ascending: false })
  if (error) throw new Error(`Erro ao listar recebimentos conciliados aguardando distribuição: ${error.message}`)
  return data ?? []
}

/**
 * LEITURA — Fila de Conciliação. Lista recebimentos aguardando vínculo
 * com uma Venda (status 'importado'), mais antigos primeiro.
 */
export async function listarRecebimentosPendentesConciliacao(cliente = null) {
  const db = cliente || (await obterClientePadrao())
  const { data, error } = await db
    .from('recebimentos_comissao')
    .select('*')
    .eq('status', 'importado')
    .order('data_recebimento', { ascending: true })
  if (error) throw new Error(`Erro ao listar recebimentos pendentes: ${error.message}`)
  return data ?? []
}

/**
 * LEITURA — Busca Vendas candidatas para vincular a um recebimento.
 * `vendas` não tem número de apólice/nome de segurado direto — só
 * `apolice_id`. A busca passa por `apolices` (numero_apolice,
 * nome_cliente — mesmas colunas já usadas em comissoesService.js) como
 * ponte até a Venda.
 */
export async function buscarVendasCandidatas(termo, cliente = null) {
  const db = cliente || (await obterClientePadrao())
  if (!termo?.trim()) return []

  const { data: apolicesEncontradas, error: erroApolices } = await db
    .from('apolices')
    .select('id, numero_apolice, nome_cliente')
    .or(`numero_apolice.ilike.%${termo}%,nome_cliente.ilike.%${termo}%`)
    .limit(20)
  if (erroApolices) throw new Error(`Erro ao buscar apólices: ${erroApolices.message}`)

  const apoliceIds = (apolicesEncontradas ?? []).map((a) => a.id)
  if (apoliceIds.length === 0) return []

  const { data: vendas, error: erroVendas } = await db
    .from('vendas')
    .select('id, apolice_id, contrato_id, status, modulo, valor_base, operadora_id')
    .in('apolice_id', apoliceIds)
  if (erroVendas) throw new Error(`Erro ao buscar vendas: ${erroVendas.message}`)

  const apolicePorId = Object.fromEntries((apolicesEncontradas ?? []).map((a) => [a.id, a]))
  return (vendas ?? []).map((v) => ({ ...v, apolice: apolicePorId[v.apolice_id] ?? null }))
}
