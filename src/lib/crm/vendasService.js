import { operacional } from '../supabaseSchemas'

/**
 * Ponto único de criação da Venda central do Lifcore (Sprint Vendas
 * Central, aprovada pelo Chief).
 *
 * Chamado exclusivamente por `fecharCotacaoComDocumento`
 * (commercialLifecycleService.js) — nenhum módulo deve chamar isso
 * diretamente, nem ter lógica própria de criação de venda. O módulo de
 * origem só fornece os dados e a decisão `geraComissao`; quem decide
 * criar a Venda é sempre este ponto único.
 *
 * Só cria Venda quando `geraComissao === true`. Quando `false`, retorna
 * `null` sem tocar no banco — a apólice/contrato continua salva
 * normalmente, só não entra no trilho de comissionamento.
 *
 * Idempotente: existe índice único no banco em `vendas.apolice_id` e
 * `vendas.contrato_id` (WHERE NOT NULL) — garante, mesmo em
 * concorrência real, que a mesma apólice/contrato nunca gera 2 vendas.
 * A checagem por SELECT abaixo evita o round-trip de erro no caso comum
 * (sem concorrência); quem garante de fato é o banco.
 *
 * ATUALIZADO (correção obrigatória — vínculo Produto + Operadora →
 * Venda, aprovada pelo Chief): `vendas.produto_id` e `vendas.operadora_id`
 * são lidos diretamente de `apolices`/`contratos` (FKs reais pro catálogo
 * institucional, nunca por correspondência de texto). A fonte de verdade
 * é sempre o documento fechado (apólice/contrato), não a cotação
 * original — o corretor pode confirmar/trocar seguradora entre a
 * cotação e o fechamento, então ler daqui é o dado mais correto. Se a
 * apólice/contrato de origem não tiver os IDs preenchidos (formulário
 * ainda não migrado, ou registro histórico anterior a esta correção), a
 * Venda ainda É criada — o fechamento comercial nunca pode ser bloqueado
 * por isso — mas nasce com produto_id/operadora_id nulos, e o filtro já
 * existente em `regrasComissaoService.listarVendasFechadasComProduto`
 * naturalmente a exclui de "Gerar Sugestões" até alguém vincular
 * explicitamente (sem inferência automática).
 */
