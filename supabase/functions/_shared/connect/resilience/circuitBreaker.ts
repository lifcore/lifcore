// _shared/connect/resilience/circuitBreaker.ts
//
// CONNECT-004E — Circuit Breaker (Bloco 06). Estados: Closed, Open,
// Half Open — rastreado por Driver (não por Provider), mesmo
// princípio de "um Driver por Capability" já usado no resto do
// Connect Center.
//
// LIMITAÇÃO CONHECIDA, documentada em vez de escondida: este estado
// vive em memória (Map a nível de módulo). Edge Functions Deno podem
// reaproveitar a mesma isolate entre invocações próximas (warm start),
// mas isso não é garantido, e não há estado compartilhado entre
// isolates concorrentes. Funciona dentro de uma instância viva; reseta
// em cold start e não é consistente entre instâncias simultâneas. Um
// Circuit Breaker realmente confiável em ambiente serverless exigiria
// um backing store compartilhado (tabela, Redis) — fora do escopo
// desta Sprint.

export type EstadoCircuito = 'closed' | 'open' | 'half_open'

export type ConfigCircuitBreaker = {
  limiteFalhasConsecutivas: number
  tempoAberturaMs: number // quanto tempo fica Open antes de virar Half Open
}

const CONFIG_PADRAO: ConfigCircuitBreaker = {
  limiteFalhasConsecutivas: 5,
  tempoAberturaMs: 30000,
}

type EstadoInterno = {
  estado: EstadoCircuito
  falhasConsecutivas: number
  abertoDesde: number | null
}

const ESTADOS = new Map<string, EstadoInterno>()

function obterOuCriarEstado(driverNome: string): EstadoInterno {
  let estado = ESTADOS.get(driverNome)
  if (!estado) {
    estado = { estado: 'closed', falhasConsecutivas: 0, abertoDesde: null }
    ESTADOS.set(driverNome, estado)
  }
  return estado
}

/** Chamado pelo Gateway ANTES de tentar o Driver. */
export function podeExecutar(driverNome: string, config: ConfigCircuitBreaker = CONFIG_PADRAO): boolean {
  const estado = obterOuCriarEstado(driverNome)

  if (estado.estado === 'closed') return true

  if (estado.estado === 'open') {
    const tempoAberto = Date.now() - (estado.abertoDesde ?? 0)
    if (tempoAberto >= config.tempoAberturaMs) {
      estado.estado = 'half_open'
      return true // permite UMA chamada de teste
    }
    return false
  }

  // half_open: chamada de teste em andamento — deixa passar
  return true
}

export function registrarSucesso(driverNome: string): void {
  const estado = obterOuCriarEstado(driverNome)
  estado.estado = 'closed'
  estado.falhasConsecutivas = 0
  estado.abertoDesde = null
}

export function registrarFalha(driverNome: string, config: ConfigCircuitBreaker = CONFIG_PADRAO): void {
  const estado = obterOuCriarEstado(driverNome)

  if (estado.estado === 'half_open') {
    // teste de recuperação falhou — volta pra Open e reinicia o relógio
    estado.estado = 'open'
    estado.abertoDesde = Date.now()
    return
  }

  estado.falhasConsecutivas += 1
  if (estado.falhasConsecutivas >= config.limiteFalhasConsecutivas) {
    estado.estado = 'open'
    estado.abertoDesde = Date.now()
  }
}

export function obterEstado(driverNome: string): EstadoCircuito {
  return obterOuCriarEstado(driverNome).estado
}
