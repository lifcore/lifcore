/**
 * CONNECT CENTER (Edge Function) — Orquestração central.
 * SPEC-002 §5, revisado 18/08 (Arquitetura v2): identifica formato →
 * extrai (IA, sempre — material de mercado é heterogêneo demais pra
 * determinístico nesta fase) → normaliza → grava DIRETO nas tabelas de
 * domínio, com sinal de confiança em vez de fila de aprovação humana
 * bloqueante (decisão de 18/08 — aprovação nesse volume não valida nada
 * de verdade, e escondia dado real do banco).
 *
 * Divisão em blocos de texto NÃO acontece mais aqui dentro — subiu pro
 * orquestrador de nível mais alto (processar-catalogo-mercado/index.ts),
 * que agora persiste cada bloco antes de processar (tabela
 * lotes_importacao_blocos) e chama cada processarDominio<X> uma vez por
 * bloco. Por isso cada função aqui volta a receber só 1 texto por vez —
 * mais simples, e a resiliência por bloco fica centralizada num lugar só.
 */

import { interpretarPlanosComIA, interpretarPrecosComIA, interpretarRegraMercadoComIA, interpretarRedeComIA } from './ia-providers/index.ts'
import { calcularAssinaturaEstrutural } from './identificacao.ts'

// deno-lint-ignore no-explicit-any
type Db = any

interface Divergencia {
  tabela_afetada: string
  registro_existente_id: string | null
  dado_novo: Record<string, unknown>
  dado_existente: Record<string, unknown> | null
  tipo_divergencia: 'novo' | 'alterado' | 'conflito'
}

function comparar(existente: Record<string, unknown> | null, novo: Record<string, unknown>): 'novo' | 'alterado' | 'conflito' {
  if (!existente) return 'novo'
  const mudou = Object.keys(novo).some((k) => novo[k] != null && JSON.stringify(novo[k]) !== JSON.stringify(existente[k]))
  return mudou ? 'alterado' : 'novo' // 'novo' aqui = sem diferença real, tratado como no-op na aplicação (update idempotente)
}

// Divide texto longo em blocos por tamanho de caracteres, nunca cortando uma
// linha ao meio. Genérico de propósito — nenhum marcador específico de
// formato de operadora. Usado agora pelo orquestrador de nível mais alto,
// não mais internamente por processarDominioPrecos (ver cabeçalho do
// arquivo) — mas a função mora aqui porque é utilitário puro de texto,
// sem dependência de banco.
export function dividirEmBlocos(texto: string, tamanhoMaximoCaracteres: number): string[] {
  const linhas = texto.split('\n')
  const blocos: string[] = []
  let atual: string[] = []
  let tamanhoAtual = 0

  for (const linha of linhas) {
    if (tamanhoAtual + linha.length > tamanhoMaximoCaracteres && atual.length > 0) {
      blocos.push(atual.join('\n'))
      atual = []
      tamanhoAtual = 0
    }
    atual.push(linha)
    tamanhoAtual += linha.length + 1
  }
  if (atual.length > 0) blocos.push(atual.join('\n'))
  return blocos
}

// Grava as divergências DIRETO na tabela de domínio — substitui o antigo
// caminho de "acumular pra divergencias_reconciliacao, esperar aprovação".
// registro_existente_id presente = update; ausente = insert. O sinal de
// confiança (status: vigente/regra_insuficiente/vinculo_confirmado/
// sem_vinculo, dependendo da tabela) já vem calculado dentro de dado_novo
// por cada processarDominio<X> — esta função só decide COMO gravar, nunca
// decide SE o dado é confiável.
//
// Idempotência (diretriz do Chief §4): recebe o id do bloco que está
// gravando. Antes de inserir qualquer linha nova, apaga tudo que ESSE
// MESMO bloco já tenha gravado antes (bloco_origem_id) — cobre retry após
// timeout, failover pra provedor secundário, ou recuperação de lease.
// Resultado líquido de um bloco nunca duplica, não importa quantas vezes
// ele for reprocessado. Nunca toca em linha de outro bloco ou de outra
// fonte (updates em registro existente já são naturalmente idempotentes,
// não precisam desse tratamento).
export async function aplicarDivergenciasDireto(divergencias: Divergencia[], db: Db, blocoId: string): Promise<{ sucesso: number; erro: number; erros: string[] }> {
  let sucesso = 0
  let erro = 0
  const erros: string[] = []

  const tabelasComInsercaoNova = [...new Set(divergencias.filter((d) => !d.registro_existente_id).map((d) => d.tabela_afetada))]
  for (const tabela of tabelasComInsercaoNova) {
    const { error } = await db.from(tabela).delete().eq('bloco_origem_id', blocoId)
    if (error) {
      erro++
      erros.push(`Limpeza de idempotência falhou em ${tabela}: ${error.message}`)
    }
  }

  for (const d of divergencias) {
    try {
      if (d.registro_existente_id) {
        const { error } = await db.from(d.tabela_afetada).update(d.dado_novo).eq('id', d.registro_existente_id)
        if (error) throw new Error(error.message)
      } else {
        const { error } = await db.from(d.tabela_afetada).insert({ ...d.dado_novo, bloco_origem_id: blocoId })
        if (error) throw new Error(error.message)
      }
      sucesso++
    } catch (e) {
      erro++
      erros.push(`${d.tabela_afetada}: ${(e as Error).message}`)
    }
  }

  return { sucesso, erro, erros }
}

