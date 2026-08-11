import { operacional } from '../supabaseSchemas'
import { criarApolice, atualizarApolice, excluirApolice } from './apolicesService'
import { atualizarClienteProspect, atualizarStatusClienteProspect } from './clientesService'

/**
 * Catálogo dos produtos do Lifplan (Planejamento Patrimonial).
 * Bem menos numeroso que o LifSure (5 produtos, não 21) porque cada um
 * tem uma lógica bem diferente entre si — não faz sentido agrupar em
 * categorias, é uma lista simples.
 */
export const PRODUTOS_LIFPLAN = ['Consórcio', 'Financiamento', 'Empréstimo', 'Investimento', 'Previdência']

/**
 * Cria um Contrato do Lifplan já vinculado ao cliente. Reaproveita a
 * mesma tabela "apolices" do Lifleet/LifSure — aqui a interface chama
 * de "Contrato", que é o termo certo pra consórcio/financiamento/
 * empréstimo/investimento/previdência (não existe "apólice" nesse
 * sentido de seguro).
 */
/**
 * BUG CORRIGIDO (11/08, mesmo achado já corrigido no Lifleet):
 * `apolices.nome_cliente` é NOT NULL no banco, mas nunca era
 * preenchido aqui — buscamos o nome do cliente antes de criar.
 */
export async function criarContratoLifplan({ corretorId, organizacaoId, clienteProspectId, dados }) {
  const { data: cliente, error: erroCliente } = await operacional
    .from('clientes_prospects')
    .select('razao_social')
    .eq('id', clienteProspectId)
    .single()
  if (erroCliente) throw new Error(`Erro ao buscar dados do cliente: ${erroCliente.message}`)

  const contrato = await criarApolice({
    corretorId,
    organizacaoId,
    dados: { ...dados, cliente_prospect_id: clienteProspectId, nome_cliente: cliente.razao_social },
  })

  // Contrato fechado = prospect virou cliente de verdade, mesma regra dos outros módulos
  await atualizarStatusClienteProspect(clienteProspectId, 'cliente')
  if (dados.vigencia_fim) {
    await atualizarClienteProspect(clienteProspectId, { data_vigencia: dados.vigencia_fim })
  }

  return contrato
}

/** Atualiza um Contrato existente do Lifplan */
export async function atualizarContratoLifplan({ contratoId, clienteProspectId, dados }) {
  await atualizarApolice(contratoId, dados)
  if (dados.vigencia_fim && clienteProspectId) {
    await atualizarClienteProspect(clienteProspectId, { data_vigencia: dados.vigencia_fim })
  }
  return { id: contratoId, ...dados }
}

/** Exclui um Contrato do Lifplan */
export async function excluirContratoLifplan(contratoId) {
  await excluirApolice(contratoId)
}

/** Lista os Contratos de um cliente do Lifplan */
export async function listarContratosLifplanDoCliente(clienteProspectId) {
  const { data, error } = await operacional
    .from('apolices')
    .select('*')
    .eq('cliente_prospect_id', clienteProspectId)
    .order('criado_em', { ascending: false })
  if (error) throw new Error(`Erro ao listar contratos do cliente: ${error.message}`)
  return data ?? []
}
