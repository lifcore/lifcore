import { buscarClienteProspectCompleto } from './clientesService'
import { listarApolicesDoCliente } from './lifleetService'
import { listarApolicesLifsureDoCliente } from './lifsureService'
import { listarApolicesLishieldDoCliente } from './lishieldService'
import { listarContratosLifplanDoCliente } from './lifplanService'
import { listarComissoesPorApolices } from './comissoesService'
import { formatarDataBR } from '../utils/formatarData'

/**
 * Report Center v1 — Camada única de montagem documental.
 *
 * Todo documento do Lifcore (a começar pelo Relatório Consolidado do
 * Cliente) deve passar por aqui — duas etapas sempre separadas:
 *
 *   1. montarDados*(...)  → busca e organiza o dado (reaproveitando os
 *      Services que já existem, um por módulo, sem duplicar consulta)
 *   2. gerarHtml*(dados)  → função pura, sem chamada de banco, que
 *      transforma o dado organizado em HTML pronto pra impressão.
 *
 * Essa separação é o que permite, no futuro, trocar só a etapa 2 por
 * geração de PDF de verdade, sem tocar em nenhuma consulta de dado.
 *
 * IMPORTANTE — limitação conhecida e assumida conscientemente: o
 * Finance Center hoje só vincula comissão à apólice (`apolice_id`),
 * não a contrato (`contrato_id` ainda não existe — decisão em espera,
 * registrada anteriormente). Por isso, o financeiro só aparece no
 * relatório para módulos que usam Apólices (Lifleet/Lifsure/LiShield).
 * Para Lifcare e LifPlan (que usam Contratos), o relatório informa
 * isso explicitamente em vez de fingir que o dado existe.
 */

const MODULO_LABEL = {
  saude: 'Lifcare (Saúde)',
  auto: 'Lifleet (Auto/Frota)',
  lifsure: 'LifSure',
  lishield: 'LiShield',
  lifplan: 'LifPlan',
}

/**
 * Busca e organiza todos os dados do cliente necessários pro
 * Relatório Consolidado — reaproveitando exclusivamente os Services
 * já existentes de cada módulo, sem nenhuma consulta nova ao banco
 * além das que esses Services já fazem.
 */
export async function montarDadosDocumentoCliente(clienteId) {
  const base = await buscarClienteProspectCompleto(clienteId)
  const { cliente, contatos, cotacoes, demandas, grupoInfo } = base
  const modulo = cliente.modulo

  let negocios = []
  let tipoNegocio = 'Contratos'
  let financeiroDisponivel = false
  let comissoes = []

  if (modulo === 'saude') {
    // Lifcare já vem embutido em buscarClienteProspectCompleto (tabela contratos)
    negocios = (base.contratos ?? []).map((c) => ({
      operadoraNome: c.operadora_nome_livre,
      identificador: c.numero_apolice,
      produtoOuPlano: c.plano,
      valor: (c.itens_contrato ?? []).reduce((s, i) => s + (i.quantidade_vidas ?? 0) * Number(i.valor ?? 0), 0),
      vigenciaFim: c.vigencia_fim,
      status: c.status,
    }))
    tipoNegocio = 'Contratos'
    financeiroDisponivel = false // contrato ainda não linca com comissão (decisão em espera)
  } else if (modulo === 'auto') {
    const apolices = await listarApolicesDoCliente(clienteId)
    negocios = mapearApolicesPadrao(apolices)
    tipoNegocio = 'Apólices'
    comissoes = await listarComissoesPorApolices(apolices.map((a) => a.id))
    financeiroDisponivel = true
  } else if (modulo === 'lifsure') {
    const apolices = await listarApolicesLifsureDoCliente(clienteId)
    negocios = mapearApolicesPadrao(apolices)
    tipoNegocio = 'Apólices'
    comissoes = await listarComissoesPorApolices(apolices.map((a) => a.id))
    financeiroDisponivel = true
  } else if (modulo === 'lishield') {
    const apolices = await listarApolicesLishieldDoCliente(clienteId)
    negocios = mapearApolicesPadrao(apolices)
    tipoNegocio = 'Apólices'
    comissoes = await listarComissoesPorApolices(apolices.map((a) => a.id))
    financeiroDisponivel = true
  } else if (modulo === 'lifplan') {
    const contratos = await listarContratosLifplanDoCliente(clienteId)
    negocios = mapearApolicesPadrao(contratos)
    tipoNegocio = 'Contratos'
    financeiroDisponivel = false // LifPlan usa contrato próprio, comissão ainda não linca (decisão em espera)
  }

  return {
    geradoEm: new Date().toISOString(),
    moduloLabel: MODULO_LABEL[modulo] ?? modulo,
    cliente,
    contatoPrimario: contatos.find((c) => c.tipo === 'primario') ?? null,
    contatoSecundario: contatos.find((c) => c.tipo === 'secundario') ?? null,
    grupoInfo,
    negocios,
    tipoNegocio,
    cotacoes: cotacoes ?? [],
    demandas: demandas ?? [],
    financeiroDisponivel,
    comissoes,
  }
}

