import { useEffect, useState } from 'react'
import '../../styles/centers.css'
import '../../styles/lcds-tokens.css'
import InfoTooltip from '../../components/InfoTooltip'
import KpiCard from '../../components/KpiCard'
import { useSearchParams } from 'react-router-dom'
import {
  marcarRepasseComoPago,
  obterFluxoCaixaPrevisto,
  resumirPorFaixaAtraso,
  listarRepassesAPagar,
  obterCentralPendencias,
  buscarComissoesGlobal,
  excluirComissao,
} from '../../lib/crm/comissoesService'
import {
  listarRecebimentosPendentesConciliacao,
  listarRecebimentosConciliadosAguardandoDistribuicao,
  buscarVendasCandidatas,
  conciliarRecebimento,
  distribuirRecebimento,
  lancarComissaoRecebida,
  TIPOS_RECEBIMENTO_VALIDOS,
  conciliarFechamentoAgregado,
  listarFechamentosAgregados,
  excluirFechamentoAgregado,
} from '../../lib/crm/comissionamentoService'
import {
  listarComissoesSugeridasDetalhado,
  gerarSugestoesCompetencia,
  ajustarComissaoSugeridaManualmente,
  validarComissaoSugerida,
  desvalidarComissaoSugerida,
  adicionarParcelaManual,
  listarAjustesDaVenda,
  excluirAjusteEstorno,
  lancarAjusteEstorno,
  obterConfrontoDaVenda,
  confrontarFechamentoAgregado,
  materializarVitalicioSeElegivel,
} from '../../lib/crm/regrasComissaoService'
import { uploadLoteImportacao, listarLotesImportacao, listarEventosPorLote, confirmarFormatoHomologado, excluirLote, listarSeguradorasCatalogo, atribuirSeguradoraEReprocessar, reprocessarLote } from '../../lib/crm/lotesImportacaoService'
import { useAuth } from '../auth/AuthContext'
import { listarCatalogoSeguradoras, listarApolices, listarCorretores } from '../../lib/crm/apolicesService'
import { vendaTemComposicao, definirComposicaoManual, criarComposicaoAutomaticaSeElegivel, excluirVendaEHistoricoForcado } from '../../lib/crm/vendasService'
import { formatarDataBR } from '../../lib/utils/formatarData'
import { operacional } from '../../lib/supabaseSchemas'
import BotaoOperacaoCritica from '../../components/BotaoOperacaoCritica'

const MODULOS = [
  { id: 'saude', label: 'Lifcare (Saúde)' },
  { id: 'auto', label: 'Lifleet (Auto)' },
  { id: 'lifsure', label: 'LifSure' },
  { id: 'lishield', label: 'LiShield' },
  { id: 'lifplan', label: 'LifPlan' },
]

const STATUS_RECEBIMENTO = [
  { id: 'pendente', label: 'Pendente' },
  { id: 'recebido', label: 'Recebido' },
  { id: 'cancelado', label: 'Cancelado' },
]

const STATUS_REPASSE = [
  { id: 'nao_aplicavel', label: 'Não aplicável' },
  { id: 'pendente', label: 'Pendente' },
  { id: 'pago', label: 'Pago' },
]

