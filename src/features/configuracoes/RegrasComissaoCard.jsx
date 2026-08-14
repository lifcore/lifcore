import { useEffect, useState } from 'react'
import InfoTooltip from '../../components/InfoTooltip'
import { useAuth } from '../auth/AuthContext'
import {
  criarRegraComissao,
  listarRegrasComissao,
  alterarStatusRegra,
  listarProdutos,
  listarOperadoras,
} from '../../lib/crm/regrasComissaoService'

const EVENTOS = [
  { valor: 'implantacao', label: 'Implantação' },
  { valor: 'primeira_parcela', label: 'Primeira parcela' },
  { valor: 'parcela', label: 'Parcela' },
  { valor: 'mes_relativo', label: 'Mês relativo à vigência' },
  { valor: 'renovacao', label: 'Renovação' },
  { valor: 'recorrencia', label: 'Recorrência' },
]
const TIPOS_VALOR = [
  { valor: 'percentual', label: 'Percentual (%)' },
  { valor: 'valor_fixo', label: 'Valor fixo (R$)' },
  { valor: 'proporcional', label: 'Proporcional a uma base' },
]
const BASES_CALCULO = [
  { valor: 'valor_base_venda', label: 'Valor da venda' },
  { valor: 'valor_liquido_recebimento', label: 'Valor líquido recebido (só após recebimento real)' },
]
const RECORRENCIAS = [
  { valor: 'unico', label: 'Único' },
  { valor: 'limitado_periodos', label: 'Limitado a N períodos' },
  { valor: 'recorrente', label: 'Recorrente' },
  { valor: 'vitalicio', label: 'Vitalício' },
]

function componenteVazio(ordem) {
  return {
    ordem,
    evento: 'implantacao',
    periodoInicio: ordem,
    periodoFim: '',
    tipoValor: 'percentual',
    valor: '',
    baseCalculo: '',
    recorrenciaTipo: 'unico',
    limitePeriodos: '',
  }
}

