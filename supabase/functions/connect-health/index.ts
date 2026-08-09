// supabase/functions/connect-health/index.ts
//
// CONNECT-004F — Health Dashboard (Bloco 10). Endpoint que expõe
// obterPainelOperacional() (Registry + Métricas + Circuit Breaker +
// Contract Validation) pro ConnectInboxPage consumir na aba nova.
//
// DIFERENÇA DELIBERADA em relação ao receber-lead-site: esta function
// é interna/administrativa, não pública — deploy SEM a flag
// --no-verify-jwt (ao contrário de receber-lead-site, que precisa
// dela por ser chamada anonimamente pelo site). Com JWT verificado,
// o Supabase já barra qualquer chamada sem sessão válida do LifCore
// ANTES do código abaixo rodar.
//
// LIMITAÇÃO CONHECIDA, não escondida: isso garante AUTENTICAÇÃO, não
// AUTORIZAÇÃO — não checa aqui se o usuário tem papel
// master/administrador (mesma regra que já existe no menu via
// somenteMasterAdmin). Não implementei essa checagem porque não
// tenho o schema/tabela de perfis à mão (schema, nome de coluna) —
// pra não repetir o erro de adivinhar contra o banco que o Security
// Baseline Checklist existe pra evitar. Se quiser fechar isso, me
// manda o perfisService.js ou equivalente.
//
// Não precisa de client Supabase aqui — obterPainelOperacional() lê
// só estado em memória (Registry, Métricas, Circuit Breaker), sem
// tocar em banco.

import { obterPainelOperacional } from '../_shared/connect/observability/observability.ts'

const ORIGENS_PERMITIDAS = [
  'https://www.lifitseg.com.br',
  // Domínio de teste da Vercel do LifCore-app ainda não migrou pro
  // oficial (ver relatório da sessão de 07/08) — adicionar manualmente
  // aqui quando o domínio de produção do App estiver definido, ou me
  // passar a URL pra eu já deixar certo.
]

function corsHeaders(origemRequisicao: string | null): Record<string, string> {
  const origemPermitida = origemRequisicao && ORIGENS_PERMITIDAS.includes(origemRequisicao)
    ? origemRequisicao
    : ORIGENS_PERMITIDAS[0]

  return {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': origemPermitida,
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-LifCore-Client',
  }
}

function respostaJson(corpo: unknown, status: number, headers: Record<string, string>): Response {
  // Status 204 (No Content) PROÍBE corpo — mesmo cuidado do
  // receber-lead-site (Security Baseline Checklist, item conhecido).
  if (status === 204) {
    return new Response(null, { status, headers })
  }
  return new Response(JSON.stringify(corpo), { status, headers })
}

Deno.serve(async (req) => {
  const headers = corsHeaders(req.headers.get('origin'))

  if (req.method === 'OPTIONS') {
    return respostaJson({}, 204, headers)
  }

  if (req.method !== 'GET') {
    return respostaJson({ message: 'Método não permitido.' }, 405, headers)
  }

  try {
    const drivers = await obterPainelOperacional()
    return respostaJson({ success: true, executadoEm: new Date().toISOString(), drivers }, 200, headers)
  } catch (erro) {
    console.error('[connect-health] Erro ao montar painel operacional:', erro)
    return respostaJson({ message: 'Erro ao montar painel operacional.' }, 500, headers)
  }
})
