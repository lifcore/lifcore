// supabase/functions/receber-lead-site/index.ts
//
// Recebe leads do site institucional (público, sem autenticação) e
// cria o registro real em operacional.clientes_prospects + o contato
// primário em operacional.contatos — mesmo padrão já usado em todo
// fluxo de "novo cliente" do LifCore, não uma escrita paralela.
//
// CONNECT-003 (Enterprise Integration Foundation) — Fase 1:
// - Configuration Registry (Cap.05): organização padrão e origens de
//   CORS deixam de ser constante fixa no código, viram linha em
//   institucional.configuracao_global.
// - Structured Entry (Cap.01): produto de interesse ganhou coluna
//   própria (produto_interesse) — antes só ia pro texto livre de
//   proxima_acao_descricao e nunca aparecia no card do cliente.
// - Auditoria com Correlation ID (Princípio 003): toda entrada grava
//   em operacional.connect_log, do recebimento até o resultado final.
//
// Segurança (mantida desta revisão pra trás):
// - CORS dinâmico por origem, lido da Configuration Registry.
// - Honeypot: campo oculto que só bot preenche.
// - Guarda simples contra duplicidade (mesmo e-mail em 24h).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
)

const MAPA_PRODUTO_PARA_MODULO: Array<{ palavras: string[]; modulo: string }> = [
  { palavras: ['saude', 'saúde', 'odonto', 'benefício', 'beneficio', 'pme'], modulo: 'saude' },
  { palavras: ['auto', 'frota', 'veículo', 'veiculo', 'carro', 'moto', 'caminhão', 'caminhao'], modulo: 'auto' },
  { palavras: ['vida', 'patrimonial', 'afinidade', 'residencial', 'condomínio', 'condominio'], modulo: 'lifsure' },
  { palavras: ['técnico', 'tecnico', 'transporte', 'responsabilidade civil', 'garantia', 'cyber', 'engenharia'], modulo: 'lishield' },
  { palavras: ['consórcio', 'consorcio', 'previdência', 'previdencia', 'investimento', 'planejamento patrimonial'], modulo: 'lifplan' },
]

function mapearProdutoParaModulo(produto: string | undefined): string {
  const texto = (produto ?? '').toLowerCase()
  for (const entrada of MAPA_PRODUTO_PARA_MODULO) {
    if (entrada.palavras.some((p) => texto.includes(p))) return entrada.modulo
  }
  return 'saude'
}

function validarEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

function validarTelefone(telefone: string): boolean {
  return (telefone ?? '').replace(/\D/g, '').length >= 10
}

// Cache em memória do isolate — evita bater na Configuration Registry
// a cada requisição. Válido enquanto a function ficar "quente"
// (mesmo padrão dos logs "booted"/"shutdown" que já vimos no painel).
let configCache: { origensPermitidas: string[]; organizacaoPadraoId: string } | null = null

async function carregarConfiguracao() {
  if (configCache) return configCache

  const { data, error } = await supabase
    .schema('institucional')
    .from('configuracao_global')
    .select('chave, valor')
    .in('chave', ['origins_permitidas', 'organizacao_padrao_id'])

  if (error || !data) {
    throw new Error(`Erro ao carregar Configuration Registry: ${error?.message}`)
  }

  const porChave = Object.fromEntries(data.map((c) => [c.chave, c.valor]))
  configCache = {
    origensPermitidas: porChave['origins_permitidas'] as string[],
    organizacaoPadraoId: porChave['organizacao_padrao_id'] as string,
  }
  return configCache
}

function corsHeaders(origemRequisicao: string | null, origensPermitidas: string[]) {
  const origemPermitida = origemRequisicao && origensPermitidas.includes(origemRequisicao)
    ? origemRequisicao
    : origensPermitidas[0]

  return {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': origemPermitida,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-LifCore-Client',
  }
}

function respostaJson(corpo: unknown, status: number, headers: Record<string, string>) {
  // Status 204 (No Content) PROÍBE corpo.
  if (status === 204) {
    return new Response(null, { status, headers })
  }
  return new Response(JSON.stringify(corpo), { status, headers })
}

/** Registra o evento no connect_log (Princípio 003) e devolve o correlation_id para acompanhar o resto do processamento. */
async function abrirLogEntrada(entryPoint: string, tipoEntrada: string, origem: string | null, payload: unknown) {
  const { data } = await supabase
    .schema('operacional')
    .from('connect_log')
    .insert({ entry_point: entryPoint, tipo_entrada: tipoEntrada, origem, payload, status: 'recebido' })
    .select('id, correlation_id')
    .single()
  return data ?? null
}

async function fecharLog(logId: string | undefined, status: 'processado' | 'erro', destino?: string, erroMensagem?: string) {
  if (!logId) return
  await supabase
    .schema('operacional')
    .from('connect_log')
    .update({ status, destino: destino ?? null, erro_mensagem: erroMensagem ?? null, processado_em: new Date().toISOString() })
    .eq('id', logId)
}

