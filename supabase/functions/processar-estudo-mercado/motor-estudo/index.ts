/**
 * MOTOR DE ESTUDO DE MERCADO (Edge Function) — Orquestração central
 * SPEC-001 §4 (pipeline de leitura) e §2 (determinístico primeiro).
 *
 * Não resolve operadora_id por semelhança de nome — nunca. A
 * normalização operadora_nome_extraido → catálogo institucional é
 * decisão humana, no mesmo padrão já usado em
 * `normalizarOperadoraCotacao` (clientesService.js).
 */

import { calcularAssinaturaEstrutural, estrategiaCompativel } from './identificacao.ts'
import { calcularConfianca, detectarAlteracao } from './confianca.ts'
import { parsearMulticalculo, type PropostaExtraida } from './estrategias/multicalculo.ts'
import { interpretarPropostasComIA } from './ia-providers/index.ts'
import { interpretarLegenda, type EntradaLegenda } from './legenda.ts'
import { extrairBlocoRedeCredenciada, processarRedeCredenciada, type LinhaRedeExtraida } from './rede-credenciada.ts'

interface FormatoHomologadoDb {
  id: string
  assinatura_estrutural: string
  status: string
}

interface DbCliente {
  from: (tabela: string) => {
    select: (colunas: string) => {
      eq: (coluna: string, valor: unknown) => {
        eq: (coluna: string, valor: unknown) => { maybeSingle: () => Promise<{ data: FormatoHomologadoDb | null; error: unknown }> }
      }
    }
  }
}

export interface ResultadoMotorEstudo {
  propostas: PropostaExtraida[]
  legenda: EntradaLegenda[]
  rede: LinhaRedeExtraida[]
  redeResumo: { chunksTotais: number; chunksComErro: number; erros: string[] }
  assinatura: { hash: string; camposDetectados: string[] }
  origemExtracao: 'deterministica' | 'adaptativa'
  formatoEncontrado: boolean
  confianca: { nivel: string; motivo: string }
  receitaExtracao: Record<string, unknown>
}

export async function processarMulticalculo({
  linhas,
  operacionalDb,
}: {
  linhas: string[]
  operacionalDb: DbCliente
}): Promise<ResultadoMotorEstudo> {
  const assinatura = await calcularAssinaturaEstrutural(linhas)

  const { data: formatoHomologado } = await operacionalDb
    .from('formatos_homologados_estudo')
    .select('*')
    .eq('tipo_documento', 'multicalculo')
    .eq('assinatura_estrutural', assinatura.hash)
    .maybeSingle()

  const alteracao = detectarAlteracao(
    formatoHomologado ? { assinatura_estrutural: formatoHomologado.assinatura_estrutural } : null,
    assinatura
  )

  // 1. Tenta o parser determinístico primeiro (SPEC-001 §2).
  const resultadoDeterministico = parsearMulticalculo(linhas)

  let propostas: PropostaExtraida[]
  let origemExtracao: 'deterministica' | 'adaptativa'
  let receitaExtracao: Record<string, unknown>

  if (resultadoDeterministico.sucesso) {
    propostas = resultadoDeterministico.propostas
    origemExtracao = 'deterministica'
    receitaExtracao = { descricao: resultadoDeterministico.motivo, metodo: 'parser determinístico (multicalculo.ts)' }
  } else {
    // 2. Cai para IA — universal, qualquer provider registrado (não só Anthropic).
    const textoCompleto = linhas.join('\n')
    const resultadoIA = (await interpretarPropostasComIA(textoCompleto)) as {
      propostas: Record<string, unknown>[]
      providerUsado: string
    }
    propostas = resultadoIA.propostas.map((p) => ({
      colunaChave: String(p.coluna_chave),
      operadoraNomeExtraido: (p.operadora_nome_extraido as string) ?? null,
      plano: (p.plano as string) ?? null,
      modalidade: (p.modalidade as string) ?? null,
      acomodacao: (p.acomodacao as string) ?? null,
      coparticipacao: (p.coparticipacao as string) ?? null,
      valorTotalMensal: (p.valor_total_mensal as number) ?? null,
      faixas: Array.isArray(p.faixas)
        ? (p.faixas as Record<string, unknown>[]).map((f) => ({
            faixaEtaria: String(f.faixa_etaria),
            valor: (f.valor as number) ?? null,
          }))
        : [],
    }))
    origemExtracao = 'adaptativa'
    receitaExtracao = {
      descricao: `Parser determinístico não fechou (${resultadoDeterministico.motivo}) — extração por IA.`,
      providerUsado: resultadoIA.providerUsado,
    }
  }

  // 3. Validação de consistência mínima antes de calcular confiança.
  const falhas: string[] = []
  if (propostas.length === 0) falhas.push('nenhuma proposta extraída')
  const chavesUnicas = new Set(propostas.map((p) => p.colunaChave))
  if (chavesUnicas.size !== propostas.length) falhas.push('colunas com coluna_chave duplicada — vínculo de plano ambíguo')

  const validacao = { aprovado: falhas.length === 0, falhas }

  const formatoEncontrado = origemExtracao === 'deterministica' && !!formatoHomologado
  const confianca = calcularConfianca({
    formatoEncontrado,
    alteracaoDetectada: alteracao.alterado,
    origemExtracao,
    validacao,
  })

  // 4. Legenda — sempre determinística, sobre o texto integral (SPEC-001 §6).
  const legenda = interpretarLegenda(linhas)

  // 5. Rede Credenciada — Passada 2. TEMPORARIAMENTE DESLIGADA (achado
  //    real de teste, 17/08): chunks sequenciais de IA em documento denso
  //    passam do tempo limite da Edge Function e travam o lote em
  //    "processando" para sempre, sem erro visível. Religar só depois de
  //    decidir o redesenho (Caminho A — rede sob demanda, hospitais
  //    selecionados pelo corretor; ou Caminho B — base acumulativa) e,
  //    de qualquer forma, com chunks em paralelo em vez de sequenciais.
  const REDE_CREDENCIADA_HABILITADA = false
  let rede: LinhaRedeExtraida[] = []
  let redeResumo = { chunksTotais: 0, chunksComErro: 0, erros: [] as string[] }
  if (REDE_CREDENCIADA_HABILITADA && confianca.nivel !== 'bloqueado') {
    const blocoRede = extrairBlocoRedeCredenciada(linhas)
    if (blocoRede) {
      const linhasRede = linhas.slice(blocoRede.inicio, blocoRede.fim)
      const colunasConhecidas = propostas.map((p) => p.colunaChave)
      const resultadoRede = await processarRedeCredenciada(linhasRede, colunasConhecidas)
      rede = resultadoRede.linhas
      redeResumo = { chunksTotais: resultadoRede.chunksTotais, chunksComErro: resultadoRede.chunksComErro, erros: resultadoRede.erros }
    }
  }

  return {
    propostas,
    legenda,
    rede,
    redeResumo,
    assinatura,
    origemExtracao,
    formatoEncontrado,
    confianca,
    receitaExtracao,
  }
}
