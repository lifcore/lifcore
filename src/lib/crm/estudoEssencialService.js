import { institucional, operacional } from '../supabaseSchemas'
import { listarCenarioAtual } from './cenarioAtualService'
import { montarBancoComparavel, derivarContextoDeComposicao } from './smartQuoteService'

/**
 * SPEC-003 §3-4 — Estudo Essencial: tabela comparativa única (não
 * seções separadas). Uma coluna por opção (Atual + cada proposta
 * pronta do Smart Quote), mesmas linhas de atributo pra todas.
 *
 * Regras de apresentação (§15) aplicadas aqui, na montagem de dados —
 * não na hora de desenhar o HTML, pra garantir que valem mesmo se o
 * template mudar:
 *   - plano atual nunca é escondido quando existir;
 *   - todo preço carrega vigência + fonte;
 *   - dado ausente vira 'não informado' explícito, nunca inferido.
 */

function interpretarCodigoRede(codigoBruto, legendaPorSigla) {
  if (!codigoBruto) return null
  return codigoBruto
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((sigla) => legendaPorSigla.get(sigla) ?? `${sigla} (não interpretado)`)
    .join(', ')
}

async function montarColunaAtual(cenarioAtual) {
  if (!cenarioAtual || cenarioAtual.length === 0) return null // §15: nunca esconder quando existir — aqui simplesmente não existe

  // Múltiplos planos no cenário atual (SPEC-001A §11) — soma pra uma coluna única de referência.
  const totalMensal = cenarioAtual.reduce((s, p) => s + (p.mensalidade_informada ?? 0), 0)
  const totalVidas = cenarioAtual.reduce((s, p) => s + (p.quantidade_vidas_informada ?? 0), 0)
  const primeiro = cenarioAtual[0]

  return {
    tipo: 'atual',
    operadoraPlano: cenarioAtual.length > 1
      ? `${cenarioAtual.length} planos atuais`
      : `${primeiro.operadora_nome ?? primeiro.operadora_nome_livre ?? 'não informado'} — ${primeiro.plano ?? 'não informado'}`,
    // NOVO (27/08) — nome do plano isolado (sem operadora), pro card do
    // comparativo: usuário pediu pra tirar o nome da operadora do card
    // (o logo já cumpre essa função) e manter só o nome do plano.
    // null no caso de múltiplos planos — não há um nome de plano único
    // pra mostrar, o card cai pra 'operadoraPlano' nesse caso.
    plano: cenarioAtual.length > 1 ? null : (primeiro.plano ?? 'não informado'),
    acomodacao: primeiro.acomodacao || 'não informado',
    coparticipacao: primeiro.coparticipacao || 'não informado',
    reembolso: primeiro.reembolso || 'não informado',
    carencia: 'não aplicável (plano vigente)',
    abrangencia: primeiro.abrangencia || 'não informado',
    redeResumo: 'não avaliada nesta versão',
    custoMensal: totalMensal || null,
    custoAnual: totalMensal ? totalMensal * 12 : null,
    fontePreco: cenarioAtual.some((p) => p.fonte === 'manual') ? 'informado pelo corretor' : 'documento do cliente',
    vigenciaPreco: primeiro.vigencia_inicio ?? null,
    totalVidas,
  }
}

function montarColunaProposta(registro, proposta) {
  if (!registro.vinculado) {
    return {
      tipo: 'proposta',
      propostaId: registro.propostaId,
      papel: proposta?.papel_selecao ?? null,
      operadoraPlano: `${registro.dadosExtraidos.operadora ?? 'não informado'} — ${registro.dadosExtraidos.plano ?? 'não informado'}`,
      // NOVO (27/08) — ver comentário em montarColunaAtual.
      plano: registro.dadosExtraidos.plano ?? 'não informado',
      acomodacao: registro.dadosExtraidos.acomodacao || 'não informado',
      coparticipacao: registro.dadosExtraidos.coparticipacao || 'não informado',
      reembolso: 'não informado (sem vínculo com o Connect Center)',
      carencia: 'não informado (sem vínculo com o Connect Center)',
      abrangencia: 'não informado',
      redeResumo: 'não disponível (sem vínculo com o Connect Center)',
      custoMensal: null,
      custoAnual: null,
      fontePreco: 'documento extraído — sem regra comercial vinculada',
      vigenciaPreco: null,
      avisoVinculo: registro.motivo,
    }
  }

  const custoMensal = registro.precificacao.status === 'aplicavel' ? registro.precificacao.valor : null

  return {
    tipo: 'proposta',
    propostaId: registro.propostaId,
    papel: proposta?.papel_selecao ?? null,
    operadoraPlano: `${proposta?.operadora_nome ?? 'não informado'} — ${registro.plano.nomePlano}${registro.plano.variante ? ` (${registro.plano.variante})` : ''}`,
    // NOVO (27/08) — ver comentário em montarColunaAtual.
    plano: `${registro.plano.nomePlano}${registro.plano.variante ? ` (${registro.plano.variante})` : ''}`,
    acomodacao: registro.plano.acomodacao || 'não informado',
    coparticipacao: registro.plano.coparticipacao || (registro.coparticipacao[0]?.conteudo ? JSON.stringify(registro.coparticipacao[0].conteudo) : 'não informado'),
    reembolso: registro.reembolso.length > 0 ? `${registro.reembolso.length} regra(s) — ver detalhe` : 'não informado',
    carencia: registro.carencias.length > 0 ? `${registro.carencias.length} regra(s) — ver detalhe` : 'não informado',
    abrangencia: registro.plano.abrangencia || 'não informado',
    redeResumo: `${registro.rede.totalPrestadores} prestador(es) em ${Object.keys(registro.rede.porRegiao).length} região(ões)`,
    custoMensal,
    custoAnual: custoMensal ? custoMensal * 12 : null,
    fontePreco: registro.precificacao.status === 'aplicavel' ? 'Connect Center — regra comercial validada' : null,
    vigenciaPreco: null, // regras_precificacao.vigencia_inicio não veio no registro comparável reduzido — ver nota de limitação abaixo
    statusPrecificacao: registro.precificacao.status,
    motivoPrecificacao: registro.precificacao.motivo,
    detalheReembolso: registro.reembolso,
    detalheCarencias: registro.carencias,
    planoVarianteId: registro.planoVarianteId,
  }
}

