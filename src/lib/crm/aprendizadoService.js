import { operacional, institucional } from '../supabaseSchemas'
import { askAI } from '../aiProvider'

/**
 * Quando uma Demanda é encerrada, gera automaticamente um RESUMO
 * sugerido (usando IA) a partir de todo o histórico do caso — mas
 * NUNCA vira Caso Real sozinho. Fica como candidato, esperando
 * aprovação humana explícita (Constituição: Responsabilidade Humana).
 */
export async function gerarResumoCandidato(casoId) {
  const { data: caso } = await operacional.from('casos').select('*').eq('id', casoId).single()

  const { data: eventos } = await operacional
    .from('eventos')
    .select('tipo, descricao')
    .eq('caso_id', casoId)
    .order('criado_em', { ascending: true })

  const historico = (eventos ?? [])
    .filter((e) => ['mensagem_corretor', 'mensagem_especialista', 'atualizacao_manual'].includes(e.tipo))
    .map((e) => `[${e.tipo}]: ${e.descricao}`)
    .join('\n\n')

  const systemPrompt = `Você resume um atendimento encerrado da LifitSeg para virar um Caso Fundamental (conhecimento institucional).
Responda APENAS em JSON válido, sem markdown, no formato:
{
  "titulo": "título curto do caso",
  "contexto": "contexto da situação",
  "problema": "qual era o problema/necessidade",
  "resultado": "como foi resolvido",
  "licoes_aprendidas": "o que fica de aprendizado pra próximos casos parecidos"
}`

  const resultado = await askAI({
    systemPrompt,
    messages: [
      {
        role: 'user',
        content: `Demanda original: ${caso.demanda_original}\n\nCategoria: ${caso.categoria ?? 'não informada'}\n\nHistórico completo:\n${historico}\n\nRecomendação final registrada: ${caso.recomendacao ?? 'não houve'}`,
      },
    ],
    maxTokens: 700,
  })

  try {
    const textoLimpo = resultado.text.replace(/```json|```/g, '').trim()
    return JSON.parse(textoLimpo)
  } catch {
    return {
      titulo: caso.demanda_original?.slice(0, 60) ?? 'Caso sem título',
      contexto: caso.demanda_original ?? '',
      problema: '',
      resultado: caso.recomendacao ?? '',
      licoes_aprendidas: '',
    }
  }
}

/** Registra o resumo sugerido como candidato (pendente de aprovação humana) */
export async function criarCandidatoConhecimento(casoId, resumoJson) {
  const { data, error } = await operacional
    .from('candidatos_conhecimento')
    .insert({
      caso_id: casoId,
      resumo_aprendizado: JSON.stringify(resumoJson),
      status: 'pendente',
    })
    .select()
    .single()
  if (error) throw new Error(`Erro ao criar candidato a conhecimento: ${error.message}`)
  return data
}

/** Aprova um candidato — SÓ acontece com clique humano explícito. Cria o Caso Real de verdade. */
export async function aprovarCandidatoComoCasoReal(candidatoId, usuarioId) {
  const { data: candidato, error: erroCandidato } = await operacional
    .from('candidatos_conhecimento')
    .select('*, casos(cliente_prospect_id)')
    .eq('id', candidatoId)
    .single()
  if (erroCandidato) throw new Error(`Erro ao buscar candidato: ${erroCandidato.message}`)

  const resumo = JSON.parse(candidato.resumo_aprendizado)

  // Descobre a qual módulo esse caso pertence (Saúde ou Auto), a partir
  // do cliente vinculado — assim o Caso Real nasce com o prefixo e a
  // numeração certos, sem misturar a contagem entre os dois módulos.
  let modulo = 'saude'
  const clienteProspectId = candidato.casos?.cliente_prospect_id
  if (clienteProspectId) {
    const { data: cliente } = await operacional
      .from('clientes_prospects')
      .select('modulo')
      .eq('id', clienteProspectId)
      .maybeSingle()
    modulo = cliente?.modulo ?? 'saude'
  }

  const prefixo = modulo === 'auto' ? 'CASO-AUTO' : 'CASO-SAU'

  const { count } = await institucional
    .from('casos_fundamentais')
    .select('id', { count: 'exact', head: true })
    .eq('modulo', modulo)
  const proximoNumero = String((count ?? 0) + 1).padStart(3, '0')
  const codigo = `${prefixo}-${proximoNumero}-REAL`

  const { data: novoCaso, error: erroCaso } = await institucional
    .from('casos_fundamentais')
    .insert({
      codigo,
      modulo,
      titulo: resumo.titulo,
      contexto: resumo.contexto,
      problema: resumo.problema,
      resultado: resumo.resultado,
      licoes_aprendidas: resumo.licoes_aprendidas,
      status_validacao: 'validado', // já nasce validado — foi aprovado por humano nesse exato momento
      validado_por: usuarioId,
      validado_em: new Date().toISOString(),
    })
    .select()
    .single()
  if (erroCaso) throw new Error(`Erro ao criar caso real: ${erroCaso.message}`)

  await operacional
    .from('candidatos_conhecimento')
    .update({
      status: 'aprovado',
      validado_por: usuarioId,
      validado_em: new Date().toISOString(),
      caso_fundamental_gerado: novoCaso.id,
    })
    .eq('id', candidatoId)

  return novoCaso
}

/** Rejeita um candidato — o resumo não vira conhecimento institucional */
export async function rejeitarCandidato(candidatoId) {
  const { error } = await operacional
    .from('candidatos_conhecimento')
    .update({ status: 'rejeitado' })
    .eq('id', candidatoId)
  if (error) throw new Error(`Erro ao rejeitar candidato: ${error.message}`)
}
