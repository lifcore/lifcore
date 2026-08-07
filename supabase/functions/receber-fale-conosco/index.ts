// supabase/functions/receber-fale-conosco/index.ts
//
// Recebe o formulário "Fale com a LifitSeg" (WEB-005) e cria o
// registro em operacional.clientes_prospects + contato primário —
// exatamente o mesmo padrão já comprovado em produção pelo
// receber-lead-site. Copiado de propósito (Evolução antes da
// reconstrução), não uma lógica nova inventada do zero.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const ORIGENS_PERMITIDAS = [
  'https://www.lifitseg.com.br',
  'https://lifitseg.com.br',
  'https://lifitsegcombr.vercel.app',
]

function validarEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

function corsHeaders(origemRequisicao: string | null) {
  const origemPermitida = origemRequisicao && ORIGENS_PERMITIDAS.includes(origemRequisicao)
    ? origemRequisicao
    : ORIGENS_PERMITIDAS[0]

  return {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': origemPermitida,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-LifCore-Client',
  }
}

function respostaJson(corpo: unknown, status: number, headers: Record<string, string>) {
  // Status 204 nunca pode ter corpo — mesma lição do receber-lead-site.
  if (status === 204) return new Response(null, { status, headers })
  return new Response(JSON.stringify(corpo), { status, headers })
}

Deno.serve(async (req) => {
  const origemRequisicao = req.headers.get('origin')
  const headers = corsHeaders(origemRequisicao)

  if (req.method === 'OPTIONS') return respostaJson({}, 204, headers)
  if (req.method !== 'POST') return respostaJson({ message: 'Método não permitido.' }, 405, headers)

  let payload: Record<string, unknown>
  try {
    payload = await req.json()
  } catch {
    return respostaJson({ message: 'Corpo da requisição inválido.' }, 400, headers)
  }

  const { nome, email, telefone, empresa, assunto, mensagem, origem } = payload as {
    nome?: string; email?: string; telefone?: string; empresa?: string; assunto?: string; mensagem?: string; origem?: string
  }

  if (!nome || !email) {
    return respostaJson({ message: 'Campos obrigatórios ausentes: Nome e E-mail são fundamentais.' }, 400, headers)
  }
  if (!validarEmail(email)) {
    return respostaJson({ message: 'E-mail em formato inválido.' }, 400, headers)
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  )

  // Guarda contra duplicidade — mesmo e-mail em 24h não cria outro registro.
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
    return respostaJson({
      success: true,
      message: 'Já recebemos seus dados recentemente — nossa equipe entrará em contato.',
      leadId: contatoExistente.cliente_prospect_id,
    }, 200, headers)
  }

  const { data: org, error: erroOrg } = await supabase
    .schema('operacional')
    .from('organizacoes')
    .select('id')
    .limit(1)
    .single()

  if (erroOrg || !org) {
    console.error('[receber-fale-conosco] Erro ao buscar organização:', erroOrg)
    return respostaJson({ message: 'Erro ao registrar contato. Tente novamente em instantes.' }, 500, headers)
  }

  const { data: cliente, error: erroCliente } = await supabase
    .schema('operacional')
    .from('clientes_prospects')
    .insert({
      organizacao_id: org.id,
      razao_social: empresa || nome,
      status: 'prospect',
      modulo: 'saude', // contato institucional genérico — sem produto específico selecionado
      corretor_id: null,
      origem_lead: origem || 'sobre-e-conhecimento',
      produto_interesse: assunto || null,
      proxima_acao_descricao: mensagem || 'Contato via formulário "Fale com a LifitSeg"',
    })
    .select('id')
    .single()

  if (erroCliente) {
    console.error('[receber-fale-conosco] Erro ao criar cliente:', erroCliente)
    return respostaJson({ message: 'Erro ao registrar contato. Tente novamente em instantes.' }, 500, headers)
  }

  const { error: erroContato } = await supabase
    .schema('operacional')
    .from('contatos')
    .insert({ cliente_prospect_id: cliente.id, tipo: 'primario', nome, telefone: telefone || '', email })

  if (erroContato) {
    console.error('[receber-fale-conosco] Cliente criado, mas contato falhou:', erroContato)
  }

  return respostaJson({ success: true, message: 'Mensagem recebida com sucesso.', leadId: cliente.id }, 200, headers)
})
