/**
 * SPRINT 1 — DOC-COM-001 (Regras → Competência → Apólice → Comissão Sugerida)
 *
 * Duas responsabilidades, deliberadamente separadas (mesmo espírito do
 * motor da Fase 2 — cada função faz uma coisa só):
 *   1. Regras de Comissão  — cadastro do Gestor, por produto+operadora+competência
 *   2. Comissão Sugerida   — cálculo derivado, por venda+competência
 *
 * IMPORTANTE: nada aqui é fato financeiro. `comissao_sugerida` nunca
 * deve ser lida como dinheiro recebido — é só expectativa, sempre
 * rotulada como tal na UI que for construída em cima disto.
 */

async function obterClientePadrao() {
  const { operacional } = await import('../supabaseSchemas')
  return operacional
}

const FAMILIAS_VALIDAS = ['unica', 'recorrente', 'proporcional', 'parcela_renovacao', 'composta']

// Só a família "Única" tem contrato de parâmetro validado até agora
// (percentual simples sobre o valor da venda). As outras 4 exigem
// exemplo real de cada produto antes de ganhar lógica de cálculo —
// não vou inventar o formato dos parâmetros sem evidência.
const FAMILIAS_COM_CALCULO_IMPLEMENTADO = ['unica']

function primeiroDiaDoMes(data) {
  const d = new Date(data)
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)).toISOString().slice(0, 10)
}

// ============================================================
// 1. REGRAS DE COMISSÃO
// ============================================================

/**
 * Cadastra uma regra de comissão sugerida para um produto de uma
 * operadora, numa competência. Não decide se a regra está "certa" —
 * só guarda o que o Gestor informou.
 */
export async function criarRegraComissao(
  { operadoraProdutoId, competenciaReferencia, familia, parametros = {}, vitalicio = false, observacoes, criadoPor },
  cliente = null
) {
  const db = cliente || (await obterClientePadrao())
  if (!operadoraProdutoId) throw new Error('Informe o produto/operadora.')
  if (!competenciaReferencia) throw new Error('Informe a competência.')
  if (!FAMILIAS_VALIDAS.includes(familia)) throw new Error(`Família de regra inválida: ${familia}`)

  const { data, error } = await db
    .from('regras_comissao')
    .insert({
      operadora_produto_id: operadoraProdutoId,
      competencia_referencia: primeiroDiaDoMes(competenciaReferencia),
      familia,
      parametros,
      vitalicio,
      observacoes: observacoes || null,
      criado_por: criadoPor || null,
    })
    .select()
    .single()

  if (error) throw new Error(`Erro ao criar regra de comissão: ${error.message}`)
  return data
}

/**
 * Lista regras cadastradas, opcionalmente filtradas por
 * operadora+produto e/ou competência.
 */
export async function listarRegrasComissao({ operadoraProdutoId, competenciaReferencia } = {}, cliente = null) {
  const db = cliente || (await obterClientePadrao())
  let query = db.from('regras_comissao').select('*').order('competencia_referencia', { ascending: false })

  if (operadoraProdutoId) query = query.eq('operadora_produto_id', operadoraProdutoId)
  if (competenciaReferencia) query = query.eq('competencia_referencia', primeiroDiaDoMes(competenciaReferencia))

  const { data, error } = await query
  if (error) throw new Error(`Erro ao listar regras de comissão: ${error.message}`)
  return data ?? []
}

/**
 * Busca a regra vigente pra um produto/operadora numa competência
 * específica — é o que o cálculo de sugestão usa pra saber "qual
 * regra vale pra esta venda, neste mês".
 */
export async function buscarRegraVigente(operadoraProdutoId, competenciaReferencia, cliente = null) {
  const db = cliente || (await obterClientePadrao())
  const { data, error } = await db
    .from('regras_comissao')
    .select('*')
    .eq('operadora_produto_id', operadoraProdutoId)
    .eq('competencia_referencia', primeiroDiaDoMes(competenciaReferencia))
    .maybeSingle()

  if (error) throw new Error(`Erro ao buscar regra vigente: ${error.message}`)
  return data // pode ser null — Seção 5.1 do blueprint: produto pode não ter regra
}

// ============================================================
// 2. COMISSÃO SUGERIDA
// ============================================================

/**
 * Calcula (ou recalcula) a comissão sugerida de uma venda, numa
 * competência específica, usando a regra vigente daquele
 * produto/operadora. Não sobrescreve competência já fechada — essa
 * trava só existe a partir da Sprint 3 (depende de
 * fechamentos_competencia, que ainda não existe). Por enquanto,
 * recalcula sempre que chamada.
 */
export async function calcularComissaoSugerida({ vendaId, operadoraProdutoId, valorBaseVenda, competenciaReferencia }, cliente = null) {
  const db = cliente || (await obterClientePadrao())
  const competencia = primeiroDiaDoMes(competenciaReferencia)
  const regra = await buscarRegraVigente(operadoraProdutoId, competencia, db)

  let valorSugerido = null
  let statusCalculo = 'nao_definida'

  if (regra) {
    if (!FAMILIAS_COM_CALCULO_IMPLEMENTADO.includes(regra.familia)) {
      // Regra existe, mas o formato dos parâmetros dessa família ainda
      // não foi validado contra exemplo real — não inventa cálculo.
      statusCalculo = 'pendente_parametro'
    } else if (regra.familia === 'unica') {
      const percentual = Number(regra.parametros?.percentual)
      if (!percentual || percentual <= 0) {
        statusCalculo = 'pendente_parametro'
      } else {
        valorSugerido = Number(((Number(valorBaseVenda) * percentual) / 100).toFixed(2))
        statusCalculo = 'calculada'
      }
    }
  }

  const { data, error } = await db
    .from('comissao_sugerida')
    .upsert(
      {
        venda_id: vendaId,
        regra_comissao_id: regra?.id ?? null,
        competencia_referencia: competencia,
        valor_sugerido: valorSugerido,
        status_calculo: statusCalculo,
        atualizado_em: new Date().toISOString(),
      },
      { onConflict: 'venda_id,competencia_referencia' }
    )
    .select()
    .single()

  if (error) throw new Error(`Erro ao calcular comissão sugerida: ${error.message}`)
  return data
}

/**
 * Lista as sugestões de uma venda ao longo do tempo (útil pra
 * acompanhar vitalício mês a mês — Seção 9 do blueprint).
 */
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
