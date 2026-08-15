import { useEffect, useState } from 'react'
import { criarCotacao, atualizarCotacao, parseValorBR } from '../../lib/crm/clientesService'
import { listarCatalogoSeguradoras, criarSeguradora } from '../../lib/crm/apolicesService'

/**
 * CORREÇÃO (Sprint Vendas Central — vínculo Operadora, aprovada pelo
 * Chief): antes era texto livre, sem vínculo com o catálogo. Agora
 * seleciona do catálogo real (`institucional.operadoras`), gravando
 * `operadora_id` verdadeiro — necessário pra cadeia Cotação → Apólice →
 * Venda → Regra de Comissão funcionar. Sem correspondência por texto:
 * ou já está no catálogo (select), ou cadastra rápido (mesmo padrão do
 * ApoliceForm.jsx) — nunca inferência automática.
 */
export default function CotacaoAutoForm({ clienteProspectId, cotacaoExistente, casoId, onSalvo, onCancelar }) {
  const [operadoraId, setOperadoraId] = useState(cotacaoExistente?.operadora_id ?? '')
  const [seguradoraNome, setSeguradoraNome] = useState(cotacaoExistente?.operadora_nome_livre ?? '')
  const [valorTotal, setValorTotal] = useState(cotacaoExistente?.valor_total ?? '')
  const [validade, setValidade] = useState(cotacaoExistente?.validade ?? '')
  const [catalogoSeguradoras, setCatalogoSeguradoras] = useState([])
  const [cadastrandoNova, setCadastrandoNova] = useState(false)
  const [nomeNovaSeguradora, setNomeNovaSeguradora] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState(null)

  useEffect(() => {
    listarCatalogoSeguradoras().then(setCatalogoSeguradoras).catch(() => {})
  }, [])

  function selecionarOperadora(id) {
    setOperadoraId(id)
    setSeguradoraNome(catalogoSeguradoras.find((s) => s.id === id)?.nome ?? '')
  }

  async function handleCadastrarNovaSeguradora() {
    if (!nomeNovaSeguradora.trim()) return
    try {
      const nova = await criarSeguradora({ nome: nomeNovaSeguradora, categoriaSeguro: 'Auto' })
      const listaAtualizada = await listarCatalogoSeguradoras()
      setCatalogoSeguradoras(listaAtualizada)
      selecionarOperadora(nova.id)
      setCadastrandoNova(false)
      setNomeNovaSeguradora('')
    } catch (err) {
      setErro(err.message)
    }
  }

  async function handleSalvar() {
    if (!operadoraId || !valorTotal) {
      setErro('Selecione a seguradora do catálogo e informe o melhor preço.')
      return
    }
    setSalvando(true)
    setErro(null)
    try {
      const dados = {
        operadora_id: operadoraId,
        operadora_nome_livre: seguradoraNome,
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
          <label>Seguradora</label>
          <select value={operadoraId} onChange={(e) => selecionarOperadora(e.target.value)}>
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
          <label>Melhor preço (R$)</label>
          <input value={valorTotal} onChange={(e) => setValorTotal(e.target.value)} placeholder="Ex: 2500,00" />
        </div>
        <div>
          <label>Prazo de validade da proposta</label>
          <input type="date" value={validade ?? ''} onChange={(e) => setValidade(e.target.value)} />
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

      {erro && <p className="ls-modal-erro">{erro}</p>}

      <div className="ls-modal-acoes">
        <button className="ls-btn ls-btn-ghost" onClick={onCancelar}>Cancelar</button>
        <button className="ls-btn ls-btn-primary" onClick={handleSalvar} disabled={salvando}>
          {salvando ? 'Salvando...' : cotacaoExistente ? 'Salvar alterações' : 'Registrar Cotação'}
        </button>
      </div>
    </div>
  )
}