export async function criarVendaSeElegivel({
  clienteProspectId,
  apoliceId,
  contratoId,
  cotacaoId,
  modulo,
  usuarioId,
  geraComissao,
}) {
  if (!geraComissao) return null
  if (!apoliceId && !contratoId) {
    throw new Error('criarVendaSeElegivel precisa de apoliceId ou contratoId.')
  }

  const tipo = apoliceId ? 'apolice' : 'contrato'
  const filtro = apoliceId ? { apolice_id: apoliceId } : { contrato_id: contratoId }

  const { data: existente, error: erroExistente } = await operacional
    .from('vendas')
    .select('id')
    .match(filtro)
    .maybeSingle()
  if (erroExistente) throw new Error(`Erro ao verificar venda existente: ${erroExistente.message}`)
  if (existente) return existente

  // valor_base (obrigatório), produto_id e operadora_id vêm do
  // documento real (apólice ou contrato) — nunca da cotação, nunca por
  // texto. Caminho de contrato (Lifcare): `contratos` não tem coluna de
  // valor único (valor vem de itens_contrato, por faixa etária) —
  // valorBase fica 0 por enquanto. Não é problema prático hoje:
  // `geraComissao` já é sempre false para Lifcare (regra existente, não
  // alterada nesta sprint), então este ramo nunca chega a criar Venda de
  // verdade ainda.
  let valorBase = 0
  let produtoId = null
  let operadoraId = null
  let corretorId = null

  if (apoliceId) {
    const { data: apolice, error: erroApolice } = await operacional
      .from('apolices')
      .select('premio, produto_id, operadora_id, corretor_id')
      .eq('id', apoliceId)
      .single()
    if (erroApolice) throw new Error(`Erro ao buscar dados da apólice para a venda: ${erroApolice.message}`)
    valorBase = apolice?.premio ?? 0
    produtoId = apolice?.produto_id ?? null
    operadoraId = apolice?.operadora_id ?? null
    corretorId = apolice?.corretor_id ?? null
  } else if (contratoId) {
    const { data: contrato, error: erroContrato } = await operacional
      .from('contratos')
      .select('produto_id, operadora_id')
      .eq('id', contratoId)
      .single()
    if (erroContrato) throw new Error(`Erro ao buscar dados do contrato para a venda: ${erroContrato.message}`)
    produtoId = contrato?.produto_id ?? null
    operadoraId = contrato?.operadora_id ?? null
  }

  const { data: venda, error } = await operacional
    .from('vendas')
    .insert({
      cliente_prospect_id: clienteProspectId,
      apolice_id: apoliceId || null,
      contrato_id: contratoId || null,
      cotacao_id: cotacaoId || null,
      operadora_id: operadoraId,
      produto_id: produtoId,
      modulo,
      tipo,
      valor_base: valorBase,
      status: 'fechada',
      fechada_em: new Date().toISOString(),
      criado_por: usuarioId || null,
    })
    .select()
    .single()

  // 23505 = unique_violation — outra requisição criou a venda entre o
  // SELECT acima e este INSERT (condição de corrida real). Não é erro
  // de verdade: busca de novo e devolve a que já existe.
  if (error?.code === '23505') {
    const { data: corrida } = await operacional.from('vendas').select('id').match(filtro).maybeSingle()
    if (corrida) return corrida
  }
  if (error) throw new Error(`Erro ao criar venda: ${error.message}`)

  // Auto-preenchimento da composição (Etapa 4, Peça 6 — aprovado pelo
  // Chief/Raphael). Efeito colateral, igual ao vitalício e ao próprio
  // geraComissao: uma falha aqui NUNCA pode impedir a Venda de nascer
  // — só fica sem composição automática, caindo no fluxo manual
  // ("Incluir Participante", em Repasses).
  try {
    await criarComposicaoAutomaticaSeElegivel({ vendaId: venda.id, corretorId, modulo })
  } catch (erroComposicao) {
    // Não interrompe o retorno de sucesso da Venda — só não preenche
    // sozinho. Silencioso de propósito aqui; quem quiser saber o motivo
    // vê a venda sem composição na tela de Repasses.
  }

  return venda
}

/**
 * Composição automática da venda (Etapa 4, Peça 6). Só cria se:
 * - o corretor tiver percentual padrão cadastrado pra esse módulo
 *   (`percentuais_padrao_corretor`);
 * - a venda ainda não tiver nenhuma composição (idempotente — nunca
 *   duplica nem sobrescreve algo que o Gestor já ajustou manualmente).
 * Sem essas condições, não faz nada — a venda fica sem composição,
 * aguardando "Incluir Participante" manual em Repasses.
 */
export async function criarComposicaoAutomaticaSeElegivel({ vendaId, corretorId, modulo }) {
  if (!corretorId || !modulo) return { criada: false, motivo: 'sem corretor_id ou módulo' }

  const { count: qtdExistente, error: erroExistente } = await operacional
    .from('venda_composicao')
    .select('id', { count: 'exact', head: true })
    .eq('venda_id', vendaId)
  if (erroExistente) throw new Error(`Erro ao verificar composição existente: ${erroExistente.message}`)
  if (qtdExistente > 0) return { criada: false, motivo: 'venda já tem composição (não sobrescreve)' }

  const { data: padrao, error: erroPadrao } = await operacional
    .from('percentuais_padrao_corretor')
    .select('percentual')
    .eq('corretor_id', corretorId)
    .eq('modulo', modulo)
    .maybeSingle()
  if (erroPadrao) throw new Error(`Erro ao buscar percentual padrão do corretor: ${erroPadrao.message}`)
  if (!padrao?.percentual) return { criada: false, motivo: 'corretor sem percentual padrão cadastrado nesse módulo' }

  const percentualCorretor = Number(padrao.percentual)
  const percentualLifitseg = Number((100 - percentualCorretor).toFixed(2))

  // Constraint do banco exige percentual > 0 — se o corretor tiver
  // 100% cadastrado, não existe linha de LifitSeg pra criar (0% não é
  // permitido, e também não faria sentido ter um participante com 0).
  const linhas = [{ venda_id: vendaId, participante_tipo: 'corretor', corretor_id: corretorId, papel: 'vendedor', percentual: percentualCorretor }]
  if (percentualLifitseg > 0) {
    linhas.push({ venda_id: vendaId, participante_tipo: 'lifitseg', papel: 'organizacao', percentual: percentualLifitseg })
  }

  const { error: erroInsert } = await operacional.from('venda_composicao').insert(linhas)
  if (erroInsert) throw new Error(`Erro ao criar composição automática: ${erroInsert.message}`)

  return { criada: true, percentualCorretor, percentualLifitseg }
}

