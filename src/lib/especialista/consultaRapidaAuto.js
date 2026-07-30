import { operacional } from '../supabaseSchemas'
import { gerarRespostaEspecialistaAuto } from './especialistaMotorAuto'

/**
 * Consulta Rápida do Auto — mesmo motor de raciocínio único da Demanda,
 * sem ciclo de vida. Pode virar Demanda depois, vinculando a um cliente.
 */
export async function atenderConsultaRapidaAuto({ demandaTexto, usuarioId, organizacaoId, imagens = [], consultaIdExistente = null }) {
  if (!demandaTexto?.trim()) {
    throw new Error('A pergunta não pode ser vazia.')
  }

  const organizacaoIdFinal = organizacaoId ?? (await buscarOrganizacaoUnica())

  let consulta
  if (consultaIdExistente) {
    const { data } = await operacional.from('consultas_rapidas_auto').select('*').eq('id', consultaIdExistente).maybeSingle()
    consulta = data
  }

  const historicoTexto = consulta?.mensagens?.length
    ? consulta.mensagens.map((m) => `[${m.autor === 'corretor' ? 'Consultor' : 'Especialista'}]: ${m.texto}`).join('\n\n')
    : ''

  if (!consulta) {
    const { data: novaConsulta, error } = await operacional
      .from('consultas_rapidas_auto')
      .insert({ organizacao_id: organizacaoIdFinal, usuario_id: usuarioId, mensagens: [] })
      .select()
      .single()
    if (error) throw new Error(`Erro ao registrar consulta: ${error.message}`)
    consulta = novaConsulta
  }

  const mensagensAtuais = [...(consulta.mensagens ?? [])]
  mensagensAtuais.push({ autor: 'corretor', texto: demandaTexto, criadoEm: new Date().toISOString() })

  const resultado = await gerarRespostaEspecialistaAuto({
    demandaTexto,
    historicoContexto: historicoTexto,
    historicoMensagens: consulta.mensagens ?? [],
    imagens: imagens.map((img) => ({ base64: img.base64, mediaType: img.mediaType })),
  })

  mensagensAtuais.push({ autor: 'especialista', texto: resultado.respostaTexto, criadoEm: new Date().toISOString() })
  await salvarMensagens(consulta.id, mensagensAtuais)

  return {
    consulta,
    precisaMaisInformacao: resultado.precisaMaisInformacao,
    perguntasParaConsultor: resultado.precisaMaisInformacao ? [resultado.respostaTexto] : undefined,
    resposta: { textoCompleto: resultado.respostaTexto },
    casosRelacionados: resultado.casosRelacionados,
  }
}

/** Converte uma Consulta Rápida em Demanda de verdade, vinculando a um cliente do Lifleet */
export async function vincularConsultaComoDemandaAuto({ consultaId, clienteProspectId, organizacaoId, usuarioId }) {
  const organizacaoIdFinal = organizacaoId ?? (await buscarOrganizacaoUnica())

  const { data: consulta, error: erroConsulta } = await operacional
    .from('consultas_rapidas_auto')
    .select('*')
    .eq('id', consultaId)
    .single()
  if (erroConsulta || !consulta) throw new Error('Consulta não encontrada.')

  const primeiraMensagem = consulta.mensagens?.find((m) => m.autor === 'corretor')?.texto ?? 'Consulta vinculada'

  const { data: codigo } = await operacional.rpc('gerar_codigo_demanda_auto')
  const { data: novoCaso, error: erroCaso } = await operacional
    .from('casos')
    .insert({
      codigo,
      organizacao_id: organizacaoIdFinal,
      cliente_prospect_id: clienteProspectId,
      situacao: 'em_andamento',
      especialista_responsavel: usuarioId,
      demanda_original: primeiraMensagem,
    })
    .select()
    .single()
  if (erroCaso) throw new Error(`Erro ao criar demanda vinculada: ${erroCaso.message}`)

  for (const msg of consulta.mensagens ?? []) {
    await operacional.from('eventos').insert({
      caso_id: novoCaso.id,
      tipo: msg.autor === 'corretor' ? 'mensagem_corretor' : 'mensagem_especialista',
      descricao: msg.texto,
      usuario_responsavel: usuarioId,
    })
  }

  await operacional
    .from('consultas_rapidas_auto')
    .update({ vinculada_caso_id: novoCaso.id })
    .eq('id', consultaId)

  return novoCaso
}

async function salvarMensagens(consultaId, mensagens) {
  const { error } = await operacional
    .from('consultas_rapidas_auto')
    .update({ mensagens, atualizado_em: new Date().toISOString() })
    .eq('id', consultaId)
  if (error) throw new Error(`Erro ao salvar mensagens da conversa: ${error.message}`)
}

async function buscarOrganizacaoUnica() {
  const { data, error } = await operacional.from('organizacoes').select('id').limit(1).single()
  if (error || !data) throw new Error('Organização LifitSeg não encontrada.')
  return data.id
}
