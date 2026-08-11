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
// CONNECT-004C (decisão do Chief, 08/08) — Lead Input Standard:
// Site/LP continua com endpoint próprio de primeira parte (esta
// function), sem passar pelo Inbound Gateway (não há payload de
// terceiro pra adaptar/verificar aqui). Mas todo processamento após
// o recebimento agora opera sobre o mesmo contrato `LeadInputStandard`
// usado pelos futuros Adapters de Lead Ads nativo (Meta/Google/etc,
// em _shared/connect/inbound/contract/leadInputStandard.ts) — assim,
// quando esses Adapters forem ativados, a lógica de negócio já está
// no formato certo, sem duplicar nada.
//
// Segurança (mantida desta revisão pra trás):
// - CORS dinâmico por origem, lido da Configuration Registry.
// - Honeypot: campo oculto que só bot preenche.
// - Guarda simples contra duplicidade (mesmo e-mail em 24h).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import type { LeadInputStandard, UtmParams } from '../_shared/connect/inbound/contract/leadInputStandard.ts'

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

/**
 * Classifica um documento (CPF ou CNPJ) só pela quantidade de dígitos
 * — 11 = CPF, 14 = CNPJ. Convenção de `tipo_pessoa` ('fisica'/
 * 'juridica') alinhada com o que já existe em `lifleetService.js`
 * (validarQuantidadeVeiculos). Se o campo vier vazio ou não bater com
 * nenhum dos dois tamanhos, não classifica nada — nunca inventa
 * tipo_pessoa a partir de um documento que não reconhece.
 */
function classificarDocumento(documento: unknown): { tipoPessoa: string | null; cpf: string | null; cnpj: string | null } {
  const digitos = (typeof documento === 'string' ? documento : '').replace(/\D/g, '')
  if (digitos.length === 11) return { tipoPessoa: 'fisica', cpf: digitos, cnpj: null }
  if (digitos.length === 14) return { tipoPessoa: 'juridica', cpf: null, cnpj: digitos }
  return { tipoPessoa: null, cpf: null, cnpj: null }
}

function validarEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

function validarTelefone(telefone: string): boolean {
  return (telefone ?? '').replace(/\D/g, '').length >= 10
}

/**
 * O `LeadModal`/`tracking.ts` do site produzem UTM no formato de URL
 * (`utm_source`, `utm_medium`, ...) — o Lead Input Standard usa
 * `source`/`medium`/... (sem prefixo, mesmo formato que os futuros
 * Adapters de Meta/Google vão popular). Sem essa conversão, o UTM se
 * perderia silenciosamente na refatoração — achado ao migrar, não
 * fazia parte do formato antigo.
 */
function normalizarUtm(bruto: unknown): UtmParams | undefined {
  if (!bruto || typeof bruto !== 'object') return undefined
  const u = bruto as Record<string, unknown>
  const resultado: UtmParams = {
    source: typeof u.utm_source === 'string' ? u.utm_source : undefined,
    medium: typeof u.utm_medium === 'string' ? u.utm_medium : undefined,
    campaign: typeof u.utm_campaign === 'string' ? u.utm_campaign : undefined,
    content: typeof u.utm_content === 'string' ? u.utm_content : undefined,
    term: typeof u.utm_term === 'string' ? u.utm_term : undefined,
  }
  const temAlgum = Object.values(resultado).some((v) => v !== undefined)
  return temAlgum ? resultado : undefined
}

/**
 * Constrói o Lead Input Standard a partir do payload cru do site.
 * Mapeamento de campos (decisão de Claude, sinalizada — não estava
 * explícita na diretriz do Chief):
 *
 * - `origem` = 'site' (constante). No contrato, `origem` identifica o
 *   canal/provider (ex: 'meta_ads', 'google_ads') — pro site, o
 *   "provider" somos nós mesmos, sempre o mesmo valor.
 * - `fonte` = o que o payload do site já chamava de `origem`
 *   ('lp-saude-odonto', 'header', 'home-hero', etc) — é o ponto
 *   específico de captação dentro do site, mesmo papel que 'lead_ads'
 *   tem pros Adapters de Meta.
 * - `externalEventId` sempre null — lead de primeira parte não tem
 *   identificador de evento de plataforma externa nenhuma.
 * - Campos específicos do domínio de negócio da LifitSeg (produto,
 *   empresa, número de colaboradores, documento) não têm campo comum
 *   no contrato — vão em `dadosExternos`, exatamente como o contrato
 *   prevê pra dado que não é universal a todo provedor.
 */
