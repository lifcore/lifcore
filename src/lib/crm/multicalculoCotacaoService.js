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
 * Cada plano selecionado no Multicálculo vira 1 linha em `cotacoes`. As
 * opções de UM item (rodada de comparação) compartilham 1
 * `grupo_comparacao_id` — é o mesmo mecanismo que `recusarSiblingsDoGrupo`
 * já usa pra marcar as opções perdedoras quando o corretor clica "Fechar
 * com esta" numa delas. Nenhuma mudança em `commercialLifecycleService.js`.
 *
 * ATUALIZADO (Sprint 3b, 20/08) — Cotação mista: agora aceita vários
 * ITENS numa chamada só (ex: "10 vidas no plano X" + "3 vidas no plano
 * Y", mesmo contrato). Cada item recebe seu PRÓPRIO `grupo_comparacao_id`
 * — nunca o mesmo entre itens diferentes, de propósito: se compartilhasse,
 * fechar o item 1 marcaria o item 2 como "perdida" por engano
 * (recusarSiblingsDoGrupo não sabe a diferença entre "opções concorrentes"
 * e "partes de uma composição"). O que junta os itens visualmente é a
 * coluna NOVA `composicao_id` (só preenchida quando há mais de 1 item) —
 * puramente informativa, o Ciclo Comercial não olha pra ela em nenhum
 * ponto, cada item continua fechando de forma totalmente independente.
 *
 * O uso de hoje (1 grupo de vidas → N planos pra comparar) continua
 * idêntico — é só o caso `itens.length === 1`.
 *
 * CORRIGIDO (25/08) — BUG do Estudo de Mercado: as Cotações criadas aqui
 * nunca gravavam `plano_biblioteca_id`, mesmo quando `plano` (vindo de
 * montarCotacaoEstruturada) já sabia exatamente qual plano da Biblioteca
 * de Mercado foi escolhido (`plano.planoId`). Sem esse vínculo, o Estudo
 * de Mercado (estudoEssencialPdfService/estudoMercadoPdfService) não
 * conseguia puxar Rede Credenciada, Acomodação nem Coparticipação pra
 * Cotações vindas do Multicálculo — a maioria na prática — mesmo sendo
 * planos reais e catalogados. Corrigido repassando `plano.planoId` pro
 * objeto `dados`. Cotações antigas, já criadas antes desta correção,
 * continuam com `plano_biblioteca_id = null` — não é retroativo; se
 * precisar corrigir as já existentes, é um UPDATE à parte, não algo
 * que este arquivo resolve sozinho.
 */

/**
 * @param {{
 *   clienteProspectId: string,
 *   itens: {
 *     faixasEtariasDasVidas: string[], // 1 entrada por vida DESTE item
 *     selecoes: { plano: object, grupoSegmentacao: object }[],
 *       // plano = 1 item de operadoras[x].planos (saída de montarCotacaoEstruturada)
 *       // grupoSegmentacao = 1 item de plano.precosPorSegmentacao — a
 *       //   segmentação que o corretor escolheu pra ESSE plano (nunca
 *       //   escolhida sozinho pelo motor, ver nota em motorSmartQuoteService.js)
 *   }[],
 * }}
 */
export async function criarCotacoesDoMulticalculo({ clienteProspectId, itens }) {
  if (!itens?.length) throw new Error('Nenhum item informado.')
  for (const item of itens) {
    if (!item.selecoes?.length) throw new Error('Um dos itens não tem nenhum plano selecionado.')
  }

  // composicao_id só existe pra composições DE VERDADE (mais de 1 item) —
  // uma cotação avulsa continua com composicao_id NULL, comportamento
  // de hoje sem nenhuma mudança.
  const composicaoId = itens.length > 1 ? crypto.randomUUID() : null

  const cotacoesCriadas = []
  const gruposComparacaoIds = []

  for (const item of itens) {
    // 1 grupo novo por item — nunca reaproveitado entre itens diferentes
    // (ver nota no topo do arquivo sobre por que isso é crítico).
    const grupoComparacaoId = crypto.randomUUID()
    gruposComparacaoIds.push(grupoComparacaoId)

    // Quantidade de vidas por faixa etária (o motor guarda 1 faixa por
    // vida; itens_cotacao quer quantidade agregada por faixa) — cálculo
    // isolado por item, cada um com sua própria fatia de vidas.
    const vidasPorFaixa = new Map()
    for (const faixa of item.faixasEtariasDasVidas) {
      vidasPorFaixa.set(faixa, (vidasPorFaixa.get(faixa) ?? 0) + 1)
    }
    const totalVidas = item.faixasEtariasDasVidas.length
    const porte = calcularPorte(totalVidas)

    for (const { plano, grupoSegmentacao } of item.selecoes) {
      const precoPorFaixa = new Map(grupoSegmentacao.faixas.map((f) => [f.faixaEtaria, f.valor]))

      const itensPreco = []
      const faixasFaltando = []
      for (const [faixa, qtdVidas] of vidasPorFaixa) {
        const valor = precoPorFaixa.get(faixa)
        if (valor === undefined) {
          faixasFaltando.push(faixa)
          continue
        }
        itensPreco.push({ faixa_etaria: faixa, quantidade_vidas: qtdVidas, valor })
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
        // CORRIGIDO (25/08): antes faltava esse campo — sem ele, o Estudo
        // de Mercado não conseguia puxar Rede/Acomodação/Coparticipação
        // pra Cotações vindas do Multicálculo. plano.planoId já vem
        // pronto de montarCotacaoEstruturada, só faltava repassar.
        plano_biblioteca_id: plano.planoId ?? null,
        validade: null,
        grupo_comparacao_id: grupoComparacaoId,
        composicao_id: composicaoId,
      }

      const cotacaoCriada = await criarCotacao({ clienteProspectId, casoId: null, dados, itens: itensPreco })
      cotacoesCriadas.push(cotacaoCriada)
    }
  }

  // Rascunho já cumpriu a função — as Cotações de verdade acabaram de
  // ser criadas acima. Não bloqueante: um erro aqui não deve impedir o
  // corretor de seguir com as Cotações já criadas com sucesso.
  await excluirRascunhoMulticalculo(clienteProspectId)

  return { composicaoId, gruposComparacaoIds, cotacoes: cotacoesCriadas }
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

/**
 * Etapa 3 do plano "Registro Manual + Estudo de Mercado" (21/08) —
 * marca/desmarca a tag "Cenário Atual" numa Cotação. Mesmo padrão de
 * `marcarCotacaoRecomendada`: nunca calculada sozinha, sempre ação
 * explícita do corretor no card; independente da tag Recomendada
 * (uma Cotação pode ser as duas coisas, nenhuma, ou só uma). Cliente
 * com mais de 1 plano ativo hoje → marca várias Cotações como Cenário
 * Atual, sem problema nenhum (não é campo único/exclusivo).
 */
export async function marcarCotacaoCenarioAtual(cotacaoId, ehCenarioAtual) {
  const { error } = await operacional.from('cotacoes').update({ eh_cenario_atual: ehCenarioAtual }).eq('id', cotacaoId)
  if (error) throw new Error(`Erro ao marcar cotação como cenário atual: ${error.message}`)
}
