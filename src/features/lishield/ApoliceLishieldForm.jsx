import { useState, useEffect } from 'react'
import { useAuth } from '../auth/AuthContext'
import { operacional } from '../../lib/supabaseSchemas'
import { parseValorBR } from '../../lib/crm/clientesService'
import { criarApoliceLishield, atualizarApoliceLishield } from '../../lib/crm/lishieldService'
import { listarCatalogoSeguradoras } from '../../lib/crm/apolicesService'
import { listarProdutos } from '../../lib/crm/catalogoInstitucionalService'

export default function ApoliceLishieldForm({ clienteProspectId, apoliceExistente, onSalvo, onCancelar }) {
  const { perfil } = useAuth()
  const [produto, setProduto] = useState(apoliceExistente?.produto ?? '')
  const [seguradoraNome, setSeguradoraNome] = useState(apoliceExistente?.operadora_nome_livre ?? '')
  const [numeroApolice, setNumeroApolice] = useState(apoliceExistente?.numero_apolice ?? '')
  const [premio, setPremio] = useState(apoliceExistente?.premio ?? '')
  const [formaPagamentoVezes, setFormaPagamentoVezes] = useState(apoliceExistente?.forma_pagamento_vezes ?? '1')
  const [comissionamento, setComissionamento] = useState(apoliceExistente?.comissionamento_percentual ?? '')
  const [vigenciaInicio, setVigenciaInicio] = useState(apoliceExistente?.vigencia_inicio ?? '')
  const [vigenciaFim, setVigenciaFim] = useState(apoliceExistente?.vigencia_fim ?? '')
  const [detalhesProduto, setDetalhesProduto] = useState(apoliceExistente?.detalhes_produto ?? '')
  const [catalogoSeguradoras, setCatalogoSeguradoras] = useState([])
  const [produtos, setProdutos] = useState([])
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState(null)

  useEffect(() => {
    listarCatalogoSeguradoras().then(setCatalogoSeguradoras).catch(() => {})
    listarProdutos({ modulo: 'lishield' }).then(setProdutos).catch(() => {})
  }, [])

  async function handleSalvar() {
    if (!produto) {
      setErro('Escolha o produto.')
      return
    }
    if (!seguradoraNome.trim() || !premio) {
      setErro('Informe ao menos a seguradora e o valor da apólice.')
      return
    }
    setSalvando(true)
    setErro(null)
    try {
      const dados = {
        produto,
        operadora_nome_livre: seguradoraNome,
        numero_apolice: numeroApolice || null,
        premio: parseValorBR(premio),
        forma_pagamento_vezes: parseInt(formaPagamentoVezes, 10) || 1,
        comissionamento_percentual: comissionamento ? parseValorBR(comissionamento) : null,
        vigencia_inicio: vigenciaInicio || null,
        vigencia_fim: vigenciaFim || null,
        detalhes_produto: detalhesProduto || null,
      }

      let apoliceResultado
      if (apoliceExistente) {
        apoliceResultado = await atualizarApoliceLishield({ apoliceId: apoliceExistente.id, clienteProspectId, dados })
      } else {
        const { data: org } = await operacional.from('organizacoes').select('id').limit(1).single()
        apoliceResultado = await criarApoliceLishield({
          corretorId: perfil.id,
          organizacaoId: org.id,
          clienteProspectId,
          dados,
        })
      }
      onSalvo(apoliceResultado)
    } catch (err) {
      setErro(err.message)
    } finally {
      setSalvando(false)
    }
  }

  return (
    <div className="cotacao-form">
      <datalist id="lista-seguradoras-lishield">
        {catalogoSeguradoras.map((s) => (
          <option key={s.id} value={s.nome} />
        ))}
      </datalist>

      <label>Produto</label>
      <select value={produto} onChange={(e) => setProduto(e.target.value)}>
        <option value="">Selecione o produto...</option>
        {produtos.map((p) => (
          <option key={p.id} value={p.nome}>{p.nome}</option>
        ))}
      </select>

      <div className="cotacao-form-linha" style={{ marginTop: '0.6rem' }}>
        <div>
          <label>Seguradora</label>
          <input
            list="lista-seguradoras-lishield"
            value={seguradoraNome}
            onChange={(e) => setSeguradoraNome(e.target.value)}
            placeholder="Comece a digitar..."
          />
        </div>
        <div>
          <label>Número da apólice</label>
          <input value={numeroApolice} onChange={(e) => setNumeroApolice(e.target.value)} />
        </div>
        <div>
          <label>Valor fechado (R$)</label>
          <input value={premio} onChange={(e) => setPremio(e.target.value)} placeholder="Ex: 15000,00" />
        </div>
      </div>

      <div className="cotacao-form-linha">
        <div>
          <label>Forma de pagamento (nº de vezes)</label>
          <input type="number" value={formaPagamentoVezes} onChange={(e) => setFormaPagamentoVezes(e.target.value)} />
        </div>
        <div>
          <label>Comissionamento (%) — informativo</label>
          <input value={comissionamento} onChange={(e) => setComissionamento(e.target.value)} placeholder="Ex: 15" />
        </div>
        <div>
          <label>Vigência início</label>
          <input type="date" value={vigenciaInicio} onChange={(e) => setVigenciaInicio(e.target.value)} />
        </div>
        <div>
          <label>Vigência fim</label>
          <input type="date" value={vigenciaFim} onChange={(e) => setVigenciaFim(e.target.value)} />
        </div>
      </div>

      <label>Detalhes do produto (livre)</label>
      <textarea
        value={detalhesProduto}
        onChange={(e) => setDetalhesProduto(e.target.value)}
        rows={4}
        placeholder="Anote aqui o que for específico deste produto: LMI e franquia (RC), maturidade de segurança (Cyber), cronograma da obra (Engenharia), rating e contragarantias (Crédito/Garantia), etc."
        style={{ width: '100%', padding: '0.5rem 0.65rem', border: '1px solid var(--ls-border)', borderRadius: 'var(--ls-radius-sm)', fontFamily: 'inherit' }}
      />

      {erro && <p className="ls-modal-erro">{erro}</p>}

      <div className="ls-modal-acoes">
        <button className="ls-btn ls-btn-ghost" onClick={onCancelar}>Cancelar</button>
        <button className="ls-btn ls-btn-primary" onClick={handleSalvar} disabled={salvando}>
          {salvando ? 'Salvando...' : apoliceExistente ? 'Salvar alterações' : 'Lançar Apólice'}
        </button>
      </div>
    </div>
  )
}
