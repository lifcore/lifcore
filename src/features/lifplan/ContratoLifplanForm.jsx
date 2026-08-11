import { useState } from 'react'
import { useAuth } from '../auth/AuthContext'
import { operacional } from '../../lib/supabaseSchemas'
import { parseValorBR } from '../../lib/crm/clientesService'
import { criarContratoLifplan, atualizarContratoLifplan, PRODUTOS_LIFPLAN } from '../../lib/crm/lifplanService'

export default function ContratoLifplanForm({ clienteProspectId, contratoExistente, onSalvo, onCancelar }) {
  const { perfil } = useAuth()
  const [produto, setProduto] = useState(contratoExistente?.produto ?? '')
  const [instituicao, setInstituicao] = useState(contratoExistente?.operadora_nome_livre ?? '')
  const [numeroContrato, setNumeroContrato] = useState(contratoExistente?.numero_apolice ?? '')
  const [valor, setValor] = useState(contratoExistente?.premio ?? '')
  const [formaPagamentoVezes, setFormaPagamentoVezes] = useState(contratoExistente?.forma_pagamento_vezes ?? '1')
  const [vigenciaInicio, setVigenciaInicio] = useState(contratoExistente?.vigencia_inicio ?? '')
  const [vigenciaFim, setVigenciaFim] = useState(contratoExistente?.vigencia_fim ?? '')
  const [detalhesProduto, setDetalhesProduto] = useState(contratoExistente?.detalhes_produto ?? '')
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState(null)

  async function handleSalvar() {
    if (!produto) {
      setErro('Escolha o produto.')
      return
    }
    if (!instituicao.trim() || !valor) {
      setErro('Informe ao menos a instituição e o valor da operação.')
      return
    }
    setSalvando(true)
    setErro(null)
    try {
      const dados = {
        produto,
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
      <select value={produto} onChange={(e) => setProduto(e.target.value)}>
        <option value="">Selecione o produto...</option>
        {PRODUTOS_LIFPLAN.map((p) => (
          <option key={p} value={p}>{p}</option>
        ))}
      </select>

      <div className="cotacao-form-linha" style={{ marginTop: '0.6rem' }}>
        <div>
          <label>Instituição</label>
          <input value={instituicao} onChange={(e) => setInstituicao(e.target.value)} placeholder="Banco, administradora, corretora..." />
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
