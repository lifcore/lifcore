import { operacional } from '../supabaseSchemas'

export async function listarTemplates(modulo = 'lifcare') {
  const { data, error } = await operacional
    .from('templates_mensagens')
    .select('*')
    .eq('modulo', modulo)
    .order('criado_em', { ascending: true })
  if (error) throw new Error(`Erro ao listar templates: ${error.message}`)
  return data ?? []
}

export async function criarTemplate({ organizacaoId, modulo, titulo, corpo, usuarioId }) {
  const { error } = await operacional.from('templates_mensagens').insert({
    organizacao_id: organizacaoId,
    modulo,
    titulo,
    corpo,
    criado_por: usuarioId,
  })
  if (error) throw new Error(`Erro ao criar template: ${error.message}`)
}

export async function atualizarTemplate(id, dados) {
  const { error } = await operacional
    .from('templates_mensagens')
    .update({ ...dados, atualizado_em: new Date().toISOString() })
    .eq('id', id)
  if (error) throw new Error(`Erro ao atualizar template: ${error.message}`)
}

export async function excluirTemplate(id) {
  const { error } = await operacional.from('templates_mensagens').delete().eq('id', id)
  if (error) throw new Error(`Erro ao excluir template: ${error.message}`)
}

/** Monta o link do WhatsApp Web com a mensagem já preenchida */
export function montarLinkWhatsApp(celular, mensagem) {
  const numeroLimpo = (celular || '').replace(/\D/g, '')
  const numeroComPais = numeroLimpo.startsWith('55') ? numeroLimpo : `55${numeroLimpo}`
  return `https://wa.me/${numeroComPais}?text=${encodeURIComponent(mensagem)}`
}

/**
 * Substitui placeholders do template pelos dados reais do contato/cliente,
 * deixando a mensagem mais humanizada (ex: "Olá {{nome}}" -> "Olá Maria").
 * Placeholders disponíveis: {{nome}}, {{empresa}}, {{corretor}}
 *
 * Se o template não incluir {{corretor}} manualmente, uma assinatura
 * é adicionada automaticamente no final (evita esquecer de assinar).
 */
export function personalizarMensagem(textoTemplate, { nomeContato, nomeEmpresa, nomeCorretor }) {
  const jaTemAssinatura = textoTemplate.includes('{{corretor}}')

  let texto = textoTemplate
    .replaceAll('{{nome}}', nomeContato || '')
    .replaceAll('{{empresa}}', nomeEmpresa || '')
    .replaceAll('{{corretor}}', nomeCorretor || '')
    .replace(/\s{2,}/g, ' ') // limpa espaço duplo que sobra quando o placeholder fica vazio

  if (!jaTemAssinatura && nomeCorretor) {
    texto += `\n\n_${nomeCorretor} - LifitSeg_`
  }

  return texto
}
