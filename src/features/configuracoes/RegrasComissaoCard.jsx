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

const BASES_CALCULO = [
  { valor: 'premio_sem_iof', label: 'Prêmio/valor total sem IOF' },
  { valor: 'mensalidade', label: 'Mensalidade' },
  { valor: 'parcela_recebida', label: 'Parcela recebida' },
  { valor: 'manual', label: 'Manual (informado pelo Gestor por apólice)' },
]

const MODELOS_RECEBIMENTO = [
  { valor: 'cascata', label: 'Cascata', descricao: 'Comissão total é abatida pelos recebimentos reais até quitar.' },
  { valor: 'proporcional', label: 'Proporcional', descricao: 'Cada recebimento real gera comissão proporcional ao valor pago.' },
  { valor: 'desdobrada', label: 'Desdobrada', descricao: 'Percentual fixo por parcela — a única que já calcula sugestão detalhada agora.' },
]

const BADGE_MODELO = { cascata: '🟦', proporcional: '🟩', desdobrada: '🟨' }

function componenteVazio(ordem) {
  return { ordem, periodoInicio: ordem, valor: '' }
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
    return id ? (operadoras.find((o) => o.id === id)?.nome ?? '—') : 'Geral'
  }

  async function handleAlterarStatus(regra) {
    const novoStatus = regra.status === 'ativo' ? 'inativo' : 'ativo'
    try {
      await alterarStatusRegra(regra.id, novoStatus)
      carregar()
    } catch (e) {
      setErro(e.message)
    }
  }

  return (
    <div className="ls-card config-card" style={{ marginTop: '1.25rem' }}>
      <h4>
        Regras de Comissão
        <InfoTooltip
          titulo="Regras de Comissão"
          texto="A regra ensina um padrão ao sistema — não decide o fato financeiro. Escolha a base de cálculo, o percentual, e como a comissão é recebida (Cascata/Proporcional/Desdobrada). Uma regra usada por alguma sugestão fica travada — pra mudar o comportamento, cadastre uma regra nova pra próxima competência."
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
          onSalvo={(qtd) => {
            setMostrarForm(false)
            setErro(null)
            carregar()
            if (qtd > 1) alert(`${qtd} regras criadas (1 por combinação produto × operadora selecionada).`)
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
                <th>Produto</th><th>Operadora</th><th>Competência</th><th>Descrição</th><th>Base</th><th>%</th><th>Modelo</th><th>Vitalício</th><th>Status</th><th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {regras.map((r) => (
                <tr key={r.id}>
                  <td>{nomeProduto(r.produto_id)}</td>
                  <td>{nomeOperadora(r.operadora_id)}</td>
                  <td>{new Date(r.competencia_referencia).toLocaleDateString('pt-BR', { month: '2-digit', year: 'numeric', timeZone: 'UTC' })}</td>
                  <td>{r.descricao}</td>
                  <td>{BASES_CALCULO.find((b) => b.valor === r.base_calculo)?.label ?? '—'}</td>
                  <td>{r.origem_percentual === 'informado_por_apolice' ? 'Por apólice' : r.percentual != null ? `${r.percentual}%` : '—'}</td>
                  <td>{BADGE_MODELO[r.modelo_recebimento] ?? ''} {r.modelo_recebimento}</td>
                  <td>{r.vitalicio ? `Sim (${r.vitalicio_percentual}%)` : 'Não'}</td>
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
  const [produtoIds, setProdutoIds] = useState([])
  const [operadoraIds, setOperadoraIds] = useState([]) // vazio = geral
  const [competencia, setCompetencia] = useState('')
  const [descricao, setDescricao] = useState('')
  const [baseCalculo, setBaseCalculo] = useState('premio_sem_iof')
  const [percentual, setPercentual] = useState('')
  const [origemPercentual, setOrigemPercentual] = useState('fixo')
  const [modeloRecebimento, setModeloRecebimento] = useState('desdobrada')
  const [vitalicio, setVitalicio] = useState(false)
  const [vitalicioPercentual, setVitalicioPercentual] = useState('')
  const [vitalicioPeriodoInicio, setVitalicioPeriodoInicio] = useState('')
  const [componentes, setComponentes] = useState([componenteVazio(1)])
  const [salvando, setSalvando] = useState(false)

  const somaComponentes = componentes.reduce((s, c) => s + (Number(c.valor) || 0), 0)
  const somaBate = modeloRecebimento !== 'desdobrada' || Math.abs(somaComponentes - Number(percentual || 0)) < 0.01

  function toggleSelecao(lista, setLista, id) {
    setLista(lista.includes(id) ? lista.filter((x) => x !== id) : [...lista, id])
  }

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
    if (!produtoIds.length) return onErro('Selecione ao menos 1 produto.')
    if (!competencia) return onErro('Informe a competência.')
    if (!descricao.trim()) return onErro('Informe a descrição da regra.')
    if (origemPercentual === 'fixo' && !percentual) return onErro('Informe o percentual da comissão.')
    if (modeloRecebimento === 'desdobrada' && !somaBate) {
      return onErro(`A soma dos componentes (${somaComponentes.toFixed(2)}%) precisa bater com o percentual total (${Number(percentual).toFixed(2)}%) antes de salvar.`)
    }

    setSalvando(true)
    try {
      const criadas = await criarRegraComissao({
        produtoIds,
        operadoraIds,
        competenciaReferencia: `${competencia}-01`,
        descricao,
        baseCalculo,
        percentual: origemPercentual === 'fixo' ? Number(percentual) : null,
        origemPercentual,
        modeloRecebimento,
        vitalicio,
        vitalicioPercentual: vitalicio ? Number(vitalicioPercentual) : null,
        vitalicioPeriodoInicio: vitalicio && modeloRecebimento === 'desdobrada' ? Number(vitalicioPeriodoInicio) : null,
        criadoPor: usuarioId,
        componentes:
          modeloRecebimento === 'desdobrada'
            ? componentes.map((c) => ({
                evento: 'parcela',
                periodoInicio: Number(c.periodoInicio),
                periodoFim: Number(c.periodoInicio),
                tipoValor: 'percentual',
                valor: Number(c.valor),
                recorrenciaTipo: 'unico',
              }))
            : [],
      })
      onSalvo(criadas.length)
    } catch (e) {
      onErro(e.message)
    }
    setSalvando(false)
  }

  return (
    <div className="ls-card" style={{ padding: '1rem', marginBottom: '1.5rem', background: 'var(--ls-bg-alt, rgba(255,255,255,0.03))' }}>
      <h5 style={{ marginTop: 0 }}>Aplicar a</h5>
      <div className="cotacao-form-linha">
        <div>
          <label>Produtos * (selecione 1 ou mais)</label>
          <div className="ls-card" style={{ padding: '0.5rem', maxHeight: '140px', overflowY: 'auto' }}>
            {produtos.map((p) => (
              <label key={p.id} style={{ display: 'block', fontWeight: 'normal', padding: '0.15rem 0' }}>
                <input type="checkbox" checked={produtoIds.includes(p.id)} onChange={() => toggleSelecao(produtoIds, setProdutoIds, p.id)} /> {p.nome}
              </label>
            ))}
          </div>
        </div>
        <div>
          <label>Operadoras (vazio = regra geral do produto)</label>
          <div className="ls-card" style={{ padding: '0.5rem', maxHeight: '140px', overflowY: 'auto' }}>
            {operadoras.map((o) => (
              <label key={o.id} style={{ display: 'block', fontWeight: 'normal', padding: '0.15rem 0' }}>
                <input type="checkbox" checked={operadoraIds.includes(o.id)} onChange={() => toggleSelecao(operadoraIds, setOperadoraIds, o.id)} /> {o.nome}
              </label>
            ))}
          </div>
        </div>
      </div>
      {produtoIds.length > 1 || operadoraIds.length > 1 ? (
        <p className="config-instrucao">
          Vai criar {produtoIds.length} × {operadoraIds.length || 1} = <strong>{produtoIds.length * (operadoraIds.length || 1)} regras</strong> (uma por combinação).
        </p>
      ) : null}

      <div className="cotacao-form-linha" style={{ marginTop: '0.75rem' }}>
        <div>
          <label>Competência *</label>
          <input type="month" value={competencia} onChange={(e) => setCompetencia(e.target.value)} />
        </div>
        <div className="config-campo-largo">
          <label>Descrição *</label>
          <input value={descricao} onChange={(e) => setDescricao(e.target.value)} placeholder="ex: Saúde PME 2-29" />
        </div>
      </div>

      <h5 style={{ marginTop: '1.25rem' }}>Como calcular?</h5>
      <div className="cotacao-form-linha">
        <div>
          <label>Base</label>
          {BASES_CALCULO.map((b) => (
            <label key={b.valor} style={{ display: 'block', fontWeight: 'normal' }}>
              <input type="radio" name="base" checked={baseCalculo === b.valor} onChange={() => setBaseCalculo(b.valor)} /> {b.label}
            </label>
          ))}
        </div>
        <div>
          <label>Percentual (%) {origemPercentual === 'fixo' ? '*' : ''}</label>
          <input
            type="number"
            step="0.01"
            min="0"
            value={percentual}
            onChange={(e) => setPercentual(e.target.value)}
            placeholder="ex: 10 ou 400"
            disabled={origemPercentual === 'informado_por_apolice'}
          />
          {modeloRecebimento !== 'desdobrada' && (
            <div style={{ marginTop: '0.4rem' }}>
              <label style={{ display: 'block', fontWeight: 'normal' }}>
                <input
                  type="radio"
                  name="origemPercentual"
                  checked={origemPercentual === 'fixo'}
                  onChange={() => setOrigemPercentual('fixo')}
                /> Percentual fixo (definido aqui)
              </label>
              <label style={{ display: 'block', fontWeight: 'normal' }}>
                <input
                  type="radio"
                  name="origemPercentual"
                  checked={origemPercentual === 'informado_por_apolice'}
                  onChange={() => { setOrigemPercentual('informado_por_apolice'); setPercentual('') }}
                /> Informado por apólice (negociado pelo corretor, campo já existente na venda)
              </label>
              {origemPercentual === 'informado_por_apolice' && (
                <p className="config-instrucao">
                  A sugestão vai usar o "Comissionamento (%)" preenchido em cada apólice. Se a apólice não tiver esse campo, a sugestão fica pendente até alguém preencher — nunca assume valor.
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      <h5 style={{ marginTop: '1.25rem' }}>Como receber?</h5>
      {MODELOS_RECEBIMENTO.map((m) => (
        <label key={m.valor} style={{ display: 'block', fontWeight: 'normal', marginBottom: '0.3rem' }}>
          <input
            type="radio"
            name="modelo"
            checked={modeloRecebimento === m.valor}
            onChange={() => {
              setModeloRecebimento(m.valor)
              if (m.valor === 'desdobrada') setOrigemPercentual('fixo')
            }}
          />{' '}
          {BADGE_MODELO[m.valor]} <strong>{m.label}</strong> — <span className="config-instrucao">{m.descricao}</span>
        </label>
      ))}

      {(modeloRecebimento === 'cascata' || modeloRecebimento === 'proporcional') && (
        <p className="config-instrucao" style={{ marginTop: '0.4rem' }}>
          Este modelo calcula a <strong>expectativa total</strong> já na venda. A distribuição real por recebimento só existirá quando a Conciliação for construída (etapa futura, não incluída aqui).
        </p>
      )}

      {modeloRecebimento === 'desdobrada' && (
        <div style={{ marginTop: '0.75rem' }}>
          <p className="config-instrucao">
            Soma atual: <strong style={{ color: somaBate ? '#2f7a3d' : '#b23b3b' }}>{somaComponentes.toFixed(2)}%</strong>
            {' '}— precisa bater com o percentual total informado acima ({Number(percentual || 0).toFixed(2)}%).
          </p>
          {componentes.map((c, i) => (
            <div key={i} className="cotacao-form-linha" style={{ alignItems: 'center', marginBottom: '0.4rem' }}>
              <div>
                <label>Parcela</label>
                <input type="number" min="1" value={c.periodoInicio} onChange={(e) => atualizarComponente(i, 'periodoInicio', e.target.value)} />
              </div>
              <div>
                <label>Percentual (%)</label>
                <input type="number" step="0.01" min="0" value={c.valor} onChange={(e) => atualizarComponente(i, 'valor', e.target.value)} />
              </div>
              {componentes.length > 1 && (
                <button className="cliente-tabela-btn cliente-tabela-btn-perigo" onClick={() => removerComponente(i)} style={{ marginTop: '1.2rem' }}>
                  Remover
                </button>
              )}
            </div>
          ))}
          <button className="ls-btn ls-btn-ghost" onClick={adicionarComponente}>+ Adicionar parcela</button>
        </div>
      )}

      <h5 style={{ marginTop: '1.25rem' }}>Existe vitalício?</h5>
      <label style={{ display: 'block', fontWeight: 'normal' }}>
        <input type="radio" name="vitalicio" checked={!vitalicio} onChange={() => setVitalicio(false)} /> Não
      </label>
      <label style={{ display: 'block', fontWeight: 'normal', marginBottom: '0.5rem' }}>
        <input type="radio" name="vitalicio" checked={vitalicio} onChange={() => setVitalicio(true)} /> Sim
      </label>
      {vitalicio && (
        <div className="cotacao-form-linha">
          <div>
            <label>Percentual vitalício (%) *</label>
            <input type="number" step="0.01" min="0" value={vitalicioPercentual} onChange={(e) => setVitalicioPercentual(e.target.value)} />
          </div>
          {modeloRecebimento === 'desdobrada' ? (
            <div>
              <label>Início (a partir de qual parcela) *</label>
              <input type="number" min="1" value={vitalicioPeriodoInicio} onChange={(e) => setVitalicioPeriodoInicio(e.target.value)} />
            </div>
          ) : (
            <p className="config-instrucao" style={{ alignSelf: 'center' }}>
              {modeloRecebimento === 'cascata'
                ? 'Início: só depois da comissão de venda quitada (depende da Conciliação — só registrado por enquanto).'
                : 'Aplicado sobre os recebimentos posteriores, conforme a regra (depende da Conciliação — só registrado por enquanto).'}
            </p>
          )}
        </div>
      )}

      <div style={{ marginTop: '1.25rem' }}>
        <button className="ls-btn ls-btn-primary" onClick={handleSalvar} disabled={salvando}>
          {salvando ? 'Salvando...' : 'Salvar Regra'}
        </button>
      </div>
    </div>
  )
}
