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
} from '../../lib/crm/comissoesService'
import {
  listarRecebimentosPendentesConciliacao,
  buscarVendasCandidatas,
  conciliarRecebimento,
  distribuirRecebimento,
  lancarComissaoRecebida,
  TIPOS_RECEBIMENTO_VALIDOS,
} from '../../lib/crm/comissionamentoService'
import {
  listarComissoesSugeridasDetalhado,
  gerarSugestoesCompetencia,
  ajustarComissaoSugeridaManualmente,
} from '../../lib/crm/regrasComissaoService'
import { uploadLoteImportacao, listarLotesImportacao, listarEventosPorLote, confirmarFormatoHomologado, excluirLote, listarSeguradorasCatalogo } from '../../lib/crm/lotesImportacaoService'
import { useAuth } from '../auth/AuthContext'
import { listarCatalogoSeguradoras, listarApolices, listarCorretores } from '../../lib/crm/apolicesService'
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

  useEffect(() => {
    carregar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [competencia])

  async function carregar() {
    setCarregando(true)
    setErro('')
    try {
      const lista = await listarComissoesSugeridasDetalhado(`${competencia}-01`)
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

  return (
    <div>
      <div className="cotacao-form-linha" style={{ alignItems: 'flex-end', marginBottom: '1rem' }}>
        <div>
          <label>Competência</label>
          <input type="month" value={competencia} onChange={(e) => setCompetencia(e.target.value)} />
        </div>
        <button className="ls-btn ls-btn-primary" onClick={handleGerar} disabled={gerando}>
          {gerando ? 'Gerando...' : 'Gerar / Atualizar Sugestões desta Competência'}
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
        <KpiCard label="Competência" valor={new Date(`${competencia}-01`).toLocaleDateString('pt-BR', { month: '2-digit', year: 'numeric', timeZone: 'UTC' })} />
      </div>

      {carregando ? (
        <p className="cliente-carregando">Carregando...</p>
      ) : dados.length === 0 ? (
        <p className="cliente-vazio">Nenhuma sugestão gerada ainda pra essa competência. Clique em "Gerar Sugestões" acima.</p>
      ) : (
        <table className="cliente-tabela">
          <thead>
            <tr>
              <th>Apólice</th><th>Cliente</th><th>Operadora</th><th>Produto</th><th>Regra</th><th>Sugestão</th><th>Ajuste</th>
            </tr>
          </thead>
          <tbody>
            {dados.map((d) => (
              <LinhaComissaoSugerida key={d.id} item={d} usuarioId={user?.id} onAtualizado={carregar} />
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

function LinhaComissaoSugerida({ item, usuarioId, onAtualizado }) {
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

  return (
    <>
      <tr onClick={() => setExpandido(!expandido)} style={{ cursor: 'pointer' }}>
        <td>{item.numeroApolice}</td>
        <td>{item.nomeCliente}</td>
        <td>{item.nomeOperadora}</td>
        <td>{item.nomeProduto}</td>
        <td>{item.regra?.descricao ?? '—'}</td>
        <td>{item.valor_sugerido != null ? formatarMoeda(item.valor_sugerido) : '—'}</td>
        <td>{item.ajustado_manualmente ? <span className="ls-badge">ajustado</span> : '—'}</td>
      </tr>
      {expandido && (
        <tr>
          <td colSpan={7}>
            <div className="ls-card" style={{ padding: '0.75rem' }}>
              {erro && <p className="ls-modal-erro">{erro}</p>}

              {item.regra?.componentes?.length > 0 ? (
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
                <p className="config-instrucao">Nenhuma regra aplicada — produto sem regra cadastrada pra essa competência, ou venda ainda fora do período de todos os componentes.</p>
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

      {resultados && (
        resultados.length === 0 ? (
          <p className="cliente-vazio">Nenhum resultado encontrado.</p>
        ) : (
          <table className="cliente-tabela">
            <thead><tr><th>Seguradora</th><th>Módulo</th><th>Valor</th><th>Status</th><th>Data</th></tr></thead>
            <tbody>
              {resultados.map((r) => (
                <tr key={r.id}>
                  <td>{r.operadora?.nome ?? '—'}</td>
                  <td>{MODULOS.find((m) => m.id === r.modulo)?.label || r.modulo}</td>
                  <td>{formatarMoeda(r.valor_comissao)}</td>
                  <td><span className="ls-badge">{r.status_recebimento}</span></td>
                  <td>{new Date(r.created_at).toLocaleDateString('pt-BR')}</td>
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
  const [seguradoraSelecionada, setSeguradoraSelecionada] = useState('')
  const [enviando, setEnviando] = useState(false)
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
      const lote = await uploadLoteImportacao({ file: arquivo, enviadoPor: user?.id, seguradoraId: seguradoraSelecionada || null })
      setSucesso(`"${lote.nome_arquivo_original}" recebido com sucesso.`)
      setArquivo(null)
      setSeguradoraSelecionada('')
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
        <p className="config-instrucao">PDF, imagem (PNG/JPG), Excel ou CSV. O arquivo original fica preservado — nada vira financeiro ainda nesta etapa.</p>

        {erro && <p className="ls-modal-erro">{erro}</p>}
        {sucesso && <p className="config-sucesso">{sucesso}</p>}

        <div className="cotacao-form-linha" style={{ alignItems: 'center' }}>
          <input type="file" accept=".pdf,.png,.jpg,.jpeg,.xlsx,.xls,.csv" onChange={(e) => setArquivo(e.target.files?.[0] ?? null)} />
          <div>
            <label style={{ fontSize: '0.8rem' }}>Seguradora (opcional — ajuda se a identificação automática não achar)</label>
            <select value={seguradoraSelecionada} onChange={(e) => setSeguradoraSelecionada(e.target.value)}>
              <option value="">Identificar automaticamente pelo conteúdo</option>
              {seguradoras.map((s) => <option key={s.id} value={s.id}>{s.nome}</option>)}
            </select>
          </div>
          <button className="ls-btn ls-btn-primary" onClick={handleUpload} disabled={!arquivo || enviando}>
            {enviando ? 'Enviando...' : 'Enviar'}
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
              <LinhaLote key={l.id} lote={l} usuarioId={user?.id} ehMaster={perfil?.papel === 'master'} onAtualizado={carregar} />
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

function LinhaLote({ lote, usuarioId, ehMaster, onAtualizado }) {
  const [expandido, setExpandido] = useState(false)
  const [eventos, setEventos] = useState(null)
  const [carregandoEventos, setCarregandoEventos] = useState(false)
  const [confirmando, setConfirmando] = useState(false)
  const [excluindo, setExcluindo] = useState(false)
  const [erroConfirmacao, setErroConfirmacao] = useState('')

  const temPrevia = lote.status !== 'recebido'
  const corConfianca = { alta: '#2f7a3d', revisao: '#b8860b', bloqueado: '#b23b3b' }[lote.nivel_confianca]

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
          {temPrevia && (
            <button className="cliente-tabela-btn" onClick={handleVerPrevia}>
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
                <div><strong>Competência informada:</strong> {lote.competencia_informada ? new Date(lote.competencia_informada).toLocaleDateString('pt-BR', { month: '2-digit', year: 'numeric', timeZone: 'UTC' }) : '—'}</div>
                <div><strong>Total bruto extraído:</strong> {lote.valor_bruto_total_extraido != null ? formatarMoeda(lote.valor_bruto_total_extraido) : '—'}</div>
                <div><strong>Linhas extraídas:</strong> {lote.quantidade_linhas_extraidas ?? '—'}</div>
              </div>

              {lote.motivo_confianca && (
                <p className="config-instrucao" style={{ marginBottom: '0.75rem' }}><strong>Motivo:</strong> {lote.motivo_confianca}</p>
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

              {lote.status === 'revisao_necessaria' && (
                <div style={{ marginTop: '0.75rem' }}>
                  {erroConfirmacao && <p className="ls-modal-erro">{erroConfirmacao}</p>}
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
  const [linhas, setLinhas] = useState(null)
  const [corretores, setCorretores] = useState([])
  const [filtroFaixa, setFiltroFaixa] = useState('')
  const [carregando, setCarregando] = useState(true)

  useEffect(() => {
    carregar()
  }, [])

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

function LinhaRepasse({ linha, nomeCorretor, onAtualizado }) {
  async function handleMarcarPago() {
    await marcarRepasseComoPago(linha.id)
    onAtualizado()
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
  const [erro, setErro] = useState('')
  const [seguradoras, setSeguradoras] = useState([])
  const [mostrarFormLancamento, setMostrarFormLancamento] = useState(false)

  useEffect(() => {
    carregarFila()
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

  function handleConciliado(recebimento, venda) {
    setFila((atual) => atual.filter((r) => r.id !== recebimento.id))
    setRecemConciliados((atual) => [...atual, { recebimento, venda, distribuido: false, linhas: null }])
  }

  function handleDistribuido(recebimentoId, linhas) {
    setRecemConciliados((atual) =>
      atual.map((item) => (item.recebimento.id === recebimentoId ? { ...item, distribuido: true, linhas } : item))
    )
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
            onConciliado={handleConciliado}
          />
        ))
      )}

      {recemConciliados.length > 0 && (
        <>
          <h3>Conciliados nesta sessão</h3>
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
          <label>Valor bruto *</label>
          <input type="number" step="0.01" value={valorBruto} onChange={(e) => setValorBruto(e.target.value)} />
        </div>
        <div>
          <label>Valor de descontos (IOF real etc.)</label>
          <input type="number" step="0.01" value={valorDescontos} onChange={(e) => setValorDescontos(e.target.value)} />
        </div>
      </div>

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

function LinhaRecebimentoPendente({ recebimento, usuarioId, onConciliado }) {
  const [expandido, setExpandido] = useState(false)
  const [termo, setTermo] = useState('')
  const [buscando, setBuscando] = useState(false)
  const [candidatas, setCandidatas] = useState([])
  const [vendaSelecionadaId, setVendaSelecionadaId] = useState(null)
  const [conciliando, setConciliando] = useState(false)
  const [erro, setErro] = useState('')

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

      {!expandido ? (
        <button className="cliente-tabela-btn" onClick={() => setExpandido(true)}>Conciliar</button>
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
