// Edge Function: especialista-ia
// Roda no servidor do Supabase, não no navegador — a chave da Anthropic
// fica guardada como "secret" aqui, nunca exposta ao usuário final.

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  // Navegador sempre manda um "OPTIONS" antes da chamada real (checagem de CORS)
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { systemPrompt, messages, maxTokens, images } = await req.json()

    const apiKey = Deno.env.get('ANTHROPIC_API_KEY')
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: 'ANTHROPIC_API_KEY não configurada nos secrets do Supabase.' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Mesma lógica de anexar imagens/documentos que já tínhamos no
    // navegador — só que agora roda aqui, do lado do servidor.
    // IMPORTANTE: a Anthropic exige formatos diferentes — "image" só
    // vale para jpeg/png/gif/webp; PDF precisa vir como "document".
    const mensagensFinais = (messages ?? []).map((msg, index) => {
      const ehUltimaDoUsuario = index === messages.length - 1 && msg.role === 'user'
      if (!ehUltimaDoUsuario || !images?.length) return msg

      return {
        role: msg.role,
        content: [
          ...images.map((img) => {
            const ehPdf = img.mediaType === 'application/pdf'
            return {
              type: ehPdf ? 'document' : 'image',
              source: { type: 'base64', media_type: img.mediaType, data: img.base64 },
            }
          }),
          { type: 'text', text: msg.content },
        ],
      }
    })

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: maxTokens || 1000,
        system: systemPrompt,
        messages: mensagensFinais,
      }),
    })

    const data = await response.json()

    if (!response.ok) {
      return new Response(JSON.stringify({ error: data }), {
        status: response.status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    return new Response(JSON.stringify(data), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})