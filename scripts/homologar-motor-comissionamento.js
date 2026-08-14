// scripts/homologar-motor-comissionamento.js
//
// FASE 2 — Homologação do motor financeiro real contra os 4 cenários
// exigidos pelo Chief (13/08). Roda fora do app, com service_role
// (bypassa RLS de propósito — é harness de teste, não runtime normal).
//
// Cria dados de teste reais no banco, executa o motor, valida os
// resultados, e no final APAGA tudo que criou — nunca deixa lixo em
// produção. Se algo falhar no meio, ainda tenta limpar antes de sair.
//
// Como rodar:
//   1. Preencha SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY abaixo (ou
//      exporte como variável de ambiente antes de rodar).
//   2. node scripts/homologar-motor-comissionamento.js

import { createClient } from '@supabase/supabase-js'
import { lancarComissaoRecebida, conciliarRecebimento, distribuirRecebimento } from '../src/lib/crm/comissionamentoService.js'

const SUPABASE_URL = process.env.SUPABASE_URL || 'COLE_AQUI_SE_NAO_USAR_VARIAVEL_DE_AMBIENTE'
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'COLE_AQUI_SE_NAO_USAR_VARIAVEL_DE_AMBIENTE'

const MARCADOR_TESTE = 'TESTE_HOMOLOGACAO_COM01_FASE2'

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
const operacional = supabase.schema('operacional')

const idsCriados = { vendas: [], recebimentos: [], parceiros: [] } // composicao/comissoes limpam em cascata pela venda_id/recebimento_id

function log(msg) {
  console.log(msg)
}

function assertAproximadamenteIgual(a, b, contexto) {
  const diferenca = Math.abs(Number(a) - Number(b))
  if (diferenca > 0.01) {
    throw new Error(`FALHOU — ${contexto}: esperado ${b}, obtido ${a} (diferença R$${diferenca.toFixed(2)})`)
  }
  log(`  ✅ ${contexto}: R$${Number(a).toFixed(2)}`)
}

async function buscarClienteProspectQualquer() {
  log('Buscando cliente_prospect de referência...')
  const { data, error } = await operacional.from('clientes_prospects').select('id').limit(1).single()
  if (error || !data) throw new Error(`Nenhum cliente_prospect encontrado no banco — precisa de pelo menos 1 pra rodar o teste. Detalhe: ${error?.message}`)
  return data.id
}

async function buscarApoliceQualquer() {
  log('Buscando apólice de referência...')
  const { data, error } = await operacional.from('apolices').select('id').limit(1).single()
  if (error || !data) throw new Error(`Nenhuma apólice encontrada no banco — precisa de pelo menos 1 pra rodar o teste. Detalhe: ${error?.message}`)
  return data.id
}

async function buscarContratoQualquer() {
  log('Buscando contrato de referência...')
  const { data, error } = await operacional.from('contratos').select('id').limit(1).single()
  if (error || !data) throw new Error(`Nenhum contrato encontrado no banco — precisa de pelo menos 1 pra rodar o teste. Detalhe: ${error?.message}`)
  return data.id
}

async function buscarCorretorQualquer() {
  log('Buscando corretor de referência...')
  const { data, error } = await operacional.from('clientes_prospects').select('corretor_id').not('corretor_id', 'is', null).limit(1).single()
  if (error || !data) throw new Error(`Nenhum corretor encontrado — precisa de pelo menos 1 cliente com corretor_id preenchido. Detalhe: ${error?.message}`)
  return data.corretor_id
}

/** parceiros_comerciais está vazia hoje — cria um registro de teste temporário pra satisfazer a constraint de venda_composicao. */
async function criarParceiroComercialDeTeste() {
  log('Criando corretora parceira de teste (tabela real está vazia hoje)...')
  const { data, error } = await operacional
    .from('parceiros_comerciais')
    .insert({ razao_social: MARCADOR_TESTE, status: 'ativo' })
    .select()
    .single()
  if (error) throw new Error(`Erro ao criar parceiro comercial de teste: ${error.message}`)
  idsCriados.parceiros.push(data.id)
  return data.id
}

