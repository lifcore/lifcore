// supabase/functions/receber-lead-site/index.ts
//
// Recebe leads do site institucional (público, sem autenticação) e
// cria o registro real em operacional.clientes_prospects + o contato
// primário em operacional.contatos — mesmo padrão já usado em todo
// fluxo de "novo cliente" do LifCore, não uma escrita paralela.
//
// Segurança (diretriz do Chief):
// - CORS travado só pro domínio do site da LifitSeg.
// - Honeypot: campo oculto que só bot preenche — se vier preenchido,
//   responde sucesso (não entrega pro bot que foi detectado) mas
//   NUNCA grava nada.
// - Validação mínima de e-mail/telefone.
// - Guarda simples contra duplicidade: mesmo e-mail+telefone nas
//   últimas 24h não cria um segundo registro (só atualiza).
//
// ⚠️ CONFIRMAR ANTES DE SUBIR: os nomes de coluna abaixo
// (razao_social, status, modulo, corretor_id, cnpj, cidade) foram
// usados em todo o app até aqui — mas esta função roda fora do
// código React, então vale um teste real antes de ir pra produção.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const DOMINIO_PERMITIDO = 'https://www.lifitseg.com.br'

const MAPA_PRODUTO_PARA_MODULO: Array<{ palavras: string[]; modulo: string }> = [
  { palavras: ['saude', 'saúde', 'odonto', 'benefício', 'beneficio', 'pme'], modulo: 'saude' },
  { palavras: ['auto', 'frota', 'veículo', 'veiculo', 'carro', 'moto', 'caminhão', 'caminhao'], modulo: 'auto' },
  { palavras: ['vida', 'patrimonial', 'afinidade', 'residencial', 'condomínio', 'condominio'], modulo: 'lifsure' },
  { palavras: ['técnico', 'tecnico', 'transporte', 'responsabilidade civil', 'garantia', 'cyber', 'engenharia'], modulo: 'lishield' },
  { palavras: ['consórcio', 'consorcio', 'previdência', 'previdencia', 'investimento', 'planejamento patrimonial'], modulo: 'lifplan' },
]

/** Mapeia o texto livre do formulário pra um dos 5 módulos reais do LifCore. Padrão: 'saude' (linha principal). */
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

function respostaJson(corpo: unknown, status = 200) {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': DOMINIO_PERMITIDO,
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, X-LifCore-Client',
    },
  })
}

Deno.serve(async (req) => {
  // Pré-flight de CORS
  if (req.method === 'OPTIONS') {
    return respostaJson({}, 204)
  }

  if (req.method !== 'POST') {
    return respostaJson({ message: 'Método não permitido.' }, 405)
  }

  let payload: Record<string, unknown>
  try {
    payload = await req.json()
  } catch {
    return respostaJson({ message: 'Corpo da requisição inválido.' }, 400)
  }

  // Honeypot — campo oculto que só bot preenche. Responde sucesso
  // pra não entregar a detecção, mas nunca grava nada.
  if (typeof payload.website === 'string' && payload.website.trim() !== '') {
    return respostaJson({ success: true, message: 'Lead capturado com sucesso.', leadId: null })
  }

  const { nome, email, telefone, empresa, cidade, produto, origem, utm, numeroColaboradores, observacoes } = payload as {
    nome?: string
    email?: string
    telefone?: string
    empresa?: string
    cidade?: string
    produto?: string
    origem?: string
    utm?: Record<string, unknown>
    numeroColaboradores?: number
    observacoes?: string
  }

  if (!nome || !email || !telefone) {
    return respostaJson({ message: 'Campos obrigatórios ausentes: Nome, E-mail e Telefone são fundamentais.' }, 400)
  }
  if (!validarEmail(email)) {
    return respostaJson({ message: 'E-mail em formato inválido.' }, 400)
  }
  if (!validarTelefone(telefone)) {
    return respostaJson({ message: 'Telefone em formato inválido.' }, 400)
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  )

  const modulo = mapearProdutoParaModulo(produto)

  // Guarda simples contra duplicidade — mesmo e-mail nas últimas 24h
  // não cria um segundo registro.
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
    })
  }

  const { data: cliente, error: erroCliente } = await supabase
    .schema('operacional')
    .from('clientes_prospects')
    .insert({
      razao_social: empresa || nome,
      status: 'prospect',
      modulo,
      corretor_id: null, // sem responsável ainda — aguarda triagem manual
      cidade: cidade || null,
      origem_lead: origem || null,
      utm_lead: utm || null,
      proxima_acao_descricao: observacoes || `Lead do site — produto de interesse: ${produto ?? 'não informado'}${numeroColaboradores ? ` (${numeroColaboradores} vidas)` : ''}`,
    })
    .select('id')
    .single()

  if (erroCliente) {
    console.error('[receber-lead-site] Erro ao criar cliente:', erroCliente)
    return respostaJson({ message: 'Erro ao registrar lead. Tente novamente em instantes.' }, 500)
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
    // Não derruba a resposta pro usuário final — o cliente já existe,
    // o time comercial ainda consegue encontrar pelo cadastro.
  }

  return respostaJson({
    success: true,
    message: 'Lead capturado com sucesso.',
    leadId: cliente.id,
  })
})