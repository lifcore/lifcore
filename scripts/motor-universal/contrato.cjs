/**
 * AI PROVIDER LAYER — Contrato único (DOC-COM-002, diretriz de
 * independência de fornecedor)
 *
 * Todo provedor de IA — Anthropic, OpenAI, o que vier depois — deve
 * expor exatamente esta forma. O Motor Universal só fala com esse
 * contrato, nunca com a API de um fornecedor específico.
 *
 * Cada provider exporta:
 *   nome          — identificador (ex: 'anthropic')
 *   interpretar(textoDocumento) — devolve o objeto abaixo
 *
 * Formato de retorno esperado de interpretar():
 * {
 *   seguradora_identificada: string | null,
 *   tipo_estrutura: 'detalhado_com_apolice' | 'agregado_sem_apolice' | null,
 *   periodo_inicio: string (YYYY-MM-DD) | null,
 *   periodo_fim: string (YYYY-MM-DD) | null,
 *   total_informado_documento: number | null,
 *   eventos: [{
 *     numero_apolice_informado, numero_recibo_informado,
 *     numero_endosso_informado, numero_parcela_informado,
 *     segurado_informado, data_evento, valor_bruto,
 *     valor_inss, valor_irrf, valor_iss, valor_outros_descontos,
 *     tipo_comissao_informado
 *   }],
 *   receita_extracao: { descricao: string } | null
 * }
 */

const CAMPOS_EVENTO_OBRIGATORIOS = ['valor_bruto']

/**
 * Validação defensiva — roda em cima do que QUALQUER provider
 * devolve, antes desse dado seguir pro resto do motor. Se um provider
 * novo (OpenAI, por exemplo) devolver algo fora do contrato, isso é
 * pego aqui, não silenciosamente adiante.
 */
function validarSaidaProvider(resultado, nomeProvider) {
  if (!resultado || typeof resultado !== 'object') {
    throw new Error(`Provider "${nomeProvider}" devolveu algo que não é um objeto.`)
  }
  if (!Array.isArray(resultado.eventos)) {
    throw new Error(`Provider "${nomeProvider}" não devolveu "eventos" como array.`)
  }
  resultado.eventos.forEach((e, i) => {
    CAMPOS_EVENTO_OBRIGATORIOS.forEach((campo) => {
      if (e[campo] === undefined) {
        throw new Error(`Provider "${nomeProvider}": evento ${i} sem o campo obrigatório "${campo}".`)
      }
    })
    if (typeof e.valor_bruto !== 'number' || Number.isNaN(e.valor_bruto)) {
      throw new Error(`Provider "${nomeProvider}": evento ${i} com valor_bruto inválido (${e.valor_bruto}).`)
    }
  })
  return true
}

module.exports = { validarSaidaProvider }
