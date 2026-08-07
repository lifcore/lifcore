// supabase/functions/testar-tokio-veiculo/index.ts
//
// CONNECT-004 REV.002 — Test Harness, v2.
// Ajuste: try/catch envolvendo TUDO, pra garantir que qualquer erro
// (mesmo um bug meu) sempre volta como JSON com mensagem clara, nunca
// como 502 mudo. E a consulta ao Provider Registry foi simplificada
// (2 passos em vez de 1 join complexo), que era a suspeita principal
// do crash anterior.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { buscarVeiculosPorDescricao, listarProdutos } from '../_shared/connect/drivers/tokio/tokioVehicleDriver.ts'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
)

Deno.serve(async (req) => {
  try {
    if (req.method !== 'POST') {
      return new Response(JSON.stringify({ message: 'Use POST.' }), { status: 405 })
    }

    let body: { descricao?: string; ambiente?: string; codigoProduto?: string; acao?: string }
    try {
      body = await req.json()
    } catch {
      return new Response(JSON.stringify({ message: 'JSON inválido.' }), { status: 400 })
    }

    const descricao = body.descricao ?? 'GOL'
    const ambiente = body.ambiente ?? 'sandbox_a'

    // Passo 1 — acha o provider
    const { data: provider, error: erroProvider } = await supabase
      .schema('institucional')
      .from('providers')
      .select('id')
      .eq('slug', 'tokio-marine')
      .single()

    if (erroProvider || !provider) {
      return new Response(JSON.stringify({ etapa: 'buscar provider', message: 'Provider tokio-marine não encontrado.', erro: erroProvider?.message }), { status: 500 })
    }

    // Passo 2 — acha o ambiente (sem join, consulta direta)
    const { data: env, error: erroEnv } = await supabase
      .schema('institucional')
      .from('provider_environments')
      .select('id, base_url')
      .eq('provider_id', provider.id)
      .eq('ambiente', ambiente)
      .single()

    if (erroEnv || !env) {
      return new Response(JSON.stringify({ etapa: 'buscar ambiente', message: `Ambiente '${ambiente}' não encontrado.`, erro: erroEnv?.message }), { status: 500 })
    }

    // Passo 3 — acha a identity
    const { data: identity, error: erroIdentity } = await supabase
      .schema('institucional')
      .from('provider_identities')
      .select('codigo_corretor, codigo_usuario, codigo_operadora')
      .eq('environment_id', env.id)
      .single()

    if (erroIdentity || !identity) {
      return new Response(JSON.stringify({ etapa: 'buscar identity', message: 'Identity não encontrada.', erro: erroIdentity?.message }), { status: 500 })
    }

    if (!identity.codigo_usuario) {
      return new Response(JSON.stringify({ etapa: 'validar identity', message: 'codigo_usuario ainda não confirmado no Provider Registry.' }), { status: 400 })
    }

    const identityParaTokio = {
      baseUrl: env.base_url,
      codigoCorretor: identity.codigo_corretor,
      codigoUsuario: identity.codigo_usuario,
      codigoOperadora: identity.codigo_operadora,
    }

    // Ação: listarProdutos — não precisa de mais nada, só as credenciais
    if (body.acao === 'listarProdutos') {
      const produtos = await listarProdutos(identityParaTokio)
      return new Response(JSON.stringify({ sucesso: true, ambiente, produtos }), {
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // Ação padrão: buscarVeiculos
    if (!body.codigoProduto) {
      return new Response(JSON.stringify({
        etapa: 'validar entrada',
        message: 'codigoProduto ainda não confirmado — envie no corpo da requisição, ou use {"acao":"listarProdutos"} primeiro pra descobrir o código certo.',
      }), { status: 400 })
    }

    const hoje = new Date()
    const inicioVigencia = `${String(hoje.getDate()).padStart(2, '0')}/${String(hoje.getMonth() + 1).padStart(2, '0')}/${hoje.getFullYear()}`

    // Passo 4 — chama a Tokio de verdade
    const veiculos = await buscarVeiculosPorDescricao(
      identityParaTokio,
      descricao,
      body.codigoProduto,
      inicioVigencia
    )

    return new Response(JSON.stringify({ sucesso: true, ambiente, quantidadeEncontrada: veiculos.length, veiculos }), {
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (err) {
    // Rede de segurança final — qualquer exceção não prevista cai
    // aqui, com stack trace completo, em vez de virar 502 mudo.
    console.error('[testar-tokio-veiculo] Erro não tratado:', err)
    return new Response(JSON.stringify({
      etapa: 'erro não tratado',
      message: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
    }), { status: 500, headers: { 'Content-Type': 'application/json' } })
  }
})
