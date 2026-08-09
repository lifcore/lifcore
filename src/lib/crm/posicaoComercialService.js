// src/lib/crm/posicaoComercialService.js
//
// Posição Comercial (Diretriz "Fechamento Customer 360", item 1).
//
// Camada de LEITURA/NORMALIZAÇÃO — não cria nenhuma entidade nova no
// banco, não substitui `contratos` nem `apolices`. Só traduz o que já
// existe em cada tabela pro mesmo formato, pra que o Customer 360
// consiga consumir os dois (e os 4 módulos) sem saber a diferença
// entre eles.
//
// Não altera `tipo`/`status` — só lê o que já foi gravado (BMR-001).
// Não inventa campo que não existe: `modulo` não é coluna de nenhuma
// das duas tabelas — vem de fora, porque cada página já sabe em qual
// módulo está (é a mesma informação que já usa pra montar a URL).

/**
 * Normaliza um registro de `contratos` (hoje só Lifcare) pro formato
 * comum. `contrato.itens_contrato` precisa vir junto na query (join
 * já usado em `buscarClienteProspectCompleto`).
 */
export function normalizarContrato(contrato, modulo) {
  const valor = (contrato.itens_contrato ?? []).reduce(
    (soma, item) => soma + (item.quantidade_vidas ?? 0) * Number(item.valor ?? 0),
    0
  )

  return {
    id: contrato.id,
    tipo: 'contrato',
    status: contrato.status,
    ativo: contrato.status === 'ativo',
    modulo,
    clienteProspectId: contrato.cliente_prospect_id,
    produtoNome: contrato.plano,
    operadoraNome: contrato.operadora_nome_livre,
    numeroApolice: contrato.numero_apolice ?? null,
    vigenciaInicio: contrato.vigencia_inicio ?? null,
    vigenciaFim: contrato.vigencia_fim,
    valor,
  }
}

/**
 * Normaliza um registro de `apolices` (Lifleet/Lifsure/LiShield/
 * Lifplan) pro mesmo formato. `apolice.tipo` já vem gravado desde a
 * Sprint anterior (services atualizados) — 'apolice' ou 'contrato'
 * (caso Lifplan).
 */
export function normalizarApolice(apolice, modulo) {
  return {
    id: apolice.id,
    tipo: apolice.tipo ?? 'apolice',
    status: apolice.status,
    ativo: apolice.status === 'ativo',
    modulo,
    clienteProspectId: apolice.cliente_prospect_id,
    produtoNome: apolice.produto,
    operadoraNome: apolice.operadora_nome_livre,
    numeroApolice: apolice.numero_apolice ?? null,
    vigenciaInicio: apolice.vigencia_inicio ?? null,
    vigenciaFim: apolice.vigencia_fim,
    valor: Number(apolice.premio) || 0,
  }
}

/**
 * Ponto único que os `ClienteDetail*Page.jsx` chamam — `origem`
 * decide qual normalizador aplicar, `modulo` identifica de onde veio
 * ('saude' | 'auto' | 'lifsure' | 'lishield' | 'lifplan', mesmo
 * vocabulário já usado em `painelExecutivoService.js`). Nunca precisa
 * saber, por fora, quais campos cada tabela tem.
 */
export function normalizarPosicoes(registros, origem, modulo) {
  if (origem === 'contratos') return (registros ?? []).map((r) => normalizarContrato(r, modulo))
  return (registros ?? []).map((r) => normalizarApolice(r, modulo))
}
