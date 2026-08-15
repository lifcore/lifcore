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
 * ATUALIZADO (correção obrigatória — vínculo Produto → Venda, aprovada
 * pelo Chief): `vendas.produto_id` é lido diretamente de
 * `apolices.produto_id`/`contratos.produto_id` (FK real pro catálogo
 * `institucional.produtos`, adicionada nesta mesma entrega) — nunca por
 * correspondência de texto. Se a apólice/contrato de origem não tiver
 * produto_id preenchido (formulário ainda não migrado, ex: ApoliceForm
 * genérico, ou registro histórico anterior a esta correção), a Venda
 * ainda É criada — o fechamento comercial nunca pode ser bloqueado por
 * isso — mas nasce com produto_id nulo, e o filtro já existente em
 * `regrasComissaoService.listarVendasFechadasComProduto` naturalmente a
 * exclui de "Gerar Sugestões" até alguém vincular o produto
 * explicitamente (sem inferência automática).
 */
export async function criarVendaSeElegivel({
  clienteProspectId,
  apoliceId,
  contratoId,
  cotacaoId,
  modulo,
  operadoraId,
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

  // valor_base (obrigatório) e produto_id vêm da apólice real.
  // Caminho de contrato (Lifcare): `contratos` não tem coluna de valor
  // único (valor vem de itens_contrato, por faixa etária) — valorBase
  // fica 0 por enquanto. Não é problema prático hoje: `geraComissao` já
  // é sempre false para Lifcare (regra existente, não alterada nesta
  // sprint), então este ramo nunca chega a criar Venda de verdade ainda.
  let valorBase = 0
  let produtoId = null

  if (apoliceId) {
    const { data: apolice, error: erroApolice } = await operacional
      .from('apolices')
      .select('premio, produto_id')
      .eq('id', apoliceId)
      .single()
    if (erroApolice) throw new Error(`Erro ao buscar dados da apólice para a venda: ${erroApolice.message}`)
    valorBase = apolice?.premio ?? 0
    produtoId = apolice?.produto_id ?? null
  } else if (contratoId) {
    const { data: contrato, error: erroContrato } = await operacional
      .from('contratos')
      .select('produto_id')
      .eq('id', contratoId)
      .single()
    if (erroContrato) throw new Error(`Erro ao buscar dados do contrato para a venda: ${erroContrato.message}`)
    produtoId = contrato?.produto_id ?? null
  }

  const { data: venda, error } = await operacional
    .from('vendas')
    .insert({
      cliente_prospect_id: clienteProspectId,
      apolice_id: apoliceId || null,
      contrato_id: contratoId || null,
      cotacao_id: cotacaoId || null,
      operadora_id: operadoraId || null,
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

  return venda
}
