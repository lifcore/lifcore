import { useState, useEffect } from 'react'
import { useAuth } from '../auth/AuthContext'
import { operacional } from '../../lib/supabaseSchemas'
import { parseValorBR } from '../../lib/crm/clientesService'
import { criarApoliceLishield, atualizarApoliceLishield } from '../../lib/crm/lishieldService'
import { listarCatalogoSeguradoras, criarSeguradora } from '../../lib/crm/apolicesService'
import { listarProdutos } from '../../lib/crm/catalogoInstitucionalService'

export default function ApoliceLishieldForm({ clienteProspectId, apoliceExistente, operadoraIdInicial, operadoraNomeInicial, onSalvo, onCancelar }) {
  const { perfil } = useAuth()
  // produtoId e operadoraId são os vínculos reais com institucional.produtos
  // e institucional.operadoras (Sprint Vendas Central, aprovada pelo
  // Chief). `produto`/`operadora_nome_livre` (texto) continuam existindo
  // por compatibilidade — quem alimenta Venda → Regra de Comissão →
  // Comissão Sugerida agora são os IDs reais.
  //
  // CORREÇÃO (mesmo achado do Lifleet, replicado — 15/08): quando este
  // form abre a partir de "Formalizar Apólice" de uma cotação já
  // fechada com seguradora escolhida, `operadoraIdInicial`/
  // `operadoraNomeInicial` pré-preenchem o campo — editável, mas não
  // parte mais do zero.
  const [produtoId, setProdutoId] = useState(apoliceExistente?.produto_id ?? '')
  const [operadoraId, setOperadoraId] = useState(apoliceExistente?.operadora_id ?? operadoraIdInicial ?? '')
  const [seguradoraNome, setSeguradoraNome] = useState(apoliceExistente?.operadora_nome_livre ?? operadoraNomeInicial ?? '')
  const [numeroApolice, setNumeroApolice] = useState(apoliceExistente?.numero_apolice ?? '')
  const [premio, setPremio] = useState(apoliceExistente?.premio ?? '')
  const [formaPagamentoVezes, setFormaPagamentoVezes] = useState(apoliceExistente?.forma_pagamento_vezes ?? '1')
  const [comissionamento, setComissionamento] = useState(apoliceExistente?.comissionamento_percentual ?? '')
  const [vigenciaInicio, setVigenciaInicio] = useState(apoliceExistente?.vigencia_inicio ?? '')
  const [vigenciaFim, setVigenciaFim] = useState(apoliceExistente?.vigencia_fim ?? '')
  const [detalhesProduto, setDetalhesProduto] = useState(apoliceExistente?.detalhes_produto ?? '')
  const [catalogoSeguradoras, setCatalogoSeguradoras] = useState([])
  const [produtos, setProdutos] = useState([])
  const [cadastrandoNova, setCadastrandoNova] = useState(false)
  const [nomeNovaSeguradora, setNomeNovaSeguradora] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState(null)

  useEffect(() => {
    listarCatalogoSeguradoras().then(setCatalogoSeguradoras).catch(() => {})
    listarProdutos({ modulo: 'lishield' }).then(setProdutos).catch(() => {})
  }, [])

  function selecionarSeguradora(id) {
    setOperadoraId(id)
    setSeguradoraNome(catalogoSeguradoras.find((s) => s.id === id)?.nome ?? '')
  }

  async function handleCadastrarNovaSeguradora() {
    if (!nomeNovaSeguradora.trim()) return
    try {
      const nova = await criarSeguradora({ nome: nomeNovaSeguradora, categoriaSeguro: 'Lishield' })
      const listaAtualizada = await listarCatalogoSeguradoras()
      setCatalogoSeguradoras(listaAtualizada)
      selecionarSeguradora(nova.id)
      setCadastrandoNova(false)
      setNomeNovaSeguradora('')
    } catch (err) {
      setErro(err.message)
    }
  }

  async function handleSalvar() {
    if (!produtoId) {
      setErro('Escolha o produto.')
      return
    }
    if (!operadoraId || !premio) {
      setErro('Selecione a seguradora do catálogo e informe o valor da apólice.')
      return
    }
    setSalvando(true)
    setErro(null)
    try {
      const produtoSelecionado = produtos.find((p) => p.id === produtoId)

      const dados = {
        produto: produtoSelecionado?.nome ?? null,
        produto_id: produtoId,
        operadora_id: operadoraId,
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
      <label>Produto</label>
      <select value={produtoId} onChange={(e) => setProdutoId(e.target.value)}>
        <option value="">Selecione o produto...</option>
        {produtos.map((p) => (
          <option key={p.id} value={p.id}>{p.nome}</option>
        ))}
      </select>

      <div className="cotacao-form-linha" style={{ marginTop: '0.6rem' }}>
        <div>
          <label>Seguradora</label>
          <select value={operadoraId} onChange={(e) => selecionarSeguradora(e.target.value)}>
            <option value="">Selecione...</option>
            {catalogoSeguradoras.map((s) => (
              <option key={s.id} value={s.id}>{s.nome}</option>
            ))}
          </select>
          <button className="ls-btn ls-btn-ghost" style={{ marginTop: '0.4rem', fontSize: '0.75rem' }} onClick={() => setCadastrandoNova(true)}>
            + Seguradora não está na lista
          </button>
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

      {cadastrandoNova && (
        <div className="ls-card" style={{ padding: '0.6rem', marginBottom: '0.6rem' }}>
          <label>Nome da nova seguradora</label>
          <input value={nomeNovaSeguradora} onChange={(e) => setNomeNovaSeguradora(e.target.value)} placeholder="Ex: Porto Seguro" />
          <div className="ls-modal-acoes">
            <button className="ls-btn ls-btn-ghost" onClick={() => { setCadastrandoNova(false); setNomeNovaSeguradora('') }}>Cancelar</button>
            <button className="ls-btn ls-btn-primary" onClick={handleCadastrarNovaSeguradora}>Cadastrar e Selecionar</button>
          </div>
        </div>
      )}

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
