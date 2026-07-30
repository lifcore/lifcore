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
    categoria: 'Vida',
    produtos: ['Seguro de Vida Individual', 'Seguro de Vida Empresarial (Global)'],
  },
  {
    categoria: 'Patrimonial',
    produtos: ['Seguro Empresarial'],
  },
  {
    categoria: 'Transportes',
    produtos: [
      'Seguro Transporte Nacional',
      'RCTR-C',
      'RC-DC',
      'RC-V',
      'Seguro de Transporte Internacional',
      'Programa de Gerenciamento de Riscos (PGR)',
      'Averbação Eletrônica',
      'Dispensa do Direito de Regresso (DDR)',
      'Gerenciamento de Riscos em Transportes',
    ],
  },
  {
    categoria: 'Responsabilidade Civil',
    produtos: ['RC Geral', 'RC Profissional', 'RC Operações', 'RC Produtos'],
  },
  {
    categoria: 'Outros Ramos',
    produtos: ['Seguro Prestamista', 'Seguro Garantia', 'Seguro Fiança', 'Seguro Celular', 'Acidentes Pessoais'],
  },
]

/** Cria uma apólice do Lifsure já vinculada ao cliente */
export async function criarApoliceLifsure({ corretorId, organizacaoId, clienteProspectId, dados }) {
  const apolice = await criarApolice({
    corretorId,
    organizacaoId,
    dados: { ...dados, cliente_prospect_id: clienteProspectId },
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