export default function RegrasComissaoCard() {
  const { user } = useAuth()
  const [regras, setRegras] = useState([])
  const [produtos, setProdutos] = useState([])
  const [operadoras, setOperadoras] = useState([])
  const [carregando, setCarregando] = useState(true)
  const [mostrarForm, setMostrarForm] = useState(false)
  const [erro, setErro] = useState(null)

  useEffect(() => {
    carregar()
  }, [])

  async function carregar() {
    setCarregando(true)
    setErro(null)
    try {
      const [listaRegras, listaProdutos, listaOperadoras] = await Promise.all([
        listarRegrasComissao(),
        listarProdutos(),
        listarOperadoras(),
      ])
      setRegras(listaRegras)
      setProdutos(listaProdutos)
      setOperadoras(listaOperadoras)
    } catch (e) {
      setErro(e.message)
    }
    setCarregando(false)
  }

  function nomeProduto(id) {
    return produtos.find((p) => p.id === id)?.nome ?? '—'
  }
  function nomeOperadora(id) {
    return id ? (operadoras.find((o) => o.id === id)?.nome ?? '—') : 'Geral (todas as operadoras)'
  }

  async function handleAlterarStatus(regra) {
    const novoStatus = regra.status === 'ativo' ? 'inativo' : 'ativo'
    try {
      await alterarStatusRegra(regra.id, novoStatus)
      carregar()
    } catch (e) {
      // Se a regra já foi utilizada, o banco rejeita — mostramos o motivo real
      setErro(e.message)
    }
  }

  return (
    <div className="ls-card config-card" style={{ marginTop: '1.25rem' }}>
      <h4>
        Regras de Comissão
        <InfoTooltip
          titulo="Regras de Comissão"
          texto="Monte a regra por etapas (componentes) — ex: 100% no mês 1, 100% no mês 2, 100% no mês 3, 2% a partir do mês 4 (vitalício). O sistema aplica automaticamente pra cada venda elegível. Uma regra usada por alguma sugestão fica travada — pra mudar o comportamento, cadastre uma regra nova pra próxima competência."
        />
      </h4>

      {erro && <p className="ls-modal-erro">{erro}</p>}

      <button className="ls-btn ls-btn-primary" onClick={() => setMostrarForm(!mostrarForm)} style={{ marginBottom: '1rem' }}>
        {mostrarForm ? 'Fechar formulário' : '+ Nova Regra'}
      </button>

      {mostrarForm && (
        <FormNovaRegra
          produtos={produtos}
          operadoras={operadoras}
          usuarioId={user?.id}
          onSalvo={() => {
            setMostrarForm(false)
            carregar()
          }}
          onErro={setErro}
        />
      )}

      {carregando ? (
        <p>Carregando...</p>
      ) : regras.length === 0 ? (
        <p className="config-instrucao">Nenhuma regra cadastrada ainda.</p>
      ) : (
        <div className="ls-card" style={{ marginTop: '0.75rem', padding: 0 }}>
          <table className="cliente-tabela">
            <thead>
              <tr>
                <th>Produto</th><th>Operadora</th><th>Competência</th><th>Descrição</th><th>Componentes</th><th>Status</th><th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {regras.map((r) => (
                <tr key={r.id}>
                  <td>{nomeProduto(r.produto_id)}</td>
                  <td>{nomeOperadora(r.operadora_id)}</td>
                  <td>{new Date(r.competencia_referencia).toLocaleDateString('pt-BR', { month: '2-digit', year: 'numeric', timeZone: 'UTC' })}</td>
                  <td>{r.descricao}</td>
                  <td>{r.componentes?.length ?? 0}</td>
                  <td>
                    <span className={`ls-badge ls-badge-${r.status === 'ativo' ? 'cliente' : 'inativo'}`}>{r.status}</span>
                  </td>
                  <td className="cliente-tabela-acoes">
                    <button className="cliente-tabela-btn" onClick={() => handleAlterarStatus(r)}>
                      {r.status === 'ativo' ? 'Inativar' : 'Ativar'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function FormNovaRegra({ produtos, operadoras, usuarioId, onSalvo, onErro }) {
  const [produtoId, setProdutoId] = useState('')
  const [operadoraId, setOperadoraId] = useState('')
  const [competencia, setCompetencia] = useState('')
  const [descricao, setDescricao] = useState('')
  const [componentes, setComponentes] = useState([componenteVazio(1)])
  const [salvando, setSalvando] = useState(false)

  function atualizarComponente(indice, campo, valor) {
    setComponentes((atual) => atual.map((c, i) => (i === indice ? { ...c, [campo]: valor } : c)))
  }

  function adicionarComponente() {
    setComponentes((atual) => [...atual, componenteVazio(atual.length + 1)])
  }

  function removerComponente(indice) {
    setComponentes((atual) => atual.filter((_, i) => i !== indice).map((c, i) => ({ ...c, ordem: i + 1 })))
  }

  async function handleSalvar() {
    onErro(null)
    if (!produtoId) return onErro('Selecione o produto.')
    if (!competencia) return onErro('Informe a competência.')
    if (!descricao.trim()) return onErro('Informe a descrição da regra.')

    setSalvando(true)
    try {
      await criarRegraComissao({
        produtoId,
        operadoraId: operadoraId || null,
        competenciaReferencia: `${competencia}-01`,
        descricao,
        criadoPor: usuarioId,
        componentes: componentes.map((c) => ({
          evento: c.evento,
          periodoInicio: Number(c.periodoInicio),
          periodoFim: c.periodoFim === '' ? null : Number(c.periodoFim),
          tipoValor: c.tipoValor,
          valor: Number(c.valor),
          baseCalculo: c.tipoValor === 'proporcional' ? c.baseCalculo : null,
          recorrenciaTipo: c.recorrenciaTipo,
          limitePeriodos: c.recorrenciaTipo === 'limitado_periodos' ? Number(c.limitePeriodos) : null,
        })),
      })
      onSalvo()
    } catch (e) {
      onErro(e.message)
    }
    setSalvando(false)
  }

  return (
    <div className="ls-card" style={{ padding: '1rem', marginBottom: '1.5rem', background: 'var(--ls-bg-alt, rgba(255,255,255,0.03))' }}>
      <div className="config-form-grid">
        <div>
          <label>Produto *</label>
          <select value={produtoId} onChange={(e) => setProdutoId(e.target.value)}>
            <option value="">Selecione...</option>
            {produtos.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
          </select>
        </div>
        <div>
          <label>Operadora (opcional — vazio = regra geral do produto)</label>
          <select value={operadoraId} onChange={(e) => setOperadoraId(e.target.value)}>
            <option value="">Geral (todas as operadoras)</option>
            {operadoras.map((o) => <option key={o.id} value={o.id}>{o.nome}</option>)}
          </select>
        </div>
        <div>
          <label>Competência *</label>
          <input type="month" value={competencia} onChange={(e) => setCompetencia(e.target.value)} />
        </div>
        <div className="config-campo-largo">
          <label>Descrição *</label>
          <input value={descricao} onChange={(e) => setDescricao(e.target.value)} placeholder="ex: Saúde PME 2-29 — implantação + vitalício" />
        </div>
      </div>

      <h5 style={{ marginTop: '1.25rem', marginBottom: '0.5rem' }}>Componentes da regra</h5>
      {componentes.map((c, i) => (
        <div key={i} className="ls-card" style={{ padding: '0.75rem', marginBottom: '0.6rem' }}>
          <div className="config-form-grid">
            <div>
              <label>Evento</label>
              <select value={c.evento} onChange={(e) => atualizarComponente(i, 'evento', e.target.value)}>
                {EVENTOS.map((ev) => <option key={ev.valor} value={ev.valor}>{ev.label}</option>)}
              </select>
            </div>
            <div>
              <label>Período início (mês)</label>
              <input type="number" min="1" value={c.periodoInicio} onChange={(e) => atualizarComponente(i, 'periodoInicio', e.target.value)} />
            </div>
            <div>
              <label>Período fim (vazio = sem fim)</label>
              <input type="number" min="1" value={c.periodoFim} onChange={(e) => atualizarComponente(i, 'periodoFim', e.target.value)} />
            </div>
            <div>
              <label>Tipo de valor</label>
              <select value={c.tipoValor} onChange={(e) => atualizarComponente(i, 'tipoValor', e.target.value)}>
                {TIPOS_VALOR.map((t) => <option key={t.valor} value={t.valor}>{t.label}</option>)}
              </select>
            </div>
            <div>
              <label>Valor {c.tipoValor === 'percentual' || c.tipoValor === 'proporcional' ? '(%)' : '(R$)'}</label>
              <input type="number" step="0.01" min="0" value={c.valor} onChange={(e) => atualizarComponente(i, 'valor', e.target.value)} />
            </div>
            {c.tipoValor === 'proporcional' && (
              <div>
                <label>Base do proporcional</label>
                <select value={c.baseCalculo} onChange={(e) => atualizarComponente(i, 'baseCalculo', e.target.value)}>
                  <option value="">Selecione...</option>
                  {BASES_CALCULO.map((b) => <option key={b.valor} value={b.valor}>{b.label}</option>)}
                </select>
              </div>
            )}
            <div>
              <label>Recorrência</label>
              <select value={c.recorrenciaTipo} onChange={(e) => atualizarComponente(i, 'recorrenciaTipo', e.target.value)}>
                {RECORRENCIAS.map((r) => <option key={r.valor} value={r.valor}>{r.label}</option>)}
              </select>
            </div>
            {c.recorrenciaTipo === 'limitado_periodos' && (
              <div>
                <label>Limite de períodos</label>
                <input type="number" min="1" value={c.limitePeriodos} onChange={(e) => atualizarComponente(i, 'limitePeriodos', e.target.value)} />
              </div>
            )}
          </div>
          {componentes.length > 1 && (
            <button className="cliente-tabela-btn cliente-tabela-btn-perigo" onClick={() => removerComponente(i)} style={{ marginTop: '0.5rem' }}>
              Remover componente
            </button>
          )}
        </div>
      ))}

      <button className="ls-btn ls-btn-ghost" onClick={adicionarComponente} style={{ marginBottom: '1rem' }}>
        + Adicionar componente
      </button>

      <div>
        <button className="ls-btn ls-btn-primary" onClick={handleSalvar} disabled={salvando}>
          {salvando ? 'Salvando...' : 'Salvar Regra'}
        </button>
      </div>
    </div>
  )
}
