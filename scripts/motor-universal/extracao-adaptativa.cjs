/**
 * MOTOR UNIVERSAL — Extração adaptativa (DOC-COM-002, Passo 5)
 *
 * Este arquivo não sabe mais o que é "Anthropic" — fala só com
 * ./ia-providers, que decide qual fornecedor está ativo. Isso é a
 * diretriz de independência de fornecedor: o Motor Universal (e este
 * módulo, que é parte dele) nunca conhece um provedor específico.
 *
 * Contrato de saída continua o mesmo de sempre — extrair(texto)
 * devolve { nomeOrigemDocumento, periodoInicio, periodoFim, eventos,
 * totalInformadoDocumento, tipoEstrutura, receitaExtracao }, igual a
 * qualquer estratégia de código.
 */

const iaProviders = require('./ia-providers/index.cjs')

async function extrair(textoDocumento) {
  const resultado = await iaProviders.interpretar(textoDocumento)

  return {
    nomeOrigemDocumento: resultado.seguradora_identificada ?? null,
    periodoInicio: resultado.periodo_inicio ?? null,
    periodoFim: resultado.periodo_fim ?? null,
    eventos: resultado.eventos,
    totalInformadoDocumento: resultado.total_informado_documento ?? null,
    tipoEstrutura: resultado.tipo_estrutura ?? null,
    receitaExtracao: resultado.receita_extracao ?? null,
    providerUsado: resultado.providerUsado,
  }
}

module.exports = { extrair }
