// _shared/connect/resilience/retryMetrics.ts
//
// CONNECT-004E — Retry Metrics.
// CONNECT-004F — estendido com ultimoErroMensagem/ultimaExecucaoEm/
// tempoMedioMs, necessários pro Health Dashboard ("Último teste,
// Último erro, Tempo médio" do documento original). Mesma limitação
// de memória do circuitBreaker.ts (reseta em cold start, não
// compartilhado entre instâncias) — registrada, não escondida.

export type MetricasDriver = {
  chamadas: number
  sucessos: number
  erros: number
  retries: number
  timeouts: number
  circuitoAberto: number
  ultimoErroMensagem: string | null
  ultimaExecucaoEm: string | null // ISO
  tempoMedioMs: number | null // média das durações registradas em sucesso/erro
}

type EstadoInterno = MetricasDriver & {
  somaDuracaoMs: number
  amostrasDuracao: number
}

function estadoVazio(): EstadoInterno {
  return {
    chamadas: 0,
    sucessos: 0,
    erros: 0,
    retries: 0,
    timeouts: 0,
    circuitoAberto: 0,
    ultimoErroMensagem: null,
    ultimaExecucaoEm: null,
    tempoMedioMs: null,
    somaDuracaoMs: 0,
    amostrasDuracao: 0,
  }
}

const METRICAS = new Map<string, EstadoInterno>()

function obterOuCriar(driverNome: string): EstadoInterno {
  let estado = METRICAS.get(driverNome)
  if (!estado) {
    estado = estadoVazio()
    METRICAS.set(driverNome, estado)
  }
  return estado
}

export function registrarChamada(driverNome: string): void {
  obterOuCriar(driverNome).chamadas += 1
}

export function registrarSucesso(driverNome: string, duracaoMs?: number): void {
  const estado = obterOuCriar(driverNome)
  estado.sucessos += 1
  estado.ultimaExecucaoEm = new Date().toISOString()
  if (typeof duracaoMs === 'number') {
    estado.somaDuracaoMs += duracaoMs
    estado.amostrasDuracao += 1
  }
}

export function registrarErro(driverNome: string, mensagem?: string, duracaoMs?: number): void {
  const estado = obterOuCriar(driverNome)
  estado.erros += 1
  estado.ultimaExecucaoEm = new Date().toISOString()
  if (mensagem) estado.ultimoErroMensagem = mensagem
  if (typeof duracaoMs === 'number') {
    estado.somaDuracaoMs += duracaoMs
    estado.amostrasDuracao += 1
  }
}

export function registrarRetry(driverNome: string): void {
  obterOuCriar(driverNome).retries += 1
}

export function registrarTimeout(driverNome: string): void {
  obterOuCriar(driverNome).timeouts += 1
}

export function registrarCircuitoAberto(driverNome: string): void {
  obterOuCriar(driverNome).circuitoAberto += 1
}

export function obterMetricas(driverNome: string): MetricasDriver {
  const estado = obterOuCriar(driverNome)
  return {
    chamadas: estado.chamadas,
    sucessos: estado.sucessos,
    erros: estado.erros,
    retries: estado.retries,
    timeouts: estado.timeouts,
    circuitoAberto: estado.circuitoAberto,
    ultimoErroMensagem: estado.ultimoErroMensagem,
    ultimaExecucaoEm: estado.ultimaExecucaoEm,
    tempoMedioMs: estado.amostrasDuracao > 0 ? Math.round(estado.somaDuracaoMs / estado.amostrasDuracao) : null,
  }
}

export function obterTodasMetricas(): Record<string, MetricasDriver> {
  const saida: Record<string, MetricasDriver> = {}
  for (const nome of METRICAS.keys()) {
    saida[nome] = obterMetricas(nome)
  }
  return saida
}
