// _shared/connect/testHarness/contractTests.ts
//
// CONNECT-004F — Test Harness, parte estrutural (Bloco 07: testes de
// "Contrato" e "Autenticação/Health"). Roda contra QUALQUER Driver
// registrado, inclusive os da Tokio — não faz chamada de rede, só
// verifica forma (todo método existe, capabilities() é consistente,
// authenticate()/health() não explodem).
//
// Os testes que dependem de simular falha de rede real (Timeout,
// XML Inválido, Erro SOAP, Erro REST) ficam em mockScenarioTests.ts,
// porque só o Mock Provider consegue simular isso sem depender da
// Tokio estar liberada.

import type { ProviderDriver } from '../contract/providerDriver.ts'

export type ResultadoTeste = {
  nome: string
  passou: boolean
  mensagem?: string
}

const METODOS_OBRIGATORIOS = ['authenticate', 'health', 'validate', 'execute', 'normalize', 'capabilities'] as const

export function testarContrato(driver: ProviderDriver<any, any, any>): ResultadoTeste[] {
  const resultados: ResultadoTeste[] = []

  const metadadosOk = Boolean(
    driver.nome && driver.provider && driver.capability && driver.contrato && driver.versao && driver.status && driver.ambiente
  )
  resultados.push({ nome: 'Metadados obrigatórios presentes', passou: metadadosOk })

  for (const metodo of METODOS_OBRIGATORIOS) {
    resultados.push({
      nome: `Método ${metodo}() implementado`,
      passou: typeof (driver as any)[metodo] === 'function',
    })
  }

  let capabilitiesOk = false
  let mensagemCapabilities: string | undefined
  try {
    const caps = driver.capabilities()
    capabilitiesOk = Array.isArray(caps) && caps.length > 0 && caps.includes(driver.capability)
    if (!capabilitiesOk) mensagemCapabilities = `capabilities() = ${JSON.stringify(caps)}, esperado incluir "${driver.capability}"`
  } catch (erro) {
    mensagemCapabilities = erro instanceof Error ? erro.message : String(erro)
  }
  resultados.push({ nome: 'capabilities() consistente com o campo capability', passou: capabilitiesOk, mensagem: mensagemCapabilities })

  return resultados
}

export async function testarAuthenticate(driver: ProviderDriver<any, any, any>, identity: unknown): Promise<ResultadoTeste> {
  try {
    await driver.authenticate(identity)
    return { nome: 'authenticate() executa sem lançar erro', passou: true }
  } catch (erro) {
    return { nome: 'authenticate() executa sem lançar erro', passou: false, mensagem: erro instanceof Error ? erro.message : String(erro) }
  }
}

export async function testarHealth(driver: ProviderDriver<any, any, any>, identity: unknown): Promise<ResultadoTeste> {
  try {
    const status = await driver.health(identity)
    const valido = status === 'ok' || status === 'indisponivel' || status === 'nao_verificado'
    return { nome: 'health() retorna status válido', passou: valido, mensagem: `status="${status}"` }
  } catch (erro) {
    return { nome: 'health() retorna status válido', passou: false, mensagem: erro instanceof Error ? erro.message : String(erro) }
  }
}
