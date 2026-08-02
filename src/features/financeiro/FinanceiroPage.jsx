import { useEffect, useState } from 'react'
import {
  listarComissoes,
  criarComissao,
  marcarComoRecebida,
  marcarRepasseComoPago,
  cancelarComissao,
  excluirComissao,
  resumoComissoes,
} from '../../lib/crm/comissoesService'
import { listarSeguradoras } from '../../lib/crm/seguradorasService'
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
  const [comissoes, setComissoes] = useState([])
  const [resumo, setResumo] = useState(null)
  const [seguradoras, setSeguradoras] = useState([])
  const [carregando, setCarregando] = useState(true)
  const [mostrarForm, setMostrarForm] = useState(false)

  // Filtros
  const [filtroSeguradora, setFiltroSeguradora] = useState('')
  const [filtroModulo, setFiltroModulo] = useState('')
  const [filtroStatusRecebimento, setFiltroStatusRecebimento] = useState('')
  const [filtroStatusRepasse, setFiltroStatusRepasse] = useState('')
  const [filtroPeriodoInicio, setFiltroPeriodoInicio] = useState('')
  const [filtroPeriodoFim, setFiltroPeriodoFim] = useState('')

  useEffect(() => {
    listarSeguradoras().then(setSeguradoras)
  }, [])

  useEffect(() => {
    carregar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtroSeguradora, filtroModulo, filtroStatusRecebimento, filtroStatusRepasse, filtroPeriodoInicio, filtroPeriodoFim])

  function filtrosAtivos() {
    const f = {}
    if (filtroSeguradora) f.seguradoraId = filtroSeguradora
    if (filtroModulo) f.modulo = filtroModulo
    if (filtroStatusRecebimento) f.statusRecebimento = filtroStatusRecebimento
    if (filtroStatusRepasse) f.statusRepasse = filtroStatusRepasse
    if (filtroPeriodoInicio) f.periodoInicio = filtroPeriodoInicio
    if (filtroPeriodoFim) f.periodoFim = filtroPeriodoFim
    return f
  }

  async function carregar() {
    setCarregando(true)
    const filtros = filtrosAtivos()
    const [lista, res] = await Promise.all([listarComissoes(filtros), resumoComissoes(filtros)])
    setComissoes(lista)
    setResumo(res)
    setCarregando(false)
  }

  function limparFiltros() {
    setFiltroSeguradora('')
    setFiltroModulo('')
    setFiltroStatusRecebimento('')
    setFiltroStatusRepasse('')
    setFiltroPeriodoInicio('')
    setFiltroPeriodoFim('')
  }

  return (
    <div className="config-page">
      <h2>Financeiro — Comissões</h2>
      <p className="config-instrucao">
        Livro-razão de comissões: registro manual do que foi apurado por apólice.
        Este módulo não calcula comissão automaticamente — cada regra de cálculo
        varia por seguradora, produto e forma de pagamento, e ainda está sendo
        mapeada. Lance aqui o valor já apurado.
      </p>

      {resumo && (
        <div className="cotacao-form-linha" style={{ marginBottom: '1rem' }}>
          <div className="ls-card"><strong>Comissão Prevista</strong><div>{formatarMoeda(resumo.comissaoPrevista)}</div></div>
          <div className="ls-card"><strong>Comissão Recebida</strong><div>{formatarMoeda(resumo.comissaoRecebida)}</div></div>
          <div className="ls-card"><strong>Comissão Pendente</strong><div>{formatarMoeda(resumo.comissaoPendente)}</div></div>
          <div className="ls-card"><strong>Comissão Repassada</strong><div>{formatarMoeda(resumo.comissaoRepassada)}</div></div>
        </div>
      )}

      <div className="ls-card" style={{ marginBottom: '1rem' }}>
        <div className="cotacao-form-linha">
          <div>
            <label>Seguradora</label>
            <select value={filtroSeguradora} onChange={(e) => setFiltroSeguradora(e.target.value)}>
              <option value="">Todas</option>
              {seguradoras.map((s) => <option key={s.id} value={s.id}>{s.nome_fantasia}</option>)}
            </select>
          </div>
          <div>
            <label>Módulo</label>
            <select value={filtroModulo} onChange={(e) => setFiltroModulo(e.target.value)}>
              <option value="">Todos</option>
              {MODULOS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
            </select>
          </div>
        </div>
        <div className="cotacao-form-linha">
          <div>
            <label>Status recebimento</label>
            <select value={filtroStatusRecebimento} onChange={(e) => setFiltroStatusRecebimento(e.target.value)}>
              <option value="">Todos</option>
              {STATUS_RECEBIMENTO.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
            </select>
          </div>
          <div>
            <label>Status repasse</label>
            <select value={filtroStatusRepasse} onChange={(e) => setFiltroStatusRepasse(e.target.value)}>
              <option value="">Todos</option>
              {STATUS_REPASSE.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
            </select>
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
        <button className="cliente-tabela-btn" onClick={limparFiltros}>Limpar filtros</button>
      </div>

      <button className="ls-btn ls-btn-accent" onClick={() => setMostrarForm(!mostrarForm)} style={{ marginBottom: '1rem' }}>
        {mostrarForm ? 'Cancelar' : '+ Lançar Comissão'}
      </button>

      {mostrarForm && (
        <FormNovaComissao
          seguradoras={seguradoras}
          onSalvo={() => { setMostrarForm(false); carregar() }}
          onCancelar={() => setMostrarForm(false)}
        />
      )}

      {carregando ? (
        <p className="cliente-carregando">Carregando...</p>
      ) : comissoes.length === 0 ? (
        <p className="cliente-vazio">Nenhuma comissão encontrada para os filtros selecionados.</p>
      ) : (
        <table className="cliente-tabela">
          <thead>
            <tr>
              <th>Seguradora</th><th>Módulo</th><th>Comissão</th><th>Status</th><th>Repasse</th><th>Ações</th>
            </tr>
          </thead>
          <tbody>
            {comissoes.map((c) => (
              <LinhaComissao key={c.id} comissao={c} onAtualizado={carregar} />
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

function FormNovaComissao({ seguradoras, onSalvo, onCancelar }) {
  const [seguradoraId, setSeguradoraId] = useState('')
  const [modulo, setModulo] = useState('auto')
  const [valorPremio, setValorPremio] = useState('')
  const [valorComissao, setValorComissao] = useState('')
  const [formaPagamento, setFormaPagamento] = useState('')
  const [percentualAplicado, setPercentualAplicado] = useState('')
  const [valorRepasseCorretor, setValorRepasseCorretor] = useState('')
  const [detalhesCalculo, setDetalhesCalculo] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState(null)

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
        seguradoraId: seguradoraId || null,
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
          <select value={seguradoraId} onChange={(e) => setSeguradoraId(e.target.value)}>
            <option value="">— Selecione —</option>
            {seguradoras.map((s) => <option key={s.id} value={s.id}>{s.nome_fantasia}</option>)}
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

      <label>Como foi calculado (registre aqui — importante enquanto não há regra automática)</label>
      <textarea value={detalhesCalculo} onChange={(e) => setDetalhesCalculo(e.target.value)} rows={2} />

      <p className="config-instrucao" style={{ marginTop: '0.5rem' }}>
        Vínculo com uma apólice ou corretor específico ainda não está disponível
        neste formulário — depende de confirmar os services reais desses módulos.
      </p>

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
  async function handleRecebida() {
    await marcarComoRecebida(comissao.id)
    onAtualizado()
  }
  async function handleRepasse() {
    await marcarRepasseComoPago(comissao.id)
    onAtualizado()
  }
  async function handleCancelar() {
    if (!window.confirm('Cancelar este registro de comissão?')) return
    await cancelarComissao(comissao.id)
    onAtualizado()
  }
  async function handleExcluir() {
    if (!window.confirm('Excluir definitivamente este lançamento?')) return
    await excluirComissao(comissao.id)
    onAtualizado()
  }

  return (
    <tr>
      <td>{comissao.seguradoras?.nome_fantasia || '—'}</td>
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
          <button className="cliente-tabela-btn" onClick={handleRepasse}>Marcar repasse pago</button>
        )}
        {comissao.status_recebimento === 'pendente' && (
          <button className="cliente-tabela-btn cliente-tabela-btn-perigo" onClick={handleCancelar}>Cancelar</button>
        )}
        <button className="cliente-tabela-btn cliente-tabela-btn-perigo" onClick={handleExcluir}>Excluir</button>
      </td>
    </tr>
  )
}