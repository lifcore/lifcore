import { operacional } from '../supabaseSchemas'
import { criarApolice, atualizarApolice, excluirApolice } from './apolicesService'
import { atualizarClienteProspect, atualizarStatusClienteProspect } from './clientesService'

/**
 * Catálogo dos 21 produtos do Lifsure (Seguros Gerais), agrupado por
 * categoria — usado no dropdown de "Produto" da Apólice. A maioria
 * tem baixo volume de vendas, então não tem formulário próprio: os
 * detalhes específicos de cada um vão no campo livre "Detalhes do
 * Produto" (sem precisar de coluna fixa por produto).
 */
export const CATEGORIAS_LIFSURE = [
  {
    categoria: 'Vida e Pessoas',
    produtos: [
      'Seguro de Vida Individual',
      'Seguro de Vida Empresarial (Global)',
      'Acidentes Pessoais (AP)',
      'Prestamista',
      'Seguro Viagem',
      'Doenças Graves',
      'Diária por Incapacidade Temporária (DIT)',
      'Diária por Internação Hospitalar (DIH)',
      'Assistência Funeral',
      'Renda por Incapacidade',
    ],
  },
  {
    categoria: 'Patrimonial',
    produtos: ['Seguro Residencial', 'Seguro Condomínio', 'Seguro Empresarial Tradicional'],
  },
  {
    categoria: 'Afinidade e Equipamentos',
    produtos: [
      'Seguro Celular',
      'Seguro Notebook',
      'Seguro Tablet',
      'Seguro Smartwatch',
      'Seguro Câmeras Fotográficas',
      'Seguro Equipamentos Portáteis',
      'Seguro Bike',
      'Seguro Pet',
    ],
  },
]

/**
 * BUG CORRIGIDO (11/08, mesmo achado já corrigido no Lifleet):
 * `apolices.nome_cliente` é NOT NULL no banco, mas nunca era
 * preenchido aqui — buscamos o nome do cliente antes de criar.
 */
export async function criarApoliceLifsure({ corretorId, organizacaoId, clienteProspectId, dados }) {
  const { data: cliente, error: erroCliente } = await operacional
    .from('clientes_prospects')
    .select('razao_social')
    .eq('id', clienteProspectId)
    .single()
  if (erroCliente) throw new Error(`Erro ao buscar dados do cliente: ${erroCliente.message}`)

  const apolice = await criarApolice({
    corretorId,
    organizacaoId,
    dados: { ...dados, cliente_prospect_id: clienteProspectId, nome_cliente: cliente.razao_social },
  })

  // Apólice fechada = prospect virou cliente de verdade, mesma regra do Lifcare/Lifleet
  await atualizarStatusClienteProspect(clienteProspectId, 'cliente')
  if (dados.vigencia_fim) {
    await atualizarClienteProspect(clienteProspectId, { data_vigencia: dados.vigencia_fim })
  }

  return apolice
}

/** Atualiza uma apólice existente do Lifsure */
export async function atualizarApoliceLifsure({ apoliceId, clienteProspectId, dados }) {
  await atualizarApolice(apoliceId, dados)
  if (dados.vigencia_fim && clienteProspectId) {
    await atualizarClienteProspect(clienteProspectId, { data_vigencia: dados.vigencia_fim })
  }
  return { id: apoliceId, ...dados }
}

/** Exclui uma apólice do Lifsure */
export async function excluirApoliceLifsure(apoliceId) {
  await excluirApolice(apoliceId)
}

/** Lista as apólices de um cliente do Lifsure (sem veículos — não existe esse conceito aqui) */
export async function listarApolicesLifsureDoCliente(clienteProspectId) {
  const { data, error } = await operacional
    .from('apolices')
    .select('*')
    .eq('cliente_prospect_id', clienteProspectId)
    .order('criado_em', { ascending: false })
  if (error) throw new Error(`Erro ao listar apólices do cliente: ${error.message}`)
  return data ?? []
}
