import { operacional } from '../supabaseSchemas'
import { criarApolice, atualizarApolice, excluirApolice } from './apolicesService'
import { atualizarClienteProspect, atualizarStatusClienteProspect } from './clientesService'
import { criarComissaoSugerida } from './comissoesService'

/**
 * Valida a regra de negócio combinada com o Raphael:
 * - Cliente Pessoa Física (cpf): cada apólice tem exatamente 1 veículo.
 * - Cliente Pessoa Jurídica (cnpj): a apólice pode ter 1 ou vários
 *   veículos (frota = mais de 1 veículo na mesma apólice).
 * O banco também reforça isso via trigger (segunda camada de proteção).
 */
export function validarQuantidadeVeiculos(tipoPessoa, veiculos) {
  if (tipoPessoa === 'fisica' && veiculos.length > 1) {
    throw new Error('Cliente Pessoa Física só pode ter 1 veículo por apólice. Cadastre uma apólice separada para cada veículo.')
  }
  if (veiculos.length === 0) {
    throw new Error('Informe ao menos 1 veículo para esta apólice.')
  }
}

/**
 * Cria uma apólice de Auto/Frota já vinculada ao cliente, com os veículos dela.
 *
 * `origemVenda` (Sprint: Automação Interna Apólice → Comissão v1):
 * indica se este lançamento é 'venda_nova', 'renovacao', 'endosso' ou
 * 'migracao'. Só quando for 'venda_nova' o sistema gera uma SUGESTÃO de
 * comissão no Finance Center (nunca um lançamento automático definitivo,
 * e nunca calcula o valor sozinho — só sinaliza que existe algo a
 * confirmar). Se o parâmetro não for informado, o comportamento de hoje
 * é preservado: nenhuma sugestão é criada, e o registro fica salvo com
 * origem 'migracao' por padrão.
 */
export async function criarApoliceAuto({ corretorId, organizacaoId, clienteProspectId, tipoPessoa, dados, veiculos, origemVenda }) {
  validarQuantidadeVeiculos(tipoPessoa, veiculos)

  // BUG CORRIGIDO: `apolices.nome_cliente` é NOT NULL no banco, mas
  // nunca era preenchido — buscamos o nome do cliente antes de criar.
  const { data: cliente, error: erroCliente } = await operacional
    .from('clientes_prospects')
    .select('razao_social')
    .eq('id', clienteProspectId)
    .single()
  if (erroCliente) throw new Error(`Erro ao buscar dados do cliente: ${erroCliente.message}`)

  const apolice = await criarApolice({
    corretorId,
    organizacaoId,
    dados: {
      ...dados,
      cliente_prospect_id: clienteProspectId,
      nome_cliente: cliente.razao_social,
      origem_venda: origemVenda || 'migracao',
    },
  })

  const veiculosComApoliceId = veiculos.map((v) => ({ ...v, apolice_id: apolice.id }))
  const { error: erroVeiculos } = await operacional.from('veiculos').insert(veiculosComApoliceId)
  if (erroVeiculos) throw new Error(`Erro ao salvar veículos da apólice: ${erroVeiculos.message}`)

  // Uma apólice fechada significa que o prospect virou cliente de
  // verdade — move automaticamente para "Cliente Ativo", igual ao
  // Contrato faz no Lifcare.
  await atualizarStatusClienteProspect(clienteProspectId, 'cliente')
  if (dados.vigencia_fim) {
    await atualizarClienteProspect(clienteProspectId, { data_vigencia: dados.vigencia_fim })
  }

  // NOVO (Sprint Apólice → Comissão v1): só gera sugestão de comissão
  // quando a origem for explicitamente "venda_nova" — renovação, endosso
  // e migração de dado legado não disparam nada aqui.
  if (origemVenda === 'venda_nova') {
    await criarComissaoSugerida({
      organizacaoId,
      operadoraId: dados.operadora_id || null,
      apoliceId: apolice.id,
      corretorId,
      modulo: 'lifleet',
      valorPremio: dados.premio || null,
    })
  }

  return apolice
}

/** Atualiza uma apólice existente e re-sincroniza a lista de veículos dela */
export async function atualizarApoliceAuto({ apoliceId, clienteProspectId, tipoPessoa, dados, veiculos }) {
  validarQuantidadeVeiculos(tipoPessoa, veiculos)

  await atualizarApolice(apoliceId, dados)

  await operacional.from('veiculos').delete().eq('apolice_id', apoliceId)
  const veiculosComApoliceId = veiculos.map((v) => ({ ...v, apolice_id: apoliceId }))
  const { error: erroVeiculos } = await operacional.from('veiculos').insert(veiculosComApoliceId)
  if (erroVeiculos) throw new Error(`Erro ao salvar veículos da apólice: ${erroVeiculos.message}`)

  if (dados.vigencia_fim && clienteProspectId) {
    await atualizarClienteProspect(clienteProspectId, { data_vigencia: dados.vigencia_fim })
  }

  return { id: apoliceId, ...dados }
}

/** Exclui uma apólice (os veículos dela saem juntos, via cascade no banco) */
export async function excluirApoliceAuto(apoliceId) {
  await excluirApolice(apoliceId)
}

/** Lista as apólices de um cliente do Lifleet, já com os veículos de cada uma */
export async function listarApolicesDoCliente(clienteProspectId) {
  const { data, error } = await operacional
    .from('apolices')
    .select('*, veiculos(*)')
    .eq('cliente_prospect_id', clienteProspectId)
    .order('criado_em', { ascending: false })
  if (error) throw new Error(`Erro ao listar apólices do cliente: ${error.message}`)
  return data ?? []
}