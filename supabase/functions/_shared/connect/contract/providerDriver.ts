// _shared/connect/contract/providerDriver.ts
//
// CONNECT-004D — Provider Gateway & Test Framework, Bloco 03 (Driver Contract).
//
// Interface única. Nenhum Driver pode ter método fora daqui (regra
// explícita do documento REV.001). O Gateway só conhece este
// contrato — nunca SOAP, REST, XML, nem nenhum detalhe de Provider.

export type StatusSaudeDriver = 'ok' | 'indisponivel' | 'nao_verificado'

export type ResultadoValidacao = {
  valido: boolean
  erros: string[]
}

export type StatusDriver = 'homologacao' | 'producao' | 'descontinuado'
export type AmbienteDriver = 'sandbox' | 'producao'

export type ProviderDriver<TInput = unknown, TOutput = unknown, TIdentity = unknown> = {
  // --- metadados (Driver Registry, Bloco 02) ---
  nome: string
  provider: string
  capability: string
  contrato: string
  versao: string
  status: StatusDriver
  ambiente: AmbienteDriver

  // --- os 6 métodos do contrato (Bloco 03) ---

  /**
   * Alguns Providers exigem um passo de autenticação separado antes de
   * qualquer chamada; outros (como a Tokio, hoje) enviam identidade em
   * todo request. Quando o Provider não tem esse passo, o Driver ainda
   * implementa o método — só como no-op documentado, nunca omitindo o
   * método (isso quebraria o contrato único).
   */
  authenticate: (identity: TIdentity) => Promise<void>

  /**
   * Verifica se o Provider está respondendo. Quando o Provider não
   * expõe um endpoint de health dedicado, o Driver deve retornar
   * 'nao_verificado' em vez de inventar uma checagem que não existe.
   */
  health: (identity: TIdentity) => Promise<StatusSaudeDriver>

  /** Validação de entrada — roda antes do Gateway chamar execute(). */
  validate: (input: TInput) => ResultadoValidacao

  /** Chamada real ao Provider. É o único método que fala com a rede. */
  execute: (input: TInput, identity: TIdentity) => Promise<TOutput>

  /**
   * Normaliza a saída de execute() pro formato final. Quando o próprio
   * execute() já devolve o modelo normalizado (caso da Tokio hoje, via
   * normalizarResposta() interno), normalize() é identidade — mas
   * continua existindo, pelo mesmo motivo de authenticate().
   */
  normalize: (saida: TOutput) => TOutput

  capabilities: () => string[]
}
