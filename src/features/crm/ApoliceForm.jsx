import { useEffect, useState } from 'react'
import { useAuth } from '../auth/AuthContext'
import { operacional } from '../../lib/supabaseSchemas'
import {
  PRODUTOS_APOLICE,
  listarCatalogoSeguradoras,
  criarSeguradora,
  criarApolice,
} from '../../lib/crm/apolicesService'

export default function ApoliceForm({ onSalvo, onCancelar }) {
  const { perfil } = useAuth()
  const [produto, setProduto] = useState('Auto')
  const [nomeCliente, setNomeCliente] = useState('')
  const [numeroApolice, setNumeroApolice] = useState('')
  const [seguradoraNome, setSeguradoraNome] = useState('')
  const [premio, setPremio] = useState('')
  const [formaPagamentoVezes, setFormaPagamentoVezes] = useState('1')
  const [comissionamento, setComissionamento] = useState('')
  const [vigenciaInicio, setVigenciaInicio] = useState('')
  const [vigenciaFim, setVigenciaFim] = useState('')
  const [catalogoSeguradoras, setCatalogoSeguradoras] = useState([])
  const [mostrarNovaSeguradora, setMostrarNovaSeguradora] = useState(false)
  const [obsNovaSeguradora, setObsNovaSeguradora] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState(null)

  useEffect(() => {
    listarCatalogoSeguradoras().then(setCatalogoSeguradoras).catch(() => {})
  }, [])

  function handleVigenciaInicioChange(valor) {
    setVigenciaInicio(valor)
    if (valor && !vigenciaFim) {
      const data = new Date(valor)
      data.setFullYear(data.getFullYear() + 1)
      setVigenciaFim(data.toISOString().slice(0, 10))
    }
  }

  async function handleCriarSeguradoraRapido() {
    if (!seguradoraNome.trim()) return
    try {
      await criarSeguradora({
        nome: seguradoraNome,
        categoriaSeguro: produto,
        observacoesComissionamento: obsNovaSeguradora || null,
      })
      const listaAtualizada = await listarCatalogoSeguradoras()
      setCatalogoSeguradoras(listaAtualizada)
      setMostrarNovaSeguradora(false)
      setObsNovaSeguradora('')
    } catch (err) {
      setErro(err.message)
    }
  }

  async function handleSalvar() {
    if (!nomeCliente.trim() || !seguradoraNome.trim() || !premio) {
      setErro('Preencha ao menos cliente, seguradora e prêmio.')
      return
    }
    setSalvando(true)
    setErro(null)
    try {
      const { data: org } = await operacional.from('organizacoes').select('id').limit(1).single()
      const seguradoraExistente = catalogoSeguradoras.find(
        (s) => s.nome.toLowerCase() === seguradoraNome.trim().toLowerCase()
      )

      await criarApolice({
        corretorId: perfil.id,
        organizacaoId: org.id,
        dados: {
          produto,
          nome_cliente: nomeCliente,
          numero_apolice: numeroApolice || null,
          operadora_id: seguradoraExistente?.id ?? null,
          operadora_nome_livre: seguradoraNome,
          premio: parseFloat(String(premio).replace(',', '.')) || 0,
          forma_pagamento_vezes: parseInt(formaPagamentoVezes, 10) || 1,
          comissionamento_percentual: comissionamento ? parseFloat(String(comissionamento).replace(',', '.')) : null,
          vigencia_inicio: vigenciaInicio || null,
          vigencia_fim: vigenciaFim || null,
        },
      })
      onSalvo()
    } catch (err) {
      setErro(err.message)
    } finally {
      setSalvando(false)
    }
  }

  return (
    <div className="cotacao-form">
      <datalist id="lista-seguradoras-apolice">
        {catalogoSeguradoras.map((s) => (
          <option key={s.id} value={s.nome} />
        ))}
      </datalist>

      <div className="cotacao-form-linha">
        <div>
          <label>Produto</label>
          <select value={produto} onChange={(e) => setProduto(e.target.value)} className="demanda-select-status">
            {PRODUTOS_APOLICE.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
        </div>
        <div>
          <label>Nome do cliente</label>
          <input value={nomeCliente} onChange={(e) => setNomeCliente(e.target.value)} />
        </div>
        <div>
          <label>Número da apólice</label>
          <input value={numeroApolice} onChange={(e) => setNumeroApolice(e.target.value)} />
        </div>
      </div>

      <div className="cotacao-form-linha">
        <div>
          <label>Seguradora</label>
          <input
            list="lista-seguradoras-apolice"
            value={seguradoraNome}
            onChange={(e) => setSeguradoraNome(e.target.value)}
            placeholder="Comece a digitar..."
          />
          {seguradoraNome.trim() &&
            !catalogoSeguradoras.some((s) => s.nome.toLowerCase() === seguradoraNome.trim().toLowerCase()) && (
              <button className="ls-btn ls-btn-ghost" style={{ marginTop: '0.4rem', fontSize: '0.75rem' }} onClick={() => setMostrarNovaSeguradora(true)}>
                + Cadastrar "{seguradoraNome}" como nova seguradora
              </button>
            )}
        </div>
        <div>
          <label>Prêmio (sem IOF)</label>
          <input value={premio} onChange={(e) => setPremio(e.target.value)} placeholder="Ex: 5000,00" />
        </div>
        <div>
          <label>Pagamento em quantas vezes</label>
          <input type="number" value={formaPagamentoVezes} onChange={(e) => setFormaPagamentoVezes(e.target.value)} />
        </div>
      </div>

      {mostrarNovaSeguradora && (
        <div className="ls-card" style={{ padding: '0.85rem', marginBottom: '0.75rem' }}>
          <label>Observações sobre comissionamento desta seguradora (opcional, texto livre)</label>
          <textarea
            value={obsNovaSeguradora}
            onChange={(e) => setObsNovaSeguradora(e.target.value)}
            rows={3}
            style={{ width: '100%', padding: '0.5rem 0.65rem', border: '1px solid var(--ls-border)', borderRadius: 'var(--ls-radius-sm)', fontFamily: 'inherit' }}
          />
          <div className="ls-modal-acoes">
            <button className="ls-btn ls-btn-ghost" onClick={() => setMostrarNovaSeguradora(false)}>Cancelar</button>
            <button className="ls-btn ls-btn-primary" onClick={handleCriarSeguradoraRapido}>Cadastrar Seguradora</button>
          </div>
        </div>
      )}

      <div className="cotacao-form-linha">
        <div>
          <label>Comissionamento negociado (%) — informativo</label>
          <input value={comissionamento} onChange={(e) => setComissionamento(e.target.value)} placeholder="Ex: 20" />
        </div>
        <div>
          <label>Vigência início</label>
          <input type="date" value={vigenciaInicio} onChange={(e) => handleVigenciaInicioChange(e.target.value)} />
        </div>
        <div>
          <label>Vigência fim</label>
          <input type="date" value={vigenciaFim} onChange={(e) => setVigenciaFim(e.target.value)} />
        </div>
      </div>

      {erro && <p className="ls-modal-erro">{erro}</p>}

      <div className="ls-modal-acoes">
        <button className="ls-btn ls-btn-ghost" onClick={onCancelar}>Cancelar</button>
        <button className="ls-btn ls-btn-primary" onClick={handleSalvar} disabled={salvando}>
          {salvando ? 'Salvando...' : 'Lançar Apólice'}
        </button>
      </div>
    </div>
  )
}