/** Normaliza apólices/contratos dos módulos que já usam campos padronizados
 * (operadora_nome_livre, produto, premio, vigencia_fim, numero_apolice) */
function mapearApolicesPadrao(lista) {
  return (lista ?? []).map((a) => ({
    operadoraNome: a.operadora_nome_livre,
    identificador: a.numero_apolice,
    produtoOuPlano: a.produto,
    valor: Number(a.premio ?? 0),
    vigenciaFim: a.vigencia_fim,
    status: a.status,
  }))
}

/**
 * Gera o HTML do Relatório Consolidado do Cliente — função pura, sem
 * chamada de banco. Recebe exatamente o formato de
 * montarDadosDocumentoCliente() e devolve uma string HTML completa,
 * pronta pra abrir numa janela e imprimir (mesmo padrão já usado no
 * "Imprimir/Comparativo" do Cotador do Lifleet).
 */
export function gerarHtmlDocumentoCliente(dados) {
  const {
    geradoEm, moduloLabel, cliente, contatoPrimario, contatoSecundario,
    grupoInfo, negocios, tipoNegocio, demandas, financeiroDisponivel, comissoes,
  } = dados

  const totalNegocios = negocios.reduce((s, n) => s + (n.valor || 0), 0)
  const demandasFinalizadas = demandas.filter((d) => d.situacao === 'resolvido' || d.situacao === 'encerrado')
  const demandasAbertas = demandas.filter((d) => d.situacao !== 'resolvido' && d.situacao !== 'encerrado')

  const totalComissaoPrevisto = comissoes.reduce((s, c) => s + (c.status_recebimento !== 'cancelado' ? Number(c.valor_comissao || 0) : 0), 0)
  const totalComissaoRecebido = comissoes.filter((c) => c.status_recebimento === 'recebido').reduce((s, c) => s + Number(c.valor_comissao || 0), 0)

  const linhasNegocios = negocios.length
    ? negocios.map((n) => `
        <tr>
          <td>${escapeHtml(n.operadoraNome ?? '—')}</td>
          <td>${escapeHtml(n.produtoOuPlano ?? '—')}</td>
          <td>${escapeHtml(n.identificador ?? '—')}</td>
          <td>${formatarMoedaHtml(n.valor)}</td>
          <td>${n.vigenciaFim ? formatarDataBR(n.vigenciaFim) : '—'}</td>
        </tr>`).join('')
    : `<tr><td colspan="5" class="vazio">Nenhum registro ainda.</td></tr>`

  const linhasDemandas = demandas.length
    ? [...demandas].sort((a, b) => new Date(b.criado_em) - new Date(a.criado_em)).map((d) => `
        <tr>
          <td>${escapeHtml(d.codigo ?? '—')}</td>
          <td>${escapeHtml(d.demanda_original ?? d.categoria ?? '—')}</td>
          <td>${escapeHtml(traduzirSituacaoGenerica(d.situacao))}</td>
          <td>${d.criado_em ? formatarDataBR(d.criado_em) : '—'}</td>
        </tr>`).join('')
    : `<tr><td colspan="4" class="vazio">Nenhuma demanda registrada.</td></tr>`

  const blocoFinanceiro = financeiroDisponivel
    ? `
      <h2>Financeiro</h2>
      <div class="resumo-grid">
        <div class="resumo-card"><span>Comissão prevista</span><strong>${formatarMoedaHtml(totalComissaoPrevisto)}</strong></div>
        <div class="resumo-card"><span>Comissão recebida</span><strong>${formatarMoedaHtml(totalComissaoRecebido)}</strong></div>
      </div>
    `
    : `
      <h2>Financeiro</h2>
      <p class="aviso">Financeiro ainda não disponível para este módulo — o Finance Center hoje só
      vincula comissão a Apólices; a vinculação com Contratos está registrada como evolução futura.</p>
    `

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8" />
<title>Relatório — ${escapeHtml(cliente.razao_social)}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: 'Georgia', 'Times New Roman', serif; color: #1a1a1a; max-width: 820px; margin: 0 auto; padding: 32px; }
  header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid #0e2a3d; padding-bottom: 16px; margin-bottom: 24px; }
  header h1 { font-size: 22px; margin: 0; color: #0e2a3d; }
  header .subtitulo { font-size: 12px; color: #666; margin-top: 4px; }
  header .gerado-em { font-size: 11px; color: #888; text-align: right; }
  h2 { font-size: 15px; color: #0e2a3d; border-bottom: 1px solid #ddd; padding-bottom: 4px; margin-top: 28px; }
  .cadastro-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 6px 24px; font-size: 13px; margin-top: 8px; }
  .cadastro-grid div span { display: block; font-size: 10px; color: #888; text-transform: uppercase; }
  table { width: 100%; border-collapse: collapse; margin-top: 8px; font-size: 12px; }
  th { text-align: left; background: #f3f3f3; padding: 6px 8px; font-size: 10px; text-transform: uppercase; color: #555; }
  td { padding: 6px 8px; border-bottom: 1px solid #eee; }
  td.vazio { color: #999; font-style: italic; text-align: center; }
  .resumo-grid { display: flex; gap: 16px; margin-top: 8px; }
  .resumo-card { border: 1px solid #ddd; border-radius: 6px; padding: 10px 14px; flex: 1; }
  .resumo-card span { display: block; font-size: 10px; color: #888; text-transform: uppercase; }
  .resumo-card strong { font-size: 16px; }
  .aviso { font-size: 12px; color: #777; font-style: italic; }
  .total-linha { text-align: right; font-weight: 700; margin-top: 6px; font-size: 13px; }
  footer { margin-top: 40px; padding-top: 12px; border-top: 1px solid #ddd; font-size: 10px; color: #999; text-align: center; }
  @media print {
    body { padding: 0; }
    button.no-print { display: none; }
  }
</style>
</head>
<body>
  <button class="no-print" onclick="window.print()" style="float:right; margin-bottom:12px; padding:8px 16px; cursor:pointer;">🖨️ Imprimir / Salvar como PDF</button>

  <header>
    <div>
      <h1>${escapeHtml(cliente.razao_social)}</h1>
      <div class="subtitulo">${escapeHtml(moduloLabel)} · Relatório Consolidado do Cliente</div>
    </div>
    <div class="gerado-em">Gerado em<br/>${formatarDataBR(geradoEm.slice(0, 10))}</div>
  </header>

  <h2>Dados Cadastrais</h2>
  <div class="cadastro-grid">
    <div><span>Documento</span>${escapeHtml(cliente.cnpj || cliente.cpf || '—')}</div>
    <div><span>Status</span>${escapeHtml(cliente.status)}</div>
    <div><span>Segmento</span>${escapeHtml(cliente.segmento || '—')}</div>
    <div><span>Vigência/Data relevante</span>${cliente.data_vigencia ? formatarDataBR(cliente.data_vigencia) : '—'}</div>
  </div>

  <h2>Contatos</h2>
  <div class="cadastro-grid">
    <div><span>Contato primário</span>${escapeHtml(contatoPrimario?.nome || '—')} ${contatoPrimario?.celular ? `— ${escapeHtml(contatoPrimario.celular)}` : ''}</div>
    <div><span>Contato secundário</span>${escapeHtml(contatoSecundario?.nome || '—')} ${contatoSecundario?.celular ? `— ${escapeHtml(contatoSecundario.celular)}` : ''}</div>
  </div>

  ${grupoInfo ? `
  <h2>Grupo Econômico</h2>
  <p style="font-size:13px;">${escapeHtml(grupoInfo.nomeGrupo)} — total de vidas do grupo: <strong>${grupoInfo.totalVidasGrupo}</strong></p>
  ` : ''}

  <h2>${escapeHtml(tipoNegocio)}</h2>
  <table>
    <thead><tr><th>Seguradora</th><th>Produto/Plano</th><th>Nº</th><th>Valor</th><th>Vigência</th></tr></thead>
    <tbody>${linhasNegocios}</tbody>
  </table>
  <div class="total-linha">Total: ${formatarMoedaHtml(totalNegocios)}</div>

  <h2>Demandas (${demandasAbertas.length} em aberto, ${demandasFinalizadas.length} finalizadas)</h2>
  <table>
    <thead><tr><th>Código</th><th>Demanda</th><th>Situação</th><th>Aberta em</th></tr></thead>
    <tbody>${linhasDemandas}</tbody>
  </table>

  ${blocoFinanceiro}

  <footer>Lifcore by LifitSeg — documento gerado automaticamente, uso interno.</footer>
</body>
</html>`
}

function escapeHtml(valor) {
  if (valor === null || valor === undefined) return ''
  return String(valor).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
}

function formatarMoedaHtml(valor) {
  return (Number(valor) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function traduzirSituacaoGenerica(situacao) {
  const mapa = {
    aberto: 'Aberta', em_andamento: 'Em andamento', aguardando_operadora: 'Aguardando seguradora',
    aguardando_cliente: 'Aguardando cliente', resolvido: 'Resolvida', encerrado: 'Fechada',
  }
  return mapa[situacao] ?? situacao
}