// ----------------------------------------------------------------------
// Domínio: Planos/Variantes
// ----------------------------------------------------------------------
export async function processarDominioPlanos(texto: string, operadoraId: string, operadoraNome: string, produtoId: string, db: Db, nomeProviderForcado?: string): Promise<Divergencia[]> {
  const resultado = (await interpretarPlanosComIA(texto, operadoraNome, nomeProviderForcado)) as { planos: Record<string, unknown>[] }
  const divergencias: Divergencia[] = []

  for (const p of resultado.planos) {
    const { data: existente } = await db
      .from('planos_variantes')
      .select('*')
      .eq('operadora_id', operadoraId)
      .eq('produto_id', produtoId)
      .eq('nome_plano', p.nome_plano)
      .eq('variante', p.variante ?? null)
      .maybeSingle()

    const dadoNovo = {
      operadora_id: operadoraId,
      produto_id: produtoId,
      nome_plano: p.nome_plano,
      variante: p.variante ?? null,
      chave_externa: p.chave_externa ?? null,
      modalidade: p.modalidade ?? null,
      acomodacao: p.acomodacao ?? null,
      abrangencia: p.abrangencia ?? null,
      segmentacao: p.segmentacao ?? null,
      tipo_contratacao: p.tipo_contratacao ?? null,
      elegibilidade: p.elegibilidade ?? null,
      fonte: 'documento',
    }

    divergencias.push({
      tabela_afetada: 'planos_variantes',
      registro_existente_id: existente?.id ?? null,
      dado_novo: dadoNovo,
      dado_existente: existente ?? null,
      tipo_divergencia: comparar(existente, dadoNovo),
    })
  }

  return divergencias
}

// ----------------------------------------------------------------------
// Domínio: Regras de Precificação
// ----------------------------------------------------------------------
export async function processarDominioPrecos(texto: string, operadoraId: string, db: Db, regiaoTarifariaId: string | null, nomeProviderForcado?: string): Promise<Divergencia[]> {
  const { data: planosExistentes } = await db.from('planos_variantes').select('id, nome_plano, variante').eq('operadora_id', operadoraId)
  const mapaPlanos = new Map((planosExistentes ?? []).map((p: Record<string, unknown>) => [`${p.nome_plano}|${p.variante ?? ''}`, p.id]))
  const nomesConhecidos = (planosExistentes ?? []).map((p: Record<string, unknown>) => `${p.nome_plano}${p.variante ? ' - ' + p.variante : ''}`)

  // Volta a processar 1 texto por chamada — divisão em blocos agora é
  // responsabilidade do orquestrador de nível mais alto (ver cabeçalho).
  const resultado = (await interpretarPrecosComIA(texto, nomesConhecidos, nomeProviderForcado)) as { regras: Record<string, unknown>[] }
  const divergencias: Divergencia[] = []

  for (const r of resultado.regras) {
    const planoVarianteId = encontrarPlanoIdPorTexto(r.plano_texto as string, mapaPlanos)

    // Região não é extraída do texto: é propriedade do arquivo inteiro,
    // vem do lote (confirmado nos PDFs de referência).
    const dimensoesPresentes = ['tipo_contratacao', 'segmento', 'faixa_vidas_min', 'faixa_etaria'].filter((d) => r[d] != null)
    const statusSugerido = r.valor == null || !regiaoTarifariaId || dimensoesPresentes.length === 0 ? 'regra_insuficiente' : 'vigente'
    const motivo =
      statusSugerido === 'regra_insuficiente'
        ? !regiaoTarifariaId
          ? 'Preço identificado, mas o lote não tem região tarifária definida — regra não pode virar vigente sem saber a qual tabela de venda ela pertence.'
          : 'Preço identificado, mas regra comercial insuficiente para registro no catálogo — nenhuma dimensão comercial pôde ser determinada.'
        : null

    const dadoNovo = {
      plano_variante_id: planoVarianteId,
      regiao_tarifaria_id: regiaoTarifariaId ?? null,
      tipo_contratacao: r.tipo_contratacao ?? null,
      segmento: r.segmento ?? null,
      faixa_vidas_min: r.faixa_vidas_min ?? null,
      faixa_vidas_max: r.faixa_vidas_max ?? null,
      faixa_etaria: r.faixa_etaria ?? null,
      valor: r.valor ?? null,
      vigencia_inicio: r.vigencia_inicio ?? null,
      fonte: 'documento',
      status: statusSugerido,
      motivo_insuficiencia: motivo,
    }

    divergencias.push({
      tabela_afetada: 'regras_precificacao',
      registro_existente_id: null, // preço sempre entra como novo registro — nunca "atualiza" uma regra comercial passada
      dado_novo: dadoNovo,
      dado_existente: null,
      tipo_divergencia: 'novo',
    })
  }

  return divergencias
}

