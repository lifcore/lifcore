import { operacional } from '../supabaseSchemas'
import { supabase } from '../supabaseClient'
import { gerarRespostaEspecialista } from './especialistaMotor'
import { recalcularProximaAcaoCliente } from '../crm/clientesService'

/**
 * Especialista de Saúde — Demanda (ENG-003, v2).
 *
 * Fluxo simplificado: recebe a mensagem, monta o contexto (histórico,
 * porte do cliente), chama o motor de raciocínio único, registra tudo.
 * Não existe mais "escolher 1 Playbook fixo" nem checklist obrigatório
 * bloqueando a resposta — a IA decide por julgamento o que perguntar.
 */
export async function atenderDemanda({ demandaTexto, usuarioId, organizacaoId, clienteProspectId, imagens = [], casoIdContinuacao = null }) {
  if (!demandaTexto?.trim()) {
    throw new Error('A demanda não pode ser vazia.')
  }

  const organizacaoIdFinal = organizacaoId ?? (await buscarOrganizacaoUnica())

  const casoExistente = casoIdContinuacao ? await buscarCasoParaContinuacao(casoIdContinuacao) : null

  let caso
  if (casoExistente) {
    caso = casoExistente
  } else {
    const codigoCaso = await gerarCodigoDemanda()
    const { data: novoCaso, error: erroCaso } = await operacional
      .from('casos')
      .insert({
        codigo: codigoCaso,
        organizacao_id: organizacaoIdFinal,
        cliente_prospect_id: clienteProspectId ?? null,
        situacao: 'em_andamento',
        especialista_responsavel: usuarioId,
        demanda_original: demandaTexto,
      })
      .select()
      .single()

    if (erroCaso) throw new Error(`Erro ao registrar o caso: ${erroCaso.message}`)
    caso = novoCaso
  }

  await registrarEvento(caso.id, 'mensagem_corretor', demandaTexto, usuarioId)

  if (imagens.length > 0) {
    await registrarEvento(
      caso.id,
      'anexo',
      `${imagens.length} arquivo(s) anexado(s): ${imagens.map((i) => i.nome).join(', ')}`,
      usuarioId,
      imagens[0]?.url
    )
  }

  const porteCliente = clienteProspectId ? await buscarPorteCliente(clienteProspectId) : null

  const resultado = await gerarRespostaEspecialista({
    demandaTexto,
    historicoContexto: casoExistente?.resumoEventos ?? '',
    porteCliente,
    imagens: imagens.map((img) => ({ base64: img.base64, mediaType: img.mediaType })),
  })

  await operacional
    .from('casos')
    .update({
      categoria: resultado.categoria,
      subcategoria: resultado.subcategoria,
      situacao: resultado.precisaMaisInformacao ? (caso.situacao ?? 'em_andamento') : 'aguardando_operadora',
    })
    .eq('id', caso.id)

  await registrarEvento(caso.id, 'mensagem_especialista', resultado.respostaTexto, usuarioId)

  return {
    caso,
    precisaMaisInformacao: resultado.precisaMaisInformacao,
    perguntasParaConsultor: resultado.precisaMaisInformacao ? [resultado.respostaTexto] : undefined,
    resposta: { textoCompleto: resultado.respostaTexto },
    regulamentacaoAplicavel: resultado.regulamentacaoAplicavel,
    casosRelacionados: resultado.casosRelacionados,
  }
}

/** Marca a demanda/caso como encerrada (botão "Encerrar conversa" no chat) */
export async function encerrarConversa(casoId) {
  const { data: caso, error } = await operacional
    .from('casos')
    .update({ situacao: 'encerrado' })
    .eq('id', casoId)
    .select('cliente_prospect_id')
    .single()
  if (error) throw new Error(`Erro ao encerrar conversa: ${error.message}`)

  if (caso?.cliente_prospect_id) {
    await recalcularProximaAcaoCliente(caso.cliente_prospect_id)
  }
}

/**
 * Reconstrói o histórico de um caso como uma lista de mensagens de chat
 * (para exibir a conversa inteira ao reabrir/continuar um caso).
 */