/**
 * Composição manual (Etapa 4, Peça 6) — pro caso raro de 2+ corretores
 * dividindo a mesma venda, ou quando o corretor não tem percentual
 * padrão cadastrado. Trava absoluta: soma dos percentuais tem que
 * fechar exatamente 100%, senão nem grava — nunca fica composição
 * incompleta no banco.
 */
export async function definirComposicaoManual({ vendaId, participantes }) {
  if (!Array.isArray(participantes) || participantes.length === 0) {
    throw new Error('Informe ao menos um participante.')
  }
  const somaPercentual = participantes.reduce((soma, p) => soma + Number(p.percentual || 0), 0)
  if (Math.abs(somaPercentual - 100) > 0.01) {
    throw new Error(`A soma dos percentuais precisa fechar exatamente 100% (está em ${somaPercentual.toFixed(2)}%).`)
  }

  const { count: qtdExistente, error: erroExistente } = await operacional
    .from('venda_composicao')
    .select('id', { count: 'exact', head: true })
    .eq('venda_id', vendaId)
  if (erroExistente) throw new Error(`Erro ao verificar composição existente: ${erroExistente.message}`)
  if (qtdExistente > 0) {
    throw new Error('Esta venda já tem composição cadastrada — exclua antes de redefinir.')
  }

  const linhas = participantes.map((p) => ({
    venda_id: vendaId,
    participante_tipo: p.tipo,
    corretor_id: p.tipo === 'corretor' ? p.corretorId : null,
    parceiro_comercial_id: p.tipo === 'corretora_parceira' ? p.parceiroComercialId : null,
    papel: p.papel || (p.tipo === 'lifitseg' ? 'organizacao' : 'vendedor'),
    percentual: Number(p.percentual),
  }))

  const { error } = await operacional.from('venda_composicao').insert(linhas)
  if (error) throw new Error(`Erro ao definir composição: ${error.message}`)
}

/** Checa se uma venda já tem composição cadastrada (automática ou manual) */
export async function vendaTemComposicao(vendaId) {
  const { count, error } = await operacional
    .from('venda_composicao')
    .select('id', { count: 'exact', head: true })
    .eq('venda_id', vendaId)
  if (error) throw new Error(`Erro ao verificar composição: ${error.message}`)
  return count > 0
}

/**
 * LIMPEZA FORÇADA DE TESTE — MASTER ONLY (achado do Raphael, 16/08).
 *
 * Diferente de `excluirVendaComDependencias`: essa função NUNCA
 * bloqueia por existir fato financeiro — apaga `comissoes`,
 * `recebimentos_comissao`, `comissao_sugerida`, `ajustes_comissao_sugerida`
 * e `venda_composicao` de todas as vendas ligadas à apólice/contrato,
 * sem exceção. É intencional: existe pra permitir zerar dado de teste
 * durante a fase de validação do sistema, exatamente o caso previsto
 * na Constituição do LifCore (seção 4.1, papel do Master —
 * "saneamento de dados... exclusões definitivas... nenhuma dessas
 * intervenções constitui quebra de governança, desde que autenticada,
 * rastreável e auditada").
 *
 * NÃO EXPOR pra nenhum papel além de Master na tela — a restrição de
 * acesso é feita na UI (mesmo padrão já usado em `excluirComissao`,
 * Financeiro → Buscar), não dentro desta função. Depois de limpar o
 * histórico financeiro, quem chamar ainda precisa chamar
 * `excluirApolice`/`excluirContrato` separadamente pra remover o
 * documento em si — esta função só desobstrui o caminho.
 */