function construirLeadInputStandardDoSite(payload: Record<string, unknown>): LeadInputStandard {
  const origemPagina = typeof payload.origem === 'string' ? payload.origem : 'site'

  return {
    origem: 'site',
    fonte: origemPagina,
    externalEventId: null,
    nome: typeof payload.nome === 'string' ? payload.nome : undefined,
    email: typeof payload.email === 'string' ? payload.email : undefined,
    telefone: typeof payload.telefone === 'string' ? payload.telefone : undefined,
    utm: normalizarUtm(payload.utm),
    dadosExternos: {
      empresa: typeof payload.empresa === 'string' ? payload.empresa : undefined,
      produto: typeof payload.produto === 'string' ? payload.produto : undefined,
      // BUG CORRIGIDO: <input type="number"> do navegador sempre manda
      // o valor como texto ("5"), nunca como number de verdade — o
      // check anterior (typeof === 'number') descartava isso sempre,
      // silenciosamente. Converte com segurança, sem quebrar se vier
      // vazio ou não numérico.
      numeroColaboradores: (() => {
        const bruto = payload.numeroColaboradores
        if (typeof bruto === 'number') return bruto
        if (typeof bruto === 'string' && bruto.trim() !== '') {
          const convertido = Number(bruto)
          return Number.isFinite(convertido) ? convertido : undefined
        }
        return undefined
      })(),
      observacoes: typeof payload.observacoes === 'string' ? payload.observacoes : undefined,
      documento: typeof payload.documento === 'string' ? payload.documento : undefined,
    },
  }
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

  // Honeypot — nunca vira log, nunca vira registro. Roda sobre o
  // payload cru, antes de qualquer conceito de "lead" existir ainda.
  if (typeof payload.website === 'string' && payload.website.trim() !== '') {
    return respostaJson({ success: true, message: 'Lead capturado com sucesso.', leadId: null }, 200, headers)
  }

  // A partir daqui, todo processamento opera sobre o Lead Input
  // Standard — não mais sobre o payload cru diretamente.
  const lead = construirLeadInputStandardDoSite(payload)

  if (!lead.nome || !lead.email || !lead.telefone) {
    return respostaJson({ message: 'Campos obrigatórios ausentes: Nome, E-mail e Telefone são fundamentais.' }, 400, headers)
  }
  if (!validarEmail(lead.email)) {
    return respostaJson({ message: 'E-mail em formato inválido.' }, 400, headers)
  }
  if (!validarTelefone(lead.telefone)) {
    return respostaJson({ message: 'Telefone em formato inválido.' }, 400, headers)
  }

  // Abre o log ANTES de qualquer escrita de negócio — Princípio 003:
  // toda entrada é rastreável desde o momento em que chega.
  // `origem` do connect_log grava `lead.fonte` (o ponto específico de
  // captação, ex: 'lp-saude-odonto') — preserva a mesma granularidade
  // que o campo já tinha antes da refatoração.
  const log = await abrirLogEntrada('website-lead-modal', 'lead', lead.fonte, payload)

  const produto = lead.dadosExternos.produto as string | undefined
  const empresa = lead.dadosExternos.empresa as string | undefined
  const numeroColaboradores = lead.dadosExternos.numeroColaboradores as number | undefined
  const observacoes = lead.dadosExternos.observacoes as string | undefined
  const documento = lead.dadosExternos.documento

  const modulo = mapearProdutoParaModulo(produto)
  const { tipoPessoa, cpf, cnpj } = classificarDocumento(documento)

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
    .eq('email', lead.email)
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
      razao_social: empresa || lead.nome,
      status: 'prospect',
      modulo,
      corretor_id: null, // sem responsável ainda — fica no Connect Inbox (vw_connect_inbox)
      origem_lead: lead.fonte || null,
      utm_lead: lead.utm ?? null, // agora no formato normalizado (source/medium/campaign), não mais utm_source/utm_medium cru
      produto_interesse: produto || null, // CONNECT-003 Cap.01 — campo estruturado, não mais só texto livre
      numero_colaboradores: numeroColaboradores ?? null,
      // BUG CORRIGIDO: tipo_pessoa é NOT NULL com DEFAULT 'juridica'
      // no banco — mandar `null` explícito sobrescreve o default e
      // quebra a constraint. Quando o documento não classifica (CPF/
      // CNPJ ausente ou com formato inválido), os 3 campos abaixo
      // simplesmente não entram no objeto de insert — o banco aplica
      // o próprio default sozinho, sem eu inventar nenhum valor aqui.
      ...(tipoPessoa ? { tipo_pessoa: tipoPessoa } : {}),
      ...(cpf ? { cpf } : {}),
      ...(cnpj ? { cnpj } : {}),
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
      nome: lead.nome,
      celular: lead.telefone, // BUG CORRIGIDO: a coluna real é `celular`, não `telefone` — confirmado via schema (contatos: id/cliente_prospect_id/tipo/nome/cargo/celular/email/criado_em/atualizado_em)
      email: lead.email,
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
