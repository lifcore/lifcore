import { useState, useEffect } from 'react'
import { useAuth } from '../auth/AuthContext'
import { operacional } from '../../lib/supabaseSchemas'
import { parseValorBR } from '../../lib/crm/clientesService'
import { criarContratoLifplan, atualizarContratoLifplan } from '../../lib/crm/lifplanService'
import { listarCatalogoSeguradoras, criarSeguradora } from '../../lib/crm/apolicesService'
import { listarProdutos } from '../../lib/crm/catalogoInstitucionalService'

/**
 * CORREÇÃO (Sprint Vendas Central — vínculo Operadora, aprovada pelo
 * Chief): "Instituição" era texto livre puro, sem catálogo nenhum
 * antes. Agora seleciona do catálogo real (institucional.operadoras,
 * mesmo compartilhado por Lifleet/Lifsure/Lishield), gravando
 * `operadora_id` verdadeiro — necessário pra cadeia Venda → Regra de
 * Comissão. Cadastro rápido disponível (mesmo padrão de ApoliceForm.jsx)
 * pra instituições ainda não cadastradas.
 */
export default function ContratoLifplanForm({ clienteProspectId, contratoExistente, onSalvo, onCancelar }) {
  const { perfil } = useAuth()
  const [produtoId, setProdutoId] = useState(contratoExistente?.produto_id ?? '')
  const [operadoraId, setOperadoraId] = useState(contratoExistente?.operadora_id ?? '')
  const [instituicao, setInstituicao] = useState(contratoExistente?.operadora_nome_livre ?? '')
  const [numeroContrato, setNumeroContrato] = useState(contratoExistente?.numero_apolice ?? '')
  const [valor, setValor] = useState(contratoExistente?.premio ?? '')
  const [formaPagamentoVezes, setFormaPagamentoVezes] = useState(contratoExistente?.forma_pagamento_vezes ?? '1')
  const [vigenciaInicio, setVigenciaInicio] = useState(contratoExistente?.vigencia_inicio ?? '')
  const [vigenciaFim, setVigenciaFim] = useState(contratoExistente?.vigencia_fim ?? '')
  const [detalhesProduto, setDetalhesProduto] = useState(contratoExistente?.detalhes_produto ?? '')
  const [produtos, setProdutos] = useState([])
  const [catalogoSeguradoras, setCatalogoSeguradoras] = useState([])
  const [cadastrandoNova, setCadastrandoNova] = useState(false)
  const [nomeNovaSeguradora, setNomeNovaSeguradora] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState(null)

  useEffect(() => {
    listarProdutos({ modulo: 'lifplan' }).then(setProdutos).catch(() => {})
    listarCatalogoSeguradoras().then(setCatalogoSeguradoras).catch(() => {})
  }, [])

  function selecionarInstituicao(id) {
    setOperadoraId(id)
    setInstituicao(catalogoSeguradoras.find((s) => s.id === id)?.nome ?? '')
  }

  async function handleCadastrarNovaInstituicao() {
    if (!nomeNovaSeguradora.trim()) return
    try {
      const nova = await criarSeguradora({ nome: nomeNovaSeguradora, categoriaSeguro: 'Lifplan' })
      const listaAtualizada = await listarCatalogoSeguradoras()
      setCatalogoSeguradoras(listaAtualizada)
      selecionarInstituicao(nova.id)
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
    if (!operadoraId || !valor) {
      setErro('Selecione a instituição do catálogo e informe o valor da operação.')
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
        operadora_nome_livre: instituicao,
        numero_apolice: numeroContrato || null,
        premio: parseValorBR(valor),
        forma_pagamento_vezes: parseInt(formaPagamentoVezes, 10) || 1,
        vigencia_inicio: vigenciaInicio || null,
        vigencia_fim: vigenciaFim || null,
        detalhes_produto: detalhesProduto || null,
      }

      let contratoResultado
      if (contratoExistente) {
        contratoResultado = await atualizarContratoLifplan({ contratoId: contratoExistente.id, clienteProspectId, dados })
      } else {
        const { data: org } = await operacional.from('organizacoes').select('id').limit(1).single()
        contratoResultado = await criarContratoLifplan({
          corretorId: perfil.id,
          organizacaoId: org.id,
          clienteProspectId,
          dados,
        })
      }
      onSalvo(contratoResultado)
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
          <label>Instituição</label>
          <select value={operadoraId} onChange={(e) => selecionarInstituicao(e.target.value)}>
            <option value="">Selecione...</option>
            {catalogoSeguradoras.map((s) => (
              <option key={s.id} value={s.id}>{s.nome}</option>
            ))}
          </select>
          <button className="ls-btn ls-btn-ghost" style={{ marginTop: '0.4rem', fontSize: '0.75rem' }} onClick={() => setCadastrandoNova(true)}>
            + Instituição não está na lista
          </button>
        </div>
        <div>
          <label>Número do contrato</label>
          <input value={numeroContrato} onChange={(e) => setNumeroContrato(e.target.value)} />
        </div>
        <div>
          <label>Valor da operação (R$)</label>
          <input value={valor} onChange={(e) => setValor(e.target.value)} placeholder="Ex: 80000,00" />
        </div>
      </div>

      {cadastrandoNova && (
        <div className="ls-card" style={{ padding: '0.6rem', marginBottom: '0.6rem' }}>
          <label>Nome da nova instituição</label>
          <input value={nomeNovaSeguradora} onChange={(e) => setNomeNovaSeguradora(e.target.value)} placeholder="Ex: Banco, administradora..." />
          <div className="ls-modal-acoes">
            <button className="ls-btn ls-btn-ghost" onClick={() => { setCadastrandoNova(false); setNomeNovaSeguradora('') }}>Cancelar</button>
            <button className="ls-btn ls-btn-primary" onClick={handleCadastrarNovaInstituicao}>Cadastrar e Selecionar</button>
          </div>
        </div>
      )}

      <div className="cotacao-form-linha">
        <div>
          <label>Parcelas (nº de vezes)</label>
          <input type="number" value={formaPagamentoVezes} onChange={(e) => setFormaPagamentoVezes(e.target.value)} />
        </div>
        <div>
          <label>Início do contrato</label>
          <input type="date" value={vigenciaInicio} onChange={(e) => setVigenciaInicio(e.target.value)} />
        </div>
        <div>
          <label>Fim / vencimento do contrato</label>
          <input type="date" value={vigenciaFim} onChange={(e) => setVigenciaFim(e.target.value)} />
        </div>
      </div>

      <label>Detalhes da operação (livre)</label>
      <textarea
        value={detalhesProduto}
        onChange={(e) => setDetalhesProduto(e.target.value)}
        rows={4}
        placeholder="Anote aqui o que for específico desta operação: taxa de juros, rentabilidade esperada, tipo de plano de previdência, bem contemplado no consórcio, etc."
        style={{ width: '100%', padding: '0.5rem 0.65rem', border: '1px solid var(--ls-border)', borderRadius: 'var(--ls-radius-sm)', fontFamily: 'inherit' }}
      />

      {erro && <p className="ls-modal-erro">{erro}</p>}

      <div className="ls-modal-acoes">
        <button className="ls-btn ls-btn-ghost" onClick={onCancelar}>Cancelar</button>
        <button className="ls-btn ls-btn-primary" onClick={handleSalvar} disabled={salvando}>
          {salvando ? 'Salvando...' : contratoExistente ? 'Salvar alterações' : 'Lançar Contrato'}
        </button>
      </div>
    </div>
  )
}
