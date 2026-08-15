import { useEffect, useState } from 'react'
import { criarCotacao, parseValorBR } from '../../lib/crm/clientesService'
import { listarCatalogoSeguradoras, criarSeguradora } from '../../lib/crm/apolicesService'

function novaLinhaSeguradora() {
  return { id: crypto.randomUUID(), operadoraId: '', seguradora: '', valor: '', observacoes: '' }
}

/**
 * Cotador Comparativo — em vez de registrar uma cotação de cada vez,
 * o corretor preenche o contexto do veículo/condutor uma única vez e
 * cota várias seguradoras juntas, lado a lado. Isso vira, na prática,
 * o Motor Determinístico do Smart Quote — sem API nenhuma rodando de
 * verdade ainda por trás (a maioria das seguradoras hoje ainda é
 * cotada manualmente), mas já organiza e apresenta a comparação de um
 * jeito profissional, pronto pra imprimir/compartilhar com o cliente.
 *
 * CORREÇÃO (Sprint Vendas Central — vínculo Operadora, aprovada pelo
 * Chief): cada linha agora seleciona a seguradora do catálogo real
 * (`institucional.operadoras`), gravando `operadora_id` verdadeiro —
 * antes era texto livre, sem vínculo nenhum, o que quebrava a cadeia
 * Cotação → Apólice → Venda → Regra de Comissão mais à frente. Sem
 * correspondência por texto: ou a seguradora já está no catálogo (select),
 * ou o corretor cadastra rapidamente uma nova (mesmo padrão já usado em
 * ApoliceForm.jsx) — nunca inferência automática.
 */
export default function CotacaoComparativaAutoForm({ clienteProspectId, casoId, onSalvo, onCancelar }) {
  const [contextoVeiculo, setContextoVeiculo] = useState('')
  const [validade, setValidade] = useState('')
  const [linhas, setLinhas] = useState([novaLinhaSeguradora(), novaLinhaSeguradora()])
  const [catalogoSeguradoras, setCatalogoSeguradoras] = useState([])
  const [linhaCadastrandoNova, setLinhaCadastrandoNova] = useState(null)
  const [nomeNovaSeguradora, setNomeNovaSeguradora] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState(null)

  useEffect(() => {
    listarCatalogoSeguradoras().then(setCatalogoSeguradoras).catch(() => {})
  }, [])

  function atualizarLinha(id, campo, valor) {
    setLinhas((lista) => lista.map((l) => (l.id === id ? { ...l, [campo]: valor } : l)))
  }

  function selecionarOperadora(id, operadoraId) {
    const nome = catalogoSeguradoras.find((s) => s.id === operadoraId)?.nome ?? ''
    setLinhas((lista) => lista.map((l) => (l.id === id ? { ...l, operadoraId, seguradora: nome } : l)))
  }

  async function handleCadastrarNovaSeguradora(linhaId) {
    if (!nomeNovaSeguradora.trim()) return
    try {
      const nova = await criarSeguradora({ nome: nomeNovaSeguradora, categoriaSeguro: 'Auto' })
      const listaAtualizada = await listarCatalogoSeguradoras()
      setCatalogoSeguradoras(listaAtualizada)
      selecionarOperadora(linhaId, nova.id)
      setLinhaCadastrandoNova(null)
      setNomeNovaSeguradora('')
    } catch (err) {
      setErro(err.message)
    }
  }

  function adicionarLinha() {
    setLinhas((lista) => [...lista, novaLinhaSeguradora()])
  }

  function removerLinha(id) {
    setLinhas((lista) => (lista.length > 1 ? lista.filter((l) => l.id !== id) : lista))
  }

  async function handleSalvar() {
    const linhasPreenchidas = linhas.filter((l) => l.operadoraId && l.valor)
    if (linhasPreenchidas.length === 0) {
      setErro('Selecione ao menos uma seguradora do catálogo, com valor.')
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
            operadora_id: linha.operadoraId,
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
              <select value={linha.operadoraId} onChange={(e) => selecionarOperadora(linha.id, e.target.value)}>
                <option value="">Selecione...</option>
                {catalogoSeguradoras.map((s) => (
                  <option key={s.id} value={s.id}>{s.nome}</option>
                ))}
              </select>
              <button
                className="ls-btn ls-btn-ghost"
                style={{ marginTop: '0.4rem', fontSize: '0.75rem' }}
                onClick={() => setLinhaCadastrandoNova(linha.id)}
              >
                + Seguradora não está na lista
              </button>
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

          {linhaCadastrandoNova === linha.id && (
            <div className="ls-card" style={{ padding: '0.6rem', marginTop: '0.6rem' }}>
              <label>Nome da nova seguradora</label>
              <input value={nomeNovaSeguradora} onChange={(e) => setNomeNovaSeguradora(e.target.value)} placeholder="Ex: Porto Seguro" />
              <div className="ls-modal-acoes">
                <button className="ls-btn ls-btn-ghost" onClick={() => { setLinhaCadastrandoNova(null); setNomeNovaSeguradora('') }}>Cancelar</button>
                <button className="ls-btn ls-btn-primary" onClick={() => handleCadastrarNovaSeguradora(linha.id)}>Cadastrar e Selecionar</button>
              </div>
            </div>
          )}
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
