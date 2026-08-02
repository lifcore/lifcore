import { useEffect, useState } from 'react'
import {
  listarComissoes,
  criarComissao,
  marcarComoRecebida,
  marcarRepasseComoPago,
  cancelarComissao,
  excluirComissao,
  lancarAjuste,
  indicadoresOperacionais,
} from '../../lib/crm/comissoesService'
import { listarCatalogoSeguradoras, listarApolices, listarCorretores } from '../../lib/crm/apolicesService'
import { operacional } from '../../lib/supabaseSchemas'

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
      <h2>Financeiro — Comissões</h2>
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
  async function handleExcluir() {
    if (!window.confirm('Excluir definitivamente este lançamento?')) return
    await excluirComissao(comissao.id)
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
          {comissao.status_recebimento === 'pendente' && (
            <button className="cliente-tabela-btn cliente-tabela-btn-perigo" onClick={handleCancelar}>Cancelar</button>
          )}
          <button className="cliente-tabela-btn cliente-tabela-btn-perigo" onClick={handleExcluir}>Excluir</button>
        </td>
      </tr>
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