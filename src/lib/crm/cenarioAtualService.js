import { institucional, operacional } from '../supabaseSchemas'
import { parseValorBR } from './clientesService'

/**
 * SPEC-001A — Motor de Estudo de Mercado, Peça 1 (Cenário Atual).
 *
 * Regras fixas do documento, aplicadas em todo este arquivo:
 * - Nunca preencher faixa ausente por aproximação.
 * - Divergência entre soma das faixas e total informado é sempre ALERTA,
 *   nunca correção automática (§6, §9 exemplo).
 * - Edição manual preserva a origem original do dado — só marca
 *   `editado_manualmente`, nunca reescreve `fonte` (§8).
 * - Anual e custo por vida são sempre recalculados, nunca armazenados
 *   (§10 do SPEC-001 — "valores devem ser recalculáveis e auditáveis").
 */

/**
 * Calcula anual e custo por vida a partir dos dados de um plano.
 * Puramente derivado — nunca persistido, sempre recalculado na leitura.
 */
export function calcularDerivadosPlano(plano) {
  const mensal = plano.mensalidade_informada ?? null
  const anual = mensal != null ? mensal * 12 : null
  const custoPorVida =
    mensal != null && plano.quantidade_vidas_informada
      ? mensal / plano.quantidade_vidas_informada
      : null
  return { anual, custoPorVida }
}

/**
 * Compara o total informado (documento/manual) contra a soma das faixas
 * cadastradas. Nunca corrige — só sinaliza. SPEC-001A §6 e §9.
 */
export function calcularDivergencia(plano, faixas) {
  const somaVidas = faixas.reduce((s, f) => s + (f.quantidade_vidas ?? 0), 0)
  const somaValor = faixas.reduce((s, f) => s + (f.valor_total ?? 0), 0)

  const temFaixas = faixas.length > 0
  const vidasInformadas = plano.quantidade_vidas_informada
  const valorInformado = plano.mensalidade_informada

  const divergeVidas =
    temFaixas && vidasInformadas != null && somaVidas !== vidasInformadas
  const divergeValor =
    temFaixas && valorInformado != null && Math.abs(somaValor - valorInformado) > 0.01

  return {
    temFaixas,
    somaVidas,
    somaValor,
    vidasInformadas,
    valorInformado,
    divergeVidas,
    divergeValor,
    divergente: divergeVidas || divergeValor,
  }
}

/**
 * Deriva o status de validação (conferido / atenção / incompleto) a partir
 * da divergência e da completude dos dados. Nunca gravado como decisão do
 * sistema sozinho no momento da criação — quem confirma "conferido" pós
 * revisão é o corretor (via `confirmarValidacaoPlano`).
 */
export function sugerirStatusValidacao(plano, faixas) {
  const div = calcularDivergencia(plano, faixas)
  if (div.divergente) return 'atencao'
  if (!plano.quantidade_vidas_informada && !plano.mensalidade_informada) return 'incompleto'
  return plano.status_validacao === 'conferido' ? 'conferido' : 'incompleto'
}

/** Lista os planos do cenário atual de uma Cotação, cada um com suas faixas e divergência calculada. */
export async function listarCenarioAtual(cotacaoId) {
  const { data: planos, error } = await operacional
    .from('cenario_atual_planos')
    .select('*, cenario_atual_faixas(*)')
    .eq('cotacao_id', cotacaoId)
    .order('criado_em', { ascending: true })
  if (error) throw new Error(`Erro ao listar cenário atual: ${error.message}`)

  const idsOperadoras = [...new Set((planos ?? []).map((p) => p.operadora_id).filter(Boolean))]
  let nomePorOperadora = {}
  if (idsOperadoras.length > 0) {
    const { data: operadoras, error: erroOperadoras } = await institucional
      .from('operadoras')
      .select('id, nome')
      .in('id', idsOperadoras)
    if (erroOperadoras) throw new Error(`Erro ao buscar nomes de operadoras: ${erroOperadoras.message}`)
    nomePorOperadora = Object.fromEntries((operadoras ?? []).map((o) => [o.id, o.nome]))
  }

  return (planos ?? []).map((plano) => {
    const faixas = plano.cenario_atual_faixas ?? []
    const { anual, custoPorVida } = calcularDerivadosPlano(plano)
    return {
      ...plano,
      operadora_nome: plano.operadora_id ? nomePorOperadora[plano.operadora_id] ?? null : null,
      faixas,
      divergencia: calcularDivergencia(plano, faixas),
      anual,
      custoPorVida,
    }
  })
}

