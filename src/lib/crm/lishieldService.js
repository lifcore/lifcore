import { operacional } from '../supabaseSchemas'
import { criarApolice, atualizarApolice, excluirApolice } from './apolicesService'
import { atualizarClienteProspect, atualizarStatusClienteProspect } from './clientesService'

/**
 * Catálogo das famílias de produto do LiShield (Seguros Técnicos e
 * Linhas Corporativas Especializadas), conforme o Catálogo Corporativo
 * de Produtos de Seguros (SEG-029) — compartilhado com o LifSure.
 */
export const CATEGORIAS_LISHIELD = [
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
    categoria: 'Garantia',
    produtos: ['Seguro Garantia', 'Garantia Judicial', 'Garantia Aduaneira', 'Garantia Licitante', 'Garantia Executante', 'Garantia Performance', 'Garantia Retenção de Pagamento', 'Garantia Concessões', 'Garantia Administrativa'],
  },
  {
    categoria: 'Crédito e Fiança',
    produtos: ['Seguro Fiança', 'Fiança Locatícia', 'Fiança Contratual', 'Crédito Interno', 'Crédito à Exportação', 'Crédito Comercial'],
  },
  {
    categoria: 'Linhas Financeiras',
    produtos: ['Seguro D&O (Directors & Officers)', 'Seguro E&O (Errors & Omissions)', 'Crime Insurance', 'EPL (Employment Practices Liability)'],
  },
  {
    categoria: 'Seguros de Engenharia',
    produtos: ['Seguro de Engenharia', 'Riscos de Engenharia', 'Obras Civis em Construção (OCC)', 'Obras Civis em Instalação e Montagem (EAR)', 'Quebra de Máquinas', 'Equipamentos Eletrônicos', 'Equipamentos Estacionários', 'Equipamentos Industriais'],
  },
  {
    categoria: 'Seguro Cyber',
    produtos: ['Seguro Cyber'],
  },
]

/**
 * BUG CORRIGIDO (11/08, mesmo achado já corrigido no Lifleet):
 * `apolices.nome_cliente` é NOT NULL no banco, mas nunca era
 * preenchido aqui — buscamos o nome do cliente antes de criar.
 */
export async function criarApoliceLishield({ corretorId, organizacaoId, clienteProspectId, dados }) {
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

  await atualizarStatusClienteProspect(clienteProspectId, 'cliente')
  if (dados.vigencia_fim) {
    await atualizarClienteProspect(clienteProspectId, { data_vigencia: dados.vigencia_fim })
  }

  return apolice
}

/** Atualiza uma apólice existente do LiShield */
export async function atualizarApoliceLishield({ apoliceId, clienteProspectId, dados }) {
  await atualizarApolice(apoliceId, dados)
  if (dados.vigencia_fim && clienteProspectId) {
    await atualizarClienteProspect(clienteProspectId, { data_vigencia: dados.vigencia_fim })
  }
  return { id: apoliceId, ...dados }
}

/** Exclui uma apólice do LiShield */
export async function excluirApoliceLishield(apoliceId) {
  await excluirApolice(apoliceId)
}

/** Lista as apólices de um cliente do LiShield */
export async function listarApolicesLishieldDoCliente(clienteProspectId) {
  const { data, error } = await operacional
    .from('apolices')
    .select('*')
    .eq('cliente_prospect_id', clienteProspectId)
    .order('criado_em', { ascending: false })
  if (error) throw new Error(`Erro ao listar apólices do cliente: ${error.message}`)
  return data ?? []
}