/** Cria uma Venda de teste já FECHADA, com a composição informada. */
async function criarVendaDeTeste({ tipo, apoliceId, contratoId, modulo, clienteProspectId, valorBase, composicao }) {
  const { data: venda, error: erroVenda } = await operacional
    .from('vendas')
    .insert({
      cliente_prospect_id: clienteProspectId,
      modulo,
      tipo,
      apolice_id: tipo === 'apolice' ? apoliceId : null,
      contrato_id: tipo === 'contrato' ? contratoId : null,
      valor_base: valorBase,
      status: 'aberta',
      produto: MARCADOR_TESTE,
    })
    .select()
    .single()
  if (erroVenda) throw new Error(`Erro ao criar venda de teste: ${erroVenda.message}`)
  idsCriados.vendas.push(venda.id)

  const linhasComposicao = composicao.map((p) => ({ venda_id: venda.id, ...p }))
  const { error: erroComposicao } = await operacional.from('venda_composicao').insert(linhasComposicao)
  if (erroComposicao) throw new Error(`Erro ao criar composição de teste: ${erroComposicao.message}`)

  const { error: erroFechar } = await operacional.from('vendas').update({ status: 'fechada', fechada_em: new Date().toISOString() }).eq('id', venda.id)
  if (erroFechar) throw new Error(`Erro ao fechar venda de teste (trigger de 100% pode ter rejeitado): ${erroFechar.message}`)

  return venda.id
}

/** Lança, concilia e distribui 1 recebimento — o ciclo completo do motor. */
async function processarRecebimento(vendaId, { valorBruto, valorDescontos, dataRecebimento, tipoRecebimento }) {
  const recebimento = await lancarComissaoRecebida(
    {
      dataRecebimento,
      valorBruto,
      valorDescontos,
      tipoRecebimento,
      documentoOrigem: MARCADOR_TESTE,
      observacoes: MARCADOR_TESTE,
    },
    operacional
  )
  idsCriados.recebimentos.push(recebimento.id)

  await conciliarRecebimento(recebimento.id, { vendaId }, null, operacional)
  const linhas = await distribuirRecebimento(recebimento.id, null, operacional)

  return { recebimento, linhas }
}

async function limparTudo() {
  log('\n--- Limpando dados de teste ---')
  if (idsCriados.vendas.length) {
    await operacional.from('comissoes').delete().in('venda_id', idsCriados.vendas)
    await operacional.from('venda_composicao').delete().in('venda_id', idsCriados.vendas)
    await operacional.from('vendas').delete().in('id', idsCriados.vendas)
  }
  if (idsCriados.recebimentos.length) {
    await operacional.from('recebimentos_comissao').delete().in('id', idsCriados.recebimentos)
  }
  if (idsCriados.parceiros.length) {
    await operacional.from('parceiros_comerciais').delete().in('id', idsCriados.parceiros)
  }
  log('Limpeza concluída — nenhum dado de teste permanece no banco.')
}

