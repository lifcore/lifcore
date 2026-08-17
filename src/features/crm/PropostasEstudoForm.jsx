import { useEffect, useState } from 'react'
import { listarCatalogoOperadoras } from '../../lib/crm/clientesService'
import { listarCenarioAtual } from '../../lib/crm/cenarioAtualService'
import {
  uploadMulticalculo,
  reprocessarLoteEstudo,
  listarLotesEstudoPorCotacao,
  listarPropostasPorLote,
  confirmarOperadoraProposta,
  definirStatusRevisaoProposta,
  definirPapelSelecao,
  reordenarPropostas,
  confirmarFormatoHomologadoEstudo,
  excluirLoteEstudo,
} from '../../lib/crm/estudoMercadoService'
import {
  calcularComposicaoDaCotacao,
  calcularValorPropostaParaComposicao,
  calcularTotalCenarioAtual,
  calcularComparativo,
  calcularCustoPorVida,
} from '../../lib/crm/estudoFinanceiroService'

const BADGE_CONFIANCA = {
  alta: '🟢 Confiança alta',
  revisao: '🟡 Revisão necessária',
  bloqueado: '🔴 Bloqueado',
}

const STATUS_LOTE_LABEL = {
  recebido: 'Recebido — processando...',
  aguardando_confirmacao: 'Aguardando confirmação',
  revisao_necessaria: 'Revisão necessária',
  bloqueado: 'Bloqueado',
  confirmado: 'Confirmado',
}

const PAPEIS = [
  { value: '', label: '—' },
  { value: 'economica', label: '💰 Econômica' },
  { value: 'recomendada', label: '⭐ Recomendada' },
  { value: 'maior_aderencia', label: '🏥 Maior aderência' },
  { value: 'outra', label: 'Outra' },
]

