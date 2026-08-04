import { askAI } from '../aiProvider'
import { buscarPreferenciasIa } from './preferenciasIaService'

/**
 * Gateway Oficial dos Especialistas (Sprint Meu Perfil v2 — AI
 * Experience Engine, aprovada pelo Chief Systems Analyst).
 *
 * Fica entre TODO motor de Especialista e o aiProvider — nenhum motor
 * deve chamar askAI diretamente depois desta Sprint. Responsabilidade
 * única: buscar as preferências de IA do usuário e grudar um bloco
 * curto na frente do systemPrompt que o motor já montou. Nunca decide
 * NADA de inteligência/base de conhecimento — isso continua 100% com
 * cada motor.
 *
 * Guardrail do Chief: nenhum Especialista deve ler `preferencias_ia`
 * direto do banco. Sempre por aqui — assim, se a estrutura do JSONB
 * mudar no futuro, só este arquivo precisa saber.
 *
 * Se a busca de preferências falhar por qualquer motivo (usuário sem
 * perfil, erro de rede), o Especialista NUNCA trava — segue sem
 * personalização, com o comportamento padrão de sempre.
 */

const ROTULOS_ESTILO = { executivo: 'Executivo', equilibrado: 'Equilibrado', consultivo: 'Consultivo', didatico: 'Didático' }
const ROTULOS_PROFUNDIDADE = { rapida: 'Resposta rápida', completa: 'Completa', estrategica: 'Análise estratégica' }
const ROTULOS_FORMATO = {
  texto_corrido: 'Texto corrido',
  topicos: 'Tópicos',
  checklist: 'Checklist',
  plano_acao: 'Plano de ação',
  comparativo: 'Comparativo (quando aplicável)',
}
const ROTULOS_TOM = { corporativo: 'Corporativo', tecnico: 'Técnico', consultivo: 'Consultivo', amigavel: 'Amigável' }
const ROTULOS_INICIATIVA = { passiva: 'Passiva', assistiva: 'Assistiva', proativa: 'Proativa' }

function montarBlocoPreferencias(prefs) {
  return `=== Preferências do Usuário ===
Estilo: ${ROTULOS_ESTILO[prefs.estilo] ?? prefs.estilo}
Formato: ${ROTULOS_FORMATO[prefs.formato] ?? prefs.formato}
Profundidade: ${ROTULOS_PROFUNDIDADE[prefs.profundidade] ?? prefs.profundidade}
Tom: ${ROTULOS_TOM[prefs.tom] ?? prefs.tom}
Iniciativa: ${ROTULOS_INICIATIVA[prefs.iniciativa] ?? prefs.iniciativa}
================================`
}

/**
 * Função pública única que todo motor de Especialista deve usar,
 * no lugar de askAI. Mesma assinatura de askAI + `usuarioId`.
 */
export async function askSpecialist({ usuarioId, systemPrompt, messages, maxTokens, images }) {
  let blocoPreferencias = ''

  if (usuarioId) {
    try {
      const prefs = await buscarPreferenciasIa(usuarioId)
      blocoPreferencias = `${montarBlocoPreferencias(prefs)}\n\n`
    } catch {
      blocoPreferencias = ''
    }
  }

  return askAI({
    systemPrompt: `${blocoPreferencias}${systemPrompt}`,
    messages,
    maxTokens,
    images,
  })
}