function formatarMoeda(valor) {
  return (Number(valor) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

const TEXTOS_ABA = {
  lancamentos: 'Etapa 2 do modelo: apólice → regra → comissão sugerida. Nunca é fato financeiro — é expectativa calculada a partir da regra cadastrada em Configurações. Gestor pode ajustar individualmente sem alterar a regra.',
  pendencias: 'Consolida tudo que exige atenção administrativa agora — clique num card pra ir direto à fila correspondente.',
  contasareceber: 'Etapa 3 do modelo: upload do relatório real da seguradora. Primeira entrega — armazena o documento e cria o lote. Extração, prévia e confronto com a sugestão vêm em etapas seguintes, testadas separadamente.',
  repasses: 'O outro lado do Ledger: dinheiro que a LifitSeg deve repassar ao corretor (não à seguradora). Repasses que dependem de uma comissão ainda não recebida aparecem separados, no fim da lista — não são "atrasados", só ainda não estão liberados pra pagamento.',
  conciliacao: 'Compara o total lançado com o total já confirmado como recebido, por seguradora. "Atrasado" é o que está pendente com previsão de recebimento já vencida.',
  fluxo: 'Soma direta do que já está cadastrado (data prevista de recebimento), pros próximos 3 meses. Sem projeção estatística — só o que já foi lançado.',
  buscar: 'Busca por Corretor, Seguradora, Nº da Apólice, Status, Período e Valor. Busca por Cliente e por Contrato ainda não disponível aqui — depende de confirmar schema antes de implementar com segurança (registrado como pendência técnica).',
}

export default function FinanceiroPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const abaAtiva = searchParams.get('aba') || 'lancamentos'
  function setAbaAtiva(aba) { setSearchParams({ aba }) }

  return (
    <div className="config-page" data-theme="lcds">
      <h2>
        Financeiro
        <InfoTooltip texto={TEXTOS_ABA[abaAtiva]} titulo="Financeiro" />
      </h2>

      <div className="cliente-abas" style={{ marginBottom: '1rem' }}>
        <button className={`cliente-aba ${abaAtiva === 'lancamentos' ? 'cliente-aba-ativa' : ''}`} onClick={() => setAbaAtiva('lancamentos')}>Comissões Sugeridas</button>
        <button className={`cliente-aba ${abaAtiva === 'pendencias' ? 'cliente-aba-ativa' : ''}`} onClick={() => setAbaAtiva('pendencias')}>Pendências</button>
        <button className={`cliente-aba ${abaAtiva === 'contasareceber' ? 'cliente-aba-ativa' : ''}`} onClick={() => setAbaAtiva('contasareceber')}>Recebimentos</button>
        <button className={`cliente-aba ${abaAtiva === 'repasses' ? 'cliente-aba-ativa' : ''}`} onClick={() => setAbaAtiva('repasses')}>Repasses</button>
        <button className={`cliente-aba ${abaAtiva === 'conciliacao' ? 'cliente-aba-ativa' : ''}`} onClick={() => setAbaAtiva('conciliacao')}>Conciliação</button>
        <button className={`cliente-aba ${abaAtiva === 'fluxo' ? 'cliente-aba-ativa' : ''}`} onClick={() => setAbaAtiva('fluxo')}>Fluxo de Caixa</button>
        <button className={`cliente-aba ${abaAtiva === 'buscar' ? 'cliente-aba-ativa' : ''}`} onClick={() => setAbaAtiva('buscar')}>Buscar</button>
      </div>

      {abaAtiva === 'pendencias' && <PendenciasTab setAbaAtiva={setAbaAtiva} />}
      {abaAtiva === 'contasareceber' && <RecebimentosTab />}
      {abaAtiva === 'repasses' && <RepassesTab />}
      {abaAtiva === 'conciliacao' && <ConciliacaoTab />}
      {abaAtiva === 'fluxo' && <FluxoCaixaTab />}
      {abaAtiva === 'buscar' && <BuscaGlobalTab />}

      {abaAtiva === 'lancamentos' && <ComissoesSugeridasTab />}
    </div>
  )
}

/**
 * Etapa 2 do DOC-COM-001 — Comissões Sugeridas.
 * Substitui o antigo livro-razão manual. Não mostra "Total Previsto"
 * nem mistura previsão com fato — só mostra o que a regra calculou,
 * por venda, numa competência. Nenhum lançamento manual aqui: a
 * entrada é sempre "Gerar sugestões", que roda o motor já existente
 * (calcularComissaoSugerida) em lote pra todas as vendas elegíveis.
 */
function ComissoesSugeridasTab() {
  const { user } = useAuth()
  const hoje = new Date()
  const competenciaPadrao = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}`

  const [competencia, setCompetencia] = useState(competenciaPadrao)
  const [dados, setDados] = useState([])
  const [carregando, setCarregando] = useState(true)
  const [gerando, setGerando] = useState(false)
  const [erro, setErro] = useState('')
  const [resultadoGeracao, setResultadoGeracao] = useState(null)
  const [mostrarValidadas, setMostrarValidadas] = useState(false)

  useEffect(() => {
    carregar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function carregar() {
    setCarregando(true)
    setErro('')
    try {
      const lista = await listarComissoesSugeridasDetalhado()
      setDados(lista)
    } catch (e) {
      setErro(e.message)
    }
    setCarregando(false)
  }

  async function handleGerar() {
    setGerando(true)
    setErro('')
    setResultadoGeracao(null)
    try {
      const resultado = await gerarSugestoesCompetencia(`${competencia}-01`)
      setResultadoGeracao(resultado)
      await carregar()
    } catch (e) {
      setErro(e.message)
    }
    setGerando(false)
  }

  const apolicesComRegra = dados.filter((d) => d.regra_comissao_id).length
  const sugestoesGeradas = dados.filter((d) => d.status_calculo === 'calculada').length
  const ajustesManuais = dados.filter((d) => d.ajustado_manualmente).length
  const semRegraOuSemValor = dados.filter((d) => d.status_calculo === 'nao_definida').length

  // Agrupamento por venda (Etapa 4, Peça 1 revisada) — o Gestor precisa
  // ver o calendário inteiro de cada venda de uma vez, não competência
  // solta. Ordenado por competência dentro do grupo (já vem ordenado
  // do service, mas garante aqui também).
  const gruposPorVenda = {}
  for (const d of dados) {
    const chave = d.venda_id
    if (!gruposPorVenda[chave]) gruposPorVenda[chave] = []
    gruposPorVenda[chave].push(d)
  }
  const grupos = Object.values(gruposPorVenda).map((linhas) =>
    linhas.slice().sort((a, b) => (a.competencia_referencia < b.competencia_referencia ? -1 : 1))
  )

  /**
   * CORREÇÃO (item 1, achado do Raphael 15/08): depois de validado por
   * completo, a venda não tem mais trabalho pendente nesta tela — fica
   * escondida por padrão pra não poluir a lista de "o que falta fazer".
   * O dado não é apagado nem alterado, só oculto — toggle reexibe pra
   * auditoria/conferência quando precisar.
   */
  const grupoTotalmenteValidado = (linhas) => linhas.length > 0 && linhas.every((l) => l.status_validacao === 'validado')
  const gruposExibidos = mostrarValidadas ? grupos : grupos.filter((linhas) => !grupoTotalmenteValidado(linhas))
  const qtdEscondidosValidados = grupos.length - grupos.filter((linhas) => !grupoTotalmenteValidado(linhas)).length

  return (
    <div>
      <div className="cotacao-form-linha" style={{ alignItems: 'flex-end', marginBottom: '1rem' }}>
        <div>
          <label>Competência (pra "Gerar Sugestões" de vendas sem calendário projetado)</label>
          <input type="month" value={competencia} onChange={(e) => setCompetencia(e.target.value)} />
        </div>
        <button className="ls-btn ls-btn-primary" onClick={handleGerar} disabled={gerando}>
          {gerando ? 'Gerando...' : 'Gerar / Atualizar Sugestões'}
        </button>
      </div>

      {resultadoGeracao && (
        <p className="config-instrucao" style={{ marginBottom: '1rem' }}>
          {resultadoGeracao.processadas} de {resultadoGeracao.totalVendas} venda(s) processada(s).
          {resultadoGeracao.erros.length > 0 && ` ${resultadoGeracao.erros.length} com erro.`}
        </p>
      )}

      {erro && <p className="ls-modal-erro">{erro}</p>}

      <div className="kpi-grid" style={{ marginBottom: '1rem' }}>
        <KpiCard label="Apólices com Regra" valor={apolicesComRegra} />
        <KpiCard label="Sugestões Geradas" valor={sugestoesGeradas} />
        <KpiCard label="Ajustes Manuais" valor={ajustesManuais} />
        <KpiCard label="Sem Regra / Sem Sugestão" valor={semRegraOuSemValor} />
        <KpiCard label="Vendas com Cenário" valor={grupos.length} />
      </div>

      <div className="cotacao-form-linha" style={{ alignItems: 'center', marginBottom: '1rem' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem' }}>
          <input type="checkbox" checked={mostrarValidadas} onChange={(e) => setMostrarValidadas(e.target.checked)} />
          Mostrar vendas já totalmente validadas ({qtdEscondidosValidados} escondida{qtdEscondidosValidados !== 1 ? 's' : ''})
        </label>
      </div>

      {carregando ? (
        <p className="cliente-carregando">Carregando...</p>
      ) : gruposExibidos.length === 0 ? (
        <p className="cliente-vazio">
          {grupos.length === 0
            ? 'Nenhuma sugestão gerada ainda. Clique em "Gerar Sugestões" acima.'
            : 'Todas as vendas com cenário já estão validadas — marque a caixa acima pra ver.'}
        </p>
      ) : (
        gruposExibidos.map((linhas) => (
          <CardVendaCalendario key={linhas[0].venda_id} linhas={linhas} usuarioId={user?.id} onAtualizado={carregar} />
        ))
      )}
    </div>
  )
}

/** Mesmo rótulo já usado na tela de Regras de Comissão (Configurações) — não inventa texto novo. */
const ROTULOS_BASE_CALCULO = {
  premio_sem_iof: 'Prêmio/valor total sem IOF',
  mensalidade: 'Mensalidade',
  parcela_recebida: 'Parcela recebida',
  manual: 'Manual',
}
function rotuloBaseCalculo(baseCalculo) {
  return ROTULOS_BASE_CALCULO[baseCalculo] ?? baseCalculo ?? '—'
}

/**
 * CORREÇÃO (Etapa 4, Peça 1 revisada — aprovado pelo Chief): antes
 * cada linha de `comissao_sugerida` virava uma linha de tabela solta.
 * Com o calendário completo sendo projetado de uma vez (Cascata/
 * Proporcional), isso mostraria a mesma venda espalhada em várias
 * linhas sem contexto. Agora um card por venda mostra o cabeçalho
 * (apólice/cliente/operadora/produto/regra + total esperado) uma vez,
 * e uma sub-tabela lista o calendário — cada competência com seu
 * próprio ajuste/validação, sem perder a granularidade que o Chief
 * pediu ("cada competência precisa poder ser validada individualmente").
 */
function CardVendaCalendario({ linhas, usuarioId, onAtualizado }) {
  const { perfil } = useAuth()
  const ehMaster = perfil?.papel === 'master'
  const primeira = linhas[0]
  const totalEsperado = linhas.reduce((soma, l) => soma + (Number(l.valor_sugerido) || 0), 0)
  const totalLinhasValidadas = linhas.filter((l) => l.status_validacao === 'validado').length
  const todasValidadas = linhas.length > 0 && totalLinhasValidadas === linhas.length
  const [excluindoVenda, setExcluindoVenda] = useState(false)

  async function handleExcluirVenda() {
    if (!window.confirm(`Excluir PERMANENTEMENTE a venda ${primeira.numeroApolice} e todo o histórico financeiro dela (sugestão, recebimentos, ajustes, composição)? A apólice continua existindo — só a venda e o financeiro somem. Não é reversível.`)) return
    setExcluindoVenda(true)
    try {
      await excluirVendaEHistoricoForcado(primeira.venda_id, usuarioId)
      onAtualizado()
    } catch (e) {
      window.alert(e.message)
    }
    setExcluindoVenda(false)
  }

  const [validandoTudo, setValidandoTudo] = useState(false)
  const [erroValidacao, setErroValidacao] = useState('')
  const [mostrarNovaParcela, setMostrarNovaParcela] = useState(false)
  const [novaCompetencia, setNovaCompetencia] = useState('')
  const [novoValorParcela, setNovoValorParcela] = useState('')
  const [salvandoParcela, setSalvandoParcela] = useState(false)

  // AJUSTES/ESTORNOS (Etapa 4, Peça 2). Carregados por venda, não vêm
  // na consulta principal pra não pesar toda listagem. Criação de novo
  // ajuste NÃO fica mais aqui — só leitura/exclusão do que já existe.
  // Correção de posicionamento (achado do Raphael): o gatilho certo do
  // estorno é a Conciliação encontrar divergência, não a validação da
  // Sugestão — validar já é confirmar a expectativa, não dá pra saber
  // de cancelamento/estorno antes da seguradora dizer algo. O botão de
  // "+ Ajuste/Estorno" volta na Peça 3 (Conciliação), lançado de lá com
  // o contexto certo — mesmo motor (`lancarAjusteEstorno`), porta
  // diferente.
  const [ajustes, setAjustes] = useState([])

  useEffect(() => {
    listarAjustesDaVenda(primeira.venda_id).then(setAjustes).catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [primeira.venda_id])

  const totalAjustes = ajustes.reduce((soma, a) => soma + Number(a.valor), 0)
  const totalLiquido = totalEsperado + totalAjustes

  // Aviso explícito quando a regra pediria calendário (Cascata/Proporcional
  // + premio_sem_iof) mas a apólice não tem forma_pagamento_vezes — nunca
  // esconde do Gestor que ele está vendo só o total, não o cronograma.
  const modeloExigeCalendario = ['cascata', 'proporcional'].includes(primeira.regra?.modelo_recebimento)
  const semParcelasInformadas = !primeira.venda?.apolice?.forma_pagamento_vezes
  const semCronogramaProjetado = modeloExigeCalendario && primeira.regra?.base_calculo === 'premio_sem_iof' && semParcelasInformadas && linhas.length === 1

  /**
   * CORREÇÃO (pedido do Raphael, teste da Peça 1): validar mês a mês
   * era redundante — os campos já são editáveis linha a linha pra
   * correção, então a validação pode ser em lote. Um clique valida
   * tudo que ainda estiver pendente; linhas já validadas não são
   * tocadas de novo (idempotente).
   */
  async function handleValidarTudo() {
    setValidandoTudo(true)
    setErroValidacao('')
    try {
      const pendentes = linhas.filter((l) => l.status_validacao !== 'validado')
      for (const l of pendentes) {
        await validarComissaoSugerida(l.id, usuarioId)
      }
      onAtualizado()
    } catch (e) {
      setErroValidacao(e.message)
    }
    setValidandoTudo(false)
  }

  /**
   * "+ Adicionar parcela" (pedido do Raphael): pra quando o calendário
   * projetado não cobre um mês que precisa existir — renegociação,
   * parcela extra, ajuste de cronograma fora do previsto. Nasce
   * ajustada manualmente, então o motor nunca mexe nela depois.
   */
  async function handleAdicionarParcela() {
    if (!novaCompetencia || novoValorParcela === '') return
    setSalvandoParcela(true)
    setErroValidacao('')
    try {
      await adicionarParcelaManual({
        vendaId: primeira.venda_id,
        competenciaReferencia: `${novaCompetencia}-01`,
        valor: Number(novoValorParcela),
        regraId: primeira.regra_comissao_id,
        usuarioId,
      })
      setNovaCompetencia('')
      setNovoValorParcela('')
      setMostrarNovaParcela(false)
      onAtualizado()
    } catch (e) {
      setErroValidacao(e.message)
    }
    setSalvandoParcela(false)
  }

  async function handleExcluirAjuste(ajusteId) {
    if (!window.confirm('Excluir este lançamento de ajuste/estorno?')) return
    try {
      await excluirAjusteEstorno(ajusteId)
      listarAjustesDaVenda(primeira.venda_id).then(setAjustes).catch(() => {})
    } catch (e) {
      setErroValidacao(e.message)
    }
  }

  return (
    <div className="ls-card" style={{ padding: '0.85rem', marginBottom: '0.85rem' }}>
      <div className="cotacao-form-linha" style={{ alignItems: 'center' }}>
        <div>
          <strong>{primeira.numeroApolice}</strong> — {primeira.nomeCliente}
        </div>
        <div>{primeira.nomeOperadora} · {primeira.nomeProduto}</div>
        <div>
          <strong>Total esperado: {formatarMoeda(totalEsperado)}</strong>
          {ajustes.length > 0 && (
            <span style={{ fontSize: '0.8rem', marginLeft: '0.5rem' }}>
              (ajustes: {formatarMoeda(totalAjustes)} → líquido: {formatarMoeda(totalLiquido)})
            </span>
          )}
          {linhas.length > 1 && (
            <span style={{ fontSize: '0.8rem', marginLeft: '0.5rem' }}>
              ({totalLinhasValidadas}/{linhas.length} validada{linhas.length > 1 ? 's' : ''})
            </span>
          )}
        </div>
        <div style={{ display: 'flex', gap: '0.4rem' }}>
          <button className="ls-btn ls-btn-ghost" onClick={() => setMostrarNovaParcela((v) => !v)}>
            + Adicionar parcela
          </button>
          {!todasValidadas && (
            <button className="cliente-tabela-btn" onClick={handleValidarTudo} disabled={validandoTudo}>
              {validandoTudo ? 'Validando...' : 'Validar Cenário'}
            </button>
          )}
          {ehMaster && (
            <button className="cliente-tabela-btn cliente-tabela-btn-perigo" onClick={handleExcluirVenda} disabled={excluindoVenda}>
              {excluindoVenda ? 'Excluindo...' : '🗑️ Excluir (Master)'}
            </button>
          )}
        </div>
      </div>

      <p style={{ fontSize: '0.8rem', margin: '0.3rem 0 0.6rem', opacity: 0.85 }}>
        Regra: {primeira.regra?.descricao ?? '—'}
        {primeira.regra?.modelo_recebimento &&
          ` — ${primeira.regra.modelo_recebimento === 'cascata' ? 'Cascata' : primeira.regra.modelo_recebimento === 'proporcional' ? 'Proporcional' : 'Desdobrada'}`}
      </p>

      {erroValidacao && <p className="ls-modal-erro">{erroValidacao}</p>}

      {semCronogramaProjetado && (
        <p className="config-instrucao" style={{ borderLeft: '3px solid var(--ls-warning, #b8860b)', paddingLeft: '0.5rem' }}>
          ⚠️ Comissão total calculada — cronograma não projetado: quantidade de parcelas não informada na apólice.
        </p>
      )}

      {mostrarNovaParcela && (
        <div className="cotacao-form-linha" style={{ marginBottom: '0.6rem', alignItems: 'flex-end' }}>
          <div>
            <label>Competência</label>
            <input type="month" value={novaCompetencia} onChange={(e) => setNovaCompetencia(e.target.value)} />
          </div>
          <div>
            <label>Valor esperado</label>
            <input type="number" step="0.01" value={novoValorParcela} onChange={(e) => setNovoValorParcela(e.target.value)} placeholder="Ex: 100,00" />
          </div>
          <button className="cliente-tabela-btn" onClick={handleAdicionarParcela} disabled={salvandoParcela || !novaCompetencia || novoValorParcela === ''}>
            {salvandoParcela ? 'Salvando...' : 'Adicionar'}
          </button>
        </div>
      )}

      {ajustes.length > 0 && (
        <div style={{ marginBottom: '0.6rem' }}>
          <strong style={{ fontSize: '0.8rem' }}>Ajustes/Estornos lançados</strong>
          <table className="cliente-tabela" style={{ marginTop: '0.3rem' }}>
            <thead><tr><th>Tipo</th><th>Valor</th><th>Competência</th><th>Motivo</th><th>Data</th><th></th></tr></thead>
            <tbody>
              {ajustes.map((a) => (
                <tr key={a.id}>
                  <td><span className="ls-badge">{a.tipo}</span></td>
                  <td>{formatarMoeda(a.valor)}</td>
                  <td>{a.competencia_referencia ? new Date(a.competencia_referencia).toLocaleDateString('pt-BR', { month: '2-digit', year: 'numeric', timeZone: 'UTC' }) : 'Venda inteira'}</td>
                  <td style={{ fontSize: '0.8rem' }}>{a.motivo}</td>
                  <td style={{ fontSize: '0.8rem' }}>{new Date(a.criado_em).toLocaleDateString('pt-BR')}</td>
                  <td>
                    <button className="ls-btn ls-btn-ghost" style={{ fontSize: '0.75rem' }} onClick={() => handleExcluirAjuste(a.id)}>Excluir</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <table className="cliente-tabela">
        <thead>
          <tr><th>Competência</th><th>Esperado</th><th>Status</th><th>Ações</th></tr>
        </thead>
        <tbody>
          {linhas.map((item) => (
            <LinhaCompetenciaCalendario key={item.id} item={item} usuarioId={usuarioId} onAtualizado={onAtualizado} />
          ))}
        </tbody>
      </table>
    </div>
  )
}

function LinhaCompetenciaCalendario({ item, usuarioId, onAtualizado }) {
  const [expandido, setExpandido] = useState(false)
  const [novoValor, setNovoValor] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')

  async function handleAjustar() {
    if (novoValor === '') return
    setSalvando(true)
    setErro('')
    try {
      await ajustarComissaoSugeridaManualmente(item.id, Number(novoValor), usuarioId)
      setNovoValor('')
      onAtualizado()
    } catch (e) {
      setErro(e.message)
    }
    setSalvando(false)
  }

  /**
   * VALIDAÇÃO (Etapa 4, Peça 1). Não exige valor ajustado — mesmo uma
   * sugestão calculada certa precisa de confirmação explícita do
   * Gestor antes de virar referência da Conciliação.
   */
  async function handleValidar() {
    setSalvando(true)
    setErro('')
    try {
      await validarComissaoSugerida(item.id, usuarioId)
      onAtualizado()
    } catch (e) {
      setErro(e.message)
    }
    setSalvando(false)
  }

  async function handleDesvalidar() {
    if (!window.confirm('Desfazer a validação desta competência? Ela volta a poder ser recalculada por "Gerar Sugestões".')) return
    setSalvando(true)
    setErro('')
    try {
      await desvalidarComissaoSugerida(item.id)
      onAtualizado()
    } catch (e) {
      setErro(e.message)
    }
    setSalvando(false)
  }

  const competenciaLabel = new Date(item.competencia_referencia).toLocaleDateString('pt-BR', {
    month: '2-digit',
    year: 'numeric',
    timeZone: 'UTC',
  })

  return (
    <>
      <tr onClick={() => setExpandido(!expandido)} style={{ cursor: 'pointer' }}>
        <td>{competenciaLabel}</td>
        <td>{item.valor_sugerido != null ? formatarMoeda(item.valor_sugerido) : '—'}</td>
        <td>
          {item.ajustado_manualmente && <span className="ls-badge">ajustado</span>}
          {item.status_validacao === 'validado' && (
            <span className="ls-badge" style={{ marginLeft: item.ajustado_manualmente ? '0.3rem' : 0, background: 'var(--ls-success, #2f7a3d)' }}>
              validado
            </span>
          )}
          {!item.ajustado_manualmente && item.status_validacao !== 'validado' && '—'}
        </td>
        <td>{item.status_validacao === 'validado' ? 'Desfazer / detalhes' : 'Validar / ajustar'}</td>
      </tr>
      {expandido && (
        <tr>
          <td colSpan={4}>
            <div className="ls-card" style={{ padding: '0.75rem' }}>
              {erro && <p className="ls-modal-erro">{erro}</p>}

              {item.status_calculo === 'calculada' ? (
                item.regra?.componentes?.length > 0 ? (
                  <>
                    <strong style={{ fontSize: '0.85rem' }}>Regra aplicada</strong>
                    <ul style={{ marginTop: '0.4rem', marginBottom: '0.75rem', fontSize: '0.85rem' }}>
                      {item.regra.componentes
                        .slice()
                        .sort((a, b) => a.ordem - b.ordem)
                        .map((c) => (
                          <li key={c.id}>
                            Mês {c.periodo_inicio}{c.periodo_fim ? `–${c.periodo_fim}` : '+'} — {c.tipo_valor === 'valor_fixo' ? formatarMoeda(c.valor) : `${c.valor}%`}
                            {c.recorrencia_tipo === 'vitalicio' && ' (vitalício)'}
                            {c.recorrencia_tipo === 'recorrente' && ' (recorrente)'}
                          </li>
                        ))}
                    </ul>
                  </>
                ) : (
                  <p className="config-instrucao">
                    Regra aplicada: <strong>{item.regra?.descricao ?? '—'}</strong> —{' '}
                    {item.regra?.modelo_recebimento === 'cascata' ? 'Cascata' : 'Proporcional'}, {item.regra?.percentual}% sobre {rotuloBaseCalculo(item.regra?.base_calculo)}.
                  </p>
                )
              ) : item.status_calculo === 'pendente_parametro' ? (
                item.regra?.base_calculo === 'manual' ? (
                  <p className="config-instrucao">
                    Esta regra usa base de cálculo <strong>Manual</strong> — informe o valor da comissão desta competência no campo "Ajuste manual" abaixo.
                  </p>
                ) : item.regra?.origem_percentual === 'informado_por_apolice' ? (
                  <p className="config-instrucao">
                    Regra encontrada, mas a apólice não tem percentual de comissionamento informado — preencha esse campo na apólice, ou informe manualmente abaixo.
                  </p>
                ) : (
                  <p className="config-instrucao">
                    Regra encontrada ({item.regra?.descricao ?? '—'}), mas a base de cálculo "{rotuloBaseCalculo(item.regra?.base_calculo)}" ainda não é suportada pelo motor automático — informe manualmente abaixo.
                  </p>
                )
              ) : (
                <p className="config-instrucao">Nenhuma regra cadastrada para este produto/seguradora nessa competência.</p>
              )}

              <div className="cotacao-form-linha">
                <div>
                  <strong>Valor calculado{item.ajustado_manualmente ? ' (original)' : ''}:</strong>{' '}
                  {formatarMoeda(item.ajustado_manualmente ? item.valor_calculado_original : item.valor_sugerido)}
                </div>
                {item.ajustado_manualmente && (
                  <div>
                    <strong>Ajustado em:</strong> {item.ajustado_em ? new Date(item.ajustado_em).toLocaleString('pt-BR') : '—'}
                  </div>
                )}
              </div>

              <div className="cotacao-form-linha" style={{ marginTop: '0.5rem' }}>
                <div>
                  <label>Ajuste manual (exceção — não altera a regra)</label>
                  <input type="number" step="0.01" value={novoValor} onChange={(e) => setNovoValor(e.target.value)} placeholder="Novo valor" />
                </div>
                <button className="cliente-tabela-btn" onClick={handleAjustar} disabled={salvando || novoValor === ''}>
                  {salvando ? 'Salvando...' : 'Aplicar Ajuste'}
                </button>
              </div>

              <div className="cotacao-form-linha" style={{ marginTop: '0.75rem', alignItems: 'center' }}>
                {item.status_validacao === 'validado' ? (
                  <>
                    <div>
                      <span className="ls-badge" style={{ background: 'var(--ls-success, #2f7a3d)' }}>Cenário validado</span>{' '}
                      {item.validado_em && (
                        <span style={{ fontSize: '0.8rem' }}>em {new Date(item.validado_em).toLocaleString('pt-BR')}</span>
                      )}
                    </div>
                    <button className="ls-btn ls-btn-ghost" onClick={handleDesvalidar} disabled={salvando}>
                      Desfazer validação
                    </button>
                  </>
                ) : (
                  <>
                    <p className="config-instrucao" style={{ margin: 0 }}>
                      Confirme este valor como o cenário esperado desta competência — ele passa a ser a referência da Conciliação e não é mais recalculado automaticamente.
                    </p>
                    <button className="cliente-tabela-btn" onClick={handleValidar} disabled={salvando}>
                      {salvando ? 'Salvando...' : 'Validar'}
                    </button>
                  </>
                )}
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  )
}

const FAIXAS_LABEL = {
  '0-30': '0–30 dias',
  '31-60': '31–60 dias',
  '61-90': '61–90 dias',
  '90+': 'Acima de 90 dias',
}

function PendenciasTab({ setAbaAtiva }) {
  const [dados, setDados] = useState(null)
  const [carregando, setCarregando] = useState(true)

  useEffect(() => {
    obterCentralPendencias().then((r) => {
      setDados(r)
      setCarregando(false)
    })
  }, [])

  if (carregando) return <p className="cliente-carregando">Carregando pendências...</p>

  const cards = [
    { titulo: 'Recebimentos vencidos', valor: dados.recebimentosVencidos.length, aba: 'contasareceber', critico: dados.recebimentosVencidos.length > 0 },
    { titulo: 'Recebimentos próximos (7 dias)', valor: dados.recebimentosProximos.length, aba: 'contasareceber' },
    { titulo: 'Repasses liberados p/ pagar', valor: dados.repassesPendentesAgora.length, aba: 'repasses' },
    { titulo: 'Repasses aguardando recebimento', valor: dados.repassesAguardando.length, aba: 'repasses' },
    { titulo: 'Lançamentos sem corretor', valor: dados.semCorretor.length },
    { titulo: 'Lançamentos sem seguradora', valor: dados.semSeguradora.length },
    { titulo: 'Seguradoras sem gestor cadastrado', valor: dados.semGestor.length },
  ]

  return (
    <div>
      <div className="kpi-grid">
        {cards.map((c) => (
          <KpiCard
            key={c.titulo}
            label={c.titulo}
            valor={c.valor}
            destacado={c.critico}
            onClick={c.aba ? () => setAbaAtiva(c.aba) : undefined}
          />
        ))}
      </div>

      {dados.semGestor.length > 0 && (
        <div style={{ marginTop: '1rem' }}>
          <h3>Seguradoras sem gestor cadastrado (por módulo)</h3>
          <ul>
            {dados.semGestor.map((g, i) => (
              <li key={i}>{g.nomeOperadora ?? g.operadoraId} — módulo {g.modulo}</li>
            ))}
          </ul>
          <p className="config-instrucao">Cadastre em Configurações → Seguradoras.</p>
        </div>
      )}
    </div>
  )
}

function BuscaGlobalTab() {
  const { perfil } = useAuth()
  const ehMaster = perfil?.papel === 'master'
  const [corretores, setCorretores] = useState([])
  const [seguradoras, setSeguradoras] = useState([])
  const [filtroCorretor, setFiltroCorretor] = useState('')
  const [filtroSeguradora, setFiltroSeguradora] = useState('')
  const [filtroNumeroApolice, setFiltroNumeroApolice] = useState('')
  const [filtroStatus, setFiltroStatus] = useState('')
  const [filtroPeriodoInicio, setFiltroPeriodoInicio] = useState('')
  const [filtroPeriodoFim, setFiltroPeriodoFim] = useState('')
  const [filtroValorMinimo, setFiltroValorMinimo] = useState('')
  const [filtroValorMaximo, setFiltroValorMaximo] = useState('')
  const [resultados, setResultados] = useState(null)
  const [buscando, setBuscando] = useState(false)
  const [excluindo, setExcluindo] = useState(null)
  const [erroExclusao, setErroExclusao] = useState('')

  useEffect(() => {
    listarCorretores().then(setCorretores)
    listarCatalogoSeguradoras().then(setSeguradoras)
  }, [])

  async function handleBuscar() {
    setBuscando(true)
    try {
      const r = await buscarComissoesGlobal({
        corretorId: filtroCorretor || undefined,
        operadoraId: filtroSeguradora || undefined,
        numeroApolice: filtroNumeroApolice || undefined,
        statusRecebimento: filtroStatus || undefined,
        periodoInicio: filtroPeriodoInicio || undefined,
        periodoFim: filtroPeriodoFim || undefined,
        valorMinimo: filtroValorMinimo || undefined,
        valorMaximo: filtroValorMaximo || undefined,
      })
      setResultados(r)
    } finally {
      setBuscando(false)
    }
  }

  /**
   * Master-only (Bloco B — extensão, aprovado pelo Chief). Corrige
   * lançamento de comissão errado do corretor, ou limpa resíduo do
   * gatilho automático legado. A trava real (nunca apagar comissão
   * vinculada a recebimento conciliado) está no service, não aqui —
   * esta função só decide QUEM pode chamar o botão, não SE é seguro
   * apagar.
   */
  async function handleExcluirComissao(id) {
    if (!window.confirm('Excluir este lançamento de comissão? Isso não afeta a Venda nem a apólice — só remove este registro do ledger.')) return
    setExcluindo(id)
    setErroExclusao('')
    try {
      await excluirComissao(id)
      setResultados((atual) => atual.filter((r) => r.id !== id))
    } catch (err) {
      setErroExclusao(err.message)
    } finally {
      setExcluindo(null)
    }
  }

  return (
    <div>
      <div className="ls-card" style={{ marginBottom: '1rem' }}>
        <div className="cotacao-form-linha">
          <div>
            <label>Corretor</label>
            <select value={filtroCorretor} onChange={(e) => setFiltroCorretor(e.target.value)}>
              <option value="">Todos</option>
              {corretores.map((c) => <option key={c.id} value={c.id}>{c.nome_completo}</option>)}
            </select>
          </div>
          <div>
            <label>Seguradora</label>
            <select value={filtroSeguradora} onChange={(e) => setFiltroSeguradora(e.target.value)}>
              <option value="">Todas</option>
              {seguradoras.map((s) => <option key={s.id} value={s.id}>{s.nome}</option>)}
            </select>
          </div>
          <div>
            <label>Nº da Apólice</label>
            <input value={filtroNumeroApolice} onChange={(e) => setFiltroNumeroApolice(e.target.value)} />
          </div>
        </div>
        <div className="cotacao-form-linha">
          <div>
            <label>Status recebimento</label>
            <select value={filtroStatus} onChange={(e) => setFiltroStatus(e.target.value)}>
              <option value="">Todos</option>
              {STATUS_RECEBIMENTO.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
            </select>
          </div>
          <div>
            <label>Valor mínimo</label>
            <input type="number" value={filtroValorMinimo} onChange={(e) => setFiltroValorMinimo(e.target.value)} />
          </div>
          <div>
            <label>Valor máximo</label>
            <input type="number" value={filtroValorMaximo} onChange={(e) => setFiltroValorMaximo(e.target.value)} />
          </div>
        </div>
        <div className="cotacao-form-linha">
          <div>
            <label>Período — de</label>
            <input type="date" value={filtroPeriodoInicio} onChange={(e) => setFiltroPeriodoInicio(e.target.value)} />
          </div>
          <div>
            <label>Período — até</label>
            <input type="date" value={filtroPeriodoFim} onChange={(e) => setFiltroPeriodoFim(e.target.value)} />
          </div>
        </div>
        <button className="ls-btn ls-btn-primary" onClick={handleBuscar} disabled={buscando} style={{ marginTop: '0.5rem' }}>
          {buscando ? 'Buscando...' : 'Buscar'}
        </button>
      </div>

      {erroExclusao && <p className="ls-modal-erro">{erroExclusao}</p>}

      {resultados && (
        resultados.length === 0 ? (
          <p className="cliente-vazio">Nenhum resultado encontrado.</p>
        ) : (
          <table className="cliente-tabela">
            <thead>
              <tr>
                <th>Seguradora</th><th>Módulo</th><th>Valor</th><th>Status</th><th>Data</th>
                {ehMaster && <th>Ação</th>}
              </tr>
            </thead>
            <tbody>
              {resultados.map((r) => (
                <tr key={r.id}>
                  <td>{r.operadora?.nome ?? '—'}</td>
                  <td>{MODULOS.find((m) => m.id === r.modulo)?.label || r.modulo}</td>
                  <td>{formatarMoeda(r.valor_comissao)}</td>
                  <td><span className="ls-badge">{r.status_recebimento}</span></td>
                  <td>{new Date(r.created_at).toLocaleDateString('pt-BR')}</td>
                  {ehMaster && (
                    <td>
                      <button
                        className="ls-btn ls-btn-ghost"
                        style={{ color: 'var(--ls-danger, #d33)', fontSize: '0.8rem' }}
                        onClick={() => handleExcluirComissao(r.id)}
                        disabled={excluindo === r.id}
                      >
                        {excluindo === r.id ? 'Excluindo...' : 'Excluir'}
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )
      )}
    </div>
  )
}

/**
 * Etapa 3 do DOC-COM-001.1 — primeira entrega funcional, deliberadamente
 * mínima: Upload → Storage (bucket 'anexos', já existente) → cria o
 * lote → mostra que foi recebido. Nada de extração/normalização/prévia
 * ainda — vem em etapa própria, testada separadamente.
 */
function RecebimentosTab() {
  const { user, perfil } = useAuth()
  const [lotes, setLotes] = useState([])
  const [seguradoras, setSeguradoras] = useState([])
  const [carregando, setCarregando] = useState(true)
  const [arquivo, setArquivo] = useState(null)
  const [enviando, setEnviando] = useState(false)
  const [chaveInput, setChaveInput] = useState(0)
  const [erro, setErro] = useState('')
  const [sucesso, setSucesso] = useState('')

  useEffect(() => {
    carregar()
    listarSeguradorasCatalogo().then(setSeguradoras)
  }, [])

  async function carregar() {
    setCarregando(true)
    try {
      setLotes(await listarLotesImportacao())
    } catch (e) {
      setErro(e.message)
    }
    setCarregando(false)
  }

  async function handleUpload() {
    if (!arquivo) return
    setEnviando(true)
    setErro('')
    setSucesso('')
    try {
      const lote = await uploadLoteImportacao({ file: arquivo, enviadoPor: user?.id })
      setSucesso(`"${lote.nome_arquivo_original}" recebido e processado.`)
      setArquivo(null)
      setChaveInput((k) => k + 1)
      await carregar()
    } catch (e) {
      setErro(e.message)
    }
    setEnviando(false)
  }

  return (
    <div>
      <div className="ls-card" style={{ padding: '1rem', marginBottom: '1.5rem' }}>
        <h4 style={{ marginTop: 0 }}>Enviar Relatório Real</h4>
        <p className="config-instrucao">PDF, Excel, CSV ou TXT. O processamento roda automaticamente após o envio — a prévia fica pronta pra conferência em seguida.</p>

        {erro && <p className="ls-modal-erro">{erro}</p>}
        {sucesso && <p className="config-sucesso">{sucesso}</p>}

        <div className="cotacao-form-linha" style={{ alignItems: 'center' }}>
          <input key={chaveInput} type="file" accept=".pdf,.xlsx,.xls,.csv,.txt" onChange={(e) => setArquivo(e.target.files?.[0] ?? null)} />
          <button className="ls-btn ls-btn-primary" onClick={handleUpload} disabled={!arquivo || enviando}>
            {enviando ? 'Enviando e processando...' : 'Enviar'}
          </button>
        </div>
      </div>

      <h4>Lotes Recebidos</h4>
      {carregando ? (
        <p className="cliente-carregando">Carregando...</p>
      ) : lotes.length === 0 ? (
        <p className="cliente-vazio">Nenhum relatório enviado ainda.</p>
      ) : (
        <table className="cliente-tabela">
          <thead>
            <tr><th>Arquivo</th><th>Tipo</th><th>Enviado em</th><th>Status</th><th>Confiança</th><th></th></tr>
          </thead>
          <tbody>
            {lotes.map((l) => (
              <LinhaLote key={l.id} lote={l} usuarioId={user?.id} ehMaster={perfil?.papel === 'master'} seguradoras={seguradoras} onAtualizado={carregar} />
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

function LinhaLote({ lote, usuarioId, ehMaster, seguradoras, onAtualizado }) {
  const [expandido, setExpandido] = useState(false)
  const [eventos, setEventos] = useState(null)
  const [carregandoEventos, setCarregandoEventos] = useState(false)
  const [confirmando, setConfirmando] = useState(false)
  const [excluindo, setExcluindo] = useState(false)
  const [reprocessando, setReprocessando] = useState(false)
  const [atribuindo, setAtribuindo] = useState(false)
  const [seguradoraEscolhida, setSeguradoraEscolhida] = useState('')
  const [erroConfirmacao, setErroConfirmacao] = useState('')

  const temPrevia = lote.status !== 'recebido'
  const corConfianca = { alta: '#2f7a3d', revisao: '#b8860b', bloqueado: '#b23b3b' }[lote.nivel_confianca]
  const semSeguradora = temPrevia && !lote.seguradora_id

  async function handleVerPrevia() {
    if (!expandido && eventos === null) {
      setCarregandoEventos(true)
      setEventos(await listarEventosPorLote(lote.id))
      setCarregandoEventos(false)
    }
    setExpandido(!expandido)
  }

  async function handleConfirmarFormato() {
    setConfirmando(true)
    setErroConfirmacao('')
    try {
      await confirmarFormatoHomologado(lote.id, usuarioId)
      onAtualizado()
    } catch (e) {
      setErroConfirmacao(e.message)
    }
    setConfirmando(false)
  }

  async function handleAtribuirSeguradora() {
    if (!seguradoraEscolhida) return
    setAtribuindo(true)
    setErroConfirmacao('')
    try {
      await atribuirSeguradoraEReprocessar(lote.id, seguradoraEscolhida)
      setEventos(null)
      onAtualizado()
    } catch (e) {
      setErroConfirmacao(e.message)
    }
    setAtribuindo(false)
  }

  async function handleReprocessar() {
    setReprocessando(true)
    setErroConfirmacao('')
    try {
      await reprocessarLote(lote.id)
      setEventos(null)
      onAtualizado()
    } catch (e) {
      setErroConfirmacao(e.message)
    }
    setReprocessando(false)
  }

  async function handleExcluir() {
    if (!window.confirm(`Excluir "${lote.nome_arquivo_original}"? Isso remove o arquivo e todos os eventos extraídos dele. Não pode ser desfeito.`)) return
    setExcluindo(true)
    try {
      await excluirLote(lote.id)
      onAtualizado()
    } catch (e) {
      alert(`Erro ao excluir: ${e.message}`)
      setExcluindo(false)
    }
  }

  return (
    <>
      <tr>
        <td>{lote.nome_arquivo_original}</td>
        <td>{lote.tipo_documento}</td>
        <td>{new Date(lote.enviado_em).toLocaleString('pt-BR')}</td>
        <td><span className="ls-badge">{lote.status}</span></td>
        <td>
          {lote.nivel_confianca && (
            <span className="ls-badge" style={{ background: corConfianca, color: '#fff' }}>
              {lote.nivel_confianca === 'alta' ? '🟢 alta' : lote.nivel_confianca === 'revisao' ? '🟡 revisão' : '🔴 bloqueado'}
            </span>
          )}
        </td>
        <td style={{ whiteSpace: 'nowrap' }}>
          {lote.status === 'recebido' && (
            <button className="cliente-tabela-btn" onClick={handleReprocessar} disabled={reprocessando}>
              {reprocessando ? 'Processando...' : 'Processar'}
            </button>
          )}
          {temPrevia && (
            <button className="cliente-tabela-btn" onClick={handleVerPrevia} style={{ marginLeft: '0.4rem' }}>
              {expandido ? 'Fechar' : 'Ver Prévia'}
            </button>
          )}
          {ehMaster && (
            <button className="cliente-tabela-btn cliente-tabela-btn-perigo" onClick={handleExcluir} disabled={excluindo} style={{ marginLeft: '0.4rem' }}>
              {excluindo ? 'Excluindo...' : 'Excluir'}
            </button>
          )}
        </td>
      </tr>
      {expandido && (
        <tr>
          <td colSpan={6}>
            <div className="ls-card" style={{ padding: '0.75rem' }}>
              <div className="cotacao-form-linha" style={{ marginBottom: '0.5rem' }}>
                <div><strong>Seguradora:</strong> {seguradoras?.find((s) => s.id === lote.seguradora_id)?.nome ?? '—'}</div>
                <div><strong>Competência informada:</strong> {lote.competencia_informada ? new Date(lote.competencia_informada).toLocaleDateString('pt-BR', { month: '2-digit', year: 'numeric', timeZone: 'UTC' }) : '—'}</div>
                <div><strong>Total bruto extraído:</strong> {lote.valor_bruto_total_extraido != null ? formatarMoeda(lote.valor_bruto_total_extraido) : '—'}</div>
                <div><strong>Linhas extraídas:</strong> {lote.quantidade_linhas_extraidas ?? '—'}</div>
              </div>

              {lote.motivo_confianca && (
                <p className="config-instrucao" style={{ marginBottom: '0.75rem' }}><strong>Motivo:</strong> {lote.motivo_confianca}</p>
              )}

              {erroConfirmacao && <p className="ls-modal-erro">{erroConfirmacao}</p>}

              {semSeguradora && (
                <div className="ls-card" style={{ padding: '0.75rem', marginBottom: '0.75rem', borderColor: '#b23b3b' }}>
                  <p style={{ color: '#b23b3b', marginTop: 0 }}>
                    <strong>Seguradora não identificada</strong> — obrigatório atribuir antes de confirmar, pra garantir a veracidade do relatório.
                  </p>
                  <div className="cotacao-form-linha">
                    <select value={seguradoraEscolhida} onChange={(e) => setSeguradoraEscolhida(e.target.value)}>
                      <option value="">Selecione a seguradora...</option>
                      {seguradoras?.map((s) => <option key={s.id} value={s.id}>{s.nome}</option>)}
                    </select>
                    <button className="cliente-tabela-btn" onClick={handleAtribuirSeguradora} disabled={!seguradoraEscolhida || atribuindo}>
                      {atribuindo ? 'Atribuindo e reprocessando...' : 'Atribuir Seguradora'}
                    </button>
                  </div>
                </div>
              )}

              {carregandoEventos ? (
                <p className="cliente-carregando">Carregando prévia...</p>
              ) : !eventos?.length ? (
                <p className="cliente-vazio">Nenhum evento normalizado encontrado pra este lote.</p>
              ) : (
                <table className="cliente-tabela">
                  <thead>
                    <tr>
                      <th>Apólice</th><th>Recibo</th><th>Parcela</th><th>Data</th><th>Valor</th><th>Classificação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {eventos.map((e) => (
                      <tr key={e.id}>
                        <td>{e.numero_apolice_informado ?? '—'}</td>
                        <td>{e.numero_recibo_informado ?? '—'}</td>
                        <td>{e.numero_parcela_informado ?? '—'}</td>
                        <td>{e.data_evento ? formatarDataBR(e.data_evento) : '—'}</td>
                        <td style={e.valor_bruto < 0 ? { color: '#b23b3b' } : {}}>{formatarMoeda(e.valor_bruto)}</td>
                        <td><span className="ls-badge">{e.classificacao}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              {lote.status === 'revisao_necessaria' && !semSeguradora && (
                <div style={{ marginTop: '0.75rem' }}>
                  <button className="ls-btn ls-btn-primary" onClick={handleConfirmarFormato} disabled={confirmando}>
                    {confirmando ? 'Confirmando...' : 'Confirmar formato e memorizar'}
                  </button>
                  <p className="config-instrucao" style={{ marginTop: '0.4rem' }}>
                    Confirma que a interpretação acima está correta. Os próximos relatórios com esse mesmo formato serão processados automaticamente, sem passar por revisão de novo.
                  </p>
                </div>
              )}

              <p className="config-instrucao" style={{ marginTop: '0.5rem' }}>
                Isto é uma prévia — nenhum destes eventos virou recebimento financeiro ainda.
              </p>
            </div>
          </td>
        </tr>
      )}
    </>
  )
}

function RepassesTab() {
  const { user } = useAuth()
  const [linhas, setLinhas] = useState(null)
  const [corretores, setCorretores] = useState([])
  const [filtroFaixa, setFiltroFaixa] = useState('')
  const [carregando, setCarregando] = useState(true)
  const [aguardandoDistribuicao, setAguardandoDistribuicao] = useState([])

  useEffect(() => {
    carregar()
    carregarAguardandoDistribuicao()
  }, [])

  async function carregarAguardandoDistribuicao() {
    try {
      const dados = await listarRecebimentosConciliadosAguardandoDistribuicao()
      setAguardandoDistribuicao(dados)
    } catch (e) {
      // silencioso — não é crítico pro resto da tela funcionar
    }
  }

  function handleDistribuidoNestaTab(recebimentoId) {
    setAguardandoDistribuicao((atual) => atual.filter((r) => r.id !== recebimentoId))
    carregar() // repasses recém-gerados já aparecem na lista principal
  }

  async function carregar() {
    setCarregando(true)
    const [r, listaCorretores] = await Promise.all([listarRepassesAPagar(), listarCorretores()])
    setLinhas(r)
    setCorretores(listaCorretores)
    setCarregando(false)
  }

  if (carregando) return <p className="cliente-carregando">Carregando repasses...</p>

  const nomesPorId = Object.fromEntries(corretores.map((c) => [c.id, c.nome_completo]))
  const acionaveis = linhas.filter((l) => !l.aguardandoRecebimento)
  const aguardando = linhas.filter((l) => l.aguardandoRecebimento)
  const resumo = resumirPorFaixaAtraso(acionaveis, 'valor_repasse_corretor')
  const linhasFiltradas = filtroFaixa ? acionaveis.filter((l) => l.faixaAtraso === filtroFaixa) : acionaveis

  return (
    <div>

      {aguardandoDistribuicao.length > 0 && (
        <>
          <h3 style={{ marginTop: 0 }}>Recebimentos conciliados, aguardando composição/distribuição</h3>
          {aguardandoDistribuicao.map((r) => (
            <LinhaAguardandoDistribuicao
              key={r.id}
              recebimento={r}
              venda={r.venda}
              corretores={corretores}
              usuarioId={user?.id}
              onDistribuido={handleDistribuidoNestaTab}
            />
          ))}
        </>
      )}

      <div className="kpi-grid">
        {Object.entries(resumo.porFaixa).map(([faixa, dados]) => (
          <KpiCard
            key={faixa}
            label={FAIXAS_LABEL[faixa]}
            valor={formatarMoeda(dados.total)}
            trendTexto={`${dados.quantidade} repasse(s)`}
            trendTipo={faixa !== '0-30' ? 'negativo' : 'neutro'}
            destacado={filtroFaixa === faixa}
            onClick={() => setFiltroFaixa(filtroFaixa === faixa ? '' : faixa)}
          />
        ))}
      </div>

      {linhasFiltradas.length === 0 ? (
        <p className="cliente-vazio">Nenhum repasse liberado pra pagamento {filtroFaixa ? 'nessa faixa' : ''}.</p>
      ) : (
        <table className="cliente-tabela">
          <thead>
            <tr><th>Corretor</th><th>Seguradora</th><th>Módulo</th><th>Valor</th><th>Recebido em</th><th>Situação</th><th>Ações</th></tr>
          </thead>
          <tbody>
            {linhasFiltradas.map((l) => (
              <LinhaRepasse key={l.id} linha={l} nomeCorretor={nomesPorId[l.corretor_id]} onAtualizado={carregar} />
            ))}
          </tbody>
        </table>
      )}

      {aguardando.length > 0 && (
        <>
          <h3 className="secao-titulo">Aguardando recebimento da seguradora ({aguardando.length})</h3>
          <table className="cliente-tabela">
            <thead>
              <tr><th>Corretor</th><th>Seguradora</th><th>Módulo</th><th>Valor</th></tr>
            </thead>
            <tbody>
              {aguardando.map((l) => (
                <tr key={l.id}>
                  <td>{nomesPorId[l.corretor_id] ?? '—'}</td>
                  <td>{l.operadora?.nome ?? '—'}</td>
                  <td>{MODULOS.find((m) => m.id === l.modulo)?.label || l.modulo}</td>
                  <td>{formatarMoeda(l.valor_repasse_corretor)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  )
}

/**
 * Recebimento já conciliado (Peça 3), aguardando virar repasse de
 * verdade (Etapa 4, Peça 6).
 *
 * CORREÇÃO (achado do Raphael, teste real 15/08): antes, se a
 * composição não existisse por qualquer motivo (ex: auto-preenchimento
 * na criação da venda falhou por login trocado no momento de fechar a
 * apólice), a tela já mostrava o formulário manual aberto, pedindo
 * digitação — mesmo quando o corretor JÁ tinha % padrão cadastrado.
 * Agora, antes de mostrar qualquer formulário, tenta de novo o
 * caminho automático (mesma função usada na criação da venda,
 * idempotente — não duplica nada). Só mostra "Adicionar Participantes"
 * — um botão discreto, fechado por padrão — quando realmente não
 * existe % cadastrado pra esse corretor nesse módulo. O caminho
 * primário é sempre o automático; o manual é exceção de verdade.
 */
function LinhaAguardandoDistribuicao({ recebimento, venda, corretores, usuarioId, onDistribuido }) {
  const { perfil } = useAuth()
  const ehMaster = perfil?.papel === 'master'
  const [temComposicao, setTemComposicao] = useState(null)
  const [mostrarManual, setMostrarManual] = useState(false)
  const [participantes, setParticipantes] = useState([{ tipo: 'corretor', corretorId: '', percentual: '' }])
  const [salvandoComposicao, setSalvandoComposicao] = useState(false)
  const [distribuindo, setDistribuindo] = useState(false)
  const [excluindoVenda, setExcluindoVenda] = useState(false)
  const [erro, setErro] = useState('')

  async function handleExcluirVenda() {
    if (!window.confirm('Excluir PERMANENTEMENTE esta venda e todo o histórico financeiro dela? A apólice continua existindo. Não é reversível.')) return
    setExcluindoVenda(true)
    try {
      await excluirVendaEHistoricoForcado(venda.id, usuarioId)
      onDistribuido(recebimento.id, [])
    } catch (e) {
      setErro(e.message)
    }
    setExcluindoVenda(false)
  }

  useEffect(() => {
    if (!venda?.id) return
    verificarOuAutoAplicar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [venda?.id])

  async function verificarOuAutoAplicar() {
    setErro('')
    try {
      const jaTem = await vendaTemComposicao(venda.id)
      if (jaTem) {
        setTemComposicao(true)
        return
      }
      // Reaplica o caminho automático (idempotente) antes de admitir
      // que precisa de digitação manual.
      const resultado = await criarComposicaoAutomaticaSeElegivel({
        vendaId: venda.id,
        corretorId: venda.apolice?.corretor_id ?? null,
        modulo: venda.modulo,
      })
      setTemComposicao(Boolean(resultado.criada))
    } catch (e) {
      setErro(e.message)
    }
  }

  const somaPercentual = participantes.reduce((soma, p) => soma + (Number(p.percentual) || 0), 0)

  function atualizarParticipante(index, campo, valor) {
    setParticipantes((atual) => atual.map((p, i) => (i === index ? { ...p, [campo]: valor } : p)))
  }

  function adicionarParticipante(tipo) {
    setParticipantes((atual) => [...atual, { tipo, corretorId: '', percentual: '' }])
  }

  function removerParticipante(index) {
    setParticipantes((atual) => (atual.length > 1 ? atual.filter((_, i) => i !== index) : atual))
  }

  async function handleConfirmarComposicao() {
    setSalvandoComposicao(true)
    setErro('')
    try {
      await definirComposicaoManual({
        vendaId: venda.id,
        participantes: participantes.map((p) => ({
          tipo: p.tipo,
          corretorId: p.tipo === 'corretor' ? p.corretorId : undefined,
          percentual: Number(p.percentual),
        })),
      })
      setTemComposicao(true)
      setMostrarManual(false)
    } catch (e) {
      setErro(e.message)
    }
    setSalvandoComposicao(false)
  }

  async function handleDistribuir() {
    setDistribuindo(true)
    setErro('')
    try {
      await distribuirRecebimento(recebimento.id, usuarioId)
      onDistribuido(recebimento.id)
    } catch (e) {
      setErro(e.message)
    }
    setDistribuindo(false)
  }

  return (
    <div className="ls-card" style={{ padding: '0.75rem', marginBottom: '0.75rem' }}>
      <div><strong>Recebimento</strong> {recebimento.id} → <strong>Venda</strong> {venda?.id ?? '—'}</div>
      <div>Líquido: {formatarMoeda(recebimento.valor_liquido)}</div>

      {erro && <p className="ls-modal-erro">{erro}</p>}

      {ehMaster && (
        <button
          className="cliente-tabela-btn cliente-tabela-btn-perigo"
          style={{ fontSize: '0.8rem', marginBottom: '0.5rem' }}
          onClick={handleExcluirVenda}
          disabled={excluindoVenda}
        >
          {excluindoVenda ? 'Excluindo...' : '🗑️ Excluir venda (Master)'}
        </button>
      )}

      {temComposicao === null ? (
        <p style={{ fontSize: '0.8rem' }}>Verificando composição...</p>
      ) : temComposicao ? (
        <button className="cliente-tabela-btn" onClick={handleDistribuir} disabled={distribuindo} style={{ marginTop: '0.5rem' }}>
          {distribuindo ? 'Distribuindo...' : 'Distribuir'}
        </button>
      ) : !mostrarManual ? (
        <div style={{ marginTop: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
          <span style={{ fontSize: '0.8rem', opacity: 0.85 }}>Corretor sem % padrão cadastrado para este módulo.</span>
          <button className="ls-btn ls-btn-ghost" onClick={() => setMostrarManual(true)}>
            Adicionar Participantes e Redistribuir
          </button>
        </div>
      ) : (
        <div style={{ marginTop: '0.5rem' }}>
          {participantes.map((p, i) => (
            <div className="cotacao-form-linha" key={i} style={{ alignItems: 'flex-end', marginBottom: '0.4rem' }}>
              <div>
                <label>Tipo</label>
                <select value={p.tipo} onChange={(e) => atualizarParticipante(i, 'tipo', e.target.value)}>
                  <option value="corretor">Corretor</option>
                  <option value="lifitseg">LifitSeg</option>
                </select>
              </div>
              {p.tipo === 'corretor' && (
                <div>
                  <label>Corretor</label>
                  <select value={p.corretorId} onChange={(e) => atualizarParticipante(i, 'corretorId', e.target.value)}>
                    <option value="">Selecione</option>
                    {corretores.map((c) => <option key={c.id} value={c.id}>{c.nome_completo}</option>)}
                  </select>
                </div>
              )}
              <div>
                <label>Percentual</label>
                <input type="number" step="0.01" value={p.percentual} onChange={(e) => atualizarParticipante(i, 'percentual', e.target.value)} style={{ width: '80px' }} />
              </div>
              {participantes.length > 1 && (
                <button className="ls-btn ls-btn-ghost" onClick={() => removerParticipante(i)}>Remover</button>
              )}
            </div>
          ))}
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginTop: '0.4rem' }}>
            <button className="ls-btn ls-btn-ghost" onClick={() => adicionarParticipante('corretor')}>+ Corretor</button>
            <button className="ls-btn ls-btn-ghost" onClick={() => adicionarParticipante('lifitseg')}>+ LifitSeg</button>
            <span style={{ fontSize: '0.85rem' }}>
              Soma: <strong style={{ color: Math.abs(somaPercentual - 100) < 0.01 ? 'var(--ls-success, #2f7a3d)' : 'var(--ls-danger, #b23b3b)' }}>{somaPercentual.toFixed(2)}%</strong>
            </span>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
            <button
              className="cliente-tabela-btn"
              onClick={handleConfirmarComposicao}
              disabled={salvandoComposicao || Math.abs(somaPercentual - 100) > 0.01}
            >
              {salvandoComposicao ? 'Salvando...' : 'Confirmar Composição'}
            </button>
            <button className="ls-btn ls-btn-ghost" onClick={() => setMostrarManual(false)}>Cancelar</button>
          </div>
        </div>
      )}
    </div>
  )
}

function LinhaRepasse({ linha, nomeCorretor, onAtualizado }) {
  const { perfil, user } = useAuth()
  const ehMaster = perfil?.papel === 'master'
  const [excluindoVenda, setExcluindoVenda] = useState(false)

  async function handleMarcarPago() {
    await marcarRepasseComoPago(linha.id)
    onAtualizado()
  }

  async function handleExcluirVenda() {
    if (!linha.venda_id) {
      window.alert('Este repasse não tem venda_id vinculado — não é possível excluir por aqui.')
      return
    }
    if (!window.confirm('Excluir PERMANENTEMENTE a venda e todo o histórico financeiro dela (inclui este repasse já calculado)? A apólice continua existindo. Não é reversível.')) return
    setExcluindoVenda(true)
    try {
      await excluirVendaEHistoricoForcado(linha.venda_id, user?.id)
      onAtualizado()
    } catch (e) {
      window.alert(e.message)
    }
    setExcluindoVenda(false)
  }

  return (
    <tr>
      <td>{nomeCorretor ?? '—'}</td>
      <td>{linha.operadora?.nome || '—'}</td>
      <td>{MODULOS.find((m) => m.id === linha.modulo)?.label || linha.modulo}</td>
      <td>{formatarMoeda(linha.valor_repasse_corretor)}</td>
      <td>{linha.data_recebimento ? formatarDataBR(linha.data_recebimento) : '—'}</td>
      <td>
        {linha.faixaAtraso ? (
          <span className="ls-badge" style={{ background: '#f5d9d9', color: '#b23b3b' }}>
            {linha.diasDesdeRecebimento}d esperando
          </span>
        ) : (
          <span className="ls-badge">Recente</span>
        )}
      </td>
      <td className="cliente-tabela-acoes">
        <button className="cliente-tabela-btn" onClick={handleMarcarPago}>Marcar repasse pago</button>
        {ehMaster && (
          <button className="cliente-tabela-btn cliente-tabela-btn-perigo" onClick={handleExcluirVenda} disabled={excluindoVenda}>
            {excluindoVenda ? 'Excluindo...' : '🗑️ Excluir (Master)'}
          </button>
        )}
      </td>
    </tr>
  )
}

/**
 * FASE 3.1 — Conciliação migrada pro motor real (comissionamentoService.js).
 *
 * Deixou de ser uma comparação agregada de previsto x recebido (o
 * modelo antigo, descartado — "PREVISÃO NÃO É FATO FINANCEIRO") e
 * passou a ser uma fila de ação: cada recebimento 'importado' é
 * vinculado individualmente a uma Venda via conciliarRecebimento().
 *
 * O botão "Distribuir" em "Conciliados nesta sessão" é temporário:
 * chama distribuirRecebimento() (3ª função do motor, já homologada)
 * só pra permitir o teste ponta a ponta antes da Fase 3.2 (Comissões)
 * existir como aba própria. Nenhuma lógica nova — só está exposta aqui
 * provisoriamente.
 */
function ConciliacaoTab() {
  const { user } = useAuth()
  const [fila, setFila] = useState(null)
  const [carregando, setCarregando] = useState(true)
  const [recemConciliados, setRecemConciliados] = useState([])
  const [fechamentosAgregados, setFechamentosAgregados] = useState([])
  const [erro, setErro] = useState('')
  const [seguradoras, setSeguradoras] = useState([])
  const [mostrarFormLancamento, setMostrarFormLancamento] = useState(false)

  useEffect(() => {
    carregarFila()
    carregarConciliadosAguardandoDistribuicao()
    carregarFechamentosAgregados()
    listarCatalogoSeguradoras().then(setSeguradoras)
  }, [])

  async function carregarFila() {
    setCarregando(true)
    setErro('')
    try {
      const dados = await listarRecebimentosPendentesConciliacao()
      setFila(dados)
    } catch (e) {
      setErro(e.message)
    }
    setCarregando(false)
  }

  /**
   * CORREÇÃO (item 3, achado do Raphael 15/08): "Conciliados nesta
   * sessão" antes só existia em memória — atualizar a página perdia a
   * lista inteira, mesmo o dado estando salvo certo no banco. Agora
   * carrega do banco (`recebimentos_comissao` com status='conciliado',
   * ainda não distribuído) assim que a tela abre.
   */
  async function carregarConciliadosAguardandoDistribuicao() {
    try {
      const dados = await listarRecebimentosConciliadosAguardandoDistribuicao()
      setRecemConciliados(dados.map((r) => ({ recebimento: r, venda: r.venda, distribuido: false, linhas: null })))
    } catch (e) {
      setErro(e.message)
    }
  }

  function handleConciliado(recebimento, venda) {
    setFila((atual) => atual.filter((r) => r.id !== recebimento.id))
    setRecemConciliados((atual) => [...atual, { recebimento, venda, distribuido: false, linhas: null }])
  }

  /**
   * CONCILIAÇÃO AGREGADA (Etapa 4, Peça 4). Sai da fila igual à
   * individual, mas vai pra uma lista própria — não tem "Distribuir"
   * (não existe venda pra distribuir pra ninguém), só confronto.
   */
  async function carregarFechamentosAgregados() {
    try {
      const dados = await listarFechamentosAgregados()
      setFechamentosAgregados(dados)
    } catch (e) {
      setErro(e.message)
    }
  }

  function handleConciliadoAgregado(recebimento) {
    setFila((atual) => atual.filter((r) => r.id !== recebimento.id))
    carregarFechamentosAgregados()
  }

  function handleDistribuido(recebimentoId, linhas) {
    // Distribuído sai da lista de "aguardando distribuição" — já
    // cumpriu seu papel aqui, o resultado fica visível em Repasses.
    setRecemConciliados((atual) => atual.filter((item) => item.recebimento.id !== recebimentoId))
  }

  function handleRecebimentoLancado(novoRecebimento) {
    setFila((atual) => [...(atual ?? []), novoRecebimento])
    setMostrarFormLancamento(false)
  }

  if (carregando) return <p className="cliente-carregando">Carregando fila de conciliação...</p>

  return (
    <div>
      {erro && <p className="cliente-vazio" style={{ color: '#b23b3b' }}>{erro}</p>}

      <div style={{ marginBottom: '1rem' }}>
        <button className="cliente-tabela-btn" onClick={() => setMostrarFormLancamento(!mostrarFormLancamento)}>
          {mostrarFormLancamento ? 'Fechar formulário' : '+ Lançar Recebimento'}
        </button>
      </div>

      {mostrarFormLancamento && (
        <FormLancarRecebimento
          seguradoras={seguradoras}
          usuarioId={user?.id}
          onSalvo={handleRecebimentoLancado}
          onCancelar={() => setMostrarFormLancamento(false)}
        />
      )}

      <h3 style={{ marginTop: 0 }}>Aguardando conciliação</h3>
      {fila.length === 0 ? (
        <p className="cliente-vazio">Nenhum recebimento aguardando conciliação.</p>
      ) : (
        fila.map((recebimento) => (
          <LinhaRecebimentoPendente
            key={recebimento.id}
            recebimento={recebimento}
            usuarioId={user?.id}
            seguradoras={seguradoras}
            onConciliado={handleConciliado}
            onConciliadoAgregado={handleConciliadoAgregado}
          />
        ))
      )}

      {recemConciliados.length > 0 && (
        <>
          <h3>Conciliados, aguardando distribuição</h3>
          {recemConciliados.map((item) => (
            <LinhaRecemConciliada
              key={item.recebimento.id}
              item={item}
              usuarioId={user?.id}
              onDistribuido={handleDistribuido}
            />
          ))}
        </>
      )}

      {fechamentosAgregados.length > 0 && (
        <>
          <h3>Fechamentos Agregados (Nível B — sem apólice identificável)</h3>
          {fechamentosAgregados.map((recebimento) => (
            <LinhaFechamentoAgregado
              key={recebimento.id}
              recebimento={recebimento}
              onExcluido={(id) => setFechamentosAgregados((atual) => atual.filter((r) => r.id !== id))}
            />
          ))}
        </>
      )}
    </div>
  )
}

/**
 * FASE 3.1 (adição autorizada após teste real revelar a lacuna) —
 * formulário mínimo para lancarComissaoRecebida(), a 1ª função do
 * motor. Sem ela, a fila de Conciliação nunca recebe nada — "lançar
 * apólice" nunca gera recebimento, só a operadora informando um
 * pagamento real gera. Nenhuma lógica nova: só coleta os campos que a
 * função já exige e chama o motor.
 */
function FormLancarRecebimento({ seguradoras, usuarioId, onSalvo, onCancelar }) {
  const [operadoraId, setOperadoraId] = useState('')
  const [numeroApoliceInformado, setNumeroApoliceInformado] = useState('')
  const [seguradoInformado, setSeguradoInformado] = useState('')
  const [dataRecebimento, setDataRecebimento] = useState('')
  const [competenciaReferencia, setCompetenciaReferencia] = useState('')
  const [valorBruto, setValorBruto] = useState('')
  const [valorDescontos, setValorDescontos] = useState('')
  const [documentoOrigem, setDocumentoOrigem] = useState('')
  const [tipoRecebimento, setTipoRecebimento] = useState('')
  const [observacoes, setObservacoes] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')

  async function handleSalvar() {
    setErro('')
    setSalvando(true)
    try {
      const novoRecebimento = await lancarComissaoRecebida({
        operadoraId: operadoraId || null,
        numeroApoliceInformado,
        seguradoInformado,
        dataRecebimento,
        competenciaReferencia: competenciaReferencia ? `${competenciaReferencia}-01` : null,
        valorBruto,
        valorDescontos: valorDescontos || 0,
        documentoOrigem,
        tipoRecebimento: tipoRecebimento || null,
        observacoes,
        criadoPor: usuarioId,
      })
      onSalvo(novoRecebimento)
    } catch (e) {
      setErro(e.message)
    }
    setSalvando(false)
  }

  return (
    <div className="ls-card" style={{ padding: '1rem', marginBottom: '1.5rem' }}>
      <h4 style={{ marginTop: 0 }}>Lançar Recebimento</h4>
      {erro && <p style={{ color: '#b23b3b' }}>{erro}</p>}

      <div className="cotacao-form-linha">
        <div>
          <label>Seguradora</label>
          <select value={operadoraId} onChange={(e) => setOperadoraId(e.target.value)}>
            <option value="">Selecione</option>
            {seguradoras.map((s) => <option key={s.id} value={s.id}>{s.nome}</option>)}
          </select>
        </div>
        <div>
          <label>Tipo de recebimento</label>
          <select value={tipoRecebimento} onChange={(e) => setTipoRecebimento(e.target.value)}>
            <option value="">Selecione</option>
            {TIPOS_RECEBIMENTO_VALIDOS.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
      </div>

      <div className="cotacao-form-linha">
        <div>
          <label>Nº apólice informado (pela operadora)</label>
          <input value={numeroApoliceInformado} onChange={(e) => setNumeroApoliceInformado(e.target.value)} />
        </div>
        <div>
          <label>Segurado informado (pela operadora)</label>
          <input value={seguradoInformado} onChange={(e) => setSeguradoInformado(e.target.value)} />
        </div>
      </div>

      <div className="cotacao-form-linha">
        <div>
          <label>Data do recebimento *</label>
          <input type="date" value={dataRecebimento} onChange={(e) => setDataRecebimento(e.target.value)} />
        </div>
        <div>
          <label>Competência de referência</label>
          <input type="month" value={competenciaReferencia} onChange={(e) => setCompetenciaReferencia(e.target.value)} />
        </div>
      </div>

      <div className="cotacao-form-linha">
        <div>
          <label>Valor bruto (o que a seguradora informou no relatório) *</label>
          <input type="number" step="0.01" value={valorBruto} onChange={(e) => setValorBruto(e.target.value)} />
        </div>
        <div>
          <label>Valor a descontar do bruto (ex: retenção de IOF) — NÃO é o valor final, é só o quanto sai</label>
          <input type="number" step="0.01" value={valorDescontos} onChange={(e) => setValorDescontos(e.target.value)} />
        </div>
      </div>

      {valorBruto !== '' && (
        <p className="config-instrucao">
          Valor líquido que será registrado: <strong>{formatarMoeda(Number(valorBruto) - Number(valorDescontos || 0))}</strong>
          {' '}({formatarMoeda(Number(valorBruto))} bruto − {formatarMoeda(Number(valorDescontos || 0))} de desconto)
        </p>
      )}

      <div className="cotacao-form-linha">
        <div>
          <label>Documento de origem</label>
          <input placeholder="ex: demonstrativo XPTO 08/2026" value={documentoOrigem} onChange={(e) => setDocumentoOrigem(e.target.value)} />
        </div>
        <div>
          <label>Observações</label>
          <input value={observacoes} onChange={(e) => setObservacoes(e.target.value)} />
        </div>
      </div>

      <div style={{ marginTop: '0.75rem' }}>
        <button
          className="cliente-tabela-btn"
          onClick={handleSalvar}
          disabled={salvando || !dataRecebimento || !valorBruto}
        >
          {salvando ? 'Lançando...' : 'Lançar recebimento'}
        </button>
        <button className="cliente-tabela-btn" onClick={onCancelar} style={{ marginLeft: '0.5rem' }}>
          Cancelar
        </button>
      </div>
    </div>
  )
}

function LinhaRecebimentoPendente({ recebimento, usuarioId, seguradoras, onConciliado, onConciliadoAgregado }) {
  const [expandido, setExpandido] = useState(false)
  const [termo, setTermo] = useState('')
  const [buscando, setBuscando] = useState(false)
  const [candidatas, setCandidatas] = useState([])
  const [vendaSelecionadaId, setVendaSelecionadaId] = useState(null)
  const [conciliando, setConciliando] = useState(false)
  const [erro, setErro] = useState('')

  // CONCILIAÇÃO AGREGADA (Etapa 4, Peça 4) — caminho alternativo, pra
  // quando não dá pra identificar a apólice (relatório só traz total
  // por seguradora/competência). Nunca inventa vínculo de venda.
  const [modoAgregado, setModoAgregado] = useState(false)
  const [operadoraAgregado, setOperadoraAgregado] = useState('')
  const [competenciaAgregado, setCompetenciaAgregado] = useState('')
  const [conciliandoAgregado, setConciliandoAgregado] = useState(false)

  async function handleConciliarAgregado() {
    if (!operadoraAgregado || !competenciaAgregado) return
    setConciliandoAgregado(true)
    setErro('')
    try {
      await conciliarFechamentoAgregado(
        recebimento.id,
        { operadoraId: operadoraAgregado, competenciaReferencia: `${competenciaAgregado}-01` },
        usuarioId
      )
      onConciliadoAgregado(recebimento)
    } catch (e) {
      setErro(e.message)
    }
    setConciliandoAgregado(false)
  }

  async function handleBuscar() {
    setBuscando(true)
    setErro('')
    try {
      const resultado = await buscarVendasCandidatas(termo)
      setCandidatas(resultado)
    } catch (e) {
      setErro(e.message)
    }
    setBuscando(false)
  }

  async function handleConfirmar() {
    if (!vendaSelecionadaId) return
    setConciliando(true)
    setErro('')
    try {
      await conciliarRecebimento(recebimento.id, { vendaId: vendaSelecionadaId }, usuarioId)
      const venda = candidatas.find((v) => v.id === vendaSelecionadaId)
      onConciliado(recebimento, venda)
    } catch (e) {
      setErro(e.message)
    }
    setConciliando(false)
  }

  return (
    <div className="ls-card" style={{ padding: '0.75rem', marginBottom: '0.75rem' }}>
      <div className="cotacao-form-linha" style={{ alignItems: 'center' }}>
        <div><strong>Apólice informada:</strong> {recebimento.numero_apolice_informado || '—'}</div>
        <div><strong>Segurado informado:</strong> {recebimento.segurado_informado || '—'}</div>
        <div><strong>Data:</strong> {formatarDataBR(recebimento.data_recebimento)}</div>
        <div><strong>Bruto:</strong> {formatarMoeda(recebimento.valor_bruto)}</div>
        <div><strong>Desconto:</strong> {formatarMoeda(recebimento.valor_descontos)}</div>
        <div><strong>Líquido:</strong> {formatarMoeda(recebimento.valor_liquido)}</div>
        {recebimento.tipo_recebimento && <span className="ls-badge">{recebimento.tipo_recebimento}</span>}
      </div>

      {!expandido && !modoAgregado ? (
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button className="cliente-tabela-btn" onClick={() => setExpandido(true)}>Conciliar (venda específica)</button>
          <button className="ls-btn ls-btn-ghost" onClick={() => setModoAgregado(true)}>
            Não sei a apólice — é fechamento agregado
          </button>
        </div>
      ) : modoAgregado ? (
        <div style={{ marginTop: '0.75rem' }}>
          {erro && <p style={{ color: '#b23b3b' }}>{erro}</p>}
          <p className="config-instrucao">
            Confronta o total deste recebimento contra a soma do cenário validado dessa seguradora nessa competência — sem tentar adivinhar qual apólice específica é.
          </p>
          <div className="cotacao-form-linha">
            <div>
              <label>Seguradora</label>
              <select value={operadoraAgregado} onChange={(e) => setOperadoraAgregado(e.target.value)}>
                <option value="">Selecione</option>
                {seguradoras.map((s) => <option key={s.id} value={s.id}>{s.nome}</option>)}
              </select>
            </div>
            <div>
              <label>Competência</label>
              <input type="month" value={competenciaAgregado} onChange={(e) => setCompetenciaAgregado(e.target.value)} />
            </div>
          </div>
          <div style={{ marginTop: '0.5rem' }}>
            <button
              className="cliente-tabela-btn"
              onClick={handleConciliarAgregado}
              disabled={!operadoraAgregado || !competenciaAgregado || conciliandoAgregado}
            >
              {conciliandoAgregado ? 'Conciliando...' : 'Confirmar Fechamento Agregado'}
            </button>
            <button className="cliente-tabela-btn" onClick={() => setModoAgregado(false)} style={{ marginLeft: '0.5rem' }}>
              Cancelar
            </button>
          </div>
        </div>
      ) : (
        <div style={{ marginTop: '0.75rem' }}>
          {erro && <p style={{ color: '#b23b3b' }}>{erro}</p>}
          <div className="cotacao-form-linha">
            <input
              placeholder="Buscar por nº apólice ou nome do segurado"
              value={termo}
              onChange={(e) => setTermo(e.target.value)}
            />
            <button className="cliente-tabela-btn" onClick={handleBuscar} disabled={buscando || !termo.trim()}>
              {buscando ? 'Buscando...' : 'Buscar venda'}
            </button>
          </div>

          {candidatas.length > 0 && (
            <table className="cliente-tabela" style={{ marginTop: '0.5rem' }}>
              <thead>
                <tr><th></th><th>Venda</th><th>Apólice</th><th>Segurado</th><th>Status</th></tr>
              </thead>
              <tbody>
                {candidatas.map((v) => (
                  <tr key={v.id}>
                    <td>
                      <input
                        type="radio"
                        name={`venda-${recebimento.id}`}
                        checked={vendaSelecionadaId === v.id}
                        onChange={() => setVendaSelecionadaId(v.id)}
                      />
                    </td>
                    <td>{v.id}</td>
                    <td>{v.apolice?.numero_apolice || '—'}</td>
                    <td>{v.apolice?.nome_cliente || '—'}</td>
                    <td><span className="ls-badge">{v.status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          <div style={{ marginTop: '0.5rem' }}>
            <button className="cliente-tabela-btn" onClick={handleConfirmar} disabled={!vendaSelecionadaId || conciliando}>
              {conciliando ? 'Conciliando...' : 'Confirmar vínculo'}
            </button>
            <button className="cliente-tabela-btn" onClick={() => setExpandido(false)} style={{ marginLeft: '0.5rem' }}>
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

/**
 * CONFRONTO (Etapa 4, Peça 3 — Conciliação Individual, aprovado pelo
 * Chief). Mostra o cenário esperado (validado, com ajustes já
 * embutidos) × o que foi realmente conciliado pra essa venda,
 * competência a competência. É aqui, e só aqui, que faz sentido lançar
 * um estorno — antes disso não tem prova nenhuma de que algo divergiu
 * (correção de posicionamento pedida pelo Raphael, ao testar a Peça 2
 * antes da hora).
 */
function PainelConfrontoVenda({ vendaId, usuarioId, onVendaExcluida }) {
  const { perfil } = useAuth()
  const ehMaster = perfil?.papel === 'master'
  const [confronto, setConfronto] = useState(null)
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')
  const [excluindoVenda, setExcluindoVenda] = useState(false)

  async function handleExcluirVenda() {
    if (!window.confirm('Excluir PERMANENTEMENTE esta venda e todo o histórico financeiro dela (sugestão, recebimentos, ajustes, composição)? A apólice continua existindo. Não é reversível.')) return
    setExcluindoVenda(true)
    try {
      await excluirVendaEHistoricoForcado(vendaId, usuarioId)
      onVendaExcluida?.()
    } catch (e) {
      window.alert(e.message)
    }
    setExcluindoVenda(false)
  }

  const [mostrarNovoAjuste, setMostrarNovoAjuste] = useState(false)
  const [tipoAjuste, setTipoAjuste] = useState('estorno')
  const [valorAjuste, setValorAjuste] = useState('')
  const [motivoAjuste, setMotivoAjuste] = useState('')
  const [competenciaAjuste, setCompetenciaAjuste] = useState('')
  const [salvandoAjuste, setSalvandoAjuste] = useState(false)
  const [avisoVitalicio, setAvisoVitalicio] = useState('')

  useEffect(() => {
    carregar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vendaId])

  /**
   * VITALÍCIO SOB DEMANDA (Etapa 4, Peça 5). Roda toda vez que o
   * confronto é (re)carregado — é idempotente (não duplica se a
   * próxima competência já existe), então é seguro chamar sempre,
   * sem precisar de gatilho manual. Se materializar uma linha nova,
   * recarrega o confronto pra ela já aparecer.
   */
  async function carregar() {
    setCarregando(true)
    setErro('')
    setAvisoVitalicio('')
    try {
      const dados = await obterConfrontoDaVenda(vendaId)
      setConfronto(dados)

      const resultadoVitalicio = await materializarVitalicioSeElegivel(vendaId)
      if (resultadoVitalicio.materializado) {
        setAvisoVitalicio(
          `Vitalício materializado: ${new Date(resultadoVitalicio.competencia).toLocaleDateString('pt-BR', { month: '2-digit', year: 'numeric', timeZone: 'UTC' })} — ${formatarMoeda(resultadoVitalicio.valor)}. Aparece na tela de Comissão Sugerida, aguardando validação.`
        )
        const dadosAtualizados = await obterConfrontoDaVenda(vendaId)
        setConfronto(dadosAtualizados)
      }
    } catch (e) {
      setErro(e.message)
    }
    setCarregando(false)
  }

  /**
   * "Estorno" sempre reduz o esperado — força o sinal, não depende do
   * Gestor lembrar do "-" (mesmo achado de antes, mesma correção).
   */
  async function handleLancarAjuste() {
    if (valorAjuste === '' || !motivoAjuste.trim()) return
    setSalvandoAjuste(true)
    setErro('')
    try {
      const linhaSelecionada = competenciaAjuste
        ? confronto.linhas.find((l) => l.competenciaReferencia === `${competenciaAjuste}-01`)
        : null
      const valorNumerico = Number(valorAjuste)
      const valorFinal = tipoAjuste === 'estorno' ? -Math.abs(valorNumerico) : valorNumerico
      await lancarAjusteEstorno({
        vendaId,
        comissaoSugeridaId: linhaSelecionada?.comissaoSugeridaId ?? null,
        competenciaReferencia: competenciaAjuste ? `${competenciaAjuste}-01` : null,
        tipo: tipoAjuste,
        valor: valorFinal,
        motivo: motivoAjuste,
        usuarioId,
      })
      setValorAjuste('')
      setMotivoAjuste('')
      setCompetenciaAjuste('')
      setMostrarNovoAjuste(false)
      carregar()
    } catch (e) {
      setErro(e.message)
    }
    setSalvandoAjuste(false)
  }

  if (carregando) return <p style={{ fontSize: '0.8rem' }}>Carregando confronto...</p>
  if (!confronto) return null

  const CORES_STATUS = {
    aguardando: undefined,
    conciliado: 'var(--ls-success, #2f7a3d)',
    divergente: 'var(--ls-danger, #b23b3b)',
  }
  const LABEL_STATUS = { aguardando: 'aguardando', conciliado: 'conciliado', divergente: 'DIVERGENTE' }

  return (
    <div className="ls-card" style={{ padding: '0.6rem', marginTop: '0.5rem', marginBottom: '0.5rem' }}>
      {avisoVitalicio && (
        <p className="config-instrucao" style={{ borderLeft: '3px solid var(--ls-success, #2f7a3d)', paddingLeft: '0.5rem', marginBottom: '0.5rem' }}>
          🔓 {avisoVitalicio}
        </p>
      )}
      <div className="cotacao-form-linha" style={{ alignItems: 'center' }}>
        <strong style={{ fontSize: '0.85rem' }}>Confronto — cenário esperado × recebido</strong>
        <span className="ls-badge" style={{ background: CORES_STATUS[confronto.statusGeral] }}>
          {LABEL_STATUS[confronto.statusGeral]}
        </span>
        <span style={{ fontSize: '0.8rem' }}>
          Esperado líquido: {formatarMoeda(confronto.totalEsperadoLiquido)} · Recebido: {formatarMoeda(confronto.totalRecebido)}
          {confronto.totalDivergencia !== 0 && ` · Diferença: ${formatarMoeda(confronto.totalDivergencia)}`}
        </span>
        <button className="ls-btn ls-btn-ghost" style={{ fontSize: '0.8rem' }} onClick={() => setMostrarNovoAjuste((v) => !v)}>
          + Ajuste/Estorno
        </button>
        {ehMaster && (
          <button className="cliente-tabela-btn cliente-tabela-btn-perigo" style={{ fontSize: '0.8rem' }} onClick={handleExcluirVenda} disabled={excluindoVenda}>
            {excluindoVenda ? 'Excluindo...' : '🗑️ Excluir venda (Master)'}
          </button>
        )}
      </div>

      {erro && <p className="ls-modal-erro">{erro}</p>}

      {mostrarNovoAjuste && (
        <div className="ls-card" style={{ padding: '0.5rem', marginTop: '0.5rem' }}>
          <div className="cotacao-form-linha" style={{ alignItems: 'flex-end' }}>
            <div>
              <label>Tipo</label>
              <select value={tipoAjuste} onChange={(e) => setTipoAjuste(e.target.value)}>
                <option value="estorno">Estorno</option>
                <option value="ajuste">Ajuste</option>
                <option value="correcao">Correção</option>
              </select>
            </div>
            <div>
              <label>Valor (positivo — o sistema aplica o sinal certo)</label>
              <input type="number" step="0.01" value={valorAjuste} onChange={(e) => setValorAjuste(e.target.value)} placeholder="Ex: 400,00" />
            </div>
            <div>
              <label>Competência (vazio = venda inteira)</label>
              <select value={competenciaAjuste} onChange={(e) => setCompetenciaAjuste(e.target.value)}>
                <option value="">Venda inteira</option>
                {confronto.linhas.map((l) => (
                  <option key={l.comissaoSugeridaId} value={l.competenciaReferencia.slice(0, 7)}>
                    {new Date(l.competenciaReferencia).toLocaleDateString('pt-BR', { month: '2-digit', year: 'numeric', timeZone: 'UTC' })}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div style={{ marginTop: '0.5rem' }}>
            <label>Motivo (obrigatório)</label>
            <textarea
              value={motivoAjuste}
              onChange={(e) => setMotivoAjuste(e.target.value)}
              rows={2}
              placeholder="Ex: Seguradora não pagou a parcela de outubro — apólice cancelada em 20/09."
              style={{ width: '100%', padding: '0.5rem 0.65rem', border: '1px solid var(--ls-border)', borderRadius: 'var(--ls-radius-sm)', fontFamily: 'inherit' }}
            />
          </div>
          <div className="ls-modal-acoes">
            <button className="ls-btn ls-btn-ghost" onClick={() => setMostrarNovoAjuste(false)}>Cancelar</button>
            <button className="ls-btn ls-btn-primary" onClick={handleLancarAjuste} disabled={salvandoAjuste || valorAjuste === '' || !motivoAjuste.trim()}>
              {salvandoAjuste ? 'Salvando...' : 'Lançar'}
            </button>
          </div>
        </div>
      )}

      {confronto.linhas.length > 0 && (
        <table className="cliente-tabela" style={{ marginTop: '0.5rem' }}>
          <thead><tr><th>Competência</th><th>Esperado</th><th>Recebido</th><th>Status</th></tr></thead>
          <tbody>
            {confronto.linhas.map((l) => (
              <tr key={l.comissaoSugeridaId}>
                <td>{new Date(l.competenciaReferencia).toLocaleDateString('pt-BR', { month: '2-digit', year: 'numeric', timeZone: 'UTC' })}</td>
                <td>{formatarMoeda(l.esperadoLiquido)}{!l.validado && ' (não validado)'}</td>
                <td>{l.recebido > 0 ? formatarMoeda(l.recebido) : '—'}</td>
                <td><span className="ls-badge" style={{ background: CORES_STATUS[l.statusConfronto] }}>{LABEL_STATUS[l.statusConfronto]}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

/**
 * Fechamento Agregado (Etapa 4, Peça 4). Mostra o confronto Nível B —
 * total informado × soma do cenário validado daquela seguradora +
 * competência. Sem "Distribuir": não existe venda pra dividir entre
 * participantes, é só confronto de auditoria.
 */
function LinhaFechamentoAgregado({ recebimento, onExcluido }) {
  const { perfil } = useAuth()
  const ehMaster = perfil?.papel === 'master'
  const [confronto, setConfronto] = useState(null)
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')
  const [excluindo, setExcluindo] = useState(false)

  async function handleExcluir() {
    if (!window.confirm('Excluir PERMANENTEMENTE este fechamento agregado? Não é reversível.')) return
    setExcluindo(true)
    try {
      await excluirFechamentoAgregado(recebimento.id)
      onExcluido?.(recebimento.id)
    } catch (e) {
      window.alert(e.message)
      setExcluindo(false)
    }
  }

  useEffect(() => {
    setCarregando(true)
    confrontarFechamentoAgregado({
      operadoraId: recebimento.operadora_id,
      competenciaReferencia: recebimento.competencia_referencia,
    })
      .then(setConfronto)
      .catch((e) => setErro(e.message))
      .finally(() => setCarregando(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recebimento.id])

  if (carregando) return <p style={{ fontSize: '0.8rem' }}>Carregando confronto agregado...</p>
  if (erro) return <p className="ls-modal-erro">{erro}</p>
  if (!confronto) return null

  const diferenca = Number((Number(recebimento.valor_liquido) - confronto.totalEsperadoLiquido).toFixed(2))
  const statusGeral = Math.abs(diferenca) < 0.01 ? 'conciliado' : 'divergente'
  const CORES_STATUS = { conciliado: 'var(--ls-success, #2f7a3d)', divergente: 'var(--ls-danger, #b23b3b)' }

  return (
    <div className="ls-card" style={{ padding: '0.75rem', marginBottom: '0.75rem' }}>
      <div className="cotacao-form-linha" style={{ alignItems: 'center' }}>
        <div><strong>Recebimento</strong> {recebimento.id}</div>
        <div>Competência: {new Date(recebimento.competencia_referencia).toLocaleDateString('pt-BR', { month: '2-digit', year: 'numeric', timeZone: 'UTC' })}</div>
        <div>Informado: {formatarMoeda(recebimento.valor_liquido)}</div>
        <span className="ls-badge" style={{ background: CORES_STATUS[statusGeral] }}>
          {statusGeral === 'conciliado' ? 'CONCILIADO' : 'DIVERGENTE'}
        </span>
        {ehMaster && (
          <button className="cliente-tabela-btn cliente-tabela-btn-perigo" style={{ fontSize: '0.8rem' }} onClick={handleExcluir} disabled={excluindo}>
            {excluindo ? 'Excluindo...' : '🗑️ Excluir (Master)'}
          </button>
        )}
      </div>
      <p style={{ fontSize: '0.8rem', marginTop: '0.4rem' }}>
        {confronto.quantidadeVendasValidadas} venda(s) validada(s) somam {formatarMoeda(confronto.totalEsperadoLiquido)}
        {confronto.totalAjustes !== 0 && ` (inclui ${formatarMoeda(confronto.totalAjustes)} de ajustes)`}
        {' '}— diferença: {formatarMoeda(diferenca)}
      </p>
      {statusGeral === 'divergente' && (
        <p className="config-instrucao" style={{ borderLeft: '3px solid var(--ls-danger, #b23b3b)', paddingLeft: '0.5rem' }}>
          Divergência registrada para análise — o sistema não tenta adivinhar qual venda específica é a responsável.
        </p>
      )}
    </div>
  )
}

function LinhaRecemConciliada({ item, usuarioId, onDistribuido }) {
  const { recebimento, venda, distribuido, linhas } = item
  const [distribuindo, setDistribuindo] = useState(false)
  const [erro, setErro] = useState('')

  async function handleDistribuir() {
    setDistribuindo(true)
    setErro('')
    try {
      const linhasCriadas = await distribuirRecebimento(recebimento.id, usuarioId)
      onDistribuido(recebimento.id, linhasCriadas)
    } catch (e) {
      setErro(e.message)
    }
    setDistribuindo(false)
  }

  return (
    <div className="ls-card" style={{ padding: '0.75rem', marginBottom: '0.75rem' }}>
      <div><strong>Recebimento</strong> {recebimento.id} → <strong>Venda</strong> {venda?.id}</div>
      <div>Líquido: {formatarMoeda(recebimento.valor_liquido)}</div>

      {venda?.id && (
        <PainelConfrontoVenda
          vendaId={venda.id}
          usuarioId={usuarioId}
          onVendaExcluida={() => onDistribuido(recebimento.id, [])}
        />
      )}

      {erro && <p style={{ color: '#b23b3b' }}>{erro}</p>}
      {!distribuido ? (
        <button className="cliente-tabela-btn" onClick={handleDistribuir} disabled={distribuindo}>
          {distribuindo ? 'Distribuindo...' : 'Distribuir'}
        </button>
      ) : (
        <p className="ls-badge" style={{ color: '#2f7a3d' }}>
          Distribuído — {linhas?.length ?? 0} comissão(ões) gerada(s)
        </p>
      )}
    </div>
  )
}

function FluxoCaixaTab() {
  const [meses, setMeses] = useState(null)
  const [carregando, setCarregando] = useState(true)

  useEffect(() => {
    obterFluxoCaixaPrevisto({ mesesAFrente: 3 }).then((r) => {
      setMeses(r)
      setCarregando(false)
    })
  }, [])

  if (carregando) return <p className="cliente-carregando">Carregando fluxo de caixa...</p>

  return (
    <div>

      {meses.length === 0 ? (
        <p className="cliente-vazio">Nenhuma previsão de recebimento nos próximos meses.</p>
      ) : (
        <div className="kpi-grid">
          {meses.map((m) => (
            <KpiCard
              key={m.mes}
              label={m.mes}
              valor={formatarMoeda(m.totalPrevisto)}
              trendTexto={`${formatarMoeda(m.totalRecebido)} recebido · ${formatarMoeda(m.totalPendente)} pendente`}
              trendTipo="neutro"
            />
          ))}
        </div>
      )}
    </div>
  )
}