// ----------------------------------------------------------------------
// Domínio: Regras de Mercado (carência / coparticipação / reembolso / regra comercial)
// ----------------------------------------------------------------------
export async function processarDominioRegraMercado(texto: string, dominio: string, operadoraId: string, db: Db, nomeProviderForcado?: string): Promise<Divergencia[]> {
  const { data: planosExistentes } = await db.from('planos_variantes').select('id, nome_plano, variante').eq('operadora_id', operadoraId)
  const mapaPlanos = new Map((planosExistentes ?? []).map((p: Record<string, unknown>) => [`${p.nome_plano}|${p.variante ?? ''}`, p.id]))
  const nomesConhecidos = (planosExistentes ?? []).map((p: Record<string, unknown>) => `${p.nome_plano}${p.variante ? ' - ' + p.variante : ''}`)

  const resultado = (await interpretarRegraMercadoComIA(texto, dominio, nomesConhecidos, nomeProviderForcado)) as { regras: Record<string, unknown>[] }
  const divergencias: Divergencia[] = []

  for (const r of resultado.regras) {
    // Distinção importante: r.plano_texto ausente = regra é da operadora
    // inteira, de propósito (ex: "a partir de 30 vidas, isenção de
    // carência") — não é falha de vínculo. Só é falha real quando a IA
    // devolveu um plano_texto e não achamos correspondência pra ele.
    const temPlanoTexto = Boolean(r.plano_texto)
    const planoVarianteId = temPlanoTexto ? encontrarPlanoIdPorTexto(r.plano_texto as string, mapaPlanos) : null
    const vinculoResolvido = !temPlanoTexto || planoVarianteId != null // operadora-wide OU achou o plano = confiável

    const { data: existente } = planoVarianteId
      ? await db.from('regras_mercado').select('*').eq('plano_variante_id', planoVarianteId).eq('dominio', dominio).eq('chave', r.chave).maybeSingle()
      : { data: null }

    const dadoNovo = {
      plano_variante_id: planoVarianteId,
      operadora_id: planoVarianteId ? null : operadoraId,
      dominio,
      chave: r.chave,
      conteudo: r.conteudo,
      vigencia_inicio: r.vigencia_inicio ?? null,
      fonte: 'documento',
      // 'vigente' aqui de propósito — mesmo vocabulário de regras_precificacao,
      // e o que listarRegrasMercado() já espera (filtra por status=vigente).
      status: vinculoResolvido ? 'vigente' : 'sem_vinculo',
    }

    divergencias.push({
      tabela_afetada: 'regras_mercado',
      registro_existente_id: existente?.id ?? null,
      dado_novo: dadoNovo,
      dado_existente: existente ?? null,
      tipo_divergencia: comparar(existente, dadoNovo),
    })
  }

  return divergencias
}