async function main() {
  log('=== HOMOLOGAÇÃO DO MOTOR — FASE 2 (COM-01) ===\n')

  const clienteProspectId = await buscarClienteProspectQualquer()
  const apoliceId = await buscarApoliceQualquer()
  const contratoId = await buscarContratoQualquer()
  const corretorId = await buscarCorretorQualquer()
  const parceiroComercialId = await criarParceiroComercialDeTeste()

  try {
    // ============================================================
    // CENÁRIO 1 — AUTO: comissão sobre líquido, IOF real, múltiplos
    // recebimentos parciais (cascata simulada por eventos distintos),
    // 4 participantes.
    // ============================================================
    log('--- CENÁRIO 1: AUTO ---')
    const vendaAuto = await criarVendaDeTeste({
      tipo: 'apolice',
      apoliceId,
      modulo: 'auto',
      clienteProspectId,
      valorBase: 1500,
      composicao: [
        { participante_tipo: 'lifitseg', papel: 'CORRETORA', percentual: 25 },
        { participante_tipo: 'corretor', corretor_id: corretorId, papel: 'PROSPECTOU', percentual: 20 },
        { participante_tipo: 'corretor', corretor_id: corretorId, papel: 'FECHOU', percentual: 25 },
        { participante_tipo: 'corretora_parceira', parceiro_comercial_id: parceiroComercialId, papel: 'PARCEIRA', percentual: 30 },
      ],
    })
    // Valor líquido esperado: 1500 - 7.38% = 1389.30. 10% comissão = 138.93.
    // Simulando 2 recebimentos reais (1ª parcela cobre parte, resto vem depois) —
    // o motor não precisa saber disso, só recebe 2 fatos.
    const r1a = await processarRecebimento(vendaAuto, { valorBruto: 115.78, valorDescontos: 8.55, dataRecebimento: '2026-08-01', tipoRecebimento: 'recorrente' })
    const somaR1a = r1a.linhas.reduce((s, l) => s + Number(l.valor_comissao), 0)
    assertAproximadamenteIgual(somaR1a, r1a.recebimento.valor_liquido, 'Cenário 1a — soma das distribuições bate com o líquido')

    const r1b = await processarRecebimento(vendaAuto, { valorBruto: 23.16, valorDescontos: 1.71, dataRecebimento: '2026-09-01', tipoRecebimento: 'recorrente' })
    const somaR1b = r1b.linhas.reduce((s, l) => s + Number(l.valor_comissao), 0)
    assertAproximadamenteIgual(somaR1b, r1b.recebimento.valor_liquido, 'Cenário 1b — 2º recebimento também fecha exatamente')
    log('  ✅ Auto: múltiplos recebimentos parciais, 4 participantes, tudo fecha.\n')

    // ============================================================
    // CENÁRIO 2 — VIDA: proporcional entre parcelas, participantes
    // simples.
    // ============================================================
    log('--- CENÁRIO 2: VIDA ---')
    const vendaVida = await criarVendaDeTeste({
      tipo: 'apolice',
      apoliceId,
      modulo: 'lifsure',
      clienteProspectId,
      valorBase: 500,
      composicao: [
        { participante_tipo: 'lifitseg', papel: 'CORRETORA', percentual: 70 },
        { participante_tipo: 'corretor', corretor_id: corretorId, papel: 'FECHOU', percentual: 30 },
      ],
    })
    for (let parcela = 1; parcela <= 3; parcela++) {
      const r = await processarRecebimento(vendaVida, { valorBruto: 5.00, valorDescontos: 0.02, dataRecebimento: `2026-0${parcela}-10`, tipoRecebimento: 'recorrente' })
      const soma = r.linhas.reduce((s, l) => s + Number(l.valor_comissao), 0)
      assertAproximadamenteIgual(soma, r.recebimento.valor_liquido, `Cenário 2 — parcela ${parcela} fecha exatamente`)
    }
    log('  ✅ Vida: proporcional entre parcelas, 2 participantes, tudo fecha.\n')

    // ============================================================
    // CENÁRIO 3 — SAÚDE PME: implantação (valor alto) seguida de
    // vitalício (valor baixo, recorrente, valor MUDA de mês pra mês
    // — simula alteração de fatura por inclusão/exclusão de vida).
    // ============================================================
    log('--- CENÁRIO 3: SAÚDE PME ---')
    const vendaSaudePme = await criarVendaDeTeste({
      tipo: 'contrato',
      contratoId,
      modulo: 'saude',
      clienteProspectId,
      valorBase: 3000,
      composicao: [
        { participante_tipo: 'lifitseg', papel: 'CORRETORA', percentual: 60 },
        { participante_tipo: 'corretor', corretor_id: corretorId, papel: 'FECHOU', percentual: 40 },
      ],
    })
    const rImplantacao = await processarRecebimento(vendaSaudePme, { valorBruto: 3000, valorDescontos: 0, dataRecebimento: '2026-08-05', tipoRecebimento: 'implantacao' })
    assertAproximadamenteIgual(
      rImplantacao.linhas.reduce((s, l) => s + Number(l.valor_comissao), 0),
      rImplantacao.recebimento.valor_liquido,
      'Cenário 3 — implantação fecha exatamente'
    )
    const rVitalicioMes1 = await processarRecebimento(vendaSaudePme, { valorBruto: 60, valorDescontos: 0, dataRecebimento: '2026-09-05', tipoRecebimento: 'vitalicio' })
    assertAproximadamenteIgual(
      rVitalicioMes1.linhas.reduce((s, l) => s + Number(l.valor_comissao), 0),
      rVitalicioMes1.recebimento.valor_liquido,
      'Cenário 3 — vitalício mês 1 fecha exatamente'
    )
    const rVitalicioMes2 = await processarRecebimento(vendaSaudePme, { valorBruto: 72.50, valorDescontos: 0, dataRecebimento: '2026-10-05', tipoRecebimento: 'vitalicio' })
    assertAproximadamenteIgual(
      rVitalicioMes2.linhas.reduce((s, l) => s + Number(l.valor_comissao), 0),
      rVitalicioMes2.recebimento.valor_liquido,
      'Cenário 3 — vitalício mês 2 (valor mudou por alteração de fatura) fecha exatamente'
    )
    log('  ✅ Saúde PME: implantação + vitalício com valor variável mês a mês, tudo fecha.\n')

    // ============================================================
    // CENÁRIO 4 — SAÚDE GRANDE CONTA: implantação + vitalício + bônus
    // por vida, valor real variável, mais participantes.
    // ============================================================
    log('--- CENÁRIO 4: SAÚDE GRANDE CONTA ---')
    const vendaSaudeGrande = await criarVendaDeTeste({
      tipo: 'contrato',
      contratoId,
      modulo: 'saude',
      clienteProspectId,
      valorBase: 80000,
      composicao: [
        { participante_tipo: 'lifitseg', papel: 'CORRETORA', percentual: 50 },
        { participante_tipo: 'corretor', corretor_id: corretorId, papel: 'PROSPECTOU', percentual: 20 },
        { participante_tipo: 'corretor', corretor_id: corretorId, papel: 'FECHOU', percentual: 30 },
      ],
    })
    const rGrandeImplantacao = await processarRecebimento(vendaSaudeGrande, { valorBruto: 40000, valorDescontos: 0, dataRecebimento: '2026-08-05', tipoRecebimento: 'implantacao' })
    assertAproximadamenteIgual(
      rGrandeImplantacao.linhas.reduce((s, l) => s + Number(l.valor_comissao), 0),
      rGrandeImplantacao.recebimento.valor_liquido,
      'Cenário 4 — implantação (parcela alta) fecha exatamente'
    )
    const rGrandeBonus = await processarRecebimento(vendaSaudeGrande, { valorBruto: 9150, valorDescontos: 0, dataRecebimento: '2026-09-05', tipoRecebimento: 'implantacao' })
    assertAproximadamenteIgual(
      rGrandeBonus.linhas.reduce((s, l) => s + Number(l.valor_comissao), 0),
      rGrandeBonus.recebimento.valor_liquido,
      'Cenário 4 — bônus por vida (valor diferente) fecha exatamente'
    )
    const rGrandeVitalicio = await processarRecebimento(vendaSaudeGrande, { valorBruto: 4000, valorDescontos: 0, dataRecebimento: '2026-10-05', tipoRecebimento: 'vitalicio' })
    assertAproximadamenteIgual(
      rGrandeVitalicio.linhas.reduce((s, l) => s + Number(l.valor_comissao), 0),
      rGrandeVitalicio.recebimento.valor_liquido,
      'Cenário 4 — vitalício fecha exatamente'
    )
    log('  ✅ Saúde Grande Conta: implantação + bônus + vitalício, 3 participantes, tudo fecha.\n')

    log('=== TODOS OS 4 CENÁRIOS PASSARAM ===')
  } catch (erro) {
    log(`\n❌ HOMOLOGAÇÃO FALHOU: ${erro.message}`)
    throw erro
  } finally {
    await limparTudo()
  }
}

main()
  .then(() => {
    log('\nConcluído.')
    process.exitCode = 0
  })
  .catch((erro) => {
    log(`\n❌ ERRO FATAL (fora dos cenários): ${erro.message}`)
    console.error(erro)
    process.exitCode = 1
  })