/**
 * Cria um plano do cenário atual, com suas faixas (opcionais). O
 * `status_validacao` é sempre sugerido pelo próprio motor a partir da
 * divergência — nunca aceita um valor "conferido" vindo de fora na criação.
 */
export async function criarPlanoCenarioAtual({ cotacaoId, dados, faixas = [], usuarioId }) {
  const { status_validacao: _ignorado, ...dadosSemStatus } = dados

  const statusSugerido = sugerirStatusValidacao(dadosSemStatus, faixas)

  const { data: plano, error } = await operacional
    .from('cenario_atual_planos')
    .insert({
      cotacao_id: cotacaoId,
      ...dadosSemStatus,
      status_validacao: statusSugerido,
      criado_por: usuarioId ?? null,
    })
    .select()
    .single()
  if (error) throw new Error(`Erro ao criar plano do cenário atual: ${error.message}`)

  if (faixas.length) {
    const faixasComId = faixas.map((f) => ({ ...f, cenario_atual_plano_id: plano.id }))
    const { error: erroFaixas } = await operacional.from('cenario_atual_faixas').insert(faixasComId)
    if (erroFaixas) throw new Error(`Erro ao salvar faixas do cenário atual: ${erroFaixas.message}`)
  }

  return plano
}

/**
 * Atualiza um plano existente. Se `itensEditadosManualmente` for true,
 * marca a edição sem apagar a `fonte` original de cada faixa (SPEC-001A §8).
 */
export async function atualizarPlanoCenarioAtual(planoId, dados, faixas = null, { usuarioId } = {}) {
  const { status_validacao: _ignorado, ...dadosSemStatus } = dados

  const patch = { ...dadosSemStatus, atualizado_em: new Date().toISOString() }
  if (faixas !== null) {
    patch.editado_manualmente = true
    patch.editado_em = new Date().toISOString()
    patch.editado_por = usuarioId ?? null
  }
  patch.status_validacao = sugerirStatusValidacao(dadosSemStatus, faixas ?? [])

  const { error } = await operacional.from('cenario_atual_planos').update(patch).eq('id', planoId)
  if (error) throw new Error(`Erro ao atualizar plano do cenário atual: ${error.message}`)

  if (faixas !== null) {
    // Preserva a fonte original de cada faixa; só o valor muda.
    await operacional.from('cenario_atual_faixas').delete().eq('cenario_atual_plano_id', planoId)
    if (faixas.length) {
      const faixasComId = faixas.map((f) => ({ ...f, cenario_atual_plano_id: planoId }))
      const { error: erroFaixas } = await operacional.from('cenario_atual_faixas').insert(faixasComId)
      if (erroFaixas) throw new Error(`Erro ao salvar faixas do cenário atual: ${erroFaixas.message}`)
    }
  }
}

/**
 * Confirma manualmente um plano como "conferido" — ação explícita do
 * corretor após revisar eventual divergência (SPEC-001 §9, §12 UX).
 * Nunca chamada automaticamente pelo motor.
 */
export async function confirmarValidacaoPlano(planoId) {
  const { error } = await operacional
    .from('cenario_atual_planos')
    .update({ status_validacao: 'conferido', atualizado_em: new Date().toISOString() })
    .eq('id', planoId)
  if (error) throw new Error(`Erro ao confirmar validação do plano: ${error.message}`)
}

export async function excluirPlanoCenarioAtual(planoId) {
  const { error } = await operacional.from('cenario_atual_planos').delete().eq('id', planoId)
  if (error) throw new Error(`Erro ao excluir plano do cenário atual: ${error.message}`)
}

/** Reexporta para o formulário não precisar importar de dois arquivos. */
export { parseValorBR }
