/**
 * Teste mínimo de autenticação — Passo 4 da configuração do provider
 * Anthropic. NÃO processa nenhum relatório. Só confirma que a chave
 * configurada como variável de ambiente autentica corretamente.
 *
 * Rodar: node scripts/testar-conexao-anthropic.cjs
 */

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY

async function main() {
  if (!ANTHROPIC_API_KEY) {
    console.error('ANTHROPIC_API_KEY não encontrada no ambiente. Configure como variável de ambiente do sistema antes de rodar (veja o passo a passo).')
    process.exitCode = 1
    return
  }

  console.log('Chave encontrada no ambiente. Testando autenticação com a API da Anthropic...')

  const resposta = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-5',
      max_tokens: 16,
      messages: [{ role: 'user', content: 'Responda apenas: ok' }],
    }),
  })

  if (resposta.status === 401) {
    console.error('ERRO: chave inválida ou não autorizada (401). Confira se copiou a chave certa no painel da Anthropic.')
    process.exitCode = 1
    return
  }

  if (!resposta.ok) {
    const corpo = await resposta.text()
    console.error(`ERRO: a API respondeu ${resposta.status}. Detalhe: ${corpo}`)
    process.exitCode = 1
    return
  }

  console.log('\n✅ Anthropic Provider conectado.')
}

main().catch((e) => {
  console.error('ERRO inesperado:', e.message)
  process.exitCode = 1
})
