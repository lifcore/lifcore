// supabase/functions/receber-trabalhe-conosco/index.ts
//
// Recebe o formulário "Trabalhe Conosco" (WEB-005) e cria o registro
// em operacional.candidatos_recrutamento. Destino temporário —
// migra pro People Center quando ele existir formalmente.

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

  const { nome, email, telefone, areaInteresse, curriculoUrl, mensagem } = payload as {
    nome?: string; email?: string; telefone?: string; areaInteresse?: string; curriculoUrl?: string; mensagem?: string
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
  const { data: existente } = await supabase
    .schema('operacional')
    .from('candidatos_recrutamento')
    .select('id, criado_em')
    .eq('email', email)
    .gte('criado_em', desde)
    .limit(1)
    .maybeSingle()

  if (existente) {
    return respostaJson({
      success: true,
      message: 'Já recebemos sua candidatura recentemente — obrigado pelo interesse.',
      candidatoId: existente.id,
    }, 200, headers)
  }

  const { data: candidato, error } = await supabase
    .schema('operacional')
    .from('candidatos_recrutamento')
    .insert({
      nome,
      email,
      telefone: telefone || null,
      area_interesse: areaInteresse || null,
      curriculo_url: curriculoUrl || null,
      mensagem: mensagem || null,
    })
    .select('id')
    .single()

  if (error) {
    console.error('[receber-trabalhe-conosco] Erro ao registrar candidato:', error)
    return respostaJson({ message: 'Erro ao registrar candidatura. Tente novamente em instantes.' }, 500, headers)
  }

  return respostaJson({ success: true, message: 'Candidatura recebida com sucesso.', candidatoId: candidato.id }, 200, headers)
})
