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
 * CORREÇÃO (achada em teste real, apólice AZUL/01245 — Raphael):
 * versão anterior tentava gravar `organizacao_id`, coluna que não
 * existe em `vendas` (erro PGRST204), e não preenchia 4 colunas
 * obrigatórias da tabela real: `modulo`, `tipo`, `valor_base`, `status`.
 * Confirmadas via information_schema + constraints CHECK antes desta
 * correção — nada chutado.
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

  // valor_base é obrigatório (NOT NULL) — busca o prêmio real da
  // apólice. Caminho de contrato (Lifcare) fica com 0 por enquanto:
  // `contratos` não tem coluna de valor único (valor vem de
  // itens_contrato, por faixa etária) e este caminho hoje nunca chega
  // aqui na prática, porque `geraComissao` já é sempre false para
  // Lifcare (regra existente, não alterada nesta sprint). Pendência
  // registrada, não resolvida — fora de escopo.
  let valorBase = 0
  if (apoliceId) {
    const { data: apolice, error: erroApolice } = await operacional
      .from('apolices')
      .select('premio')
      .eq('id', apoliceId)
      .single()
    if (erroApolice) throw new Error(`Erro ao buscar prêmio da apólice para a venda: ${erroApolice.message}`)
    valorBase = apolice?.premio ?? 0
  }

  const { data: venda, error } = await operacional
    .from('vendas')
    .insert({
      cliente_prospect_id: clienteProspectId,
      apolice_id: apoliceId || null,
      contrato_id: contratoId || null,
      cotacao_id: cotacaoId || null,
      operadora_id: operadoraId || null,
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