Deno.serve(async (req) => {
  const origemRequisicao = req.headers.get('origin')
  let config: Awaited<ReturnType<typeof carregarConfiguracao>>

  try {
    config = await carregarConfiguracao()
  } catch (err) {
    console.error('[receber-lead-site] Erro ao carregar configuração:', err)
    // Fallback duro se a Configuration Registry falhar — não derruba o site.
    config = { origensPermitidas: ['https://www.lifitseg.com.br'], organizacaoPadraoId: '' }
  }

  const headers = corsHeaders(origemRequisicao, config.origensPermitidas)

  if (req.method === 'OPTIONS') {
    return respostaJson({}, 204, headers)
  }

  if (req.method !== 'POST') {
    return respostaJson({ message: 'Método não permitido.' }, 405, headers)
  }

  let payload: Record<string, unknown>
  try {
    payload = await req.json()
  } catch {
    return respostaJson({ message: 'Corpo da requisição inválido.' }, 400, headers)
  }

  // Honeypot — nunca vira log, nunca vira registro.
  if (typeof payload.website === 'string' && payload.website.trim() !== '') {
    return respostaJson({ success: true, message: 'Lead capturado com sucesso.', leadId: null }, 200, headers)
  }

  const { nome, email, telefone, empresa, produto, origem, utm, numeroColaboradores, observacoes } = payload as {
    nome?: string
    email?: string
    telefone?: string
    empresa?: string
    produto?: string
    origem?: string
    utm?: Record<string, unknown>
    numeroColaboradores?: number
    observacoes?: string
  }

  if (!nome || !email || !telefone) {
    return respostaJson({ message: 'Campos obrigatórios ausentes: Nome, E-mail e Telefone são fundamentais.' }, 400, headers)
  }
  if (!validarEmail(email)) {
    return respostaJson({ message: 'E-mail em formato inválido.' }, 400, headers)
  }
  if (!validarTelefone(telefone)) {
    return respostaJson({ message: 'Telefone em formato inválido.' }, 400, headers)
  }

  // Abre o log ANTES de qualquer escrita de negócio — Princípio 003:
  // toda entrada é rastreável desde o momento em que chega.
  const log = await abrirLogEntrada('website-lead-modal', 'lead', origem ?? null, payload)

  const modulo = mapearProdutoParaModulo(produto)

  if (!config.organizacaoPadraoId) {
    await fecharLog(log?.id, 'erro', undefined, 'organizacao_padrao_id ausente na Configuration Registry')
    return respostaJson({ message: 'Erro ao registrar lead. Tente novamente em instantes.' }, 500, headers)
  }

  // Guarda simples contra duplicidade — mesmo e-mail nas últimas 24h.
  const desde = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const { data: contatoExistente } = await supabase
    .schema('operacional')
    .from('contatos')
    .select('cliente_prospect_id, criado_em')
    .eq('email', email)
    .gte('criado_em', desde)
    .limit(1)
    .maybeSingle()

  if (contatoExistente) {
    await fecharLog(log?.id, 'processado', 'growth (duplicado — ignorado)')
    return respostaJson({
      success: true,
      message: 'Já recebemos seus dados recentemente — nossa equipe entrará em contato.',
      leadId: contatoExistente.cliente_prospect_id,
    }, 200, headers)
  }

  const { data: cliente, error: erroCliente } = await supabase
    .schema('operacional')
    .from('clientes_prospects')
    .insert({
      organizacao_id: config.organizacaoPadraoId,
      razao_social: empresa || nome,
      status: 'prospect',
      modulo,
      corretor_id: null, // sem responsável ainda — fica no Connect Inbox (vw_connect_inbox)
      origem_lead: origem || null,
      utm_lead: utm || null,
      produto_interesse: produto || null, // CONNECT-003 Cap.01 — campo estruturado, não mais só texto livre
      numero_colaboradores: numeroColaboradores ?? null,
      proxima_acao_descricao: observacoes || null,
    })
    .select('id')
    .single()

  if (erroCliente) {
    console.error('[receber-lead-site] Erro ao criar cliente:', erroCliente)
    await fecharLog(log?.id, 'erro', undefined, erroCliente.message)
    return respostaJson({ message: 'Erro ao registrar lead. Tente novamente em instantes.' }, 500, headers)
  }

  const { error: erroContato } = await supabase
    .schema('operacional')
    .from('contatos')
    .insert({
      cliente_prospect_id: cliente.id,
      tipo: 'primario',
      nome,
      telefone,
      email,
    })

  if (erroContato) {
    console.error('[receber-lead-site] Cliente criado, mas contato falhou:', erroContato)
    await fecharLog(log?.id, 'erro', 'growth', `Cliente criado, contato falhou: ${erroContato.message}`)
  } else {
    await fecharLog(log?.id, 'processado', 'growth')
  }

  return respostaJson({
    success: true,
    message: 'Lead capturado com sucesso.',
    leadId: cliente.id,
  }, 200, headers)
})