// ----------------------------------------------------------------------
// Domínio: Rede Credenciada — marca/unidade resolvidos direto (identidade
// determinística, não é "conhecimento de mercado" contestável). O vínculo
// plano×unidade agora É SEMPRE gravado — antes (até 17/08) era descartado
// silenciosamente quando o plano não batia com nenhum conhecido; a partir
// de 18/08, grava com status: 'sem_vinculo' e plano_variante_id null,
// visível pra conferência, em vez de simplesmente sumir.
// ----------------------------------------------------------------------
export async function processarDominioRede(texto: string, operadoraId: string, db: Db, regiaoTarifariaId: string | null, nomeProviderForcado?: string): Promise<Divergencia[]> {
  const { data: planosExistentes } = await db.from('planos_variantes').select('id, nome_plano, variante').eq('operadora_id', operadoraId)
  const mapaPlanos = new Map((planosExistentes ?? []).map((p: Record<string, unknown>) => [`${p.nome_plano}|${p.variante ?? ''}`, p.id]))
  const nomesConhecidos = (planosExistentes ?? []).map((p: Record<string, unknown>) => `${p.nome_plano}${p.variante ? ' - ' + p.variante : ''}`)

  const resultado = (await interpretarRedeComIA(texto, nomesConhecidos, nomeProviderForcado)) as { linhas: Record<string, unknown>[] }
  const divergencias: Divergencia[] = []

  for (const l of resultado.linhas) {
    const planoVarianteId = encontrarPlanoIdPorTexto(l.plano_texto as string, mapaPlanos)
    // ANTES: if (!planoVarianteId) continue — descartava a linha inteira, sem rastro.
    // AGORA: segue e grava, só marcando a confiança do vínculo.

    let marcaId: string | null = null
    const { data: marcaExistente } = await db.from('prestadores_marca').select('id').eq('nome', l.prestador).eq('tipo', l.tipo ?? 'hospital').maybeSingle()
    if (marcaExistente) {
      marcaId = marcaExistente.id
    } else {
      const { data: marcaNova } = await db.from('prestadores_marca').insert({ nome: l.prestador, tipo: l.tipo ?? 'hospital' }).select('id').single()
      marcaId = marcaNova?.id ?? null
    }

    // regiao_tarifaria_id só é gravado na CRIAÇÃO da unidade, nunca
    // sobrescrito. Ambiguidade conhecida (Passo 3): reflete "de qual
    // import foi descoberta primeiro", não uma região real do prestador.
    // Achado de 18/08 (não generalizado ainda): pode ser que Rede nem
    // varie por região nalgumas operadoras — se confirmado, essa
    // obrigatoriedade de região tarifária no upload deste domínio pode
    // deixar de fazer sentido. Não alterado aqui até confirmar em mais
    // operadoras.
    const { data: unidadeExistente } = await db.from('prestadores_unidade').select('id').eq('nome', l.prestador).eq('municipio', l.municipio ?? null).maybeSingle()
    let unidadeId = unidadeExistente?.id ?? null
    if (!unidadeId) {
      const { data: unidadeNova } = await db
        .from('prestadores_unidade')
        .insert({ marca_id: marcaId, nome: l.prestador, municipio: l.municipio ?? null, regiao_tarifaria_id: regiaoTarifariaId ?? null })
        .select('id')
        .single()
      unidadeId = unidadeNova?.id ?? null
    }
    if (!unidadeId) continue // isso aqui é falha real de identidade de prestador, não falha de vínculo de plano — mantém o skip

    const { data: existente } = planoVarianteId
      ? await db.from('rede_credenciada').select('*').eq('plano_variante_id', planoVarianteId).eq('unidade_id', unidadeId).maybeSingle()
      : { data: null } // sem plano confirmado não dá pra checar duplicidade por plano — sempre insere como novo

    const dadoNovo = {
      plano_variante_id: planoVarianteId, // pode ser null agora — coluna precisa aceitar (ver migração 001)
      unidade_id: unidadeId,
      codigo_bruto: l.codigo_bruto ?? null,
      fonte: 'documento',
      status: planoVarianteId ? 'vinculo_confirmado' : 'sem_vinculo',
    }

    divergencias.push({
      tabela_afetada: 'rede_credenciada',
      registro_existente_id: existente?.id ?? null,
      dado_novo: dadoNovo,
      dado_existente: existente ?? null,
      tipo_divergencia: comparar(existente, dadoNovo),
    })
  }

  return divergencias
}

function encontrarPlanoIdPorTexto(textoPlano: string | undefined, mapaPlanos: Map<string, unknown>): string | null {
  if (!textoPlano) return null
  for (const [chave, id] of mapaPlanos) {
    const [nome, variante] = chave.split('|')
    if (textoPlano.includes(nome) && (!variante || textoPlano.includes(variante))) return id as string
  }
  return null
}

export { calcularAssinaturaEstrutural }
