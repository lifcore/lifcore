/**
 * SPEC-002 §10-11 — Smart Quote: orquestração + banco comparável.
 *
 * Este arquivo separa as funções PURAS (sem I/O, testáveis isoladas)
 * das funções de orquestração (leem banco). A seleção de regra de
 * preço é a peça de maior risco — nunca escolhe sozinho quando há
 * ambiguidade real, sempre expõe pro corretor decidir.
 */

/**
 * Escolhe, entre as regras de precificação vigentes de um plano, a que
 * se aplica ao contexto real da Cotação (região, segmento, total de
 * vidas). Pontua por especificidade — regra com mais dimensões batendo
 * exatamente vence uma regra mais genérica. Nunca decide sozinho em
 * caso de empate real (duas regras igualmente específicas e
 * conflitantes) — devolve `status: 'ambiguo'` nesse caso.
 */
export function selecionarRegraPrecificacaoAplicavel(regras, contexto) {
  const { regiao, segmento, totalVidas } = contexto
  const vigentes = (regras ?? []).filter((r) => r.status === 'vigente')

  if (vigentes.length === 0) {
    return { status: 'nao_encontrado', regra: null, motivo: 'Nenhuma regra de precificação vigente para este plano.', candidatas: [] }
  }

  const compativeis = vigentes.filter((r) => {
    if (r.regiao != null && regiao != null && r.regiao !== regiao) return false
    if (r.segmento != null && segmento != null && r.segmento !== segmento) return false
    if (r.faixa_vidas_min != null && totalVidas != null && totalVidas < r.faixa_vidas_min) return false
    if (r.faixa_vidas_max != null && totalVidas != null && totalVidas > r.faixa_vidas_max) return false
    return true
  })

  if (compativeis.length === 0) {
    return {
      status: 'nao_encontrado',
      regra: null,
      motivo: `Nenhuma regra vigente compatível com o contexto informado (região: ${regiao ?? '—'}, segmento: ${segmento ?? '—'}, vidas: ${totalVidas ?? '—'}).`,
      candidatas: vigentes,
    }
  }

  const comEspecificidade = compativeis.map((r) => ({
    regra: r,
    especificidade: [r.regiao, r.segmento, r.faixa_vidas_min, r.faixa_etaria].filter((v) => v != null).length,
  }))
  const maxEspecificidade = Math.max(...comEspecificidade.map((c) => c.especificidade))
  const maisEspecificas = comEspecificidade.filter((c) => c.especificidade === maxEspecificidade)

  if (maisEspecificas.length > 1) {
    return {
      status: 'ambiguo',
      regra: null,
      motivo: `${maisEspecificas.length} regras igualmente específicas se aplicam — precisa de confirmação manual.`,
      candidatas: maisEspecificas.map((c) => c.regra),
    }
  }

  return { status: 'aplicavel', regra: maisEspecificas[0].regra, motivo: null, candidatas: [] }
}

/**
 * Monta o registro normalizado de uma proposta vinculada ao catálogo —
 * a unidade base do "banco comparável" (SPEC-002 §11). Função pura:
 * recebe os dados já lidos do banco, não faz nenhuma consulta.
 */
export function montarRegistroComparavel({ proposta, planoVariante, regrasPrecificacao, regrasMercado, resumoRede, contexto }) {
  if (!planoVariante) {
    return {
      propostaId: proposta.id,
      vinculado: false,
      motivo: 'Proposta sem vínculo confirmado com o catálogo do Connect Center — dados limitados ao que foi extraído do documento.',
      dadosExtraidos: {
        operadora: proposta.operadora_nome ?? proposta.operadora_nome_extraido,
        plano: proposta.plano,
        modalidade: proposta.modalidade,
        acomodacao: proposta.acomodacao,
        coparticipacao: proposta.coparticipacao,
      },
    }
  }

  const selecaoPreco = selecionarRegraPrecificacaoAplicavel(regrasPrecificacao, contexto)

  const porDominio = (dominio) => (regrasMercado ?? []).filter((r) => r.dominio === dominio)

  return {
    propostaId: proposta.id,
    vinculado: true,
    planoVarianteId: planoVariante.id,
    plano: {
      nomePlano: planoVariante.nome_plano,
      variante: planoVariante.variante,
      modalidade: planoVariante.modalidade,
      acomodacao: planoVariante.acomodacao,
      abrangencia: planoVariante.abrangencia,
      tipoContratacao: planoVariante.tipo_contratacao,
      elegibilidade: planoVariante.elegibilidade,
    },
    precificacao: {
      status: selecaoPreco.status,
      valor: selecaoPreco.regra?.valor ?? null,
      dimensoes: selecaoPreco.regra
        ? { regiao: selecaoPreco.regra.regiao, segmento: selecaoPreco.regra.segmento, faixaVidas: [selecaoPreco.regra.faixa_vidas_min, selecaoPreco.regra.faixa_vidas_max] }
        : null,
      motivo: selecaoPreco.motivo,
      candidatas: selecaoPreco.candidatas,
    },
    carencias: porDominio('carencia'),
    coparticipacao: porDominio('coparticipacao'),
    reembolso: porDominio('reembolso'),
    regrasComerciais: porDominio('regra_comercial'),
    rede: resumoRede ?? { totalPrestadores: 0, porRegiao: {} },
  }
}

/**
 * Relatório de prontidão — quais propostas da Cotação estão prontas
 * pro Smart Quote orquestrar (vinculadas + preço aplicável
 * inequívoco) e quais precisam de atenção do corretor antes.
 */
export function avaliarProntidao(registrosComparaveis) {
  const prontas = []
  const precisamAtencao = []

  for (const r of registrosComparaveis) {
    if (!r.vinculado) {
      precisamAtencao.push({ propostaId: r.propostaId, motivo: 'Sem vínculo com o catálogo do Connect Center.' })
    } else if (r.precificacao.status !== 'aplicavel') {
      precisamAtencao.push({ propostaId: r.propostaId, motivo: r.precificacao.motivo })
    } else {
      prontas.push(r.propostaId)
    }
  }

  return { prontas, precisamAtencao, totalPropostas: registrosComparaveis.length }
}