function formatarMoeda(v) {
  return v == null ? '—' : `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
}

/**
 * SPEC-001 — Motor de Estudo de Mercado, Peça 3. Upload do Multicálculo,
 * prévia editável das propostas extraídas, confirmação de operadora
 * (nunca automática) e comparativo financeiro contra o Cenário Atual.
 *
 * Assim como o Cenário Atual, só faz sentido depois que a Cotação já
 * tem `id` — segue o mesmo padrão de seção embutida, sem tela nova.
 */
export default function PropostasEstudoForm({ cotacaoId, itensCotacao = [], usuarioId = null }) {
  const [lotes, setLotes] = useState([])
  const [propostasPorLote, setPropostasPorLote] = useState({})
  const [cenarioAtual, setCenarioAtual] = useState([])
  const [catalogoOperadoras, setCatalogoOperadoras] = useState([])
  const [enviando, setEnviando] = useState(false)
  const [processandoLoteId, setProcessandoLoteId] = useState(null)
  const [erro, setErro] = useState(null)

  const composicao = calcularComposicaoDaCotacao(itensCotacao)
  const totalCenarioAtual = calcularTotalCenarioAtual(cenarioAtual)

  useEffect(() => {
    listarCatalogoOperadoras().then(setCatalogoOperadoras).catch(() => {})
  }, [])

  useEffect(() => {
    if (!cotacaoId) return
    carregarTudo()
  }, [cotacaoId])

  async function carregarTudo() {
    try {
      const [lotesCarregados, cenario] = await Promise.all([
        listarLotesEstudoPorCotacao(cotacaoId),
        listarCenarioAtual(cotacaoId),
      ])
      setLotes(lotesCarregados)
      setCenarioAtual(cenario)

      const mapa = {}
      for (const lote of lotesCarregados) {
        if (['aguardando_confirmacao', 'revisao_necessaria', 'confirmado'].includes(lote.status)) {
          mapa[lote.id] = await listarPropostasPorLote(lote.id)
        }
      }
      setPropostasPorLote(mapa)
    } catch (err) {
      setErro(err.message)
    }
  }

  async function handleUpload(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setEnviando(true)
    setErro(null)
    try {
      await uploadMulticalculo({ file, cotacaoId, enviadoPor: usuarioId })
      await carregarTudo()
    } catch (err) {
      setErro(err.message)
    } finally {
      setEnviando(false)
      e.target.value = ''
    }
  }

  async function handleReprocessar(loteId) {
    setProcessandoLoteId(loteId)
    setErro(null)
    try {
      await reprocessarLoteEstudo(loteId)
      await carregarTudo()
    } catch (err) {
      setErro(err.message)
    } finally {
      setProcessandoLoteId(null)
    }
  }

  async function handleExcluirLote(loteId) {
    if (!confirm('Excluir este lote e todas as propostas extraídas dele? Esta ação não pode ser desfeita.')) return
    try {
      await excluirLoteEstudo(loteId)
      await carregarTudo()
    } catch (err) {
      setErro(err.message)
    }
  }

  async function handleConfirmarFormato(loteId) {
    try {
      await confirmarFormatoHomologadoEstudo(loteId, usuarioId)
      await carregarTudo()
    } catch (err) {
      setErro(err.message)
    }
  }

  async function handleOperadora(propostaId, loteId, operadoraId) {
    try {
      await confirmarOperadoraProposta(propostaId, operadoraId || null)
      setPropostasPorLote((await listarPropostasPorLote(loteId)) && {
        ...propostasPorLote,
        [loteId]: await listarPropostasPorLote(loteId),
      })
    } catch (err) {
      setErro(err.message)
    }
  }

  async function handleStatusRevisao(propostaId, loteId, status) {
    try {
      await definirStatusRevisaoProposta(propostaId, status)
      setPropostasPorLote({ ...propostasPorLote, [loteId]: await listarPropostasPorLote(loteId) })
    } catch (err) {
      setErro(err.message)
    }
  }

  async function handlePapel(propostaId, loteId, papel) {
    try {
      await definirPapelSelecao(propostaId, papel || null)
      setPropostasPorLote({ ...propostasPorLote, [loteId]: await listarPropostasPorLote(loteId) })
    } catch (err) {
      setErro(err.message)
    }
  }

  async function moverProposta(loteId, index, direcao) {
    const lista = [...propostasPorLote[loteId]]
    const novoIndex = index + direcao
    if (novoIndex < 0 || novoIndex >= lista.length) return
    ;[lista[index], lista[novoIndex]] = [lista[novoIndex], lista[index]]
    setPropostasPorLote({ ...propostasPorLote, [loteId]: lista })
    try {
      await reordenarPropostas(lista.map((p) => p.id))
    } catch (err) {
      setErro(err.message)
    }
  }

  if (!cotacaoId) {
    return (
      <p className="cenario-atual-aviso">
        Salve a Cotação primeiro para poder enviar o Multicálculo e gerar as Propostas de Mercado.
      </p>
    )
  }

  return (
    <div className="cotacao-form propostas-estudo-form">
      <h3>Propostas de Mercado (Multicálculo)</h3>
      <p className="cenario-atual-descricao">
        Envie o PDF do Multicálculo — o motor extrai as propostas automaticamente. Confirme a operadora e revise
        antes de considerar qualquer proposta pronta pro Estudo.
      </p>

      {erro && <p className="ls-modal-erro">{erro}</p>}

      <div className="propostas-estudo-upload">
        <label className="ls-btn ls-btn-primary">
          {enviando ? 'Enviando...' : '+ Enviar Multicálculo (PDF)'}
          <input type="file" accept=".pdf" onChange={handleUpload} disabled={enviando} style={{ display: 'none' }} />
        </label>
      </div>

      {lotes.map((lote) => {
        const propostas = propostasPorLote[lote.id] ?? []
        return (
          <div key={lote.id} className="cotacao-bloco-plano propostas-estudo-lote">
            <div className="cotacao-bloco-plano-header">
              <strong>{lote.nome_arquivo_original ?? 'Multicálculo'}</strong>
              <span className="cenario-atual-status-badge">
                {lote.nivel_confianca ? BADGE_CONFIANCA[lote.nivel_confianca] : STATUS_LOTE_LABEL[lote.status]}
              </span>
              <button className="cotacao-remover-bloco" onClick={() => handleExcluirLote(lote.id)}>✕</button>
            </div>

            {lote.motivo_confianca && <p className="propostas-estudo-motivo">{lote.motivo_confianca}</p>}

            <div className="ls-modal-acoes">
              {lote.status === 'revisao_necessaria' && (
                <button className="ls-btn ls-btn-ghost" onClick={() => handleConfirmarFormato(lote.id)}>
                  Confirmar formato (memorizar para próximos documentos)
                </button>
              )}
              {(lote.status === 'recebido' || lote.status === 'bloqueado') && (
                <button
                  className="ls-btn ls-btn-ghost"
                  onClick={() => handleReprocessar(lote.id)}
                  disabled={processandoLoteId === lote.id}
                >
                  {processandoLoteId === lote.id ? 'Reprocessando...' : 'Reprocessar'}
                </button>
              )}
            </div>

            {propostas.map((proposta, index) => {
              const resultado = calcularValorPropostaParaComposicao(proposta, composicao)
              const comparativo = calcularComparativo({
                mensalAtual: totalCenarioAtual.totalMensal,
                mensalProposta: resultado.valorMensal,
              })
              const custoPorVida = calcularCustoPorVida(resultado.valorMensal, resultado.totalVidas)

              return (
                <div key={proposta.id} className="propostas-estudo-proposta">
                  <div className="cotacao-form-linha">
                    <div>
                      <strong>{proposta.plano ?? proposta.coluna_chave}</strong>
                      <div className="propostas-estudo-chave">{proposta.coluna_chave}</div>
                    </div>
                    <div>
                      <button onClick={() => moverProposta(lote.id, index, -1)} disabled={index === 0}>↑</button>
                      <button onClick={() => moverProposta(lote.id, index, 1)} disabled={index === propostas.length - 1}>↓</button>
                    </div>
                  </div>

                  <div className="cotacao-form-linha">
                    <div>
                      <label>Operadora (confirmar no catálogo)</label>
                      <select
                        value={proposta.operadora_id ?? ''}
                        onChange={(e) => handleOperadora(proposta.id, lote.id, e.target.value)}
                      >
                        <option value="">
                          {proposta.operadora_nome_extraido ? `Extraído: "${proposta.operadora_nome_extraido}" — confirmar` : 'Selecione...'}
                        </option>
                        {catalogoOperadoras.map((op) => (
                          <option key={op.id} value={op.id}>{op.nome}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label>Papel no Estudo</label>
                      <select value={proposta.papel_selecao ?? ''} onChange={(e) => handlePapel(proposta.id, lote.id, e.target.value)}>
                        {PAPEIS.map((p) => (
                          <option key={p.value} value={p.value}>{p.label}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="propostas-estudo-atributos">
                    <span>Modalidade: {proposta.modalidade ?? '—'}</span>
                    <span>Acomodação: {proposta.acomodacao ?? '—'}</span>
                    <span>Coparticipação: {proposta.coparticipacao ?? '—'}</span>
                  </div>

                  <div className="propostas-estudo-financeiro">
                    <span>Mensal (composição da Cotação): {formatarMoeda(resultado.valorMensal)}</span>
                    <span>Custo por vida: {formatarMoeda(custoPorVida)}</span>
                    {resultado.faixasFaltantes.length > 0 && (
                      <span className="propostas-estudo-alerta">
                        ⚠️ Sem preço para as faixas: {resultado.faixasFaltantes.join(', ')} — não incluídas no total.
                      </span>
                    )}
                    {comparativo.tipo && (
                      <span className={comparativo.tipo === 'economia' ? 'propostas-estudo-economia' : 'propostas-estudo-acrescimo'}>
                        {comparativo.tipo === 'economia' ? '↓' : '↑'} {formatarMoeda(Math.abs(comparativo.impactoMensal))}/mês
                        ({comparativo.impactoPercentual?.toFixed(1)}%) vs. cenário atual — {formatarMoeda(Math.abs(comparativo.impactoAnual))}/ano
                      </span>
                    )}
                  </div>

                  <div className="ls-modal-acoes">
                    <button
                      className={proposta.status_revisao === 'rejeitada' ? 'ls-btn ls-btn-primary' : 'ls-btn ls-btn-ghost'}
                      onClick={() => handleStatusRevisao(proposta.id, lote.id, 'rejeitada')}
                    >
                      Rejeitar
                    </button>
                    <button
                      className={proposta.status_revisao === 'confirmada' ? 'ls-btn ls-btn-primary' : 'ls-btn ls-btn-ghost'}
                      onClick={() => handleStatusRevisao(proposta.id, lote.id, 'confirmada')}
                    >
                      {proposta.status_revisao === 'confirmada' ? '✓ Confirmada' : 'Confirmar proposta'}
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )
      })}
    </div>
  )
}
