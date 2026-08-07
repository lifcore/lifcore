// _shared/connect/models/quote.ts
//
// CONNECT-005 — Modelo interno normalizado.
//
// REV.002, Diretriz 4: "O Smart Quote nunca monta XML SOAP. Nunca.
// Ele trabalha somente com o modelo interno." Este é esse modelo.
// Quando a Porto ou a Bradesco entrarem, o Smart Quote continua
// falando exatamente esta linguagem — quem traduz é o Driver de cada
// Provider.

export type QuoteRequest = {
  segurado: {
    nome: string
    cpfCnpj: string
    telefone?: string
    email?: string
  }
  veiculo: {
    idVeiculo: string // já resolvido via Driver de consulta de veículo, nunca digitado livre
    anoModelo: number
    zeroKm: boolean
    placa?: string
    chassi?: string
  }
  cobertura: {
    codigosCoberturaSelecionados: string[]
    codigoFranquia?: string
    classeBonus?: number
  }
  vigencia: {
    inicio: string // ISO date
    fim: string
  }
  corretorId: string // referência interna LifCore, nunca o código do Provider diretamente
}

export type QuoteResponseModalidade = {
  codigoModalidade: string
  descricao: string
  premioLiquido: number
  custoApolice: number
  coberturas: Array<{
    codigo: string
    descricao: string
    valorCobertura: number
    premioCobertura: number
  }>
}

export type QuoteResponse =
  | {
      sucesso: true
      numeroCalculo: string
      modalidades: QuoteResponseModalidade[]
      dataVersao: string
    }
  | {
      sucesso: false
      erros: string[]
    }

export type VeiculoConsultado = {
  idVeiculo: string
  descricaoFabricante: string
  descricaoModelo: string
  codigoFipe?: string
  tipoCombustivel?: string
}
