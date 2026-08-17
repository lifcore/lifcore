/**
 * CONNECT CENTER (Edge Function) — Orquestração central.
 * SPEC-002 §5: identifica formato → extrai (IA, sempre — material de
 * mercado é heterogêneo demais pra determinístico nesta fase) →
 * normaliza → compara com o existente → toda divergência vai pra fila
 * de aprovação. NENHUMA função aqui grava direto nas tabelas de
 * domínio (planos_variantes, regras_precificacao, regras_mercado,
 * rede_credenciada) — só em `divergencias_reconciliacao`.
 *
 * Exceção deliberada: `prestadores_marca`/`prestadores_unidade` (nível
 * de identidade de prestador, não "conhecimento de mercado" contestável)
 * são resolvidos/criados diretamente — só o vínculo plano×unidade
 * (rede_credenciada) passa pela fila.
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
  return mudou ? 'alterado' : 'novo' // 'novo' aqui = sem diferença real, tratado como no-op na aprovação (update idempotente)
}

// ----------------------------------------------------------------------
// Domínio: Planos/Variantes
// ----------------------------------------------------------------------
export async function processarDominioPlanos(texto: string, operadoraId: string, operadoraNome: string, produtoId: string, db: Db): Promise<Divergencia[]> {
  const resultado = (await interpretarPlanosComIA(texto, operadoraNome)) as { planos: Record<string, unknown>[] }
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
// Domínio: Regras de Precificação (a correção de 17/08 aplicada aqui)
// ----------------------------------------------------------------------
export async function processarDominioPrecos(texto: string, operadoraId: string, db: Db, regiaoTarifariaId: string | null): Promise<Divergencia[]> {
  const { data: planosExistentes } = await db.from('planos_variantes').select('id, nome_plano, variante').eq('operadora_id', operadoraId)
  const mapaPlanos = new Map((planosExistentes ?? []).map((p: Record<string, unknown>) => [`${p.nome_plano}|${p.variante ?? ''}`, p.id]))
  const nomesConhecidos = (planosExistentes ?? []).map((p: Record<string, unknown>) => `${p.nome_plano}${p.variante ? ' - ' + p.variante : ''}`)

  const resultado = (await interpretarPrecosComIA(texto, nomesConhecidos)) as { regras: Record<string, unknown>[] }
  const divergencias: Divergencia[] = []

  for (const r of resultado.regras) {
    const planoVarianteId = encontrarPlanoIdPorTexto(r.plano_texto as string, mapaPlanos)

    // Passo 3 (Documento Mestre) — região não é mais extraída do texto:
    // é propriedade do arquivo inteiro, vem do lote (confirmado nos
    // PDFs de referência Porto Seguro SP/Jundiaí — o título já diz a
    // região). Sem regiaoTarifariaId, a regra nunca fecha como vigente.
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
      registro_existente_id: null, // preço sempre entra como novo registro — não faz sentido "atualizar" uma regra comercial passada, ela é revogada e substituída
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
export async function processarDominioRegraMercado(texto: string, dominio: string, operadoraId: string, db: Db): Promise<Divergencia[]> {
  const { data: planosExistentes } = await db.from('planos_variantes').select('id, nome_plano, variante').eq('operadora_id', operadoraId)
  const mapaPlanos = new Map((planosExistentes ?? []).map((p: Record<string, unknown>) => [`${p.nome_plano}|${p.variante ?? ''}`, p.id]))
  const nomesConhecidos = (planosExistentes ?? []).map((p: Record<string, unknown>) => `${p.nome_plano}${p.variante ? ' - ' + p.variante : ''}`)

  const resultado = (await interpretarRegraMercadoComIA(texto, dominio, nomesConhecidos)) as { regras: Record<string, unknown>[] }
  const divergencias: Divergencia[] = []

  for (const r of resultado.regras) {
    const planoVarianteId = r.plano_texto ? encontrarPlanoIdPorTexto(r.plano_texto as string, mapaPlanos) : null

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
// Domínio: Rede Credenciada — marca/unidade resolvidos direto, só o
// vínculo plano×unidade vai pra fila (ver nota no topo do arquivo).
// ----------------------------------------------------------------------
export async function processarDominioRede(texto: string, operadoraId: string, db: Db, regiaoTarifariaId: string | null): Promise<Divergencia[]> {
  const { data: planosExistentes } = await db.from('planos_variantes').select('id, nome_plano, variante').eq('operadora_id', operadoraId)
  const mapaPlanos = new Map((planosExistentes ?? []).map((p: Record<string, unknown>) => [`${p.nome_plano}|${p.variante ?? ''}`, p.id]))
  const nomesConhecidos = (planosExistentes ?? []).map((p: Record<string, unknown>) => `${p.nome_plano}${p.variante ? ' - ' + p.variante : ''}`)

  const resultado = (await interpretarRedeComIA(texto, nomesConhecidos)) as { linhas: Record<string, unknown>[] }
  const divergencias: Divergencia[] = []

  for (const l of resultado.linhas) {
    const planoVarianteId = encontrarPlanoIdPorTexto(l.plano_texto as string, mapaPlanos)
    if (!planoVarianteId) continue // sem plano conhecido, não arrisca vínculo às cegas

    // Marca/unidade: identidade determinística por (nome, município) — resolve ou cria direto (unique constraint garante idempotência).
    let marcaId: string | null = null
    const { data: marcaExistente } = await db.from('prestadores_marca').select('id').eq('nome', l.prestador).eq('tipo', l.tipo ?? 'hospital').maybeSingle()
    if (marcaExistente) {
      marcaId = marcaExistente.id
    } else {
      const { data: marcaNova } = await db.from('prestadores_marca').insert({ nome: l.prestador, tipo: l.tipo ?? 'hospital' }).select('id').single()
      marcaId = marcaNova?.id ?? null
    }

    // Passo 3 — regiao_tarifaria_id só é gravado na CRIAÇÃO da unidade,
    // nunca sobrescrito numa unidade já existente. O mesmo prestador
    // físico aparece em PDFs de regiões diferentes (confirmado: "H
    // Paulo Sacramento" em Jundiaí aparece tanto no arquivo de SP quanto
    // no de Jundiaí) — a região aqui reflete "de qual import foi
    // descoberta primeiro", não uma "região caseira" real do prestador.
    // Ambiguidade conhecida, não resolvida aqui — sinalizada pro Raphael.
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
    if (!unidadeId) continue

    const { data: existente } = await db.from('rede_credenciada').select('*').eq('plano_variante_id', planoVarianteId).eq('unidade_id', unidadeId).maybeSingle()

    const dadoNovo = {
      plano_variante_id: planoVarianteId,
      unidade_id: unidadeId,
      codigo_bruto: l.codigo_bruto ?? null,
      fonte: 'documento',
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
