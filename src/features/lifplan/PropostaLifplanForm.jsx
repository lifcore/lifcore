import { useEffect, useState } from 'react'
import { criarCotacao, atualizarCotacao, parseValorBR } from '../../lib/crm/clientesService'
import { listarCatalogoSeguradoras, criarSeguradora } from '../../lib/crm/apolicesService'

/**
 * CORREÇÃO (Bloco C — vínculo Operadora nas cotações, aprovado pelo
 * Chief): "Instituição" era texto livre puro, sem catálogo nenhum
 * antes. Agora seleciona do catálogo real (institucional.operadoras,
 * mesmo compartilhado por Lifleet/Lifsure/Lishield), gravando
 * `operadora_id` verdadeiro — necessário pra cadeia Proposta → Contrato
 * → Venda → Regra de Comissão. Sem correspondência por texto: ou já
 * está no catálogo (select), ou cadastra rápido — nunca inferência
 * automática.
 */
export default function PropostaLifplanForm({ clienteProspectId, cotacaoExistente, casoId, onSalvo, onCancelar }) {
  const [operadoraId, setOperadoraId] = useState(cotacaoExistente?.operadora_id ?? '')
  const [instituicao, setInstituicao] = useState(cotacaoExistente?.operadora_nome_livre ?? '')
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
    if (!operadoraId || !valorTotal) {
      setErro('Selecione a instituição do catálogo e informe o valor da proposta.')
      return
    }
    setSalvando(true)
    setErro(null)
    try {
      const dados = {
        operadora_id: operadoraId,
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
          <label>Valor da proposta (R$)</label>
          <input value={valorTotal} onChange={(e) => setValorTotal(e.target.value)} placeholder="Ex: 50000,00" />
        </div>
        <div>
          <label>Prazo de validade da proposta</label>
          <input type="date" value={validade ?? ''} onChange={(e) => setValidade(e.target.value)} />
        </div>
      </div>

      {cadastrandoNova && (
        <div className="ls-card" style={{ padding: '0.6rem', marginBottom: '0.6rem' }}>
          <label>Nome da nova instituição</label>
          <input value={nomeNovaSeguradora} onChange={(e) => setNomeNovaSeguradora(e.target.value)} placeholder="Ex: Banco, administradora, corretora de investimentos..." />
          <div className="ls-modal-acoes">
            <button className="ls-btn ls-btn-ghost" onClick={() => { setCadastrandoNova(false); setNomeNovaSeguradora('') }}>Cancelar</button>
            <button className="ls-btn ls-btn-primary" onClick={handleCadastrarNovaInstituicao}>Cadastrar e Selecionar</button>
          </div>
        </div>
      )}

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
