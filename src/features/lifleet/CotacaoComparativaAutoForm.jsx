import { useState } from 'react'
import { criarCotacao, parseValorBR } from '../../lib/crm/clientesService'

function novaLinhaSeguradora() {
  return { id: crypto.randomUUID(), seguradora: '', valor: '', observacoes: '' }
}

/**
 * Cotador Comparativo — em vez de registrar uma cotação de cada vez,
 * o corretor preenche o contexto do veículo/condutor uma única vez e
 * cota várias seguradoras juntas, lado a lado. Isso vira, na prática,
 * o Motor Determinístico do Smart Quote — sem API nenhuma rodando de
 * verdade ainda por trás (a maioria das seguradoras hoje ainda é
 * cotada manualmente), mas já organiza e apresenta a comparação de um
 * jeito profissional, pronto pra imprimir/compartilhar com o cliente.
 */
export default function CotacaoComparativaAutoForm({ clienteProspectId, casoId, onSalvo, onCancelar }) {
  const [contextoVeiculo, setContextoVeiculo] = useState('')
  const [validade, setValidade] = useState('')
  const [linhas, setLinhas] = useState([novaLinhaSeguradora(), novaLinhaSeguradora()])
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState(null)

  function atualizarLinha(id, campo, valor) {
    setLinhas((lista) => lista.map((l) => (l.id === id ? { ...l, [campo]: valor } : l)))
  }

  function adicionarLinha() {
    setLinhas((lista) => [...lista, novaLinhaSeguradora()])
  }

  function removerLinha(id) {
    setLinhas((lista) => (lista.length > 1 ? lista.filter((l) => l.id !== id) : lista))
  }

  async function handleSalvar() {
    const linhasPreenchidas = linhas.filter((l) => l.seguradora.trim() && l.valor)
    if (linhasPreenchidas.length === 0) {
      setErro('Preencha ao menos uma seguradora com valor.')
      return
    }
    setSalvando(true)
    setErro(null)
    try {
      const grupoComparacaoId = crypto.randomUUID()
      for (const linha of linhasPreenchidas) {
        await criarCotacao({
          clienteProspectId,
          casoId: casoId ?? null,
          dados: {
            operadora_nome_livre: linha.seguradora,
            valor_total: parseValorBR(linha.valor),
            validade: validade || null,
            contexto_veiculo: contextoVeiculo || null,
            observacoes: linha.observacoes || null,
            grupo_comparacao_id: grupoComparacaoId,
            status: 'em_analise',
          },
          itens: [],
        })
      }
      onSalvo()
    } catch (err) {
      setErro(err.message)
    } finally {
      setSalvando(false)
    }
  }

  return (
    <div className="cotacao-form">
      <label>Contexto do veículo/condutor (vale pra todas as seguradoras desta rodada)</label>
      <input
        value={contextoVeiculo}
        onChange={(e) => setContextoVeiculo(e.target.value)}
        placeholder="Ex: Fiat Argo 2022, condutor 35 anos, CEP 13202-000, uso particular"
      />

      <label>Prazo de validade das propostas (se souber)</label>
      <input type="date" value={validade} onChange={(e) => setValidade(e.target.value)} />

      <h4 style={{ marginTop: '0.9rem' }}>Seguradoras cotadas</h4>
      {linhas.map((linha, index) => (
        <div key={linha.id} className="ls-card" style={{ padding: '0.75rem', marginBottom: '0.6rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.3rem' }}>
            <strong>Seguradora {index + 1}</strong>
            <button className="cotacao-remover-bloco" onClick={() => removerLinha(linha.id)}>✕</button>
          </div>
          <div className="cotacao-form-linha">
            <div>
              <label>Seguradora</label>
              <input value={linha.seguradora} onChange={(e) => atualizarLinha(linha.id, 'seguradora', e.target.value)} placeholder="Ex: Porto Seguro" />
            </div>
            <div>
              <label>Valor (R$)</label>
              <input value={linha.valor} onChange={(e) => atualizarLinha(linha.id, 'valor', e.target.value)} placeholder="Ex: 2500,00" />
            </div>
            <div>
              <label>Franquia / coberturas (livre)</label>
              <input value={linha.observacoes} onChange={(e) => atualizarLinha(linha.id, 'observacoes', e.target.value)} placeholder="Ex: Franquia R$ 1.800, vidros inclusos" />
            </div>
          </div>
        </div>
      ))}

      <button className="ls-btn ls-btn-ghost cotacao-add-bloco" onClick={adicionarLinha}>
        + Adicionar outra seguradora
      </button>

      {erro && <p className="ls-modal-erro">{erro}</p>}

      <div className="ls-modal-acoes">
        <button className="ls-btn ls-btn-ghost" onClick={onCancelar}>Cancelar</button>
        <button className="ls-btn ls-btn-primary" onClick={handleSalvar} disabled={salvando}>
          {salvando ? 'Salvando...' : 'Salvar Comparativo'}
        </button>
      </div>
    </div>
  )
}