export async function limparHistoricoFinanceiroDeTeste({ apoliceId, contratoId }, usuarioId) {
  if (!apoliceId && !contratoId) throw new Error('Informe apoliceId ou contratoId.')
  const filtroDocumento = apoliceId ? { apolice_id: apoliceId } : { contrato_id: contratoId }

  const { data: vendas, error: erroVendas } = await operacional.from('vendas').select('id').match(filtroDocumento)
  if (erroVendas) throw new Error(`Erro ao buscar vendas do documento: ${erroVendas.message}`)
  const idsVendas = (vendas ?? []).map((v) => v.id)

  const resumo = { vendasEncontradas: idsVendas.length, comissoesRemovidas: 0, recebimentosRemovidos: 0, sugestoesRemovidas: 0, ajustesRemovidos: 0, composicoesRemovidas: 0 }

  // 1. Ledger (comissoes) — por venda_id (se houver vendas) E direto por apolice_id/contrato_id (link legado)
  if (idsVendas.length > 0) {
    const { count, error } = await operacional.from('comissoes').delete({ count: 'exact' }).in('venda_id', idsVendas)
    if (error) throw new Error(`Erro ao limpar comissões (por venda): ${error.message}`)
    resumo.comissoesRemovidas += count ?? 0
  }
  {
    const { count, error } = await operacional.from('comissoes').delete({ count: 'exact' }).match(filtroDocumento)
    if (error) throw new Error(`Erro ao limpar comissões (direto): ${error.message}`)
    resumo.comissoesRemovidas += count ?? 0
  }

  // 2. Recebimentos — mesma dupla checagem (venda_id e direto)
  if (idsVendas.length > 0) {
    const { count, error } = await operacional.from('recebimentos_comissao').delete({ count: 'exact' }).in('venda_id', idsVendas)
    if (error) throw new Error(`Erro ao limpar recebimentos (por venda): ${error.message}`)
    resumo.recebimentosRemovidos += count ?? 0
  }
  {
    const { count, error } = await operacional.from('recebimentos_comissao').delete({ count: 'exact' }).match(filtroDocumento)
    if (error) throw new Error(`Erro ao limpar recebimentos (direto): ${error.message}`)
    resumo.recebimentosRemovidos += count ?? 0
  }

  if (idsVendas.length > 0) {
    // 3. Ajustes/estornos
    const { count: qtdAjustes, error: erroAjustes } = await operacional.from('ajustes_comissao_sugerida').delete({ count: 'exact' }).in('venda_id', idsVendas)
    if (erroAjustes) throw new Error(`Erro ao limpar ajustes: ${erroAjustes.message}`)
    resumo.ajustesRemovidos = qtdAjustes ?? 0

    // 4. Comissão sugerida (calendário)
    const { count: qtdSugestoes, error: erroSugestoes } = await operacional.from('comissao_sugerida').delete({ count: 'exact' }).in('venda_id', idsVendas)
    if (erroSugestoes) throw new Error(`Erro ao limpar comissões sugeridas: ${erroSugestoes.message}`)
    resumo.sugestoesRemovidas = qtdSugestoes ?? 0

    // 5. Composição
    const { count: qtdComposicao, error: erroComposicao } = await operacional.from('venda_composicao').delete({ count: 'exact' }).in('venda_id', idsVendas)
    if (erroComposicao) throw new Error(`Erro ao limpar composição: ${erroComposicao.message}`)
    resumo.composicoesRemovidas = qtdComposicao ?? 0

    // 6. Vendas em si
    const { error: erroVendasDelete } = await operacional.from('vendas').delete().in('id', idsVendas)
    if (erroVendasDelete) throw new Error(`Erro ao limpar vendas: ${erroVendasDelete.message}`)
  }

  return resumo
}

