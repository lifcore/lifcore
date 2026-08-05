import { operacional } from '../supabaseSchemas'

/**
 * Lista os templates de um módulo. Sem `corretorId`, mostra só os
 * padrões da empresa (corretor_id nulo) — comportamento seguro pra
 * qualquer chamada antiga que ainda não foi atualizada. Com
 * `corretorId`, mostra padrões da empresa + os pessoais daquele
 * corretor (nunca os de outro corretor).
 */
export async function listarTemplates(modulo = 'lifcare', corretorId = null) {
  let query = operacional
    .from('templates_mensagens')
    .select('*')
    .eq('modulo', modulo)
    .order('criado_em', { ascending: true })

  query = corretorId
    ? query.or(`corretor_id.is.null,corretor_id.eq.${corretorId}`)
    : query.is('corretor_id', null)

  const { data, error } = await query
  if (error) throw new Error(`Erro ao listar templates: ${error.message}`)
  return data ?? []
}

/**
 * Knowledge Center v1 — Template Registry: visão cross-módulo pra
 * governança (categoria, status, versão), diferente de `listarTemplates`
 * que é escopado a 1 módulo (uso original, dentro do modal de WhatsApp).
 * Mesma tabela, consulta diferente — sem duplicar lógica de escrita.
 */
export async function listarTodosTemplates({ categoria, modulo, status, busca } = {}) {
  let query = operacional.from('templates_mensagens').select('*').order('modulo').order('titulo')
  if (categoria) query = query.eq('categoria', categoria)
  if (modulo) query = query.eq('modulo', modulo)
  if (status) query = query.eq('status', status)
  const { data, error } = await query
  if (error) throw new Error(`Erro ao listar templates (registry): ${error.message}`)
  const linhas = data ?? []
  if (!busca) return linhas
  const termo = busca.toLowerCase()
  return linhas.filter((t) => t.titulo?.toLowerCase().includes(termo) || t.corpo?.toLowerCase().includes(termo))
}

/**
 * Cria um template. Sem `corretorId`, vira um padrão da empresa
 * (visível a todos — a tela deve garantir que só Master use esse
 * caminho). Com `corretorId`, vira pessoal daquele corretor.
 */
export async function criarTemplate({ organizacaoId, modulo, titulo, corpo, usuarioId, categoria, corretorId = null }) {
  const { error } = await operacional.from('templates_mensagens').insert({
    organizacao_id: organizacaoId,
    modulo,
    titulo,
    corpo,
    criado_por: usuarioId,
    categoria: categoria || null,
    corretor_id: corretorId,
  })
  if (error) throw new Error(`Erro ao criar template: ${error.message}`)
}

/** Atualização "de conteúdo" (usada no fluxo original de mensagens) —
 * comportamento inalterado, não mexe em versão. */
export async function atualizarTemplate(id, dados) {
  const { error } = await operacional
    .from('templates_mensagens')
    .update({ ...dados, atualizado_em: new Date().toISOString() })
    .eq('id', id)
  if (error) throw new Error(`Erro ao atualizar template: ${error.message}`)
}

/**
 * Knowledge Center v1 — atualização com governança: incrementa versão
 * e permite ajustar categoria/status. Função separada de
 * `atualizarTemplate` pra não alterar o comportamento já usado no
 * fluxo original de mensagens (que não precisa de versionamento).
 */
export async function atualizarTemplateComGovernanca(id, dados) {
  const { data: atual, error: erroAtual } = await operacional
    .from('templates_mensagens')
    .select('versao')
    .eq('id', id)
    .single()
  if (erroAtual) throw new Error(`Erro ao buscar template: ${erroAtual.message}`)

  const { error } = await operacional
    .from('templates_mensagens')
    .update({ ...dados, versao: (atual.versao ?? 1) + 1, atualizado_em: new Date().toISOString() })
    .eq('id', id)
  if (error) throw new Error(`Erro ao atualizar template: ${error.message}`)
}

/** Inativa um template sem excluir (preserva histórico de uso) */
export async function inativarTemplate(id) {
  const { error } = await operacional.from('templates_mensagens').update({ status: 'inativo' }).eq('id', id)
  if (error) throw new Error(`Erro ao inativar template: ${error.message}`)
}

export async function reativarTemplate(id) {
  const { error } = await operacional.from('templates_mensagens').update({ status: 'ativo' }).eq('id', id)
  if (error) throw new Error(`Erro ao reativar template: ${error.message}`)
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
export function personalizarMensagem(textoTemplate, { nomeContato, nomeEmpresa, nomeCorretor, vigencia, veiculo }) {
  const jaTemAssinatura = textoTemplate.includes('{{corretor}}')

  let texto = textoTemplate
    .replaceAll('{{nome}}', nomeContato || '')
    .replaceAll('{{empresa}}', nomeEmpresa || '')
    .replaceAll('{{corretor}}', nomeCorretor || '')
    .replaceAll('{{vigencia}}', vigencia || '')
    .replaceAll('{{veiculo}}', veiculo || '')
    .replace(/\s{2,}/g, ' ') // limpa espaço duplo que sobra quando o placeholder fica vazio

  if (!jaTemAssinatura && nomeCorretor) {
    texto += `\n\n_${nomeCorretor} - LifitSeg_`
  }

  return texto
}