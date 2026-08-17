// supabase/functions/listar-referencias-saude/index.ts
//
// Leitura PÚBLICA das Referências em Saúde (Módulo V1, doc do Chief) —
// consumida pelo site institucional sem autenticação nenhuma. Mesmo
// padrão de CORS dinâmico (Configuration Registry) e mesmo client
// Supabase de `receber-lead-site`, adaptado pra GET/leitura.
//
// IMPORTANTE: esta function usa SUPABASE_SERVICE_ROLE_KEY, que
// IGNORA RLS por completo — a policy `status <> 'INATIVO'` criada na
// tabela não protege nada aqui. O filtro de status é aplicado
// explicitamente no código abaixo, não confia em RLS pra isso.
//
// Suporta 3 formas de consulta, batendo com a árvore de navegação do
// documento (item 8): especialidade → região → lista → instituição.
//   - sem parâmetro:              lista tudo (exceto INATIVO/MONITORAMENTO)
//   - ?slug=hospital-x:           1 instituição específica (qualquer status, pra página própria)
//   - ?regiao=jundiai-entorno:    filtra por região
//   - ?tipo=hospital:             filtra por tipo (hospital|laboratorio|clinica)
//   - ?especialidade=Cardiologia: filtra por especialidade (contém)
//   - ?patologia=Infarto:         filtra por patologia (contém)
// Os filtros de regiao/tipo/especialidade/patologia podem ser combinados.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
)

function respostaJson(corpo: unknown, status: number, headers: Record<string, string>) {
  if (status === 204) {
    return new Response(null, { status, headers })
  }
  return new Response(JSON.stringify(corpo), { status, headers })
}

function corsHeaders(origemRequisicao: string | null, origensPermitidas: string[]) {
  const origemPermitida = origemRequisicao && origensPermitidas.includes(origemRequisicao)
    ? origemRequisicao
    : origensPermitidas[0]

  return {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': origemPermitida,
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-LifCore-Client',
  }
}

// Mesmo cache em memória do isolate que já existe em receber-lead-site
// — evita bater na Configuration Registry a cada requisição.
let configCache: { origensPermitidas: string[] } | null = null

async function carregarConfiguracao() {
  if (configCache) return configCache

  const { data, error } = await supabase
    .schema('institucional')
    .from('configuracao_global')
    .select('chave, valor')
    .eq('chave', 'origins_permitidas')

  if (error || !data) {
    throw new Error(`Erro ao carregar Configuration Registry: ${error?.message}`)
  }

  const porChave = Object.fromEntries(data.map((c) => [c.chave, c.valor]))
  configCache = {
    origensPermitidas: porChave['origins_permitidas'] as string[],
  }
  return configCache
}

const COLUNAS_PUBLICAS = 'id, slug, nome, tipo, cidade, regiao, endereco, site_oficial, telefone, especialidades, patologias, exames, descricao, destaque, status, google_business_url, logo_url, servicos_destaque, operadoras_informadas, observacao_cobertura'

Deno.serve(async (req) => {
  const origemRequisicao = req.headers.get('origin')
  let config: Awaited<ReturnType<typeof carregarConfiguracao>>

  try {
    config = await carregarConfiguracao()
  } catch (err) {
    console.error('[listar-referencias-saude] Erro ao carregar configuração:', err)
    config = { origensPermitidas: ['https://www.lifitseg.com.br'] }
  }

  const headers = corsHeaders(origemRequisicao, config.origensPermitidas)

  if (req.method === 'OPTIONS') {
    return respostaJson({}, 204, headers)
  }

  if (req.method !== 'GET') {
    return respostaJson({ message: 'Método não permitido.' }, 405, headers)
  }

  const url = new URL(req.url)
  const slug = url.searchParams.get('slug')
  const regiao = url.searchParams.get('regiao')
  const tipo = url.searchParams.get('tipo')
  const especialidade = url.searchParams.get('especialidade')
  const patologia = url.searchParams.get('patologia')

  // Página de uma instituição específica: mostra qualquer status
  // (inclusive EM_IMPLANTACAO, que é conteúdo público de propósito —
  // ex: "Novo Hospital Unimed Jundiaí: o que está chegando à região",
  // citado no doc do Chief). MONITORAMENTO/INATIVO seguem fora das
  // listagens gerais abaixo, mas se alguém tiver o link direto do
  // slug, o item ainda existe — não é dado sigiloso, só não deve ser
  // sugerido like "disponível agora".
  if (slug) {
    const { data, error } = await supabase
      .schema('institucional')
      .from('referencias_saude')
      .select(COLUNAS_PUBLICAS)
      .eq('slug', slug)
      .maybeSingle()

    if (error) {
      console.error('[listar-referencias-saude] Erro ao buscar por slug:', error)
      return respostaJson({ message: 'Erro ao buscar referência.' }, 500, headers)
    }
    if (!data) {
      return respostaJson({ message: 'Referência não encontrada.' }, 404, headers)
    }
    return respostaJson({ success: true, data }, 200, headers)
  }

  // Listagens: nunca mostra MONITORAMENTO nem INATIVO — só ATIVO e
  // EM_IMPLANTACAO (regra do doc: item 4, "em implantação" pode
  // aparecer como destaque futuro, mas nunca como disponível agora —
  // isso é responsabilidade do FRONT diferenciar visualmente, não
  // desta function esconder o registro).
  let query = supabase
    .schema('institucional')
    .from('referencias_saude')
    .select(COLUNAS_PUBLICAS)
    .in('status', ['ATIVO', 'EM_IMPLANTACAO'])
    .order('destaque', { ascending: false })
    .order('nome', { ascending: true })

  if (regiao) query = query.eq('regiao', regiao)
  if (tipo) query = query.eq('tipo', tipo)

  const { data, error } = await query

  if (error) {
    console.error('[listar-referencias-saude] Erro ao listar:', error)
    return respostaJson({ message: 'Erro ao listar referências.' }, 500, headers)
  }

  // CORREÇÃO (11/08): especialidade/patologia usam busca PARCIAL,
  // case-insensitive, feita em JS — não mais match exato no Postgres.
  // Motivo: a taxonomia fixa do Chief ('Cardiologia', 'Oncologia'...)
  // não bate palavra-por-palavra com o que fica salvo por instituição
  // ('Oncologia Pediátrica', 'Cardiologia Pediátrica') — match exato
  // faria essas instituições sumirem da página da especialidade-mãe.
  let resultado = data ?? []

  if (especialidade) {
    const busca = especialidade.toLowerCase()
    resultado = resultado.filter((item) =>
      (item.especialidades ?? []).some((e: string) => e.toLowerCase().includes(busca))
    )
  }
  if (patologia) {
    const busca = patologia.toLowerCase()
    resultado = resultado.filter((item) =>
      (item.patologias ?? []).some((p: string) => p.toLowerCase().includes(busca))
    )
  }

  return respostaJson({ success: true, data: resultado }, 200, headers)
})