/**
 * Exclui uma Venda e suas dependências pré-financeiras (Bloco B —
 * exclusão em cascata, aprovado pelo Chief).
 *
 * NUNCA apaga fato financeiro real: bloqueia com erro claro se existir
 * `comissoes` (ledger real, alimentado por `lancarComissaoRecebida`) ou
 * `recebimentos_comissao` (qualquer status — mesmo 'importado' já é
 * fato financeiro reconciliável: a própria constraint do banco exige
 * `venda_id` preenchido pra qualquer status que não seja 'importado',
 * e mesmo 'importado' pode já ter `venda_id`). Segue o princípio já
 * registrado no projeto: "recebimento informado/conciliado é fato
 * financeiro" — nunca inventado aqui, só aplicado.
 *
 * Só cascateia o que é pré-financeiro/metadado: `comissao_sugerida`
 * (sugestão, não fato) e `venda_composicao` (composição de
 * participantes/split, configuração, não dinheiro).
 */
export async function excluirVendaComDependencias(vendaId) {
  const { count: qtdComissoes, error: erroContarComissoes } = await operacional
    .from('comissoes')
    .select('id', { count: 'exact', head: true })
    .eq('venda_id', vendaId)
  if (erroContarComissoes) throw new Error(`Erro ao verificar comissões da venda: ${erroContarComissoes.message}`)
  if (qtdComissoes > 0) {
    throw new Error('Não é possível excluir: existe comissão lançada (ledger real) vinculada a esta Venda.')
  }

  const { count: qtdRecebimentos, error: erroContarRecebimentos } = await operacional
    .from('recebimentos_comissao')
    .select('id', { count: 'exact', head: true })
    .eq('venda_id', vendaId)
  if (erroContarRecebimentos) throw new Error(`Erro ao verificar recebimentos da venda: ${erroContarRecebimentos.message}`)
  if (qtdRecebimentos > 0) {
    throw new Error('Não é possível excluir: existe recebimento (importado ou conciliado) vinculado a esta Venda.')
  }

  const { error: erroSugerida } = await operacional.from('comissao_sugerida').delete().eq('venda_id', vendaId)
  if (erroSugerida) throw new Error(`Erro ao excluir comissão sugerida da venda: ${erroSugerida.message}`)

  const { error: erroComposicao } = await operacional.from('venda_composicao').delete().eq('venda_id', vendaId)
  if (erroComposicao) throw new Error(`Erro ao excluir composição da venda: ${erroComposicao.message}`)

  const { error } = await operacional.from('vendas').delete().eq('id', vendaId)
  if (error) throw new Error(`Erro ao excluir venda: ${error.message}`)
}

/**
 * Exclui todas as vendas vinculadas a uma apólice, contrato ou cotação
 * — usado antes de excluir o documento de origem em si. Propaga o
 * bloqueio de `excluirVendaComDependencias` se qualquer venda tiver
 * fato financeiro real por trás (para o processo inteiro, não decide
 * nada sozinho).
 */
export async function excluirVendasDoDocumento({ apoliceId, contratoId, cotacaoId }) {
  let query = operacional.from('vendas').select('id')
  if (apoliceId) query = query.eq('apolice_id', apoliceId)
  else if (contratoId) query = query.eq('contrato_id', contratoId)
  else if (cotacaoId) query = query.eq('cotacao_id', cotacaoId)
  else throw new Error('excluirVendasDoDocumento precisa de apoliceId, contratoId ou cotacaoId.')

  const { data: vendas, error } = await query
  if (error) throw new Error(`Erro ao buscar vendas do documento: ${error.message}`)

  for (const v of vendas ?? []) {
    await excluirVendaComDependencias(v.id)
  }
}