export async function buscarHistoricoChat(casoId) {
  const { data: caso } = await operacional
    .from('casos')
    .select('demanda_original, criado_em')
    .eq('id', casoId)
    .maybeSingle()

  const { data: eventos, error } = await operacional
    .from('eventos')
    .select('tipo, descricao, criado_em, anexo_url, usuario_responsavel')
    .eq('caso_id', casoId)
    .order('criado_em', { ascending: true })

  if (error) throw new Error(`Erro ao buscar histórico: ${error.message}`)

  const idsUsuarios = [...new Set((eventos ?? []).map((e) => e.usuario_responsavel).filter(Boolean))]
  let nomesPorId = {}
  if (idsUsuarios.length > 0) {
    const { data: perfisEnvolvidos } = await supabase
      .from('perfis')
      .select('id, nome_completo')
      .in('id', idsUsuarios)
    nomesPorId = Object.fromEntries((perfisEnvolvidos ?? []).map((p) => [p.id, p.nome_completo]))
  }

  const mensagens = (eventos ?? [])
    .filter((e) => e.tipo === 'mensagem_corretor' || e.tipo === 'mensagem_especialista' || e.tipo === 'anexo' || e.tipo === 'atualizacao_manual')
    .map((e) => {
      let texto = e.descricao
      if (e.tipo === 'atualizacao_manual') {
        const nomeAutor = nomesPorId[e.usuario_responsavel] ?? 'Corretor'
        const dataFormatada = new Date(e.criado_em).toLocaleString('pt-BR', {
          day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
        })
        texto = `${nomeAutor} atualizou em ${dataFormatada}: "${e.descricao}"`
      }
      return {
        autor: e.tipo === 'mensagem_corretor' ? 'corretor' : e.tipo === 'anexo' || e.tipo === 'atualizacao_manual' ? 'sistema' : 'especialista',
        texto,
        anexoUrl: e.anexo_url,
        criadoEm: e.criado_em,
      }
    })

  const primeiraMensagemJaRegistrada = mensagens.some(
    (m) => m.autor === 'corretor' && m.texto === caso?.demanda_original
  )
  if (caso?.demanda_original && !primeiraMensagemJaRegistrada) {
    mensagens.unshift({ autor: 'corretor', texto: caso.demanda_original, criadoEm: caso.criado_em })
  }

  return mensagens
}

/** Registra um evento na linha do tempo do caso (rastreabilidade completa) */
async function registrarEvento(casoId, tipo, descricao, usuarioId, anexoUrl) {
  const { error } = await operacional.from('eventos').insert({
    caso_id: casoId,
    tipo,
    descricao,
    usuario_responsavel: usuarioId,
    anexo_url: anexoUrl ?? null,
  })
  if (error) console.error('Erro ao registrar evento (não bloqueante):', error.message)
}

/** Busca um caso existente (para continuação) com um resumo compacto do histórico recente */
async function buscarCasoParaContinuacao(casoId) {
  const { data: caso, error } = await operacional
    .from('casos')
    .select('*')
    .eq('id', casoId)
    .maybeSingle()
  if (error || !caso) return null

  const { data: eventos } = await operacional
    .from('eventos')
    .select('tipo, descricao, criado_em')
    .eq('caso_id', casoId)
    .order('criado_em', { ascending: true })
    .limit(20)

  const resumoEventos = (eventos ?? [])
    .filter((e) => e.tipo === 'mensagem_corretor' || e.tipo === 'mensagem_especialista' || e.tipo === 'atualizacao_manual')
    .map((e) => `[${e.tipo === 'mensagem_corretor' ? 'Consultor' : e.tipo === 'atualizacao_manual' ? 'Atualização' : 'Especialista'}]: ${e.descricao}`)
    .join('\n\n')

  return { ...caso, resumoEventos: resumoEventos ? `Histórico da conversa até agora:\n${resumoEventos}` : '' }
}

/** Busca o porte (PME1/PME2/Negociado) já calculado no cadastro do cliente vinculado */
async function buscarPorteCliente(clienteProspectId) {
  const { data } = await operacional
    .from('clientes_prospects')
    .select('porte')
    .eq('id', clienteProspectId)
    .maybeSingle()
  return data?.porte ?? null
}

/** Fase 1: busca a única organização cadastrada (a própria LifitSeg) */
async function buscarOrganizacaoUnica() {
  const { data, error } = await operacional
    .from('organizacoes')
    .select('id')
    .limit(1)
    .single()

  if (error || !data) {
    throw new Error(
      'Não foi possível encontrar a organização LifitSeg cadastrada. Verifique se a migração 003 rodou corretamente (ela cria esse registro automaticamente).'
    )
  }
  return data.id
}

/** Gera o próximo código sequencial de demanda (DM-SAU-0001, 0002...) via função no banco */
async function gerarCodigoDemanda() {
  const { data, error } = await operacional.rpc('gerar_codigo_demanda_saude')
  if (error) {
    console.warn('Falha ao gerar código sequencial, usando fallback aleatório:', error.message)
    return `DM-SAU-${Math.floor(1000 + Math.random() * 9000)}`
  }
  return data
}