/** Rede agrupada por região, matriz prestador × proposta, só para as propostas com vínculo. */
async function montarRedePorRegiao(registrosVinculados, operadoraIdsEnvolvidas) {
  if (registrosVinculados.length === 0) return { regioes: [], notaValidacao: 'Nenhuma proposta com rede disponível para comparar.' }

  const planoVarianteIds = registrosVinculados.map((r) => r.planoVarianteId)

  const [{ data: linhasRede }, { data: legendaBruta }] = await Promise.all([
    institucional
      .from('rede_credenciada')
      .select('*, prestadores_unidade(nome, municipio, regiao, prestadores_marca(nome))')
      .in('plano_variante_id', planoVarianteIds),
    institucional.from('legendas_mercado').select('*').in('operadora_id', operadoraIdsEnvolvidas),
  ])

  const legendaPorSigla = new Map((legendaBruta ?? []).map((l) => [l.sigla, l.significado]))

  const porRegiao = {}
  const prestadoresSet = new Set()
  for (const linha of linhasRede ?? []) {
    const regiao = linha.prestadores_unidade?.regiao ?? 'Região não informada'
    const nomePrestador = linha.prestadores_unidade?.prestadores_marca?.nome ?? linha.prestadores_unidade?.nome ?? 'Prestador não identificado'
    const chavePrestador = `${regiao}|${nomePrestador}`
    prestadoresSet.add(chavePrestador)

    if (!porRegiao[regiao]) porRegiao[regiao] = {}
    if (!porRegiao[regiao][nomePrestador]) porRegiao[regiao][nomePrestador] = {}
    porRegiao[regiao][nomePrestador][linha.plano_variante_id] = interpretarCodigoRede(linha.codigo_bruto, legendaPorSigla) ?? 'presente'
  }

  const regioes = Object.entries(porRegiao).map(([regiao, prestadores]) => ({
    regiao,
    prestadores: Object.entries(prestadores).map(([nome, porPlano]) => ({ nome, porPlano })),
  }))

  return {
    regioes,
    notaValidacao: 'Rede referencial, conforme último material importado no Connect Center — sujeita a confirmação junto à operadora antes da contratação.',
  }
}

export async function montarDadosEstudoEssencial(cotacaoId, { regiao = null, segmento = null } = {}) {
  const { data: cotacao, error: erroCotacao } = await operacional
    .from('cotacoes')
    .select('*, itens_cotacao(*)')
    .eq('id', cotacaoId)
    .single()
  if (erroCotacao) throw new Error(`Erro ao buscar cotação: ${erroCotacao.message}`)

  const { data: cliente, error: erroCliente } = await operacional
    .from('clientes_prospects')
    .select('razao_social, cnpj')
    .eq('id', cotacao.cliente_prospect_id)
    .single()
  if (erroCliente) throw new Error(`Erro ao buscar cliente: ${erroCliente.message}`)

  const cenarioAtual = await listarCenarioAtual(cotacaoId)
  const contexto = derivarContextoDeComposicao(cotacao.itens_cotacao, { regiao, segmento })
  const { registros, prontidao } = await montarBancoComparavel(cotacaoId, contexto)

  const { data: propostasBrutas } = await operacional
    .from('propostas_estudo')
    .select('*')
    .eq('cotacao_id', cotacaoId)
    .eq('status_revisao', 'confirmada')
  const propostaPorId = new Map((propostasBrutas ?? []).map((p) => [p.id, p]))

  const registrosProntos = registros.filter((r) => prontidao.prontas.includes(r.propostaId))
  const colunaAtual = await montarColunaAtual(cenarioAtual)
  const colunasPropostas = registrosProntos
    .map((r) => montarColunaProposta(r, propostaPorId.get(r.propostaId)))
    .sort((a, b) => (propostaPorId.get(a.propostaId)?.ordem_apresentacao ?? 999) - (propostaPorId.get(b.propostaId)?.ordem_apresentacao ?? 999))

  const registrosVinculadosProntos = registrosProntos.filter((r) => r.vinculado)
  const operadoraIdsEnvolvidas = [...new Set([...(propostasBrutas ?? []).map((p) => p.operadora_id).filter(Boolean)])]
  const redePorRegiao = await montarRedePorRegiao(registrosVinculadosProntos, operadoraIdsEnvolvidas)

  return {
    geradoEm: new Date().toISOString(),
    cliente,
    colunaAtual,
    colunasPropostas,
    redePorRegiao,
    prontidao, // inclui as que precisam de atenção — o corretor decide se gera assim mesmo
    contexto,
  }
}
