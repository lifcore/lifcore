import { useState } from 'react'
import { criarCotacao, atualizarCotacao, parseValorBR } from '../../lib/crm/clientesService'

export default function PropostaLifplanForm({ clienteProspectId, cotacaoExistente, casoId, onSalvo, onCancelar }) {
  const [instituicao, setInstituicao] = useState(cotacaoExistente?.operadora_nome_livre ?? '')
  const [valorTotal, setValorTotal] = useState(cotacaoExistente?.valor_total ?? '')
  const [validade, setValidade] = useState(cotacaoExistente?.validade ?? '')
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState(null)

  async function handleSalvar() {
    if (!instituicao.trim() || !valorTotal) {
      setErro('Informe ao menos a instituição e o valor da proposta.')
      return
    }
    setSalvando(true)
    setErro(null)
    try {
      const dados = {
        operadora_nome_livre: instituicao,
        valor_total: parseValorBR(valorTotal),
        validade: validade || null,
      }

      if (cotacaoExistente) {
        await atualizarCotacao(cotacaoExistente.id, dados, [])
      } else {
        await criarCotacao({ clienteProspectId, casoId: casoId ?? null, dados: { ...dados, status: 'em_analise' }, itens: [] })
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
      <div className="cotacao-form-linha">
        <div>
          <label>Instituição</label>
          <input value={instituicao} onChange={(e) => setInstituicao(e.target.value)} placeholder="Ex: Banco, administradora, corretora de investimentos..." />
        </div>
        <div>
          <label>Valor da proposta (R$)</label>
          <input value={valorTotal} onChange={(e) => setValorTotal(e.target.value)} placeholder="Ex: 50000,00" />
        </div>
        <div>
          <label>Prazo de validade da proposta</label>
          <input type="date" value={validade ?? ''} onChange={(e) => setValidade(e.target.value)} />
        </div>
      </div>

      {erro && <p className="ls-modal-erro">{erro}</p>}

      <div className="ls-modal-acoes">
        <button className="ls-btn ls-btn-ghost" onClick={onCancelar}>Cancelar</button>
        <button className="ls-btn ls-btn-primary" onClick={handleSalvar} disabled={salvando}>
          {salvando ? 'Salvando...' : cotacaoExistente ? 'Salvar alterações' : 'Registrar Proposta'}
        </button>
      </div>
    </div>
  )
}
