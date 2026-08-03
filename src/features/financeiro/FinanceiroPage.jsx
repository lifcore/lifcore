import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  listarComissoes,
  criarComissao,
  marcarComoRecebida,
  marcarRepasseComoPago,
  cancelarComissao,
  excluirComissao,
  lancarAjuste,
  indicadoresOperacionais,
  obterConciliacao,
  obterFluxoCaixaPrevisto,
  listarContasAReceber,
  resumirPorFaixaAtraso,
  listarRepassesAPagar,
  obterCentralPendencias,
  buscarComissoesGlobal,
  obterHistoricoLancamento,
} from '../../lib/crm/comissoesService'
import { listarCatalogoSeguradoras, listarApolices, listarCorretores } from '../../lib/crm/apolicesService'
import { listarGestoresPorOperadora } from '../../lib/crm/seguradorasService'
import { montarLinkWhatsApp } from '../../lib/crm/templatesService'
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

export default function FinanceiroPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const abaAtiva = searchParams.get('aba') || 'lancamentos'
  function setAbaAtiva(aba) { setSearchParams({ aba }) }
  const [resultado, setResultado] = useState({ linhas: [], total: 0 })
  const [indicadores, setIndicadores] = useState(null)
  const [seguradoras, setSeguradoras] = useState([])
  const [corretores, setCorretores] = useState([])
  const [carregando, setCarregando] = useState(true)
  const [mostrarForm, setMostrarForm] = useState(false)

  // Filtros
  const [busca, setBusca] = useState('')
  const [filtroSeguradora, setFiltroSeguradora] = useState('')
  const [filtroModulo, setFiltroModulo] = useState('')
  const [filtroCorretor, setFiltroCorretor] = useState('')
  const [filtroStatusRecebimento, setFiltroStatusRecebimento] = useState('')
  const [filtroStatusRepasse, setFiltroStatusRepasse] = useState('')
  const [filtroPeriodoInicio, setFiltroPeriodoInicio] = useState('')
  const [filtroPeriodoFim, setFiltroPeriodoFim] = useState('')
  const [ordenarPor, setOrdenarPor] = useState('created_at')
  const [ordemAscendente, setOrdemAscendente] = useState(false)
  const [pagina, setPagina] = useState(1)
  const TAMANHO_PAGINA = 20

  useEffect(() => {
    listarCatalogoSeguradoras().then(setSeguradoras)
    listarCorretores().then(setCorretores)
  }, [])

  useEffect(() => {
    carregar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busca, filtroSeguradora, filtroModulo, filtroCorretor, filtroStatusRecebimento, filtroStatusRepasse, filtroPeriodoInicio, filtroPeriodoFim, ordenarPor, ordemAscendente, pagina])

  function filtrosAtivos() {
    const f = { ordenarPor, ordemAscendente, pagina, tamanhoPagina: TAMANHO_PAGINA }
    if (busca) f.busca = busca
    if (filtroSeguradora) f.operadoraId = filtroSeguradora
    if (filtroModulo) f.modulo = filtroModulo
    if (filtroCorretor) f.corretorId = filtroCorretor
    if (filtroStatusRecebimento) f.statusRecebimento = filtroStatusRecebimento
    if (filtroStatusRepasse) f.statusRepasse = filtroStatusRepasse
    if (filtroPeriodoInicio) f.periodoInicio = filtroPeriodoInicio
    if (filtroPeriodoFim) f.periodoFim = filtroPeriodoFim
    return f
  }

  async function carregar() {
    setCarregando(true)
    const filtros = filtrosAtivos()
    const [res, ind] = await Promise.all([listarComissoes(filtros), indicadoresOperacionais(filtros)])
    setResultado(res)
    setIndicadores(ind)
    setCarregando(false)
  }

  function limparFiltros() {
    setBusca('')
    setFiltroSeguradora('')
    setFiltroModulo('')
    setFiltroCorretor('')
    setFiltroStatusRecebimento('')
    setFiltroStatusRepasse('')
    setFiltroPeriodoInicio('')
    setFiltroPeriodoFim('')
    setPagina(1)
  }

  const totalPaginas = Math.max(1, Math.ceil(resultado.total / TAMANHO_PAGINA))

  return (
    <div className="config-page">
      <h2>Financeiro</h2>

      <div className="cliente-abas" style={{ marginBottom: '1rem' }}>
        <button className={`cliente-aba ${abaAtiva === 'lancamentos' ? 'cliente-aba-ativa' : ''}`} onClick={() => setAbaAtiva('lancamentos')}>Comissões</button>
        <button className={`cliente-aba ${abaAtiva === 'pendencias' ? 'cliente-aba-ativa' : ''}`} onClick={() => setAbaAtiva('pendencias')}>Pendências</button>
        <button className={`cliente-aba ${abaAtiva === 'contasareceber' ? 'cliente-aba-ativa' : ''}`} onClick={() => setAbaAtiva('contasareceber')}>Contas a Receber</button>
        <button className={`cliente-aba ${abaAtiva === 'repasses' ? 'cliente-aba-ativa' : ''}`} onClick={() => setAbaAtiva('repasses')}>Repasses</button>
        <button className={`cliente-aba ${abaAtiva === 'conciliacao' ? 'cliente-aba-ativa' : ''}`} onClick={() => setAbaAtiva('conciliacao')}>Conciliação</button>
        <button className={`cliente-aba ${abaAtiva === 'fluxo' ? 'cliente-aba-ativa' : ''}`} onClick={() => setAbaAtiva('fluxo')}>Fluxo de Caixa</button>
        <button className={`cliente-aba ${abaAtiva === 'buscar' ? 'cliente-aba-ativa' : ''}`} onClick={() => setAbaAtiva('buscar')}>Buscar</button>
      </div>

      {abaAtiva === 'pendencias' && <PendenciasTab setAbaAtiva={setAbaAtiva} />}
      {abaAtiva === 'contasareceber' && <ContasAReceberTab />}
      {abaAtiva === 'repasses' && <RepassesTab />}
      {abaAtiva === 'conciliacao' && <ConciliacaoTab />}
      {abaAtiva === 'fluxo' && <FluxoCaixaTab />}
      {abaAtiva === 'buscar' && <BuscaGlobalTab />}

      {abaAtiva === 'lancamentos' && (
      <>
      <p className="config-instrucao">
        Livro-razão de comissões: registro manual do que foi apurado por apólice.
        Sem cálculo automático — cada valor é lançado por quem apurou.
      </p>

      {indicadores && (
        <div className="cotacao-form-linha" style={{ marginBottom: '1rem', flexWrap: 'wrap' }}>
          <div className="ls-card"><strong>Total Previsto</strong><div>{formatarMoeda(indicadores.totalPrevisto)}</div></div>
          <div className="ls-card"><strong>Total Recebido</strong><div>{formatarMoeda(indicadores.totalRecebido)}</div></div>
          <div className="ls-card"><strong>Total Pendente</strong><div>{formatarMoeda(indicadores.totalPendente)}</div></div>
          <div className="ls-card"><strong>Total Repassado</strong><div>{formatarMoeda(indicadores.totalRepassado)}</div></div>
          <div className="ls-card"><strong>Lançamentos</strong><div>{indicadores.quantidadeLancamentos}</div></div>
        </div>
      )}

      <div className="ls-card" style={{ marginBottom: '1rem' }}>
        <label>Pesquisa rápida (observações, forma de pagamento, detalhes do cálculo)</label>
        <input value={busca} onChange={(e) => { setBusca(e.target.value); setPagina(1) }} placeholder="Buscar..." />

        <div className="cotacao-form-linha" style={{ marginTop: '0.5rem' }}>
          <div>
            <label>Seguradora</label>
            <select value={filtroSeguradora} onChange={(e) => { setFiltroSeguradora(e.target.value); setPagina(1) }}>
              <option value="">Todas</option>
              {seguradoras.map((s) => <option key={s.id} value={s.id}>{s.nome}</option>)}
            </select>
          </div>
          <div>
            <label>Módulo</label>
            <select value={filtroModulo} onChange={(e) => { setFiltroModulo(e.target.value); setPagina(1) }}>
              <option value="">Todos</option>
              {MODULOS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
            </select>
          </div>
          <div>
            <label>Corretor</label>
            <select value={filtroCorretor} onChange={(e) => { setFiltroCorretor(e.target.value); setPagina(1) }}>
              <option value="">Todos</option>
              {corretores.map((c) => <option key={c.id} value={c.id}>{c.nome_completo}</option>)}
            </select>
          </div>
        </div>

        <div className="cotacao-form-linha">
          <div>
            <label>Status recebimento</label>
            <select value={filtroStatusRecebimento} onChange={(e) => { setFiltroStatusRecebimento(e.target.value); setPagina(1) }}>
              <option value="">Todos</option>
              {STATUS_RECEBIMENTO.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
            </select>
          </div>
          <div>
            <label>Status repasse</label>
            <select value={filtroStatusRepasse} onChange={(e) => { setFiltroStatusRepasse(e.target.value); setPagina(1) }}>
              <option value="">Todos</option>
              {STATUS_REPASSE.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
            </select>
          </div>
          <div>
            <label>Ordenar por</label>
            <select value={ordenarPor} onChange={(e) => setOrdenarPor(e.target.value)}>
              <option value="created_at">Data de lançamento</option>
              <option value="valor_comissao">Valor da comissão</option>
              <option value="data_prevista_recebimento">Previsão de recebimento</option>
              <option value="data_recebimento">Data de recebimento</option>
            </select>
          </div>
        </div>

        <div className="cotacao-form-linha">
          <div>
            <label>Período — de</label>
            <input type="date" value={filtroPeriodoInicio} onChange={(e) => { setFiltroPeriodoInicio(e.target.value); setPagina(1) }} />
          </div>
          <div>
            <label>Período — até</label>
            <input type="date" value={filtroPeriodoFim} onChange={(e) => { setFiltroPeriodoFim(e.target.value); setPagina(1) }} />
          </div>
        </div>

        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
          <button className="cliente-tabela-btn" onClick={limparFiltros}>Limpar filtros</button>
          <button className="cliente-tabela-btn" onClick={() => setOrdemAscendente(!ordemAscendente)}>
            {ordemAscendente ? '↑ Crescente' : '↓ Decrescente'}
          </button>
        </div>
      </div>

      <button className="ls-btn ls-btn-accent" onClick={() => setMostrarForm(!mostrarForm)} style={{ marginBottom: '1rem' }}>
        {mostrarForm ? 'Cancelar' : '+ Lançar Comissão'}
      </button>

      {mostrarForm && (
        <FormNovaComissao
          seguradoras={seguradoras}
          corretores={corretores}
          onSalvo={() => { setMostrarForm(false); carregar() }}
          onCancelar={() => setMostrarForm(false)}
        />
      )}

      {carregando ? (
        <p className="cliente-carregando">Carregando...</p>
      ) : resultado.linhas.length === 0 ? (
        <p className="cliente-vazio">Nenhuma comissão encontrada para os filtros selecionados.</p>
      ) : (
        <>
          <table className="cliente-tabela">
            <thead>
              <tr>
                <th>Seguradora</th><th>Módulo</th><th>Comissão</th><th>Status</th><th>Repasse</th><th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {resultado.linhas.map((c) => (
                <LinhaComissao key={c.id} comissao={c} onAtualizado={carregar} />
              ))}
            </tbody>
          </table>

          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginTop: '0.75rem' }}>
            <button className="cliente-tabela-btn" disabled={pagina <= 1} onClick={() => setPagina(pagina - 1)}>← Anterior</button>
            <span>Página {pagina} de {totalPaginas} ({resultado.total} lançamentos)</span>
            <button className="cliente-tabela-btn" disabled={pagina >= totalPaginas} onClick={() => setPagina(pagina + 1)}>Próxima →</button>
          </div>
        </>
      )}
      </>
      )}
    </div>
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
      <p className="config-instrucao">
        Consolida tudo que exige atenção administrativa agora — clique num card pra ir direto à fila correspondente.
      </p>
      <div className="cotacao-form-linha" style={{ flexWrap: 'wrap' }}>
        {cards.map((c) => (
          <div
            key={c.titulo}
            className="ls-card"
            style={{ minWidth: '180px', cursor: c.aba ? 'pointer' : 'default' }}
            onClick={() => c.aba && setAbaAtiva(c.aba)}
          >
            <strong>{c.titulo}</strong>
            <div style={{ fontSize: '1.3rem', fontWeight: 600, color: c.critico ? '#b23b3b' : undefined }}>{c.valor}</div>
          </div>
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
      <p className="config-instrucao">
        Busca por Corretor, Seguradora, Nº da Apólice, Status, Período e Valor. Busca por Cliente
        e por Contrato ainda não disponível aqui — depende de confirmar schema antes de implementar
        com segurança (registrado como pendência técnica).
      </p>

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

function ContasAReceberTab() {
  const [linhas, setLinhas] = useState(null)
  const [filtroFaixa, setFiltroFaixa] = useState('')
  const [carregando, setCarregando] = useState(true)

  useEffect(() => {
    carregar()
  }, [])

  async function carregar() {
    setCarregando(true)
    const r = await listarContasAReceber()
    setLinhas(r)
    setCarregando(false)
  }

  if (carregando) return <p className="cliente-carregando">Carregando contas a receber...</p>

  const resumo = resumirPorFaixaAtraso(linhas)
  const linhasFiltradas = filtroFaixa ? linhas.filter((l) => l.faixaAtraso === filtroFaixa) : linhas

  return (
    <div>
      <p className="config-instrucao">
        Fila de lançamentos pendentes, ordenada por urgência — o que está mais atrasado aparece primeiro.
        Complementa a Conciliação (que mostra visão agregada por seguradora): aqui é por lançamento individual.
      </p>

      <div className="cotacao-form-linha" style={{ flexWrap: 'wrap', marginBottom: '1rem' }}>
        {Object.entries(resumo.porFaixa).map(([faixa, dados]) => (
          <button
            key={faixa}
            className="ls-card"
            style={{
              minWidth: '150px', textAlign: 'left', cursor: 'pointer',
              border: filtroFaixa === faixa ? '2px solid #b23b3b' : undefined,
            }}
            onClick={() => setFiltroFaixa(filtroFaixa === faixa ? '' : faixa)}
          >
            <strong>{FAIXAS_LABEL[faixa]}</strong>
            <div style={{ fontSize: '1.2rem', fontWeight: 600, color: faixa !== '0-30' ? '#b23b3b' : undefined }}>
              {formatarMoeda(dados.total)}
            </div>
            <div className="config-instrucao" style={{ fontSize: '0.8rem' }}>{dados.quantidade} lançamento(s)</div>
          </button>
        ))}
      </div>

      {linhasFiltradas.length === 0 ? (
        <p className="cliente-vazio">Nenhuma conta a receber pendente {filtroFaixa ? 'nessa faixa' : ''}.</p>
      ) : (
        <table className="cliente-tabela">
          <thead>
            <tr>
              <th>Seguradora</th><th>Módulo</th><th>Valor</th><th>Previsão</th><th>Atraso</th><th>Ações</th>
            </tr>
          </thead>
          <tbody>
            {linhasFiltradas.map((l) => (
              <LinhaContaAReceber key={l.id} linha={l} onAtualizado={carregar} />
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

function LinhaContaAReceber({ linha, onAtualizado }) {
  const [cobrando, setCobrando] = useState(false)

  async function handleMarcarRecebida() {
    await marcarComoRecebida(linha.id)
    onAtualizado()
  }

  async function handleCobrar() {
    setCobrando(true)
    try {
      const gestores = await listarGestoresPorOperadora(linha.operadora_id)
      const gestor = gestores.find((g) => g.modulo === linha.modulo)
      const numero = gestor?.whatsapp || gestor?.telefone
      if (!numero) {
        alert('Nenhum WhatsApp/telefone cadastrado pro gestor dessa seguradora nesse módulo. Cadastre em Configurações → Seguradoras.')
        return
      }
      const texto = `Olá${gestor.nome ? ', ' + gestor.nome : ''}! Temos um recebimento de comissão pendente` +
        `${linha.operadora?.nome ? ` (${linha.operadora.nome})` : ''}, valor ${formatarMoeda(linha.valor_comissao)}` +
        `${linha.data_prevista_recebimento ? `, previsto para ${formatarDataBR(linha.data_prevista_recebimento)}` : ''}.` +
        ` Poderia nos ajudar a verificar o status? Obrigado!`
      window.open(montarLinkWhatsApp(numero, texto), '_blank')
    } finally {
      setCobrando(false)
    }
  }

  return (
    <tr>
      <td>{linha.operadora?.nome || '—'}</td>
      <td>{MODULOS.find((m) => m.id === linha.modulo)?.label || linha.modulo}</td>
      <td>{formatarMoeda(linha.valor_comissao)}</td>
      <td>{linha.data_prevista_recebimento ? formatarDataBR(linha.data_prevista_recebimento) : '—'}</td>
      <td>
        {linha.faixaAtraso ? (
          <span className="ls-badge" style={{ background: '#f5d9d9', color: '#b23b3b' }}>
            {linha.diasAtraso}d ({FAIXAS_LABEL[linha.faixaAtraso]})
          </span>
        ) : (
          <span className="ls-badge">No prazo</span>
        )}
      </td>
      <td className="cliente-tabela-acoes">
        <button className="cliente-tabela-btn" onClick={handleMarcarRecebida}>Marcar recebida</button>
        <button className="cliente-tabela-btn" onClick={handleCobrar} disabled={cobrando}>
          {cobrando ? '...' : '💬 Cobrar'}
        </button>
      </td>
    </tr>
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
      <p className="config-instrucao">
        O outro lado do Ledger: dinheiro que a LifitSeg deve repassar ao corretor (não à seguradora).
        Repasses que dependem de uma comissão ainda não recebida aparecem separados, no fim da lista —
        não são "atrasados", só ainda não estão liberados pra pagamento.
      </p>

      <div className="cotacao-form-linha" style={{ flexWrap: 'wrap', marginBottom: '1rem' }}>
        {Object.entries(resumo.porFaixa).map(([faixa, dados]) => (
          <button
            key={faixa}
            className="ls-card"
            style={{
              minWidth: '150px', textAlign: 'left', cursor: 'pointer',
              border: filtroFaixa === faixa ? '2px solid #b23b3b' : undefined,
            }}
            onClick={() => setFiltroFaixa(filtroFaixa === faixa ? '' : faixa)}
          >
            <strong>{FAIXAS_LABEL[faixa]}</strong>
            <div style={{ fontSize: '1.2rem', fontWeight: 600, color: faixa !== '0-30' ? '#b23b3b' : undefined }}>
              {formatarMoeda(dados.total)}
            </div>
            <div className="config-instrucao" style={{ fontSize: '0.8rem' }}>{dados.quantidade} repasse(s)</div>
          </button>
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
          <h3 style={{ marginTop: '1.5rem' }}>Aguardando recebimento da seguradora ({aguardando.length})</h3>
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

function ConciliacaoTab() {
  const [linhas, setLinhas] = useState(null)
  const [carregando, setCarregando] = useState(true)

  useEffect(() => {
    obterConciliacao().then((r) => {
      setLinhas(r)
      setCarregando(false)
    })
  }, [])

  if (carregando) return <p className="cliente-carregando">Carregando conciliação...</p>

  return (
    <div>
      <p className="config-instrucao">
        Compara o total lançado com o total já confirmado como recebido, por seguradora.
        "Atrasado" é o que está pendente com previsão de recebimento já vencida — o ponto
        que realmente merece atenção, não apenas o que ainda está no prazo.
      </p>

      {linhas.length === 0 ? (
        <p className="cliente-vazio">Nenhum lançamento para conciliar ainda.</p>
      ) : (
        <table className="cliente-tabela">
          <thead>
            <tr>
              <th>Seguradora</th><th>Total Lançado</th><th>Total Recebido</th><th>Pendente (geral)</th><th>Atrasado</th>
            </tr>
          </thead>
          <tbody>
            {linhas.map((l) => (
              <tr key={l.operadoraId ?? 'sem_seguradora'}>
                <td>{l.operadora?.nome ?? 'Sem seguradora'}</td>
                <td>{formatarMoeda(l.totalLancado)}</td>
                <td>{formatarMoeda(l.totalRecebido)}</td>
                <td>{formatarMoeda(l.totalPendenteGeral)}</td>
                <td style={l.totalAtrasado > 0 ? { color: '#b23b3b', fontWeight: 600 } : {}}>
                  {formatarMoeda(l.totalAtrasado)}
                  {l.qtdAtrasados > 0 && ` (${l.qtdAtrasados})`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
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
      <p className="config-instrucao">
        Soma direta do que já está cadastrado (data prevista de recebimento), pros
        próximos 3 meses. Sem projeção estatística — só o que já foi lançado.
      </p>

      {meses.length === 0 ? (
        <p className="cliente-vazio">Nenhuma previsão de recebimento nos próximos meses.</p>
      ) : (
        <div className="cotacao-form-linha" style={{ flexWrap: 'wrap' }}>
          {meses.map((m) => (
            <div key={m.mes} className="ls-card" style={{ minWidth: '200px' }}>
              <strong>{m.mes}</strong>
              <div style={{ fontSize: '1.2rem', fontWeight: 600, marginTop: '0.25rem' }}>{formatarMoeda(m.totalPrevisto)}</div>
              <div className="config-instrucao" style={{ fontSize: '0.8rem' }}>
                {formatarMoeda(m.totalRecebido)} recebido · {formatarMoeda(m.totalPendente)} pendente
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function FormNovaComissao({ seguradoras, corretores, onSalvo, onCancelar }) {
  const [operadoraId, setOperadoraId] = useState('')
  const [modulo, setModulo] = useState('auto')
  const [corretorId, setCorretorId] = useState('')
  const [apoliceId, setApoliceId] = useState('')
  const [apolicesDoCorretor, setApolicesDoCorretor] = useState([])
  const [valorPremio, setValorPremio] = useState('')
  const [valorComissao, setValorComissao] = useState('')
  const [formaPagamento, setFormaPagamento] = useState('')
  const [percentualAplicado, setPercentualAplicado] = useState('')
  const [valorRepasseCorretor, setValorRepasseCorretor] = useState('')
  const [detalhesCalculo, setDetalhesCalculo] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState(null)

  useEffect(() => {
    if (corretorId) {
      listarApolices({ corretorId }).then(setApolicesDoCorretor)
    } else {
      setApolicesDoCorretor([])
    }
    setApoliceId('')
  }, [corretorId])

  async function handleSalvar() {
    if (!valorComissao) {
      setErro('Informe o valor da comissão.')
      return
    }
    setSalvando(true)
    setErro(null)
    try {
      const { data: org } = await operacional.from('organizacoes').select('id').limit(1).single()
      await criarComissao({
        organizacaoId: org.id,
        operadoraId: operadoraId || null,
        apoliceId: apoliceId || null,
        corretorId: corretorId || null,
        modulo,
        valorPremio: valorPremio || null,
        valorComissao,
        formaPagamento,
        percentualAplicado: percentualAplicado || null,
        valorRepasseCorretor: valorRepasseCorretor || null,
        detalhesCalculo,
      })
      onSalvo()
    } catch (err) {
      setErro(err.message)
    } finally {
      setSalvando(false)
    }
  }

  return (
    <div className="ls-card" style={{ marginBottom: '1rem' }}>
      <div className="cotacao-form-linha">
        <div>
          <label>Seguradora</label>
          <select value={operadoraId} onChange={(e) => setOperadoraId(e.target.value)}>
            <option value="">— Selecione —</option>
            {seguradoras.map((s) => <option key={s.id} value={s.id}>{s.nome}</option>)}
          </select>
        </div>
        <div>
          <label>Módulo</label>
          <select value={modulo} onChange={(e) => setModulo(e.target.value)}>
            {MODULOS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
          </select>
        </div>
      </div>

      <div className="cotacao-form-linha">
        <div>
          <label>Corretor</label>
          <select value={corretorId} onChange={(e) => setCorretorId(e.target.value)}>
            <option value="">— Selecione —</option>
            {corretores.map((c) => <option key={c.id} value={c.id}>{c.nome_completo}</option>)}
          </select>
        </div>
        <div>
          <label>Apólice (do corretor selecionado)</label>
          <select value={apoliceId} onChange={(e) => setApoliceId(e.target.value)} disabled={!corretorId}>
            <option value="">— Selecione —</option>
            {apolicesDoCorretor.map((ap) => (
              <option key={ap.id} value={ap.id}>
                {ap.produto} — {formatarMoeda(ap.premio)} ({new Date(ap.criado_em).toLocaleDateString('pt-BR')})
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="cotacao-form-linha">
        <div>
          <label>Valor do prêmio (opcional)</label>
          <input type="number" step="0.01" value={valorPremio} onChange={(e) => setValorPremio(e.target.value)} />
        </div>
        <div>
          <label>Valor da comissão *</label>
          <input type="number" step="0.01" value={valorComissao} onChange={(e) => setValorComissao(e.target.value)} />
        </div>
      </div>

      <div className="cotacao-form-linha">
        <div>
          <label>Forma de pagamento</label>
          <input value={formaPagamento} onChange={(e) => setFormaPagamento(e.target.value)} placeholder="Ex: à vista, 12x no cartão..." />
        </div>
        <div>
          <label>% aplicado (informativo)</label>
          <input type="number" step="0.01" value={percentualAplicado} onChange={(e) => setPercentualAplicado(e.target.value)} />
        </div>
      </div>

      <label>Repasse ao corretor (deixe em branco se não houver)</label>
      <input type="number" step="0.01" value={valorRepasseCorretor} onChange={(e) => setValorRepasseCorretor(e.target.value)} />

      <label>Como foi calculado</label>
      <textarea value={detalhesCalculo} onChange={(e) => setDetalhesCalculo(e.target.value)} rows={2} />

      {erro && <p className="ls-modal-erro">{erro}</p>}

      <div className="ls-modal-acoes">
        <button className="ls-btn ls-btn-ghost" onClick={onCancelar}>Cancelar</button>
        <button className="ls-btn ls-btn-primary" onClick={handleSalvar} disabled={salvando}>
          {salvando ? 'Salvando...' : 'Lançar Comissão'}
        </button>
      </div>
    </div>
  )
}

function LinhaComissao({ comissao, onAtualizado }) {
  const [mostrarAjuste, setMostrarAjuste] = useState(false)
  const [mostrarHistorico, setMostrarHistorico] = useState(false)
  const [valorAjuste, setValorAjuste] = useState('')
  const [motivoAjuste, setMotivoAjuste] = useState('')

  async function handleRecebida() {
    await marcarComoRecebida(comissao.id)
    onAtualizado()
  }
  async function handleRepasse() {
    await marcarRepasseComoPago(comissao.id)
    onAtualizado()
  }
  async function handleCancelar() {
    const motivo = window.prompt('Motivo do cancelamento (obrigatório):')
    if (!motivo?.trim()) return
    await cancelarComissao(comissao.id, motivo)
    onAtualizado()
  }
  async function handleSalvarAjuste() {
    if (!valorAjuste || !motivoAjuste.trim()) return
    await lancarAjuste(comissao.id, Number(valorAjuste), motivoAjuste)
    setMostrarAjuste(false)
    setValorAjuste('')
    setMotivoAjuste('')
    onAtualizado()
  }

  return (
    <>
      <tr>
        <td>{comissao.operadora?.nome || '—'}</td>
        <td>{MODULOS.find((m) => m.id === comissao.modulo)?.label || comissao.modulo}</td>
        <td>{formatarMoeda(comissao.valor_comissao)}</td>
        <td><span className="ls-badge">{comissao.status_recebimento}</span></td>
        <td>
          {comissao.status_repasse !== 'nao_aplicavel'
            ? `${formatarMoeda(comissao.valor_repasse_corretor)} (${comissao.status_repasse})`
            : '—'}
        </td>
        <td className="cliente-tabela-acoes">
          {comissao.status_recebimento === 'pendente' && (
            <button className="cliente-tabela-btn" onClick={handleRecebida}>Marcar recebida</button>
          )}
          {comissao.status_repasse === 'pendente' && (
            <button className="cliente-tabela-btn" onClick={handleRepasse}>Repasse pago</button>
          )}
          <button className="cliente-tabela-btn" onClick={() => setMostrarAjuste(!mostrarAjuste)}>Ajuste</button>
          <button className="cliente-tabela-btn" onClick={() => setMostrarHistorico(!mostrarHistorico)}>Histórico</button>
          {comissao.status_recebimento === 'pendente' && (
            <button className="cliente-tabela-btn cliente-tabela-btn-perigo" onClick={handleCancelar}>Cancelar</button>
          )}
          <BotaoOperacaoCritica
            label="Excluir"
            tabelaAfetada="operacional.comissoes"
            registroId={comissao.id}
            dadosAntes={comissao}
            executar={() => excluirComissao(comissao.id)}
            onSucesso={onAtualizado}
          />
        </td>
      </tr>
      {mostrarHistorico && <LinhaHistorico comissaoId={comissao.id} />}
      {mostrarAjuste && (
        <tr>
          <td colSpan={6}>
            <div className="ls-card" style={{ padding: '0.75rem' }}>
              <div className="cotacao-form-linha">
                <div>
                  <label>Valor do ajuste (+ ou -)</label>
                  <input type="number" step="0.01" value={valorAjuste} onChange={(e) => setValorAjuste(e.target.value)} />
                </div>
                <div>
                  <label>Motivo (obrigatório)</label>
                  <input value={motivoAjuste} onChange={(e) => setMotivoAjuste(e.target.value)} />
                </div>
              </div>
              <button className="cliente-tabela-btn" onClick={handleSalvarAjuste}>Registrar ajuste</button>
            </div>
          </td>
        </tr>
      )}
    </>
  )
}

/** Timeline Financeira — combina Ajustes + Auditoria de um lançamento,
 * sem criar nenhum histórico paralelo (só leitura combinada). */
function LinhaHistorico({ comissaoId }) {
  const [eventos, setEventos] = useState(null)

  useEffect(() => {
    obterHistoricoLancamento(comissaoId).then(setEventos)
  }, [comissaoId])

  return (
    <tr>
      <td colSpan={6}>
        <div className="ls-card" style={{ padding: '0.75rem' }}>
          <strong style={{ fontSize: '0.85rem' }}>Histórico do lançamento</strong>
          {!eventos ? (
            <p className="cliente-carregando">Carregando...</p>
          ) : eventos.length === 0 ? (
            <p className="config-instrucao">Nenhum ajuste ou operação crítica registrada ainda.</p>
          ) : (
            <ul style={{ marginTop: '0.5rem', fontSize: '0.85rem' }}>
              {eventos.map((e, i) => (
                <li key={i}>
                  <strong>{new Date(e.data).toLocaleString('pt-BR')}</strong> — {e.descricao}
                  {e.motivo && <span className="config-instrucao"> ({e.motivo})</span>}
                </li>
              ))}
            </ul>
          )}
        </div>
      </td>
    </tr>
  )
}