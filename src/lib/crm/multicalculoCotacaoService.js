import { operacional } from '../supabaseSchemas'
import { criarCotacao, calcularPorte } from './clientesService'
import { excluirRascunhoMulticalculo } from './multicalculoRascunhoService'

/**
 * Ponte entre a Biblioteca de Mercado (Sprint 1-3, motorSmartQuoteService)
 * e o Ciclo Comercial já existente (commercialLifecycleService,
 * CotacoesSecao em ClienteDetailPage.jsx) — NÃO duplica lógica de
 * negócio nenhuma, só monta os dados no formato que `criarCotacao`
 * já espera e usa.
 *
 * Cada plano selecionado no Multicálculo vira 1 linha em `cotacoes`,
 * todas compartilhando o mesmo `grupo_comparacao_id` novo — é o mesmo
 * mecanismo que `recusarSiblingsDoGrupo` já usa pra marcar as opções
 * perdedoras quando o corretor clica "Fechar com esta" numa delas.
 * Nenhuma mudança em `commercialLifecycleService.js`.
 */

/**
 * @param {{
 *   clienteProspectId: string,
 *   selecoes: { plano: object, grupoSegmentacao: object }[],
 *     // plano = 1 item de operadoras[x].planos (saída de montarCotacaoEstruturada)
 *     // grupoSegmentacao = 1 item de plano.precosPorSegmentacao — a
 *     //   segmentação que o corretor escolheu pra ESSE plano (nunca
 *     //   escolhida sozinho pelo motor, ver nota em motorSmartQuoteService.js)
 *   faixasEtariasDasVidas: string[] // vem do ContextoCotacaoForm (Passo 1)
 * }}
 */
export async function criarCotacoesDoMulticalculo({ clienteProspectId, selecoes, faixasEtariasDasVidas }) {
  if (!selecoes?.length) throw new Error('Nenhum plano selecionado.')

  // 1 grupo novo por rodada de comparação — todas as opções desta
  // seleção do Multicálculo entram juntas, como o Ciclo Comercial já
  // espera pra saber quem é "sibling" de quem.
  const grupoComparacaoId = crypto.randomUUID()

  // Quantidade de vidas por faixa etária (o motor guarda 1 faixa por
  // vida; itens_cotacao quer quantidade agregada por faixa).
  const vidasPorFaixa = new Map()
  for (const faixa of faixasEtariasDasVidas) {
    vidasPorFaixa.set(faixa, (vidasPorFaixa.get(faixa) ?? 0) + 1)
  }
  const totalVidas = faixasEtariasDasVidas.length
  const porte = calcularPorte(totalVidas)

  const cotacoesCriadas = []

  for (const { plano, grupoSegmentacao } of selecoes) {
    const precoPorFaixa = new Map(grupoSegmentacao.faixas.map((f) => [f.faixaEtaria, f.valor]))

    const itens = []
    const faixasFaltando = []
    for (const [faixa, qtdVidas] of vidasPorFaixa) {
      const valor = precoPorFaixa.get(faixa)
      if (valor === undefined) {
        faixasFaltando.push(faixa)
        continue
      }
      itens.push({ faixa_etaria: faixa, quantidade_vidas: qtdVidas, valor })
    }

    if (faixasFaltando.length > 0) {
      throw new Error(
        `Plano "${plano.nome}" (${plano.operadora}) não tem preço, na segmentação escolhida, ` +
          `para: ${faixasFaltando.join(', ')}. Não é possível criar a Cotação com dado incompleto.`
      )
    }

    const dados = {
      operadora_id: plano.operadoraId,
      operadora_nome_livre: plano.operadora,
      porte,
      numero_vidas: totalVidas,
      plano: plano.nome,
      validade: null,
      grupo_comparacao_id: grupoComparacaoId,
    }

    const cotacaoCriada = await criarCotacao({ clienteProspectId, casoId: null, dados, itens })
    cotacoesCriadas.push(cotacaoCriada)
  }

  // Rascunho já cumpriu a função — as Cotações de verdade acabaram de
  // ser criadas acima. Não bloqueante: um erro aqui não deve impedir o
  // corretor de seguir com as Cotações já criadas com sucesso.
  await excluirRascunhoMulticalculo(clienteProspectId)

  return { grupoComparacaoId, cotacoes: cotacoesCriadas }
}

/**
 * BMR-008 — marca/desmarca a tag manual "Recomendada" numa Cotação.
 * Nunca calculada sozinha (confirmado com o usuário) — sempre ação
 * explícita do corretor clicando no card.
 */
export async function marcarCotacaoRecomendada(cotacaoId, recomendada) {
  const { error } = await operacional.from('cotacoes').update({ recomendada }).eq('id', cotacaoId)
  if (error) throw new Error(`Erro ao marcar cotação como recomendada: ${error.message}`)
}
