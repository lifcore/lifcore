import { operacional } from '../supabaseSchemas'

/**
 * Customer Timeline (Sprint 008 — Customer 360 Engine, Bloco A).
 *
 * Camada de APRESENTAÇÃO, nunca um domínio novo (diretriz explícita
 * do Chief). Só consolida leitura de eventos que já existem em
 * domínios separados — nunca mistura as tabelas em si:
 *   - `eventos_comerciais` (Ciclo de Fechamento Comercial)
 *   - `eventos` (Claims — tabela própria, nunca generalizada)
 *   - `clientes_prospects.criado_em` (um ponto só, não é tabela de evento)
 *
 * FORA DO ESCOPO, de propósito (zero inferência):
 * - "Renovação criada": não existe hoje nenhum evento persistido
 *   representando isso. Entra quando o domínio de Renovação existir.
 * - "Primeira comissão": no modelo atual, comissão só nasce de Apólice
 *   (Ciclo de Fechamento) — e Lifcare (piloto desta Sprint) usa
 *   Contratos, não Apólices. Não há dado real pra mostrar aqui ainda.
 *   Ver RFC-001 (Condição Comercial) para o que muda isso no futuro.
 */
export async function obterTimelineCliente({ clienteId, clienteCriadoEm, cotacaoIds = [], casoIds = [] }) {
  const [eventosComerciais, eventosClaims, eventosCliente] = await Promise.all([
    cotacaoIds.length
      ? operacional.from('eventos_comerciais').select('*').eq('entidade_tipo', 'cotacao').in('entidade_id', cotacaoIds)
      : Promise.resolve({ data: [] }),
    casoIds.length
      ? operacional.from('eventos').select('*').in('caso_id', casoIds)
      : Promise.resolve({ data: [] }),
    clienteId
      ? operacional.from('eventos_comerciais').select('*').eq('entidade_tipo', 'cliente').eq('entidade_id', clienteId)
      : Promise.resolve({ data: [] }),
  ])

  const linha = []

  if (clienteCriadoEm) {
    linha.push({ data: clienteCriadoEm, titulo: 'Lead criado', descricao: null, origem: 'cadastro' })
  }

  for (const e of eventosComerciais.data ?? []) {
    linha.push({ data: e.criado_em, titulo: rotularEventoComercial(e.tipo_evento), descricao: e.descricao, origem: 'comercial' })
  }

  for (const e of eventosClaims.data ?? []) {
    linha.push({ data: e.criado_em, titulo: e.tipo ?? 'Atualização de caso', descricao: e.descricao, origem: 'claims' })
  }

  for (const e of eventosCliente.data ?? []) {
    linha.push({ data: e.criado_em, titulo: rotularEventoComercial(e.tipo_evento), descricao: e.descricao, origem: 'cliente' })
  }

  linha.sort((a, b) => new Date(a.data) - new Date(b.data))
  return linha
}

function rotularEventoComercial(tipoEvento) {
  const rotulos = {
    proposta_emitida: 'Proposta emitida',
    recusada: 'Cotação recusada',
    aprovada: 'Proposta aprovada',
    apolice_gerada: 'Apólice gerada',
    transferencia_titularidade: 'Cliente transferido',
  }
  return rotulos[tipoEvento] ?? tipoEvento
}