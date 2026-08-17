import { useEffect, useState } from 'react'
import {
  DOMINIOS_MERCADO,
  uploadMaterialMercado,
  reprocessarLoteMercado,
  excluirLoteMercado,
  listarLotesImportacaoMercado,
  listarDivergenciasPendentes,
  aprovarDivergencia,
  rejeitarDivergencia,
  aprovarTodasDivergenciasDoLote,
} from '../../lib/crm/catalogoMercadoService'

const STATUS_LOTE_LABEL = {
  recebido: 'Recebido — processando...',
  aguardando_aprovacao: '🟡 Aguardando aprovação',
  aprovado: '🟢 Aprovado',
  rejeitado: '🔴 Rejeitado',
  erro: '🔴 Erro no processamento',
}

const TIPO_DIVERGENCIA_LABEL = { novo: '🆕 Novo', alterado: '✏️ Alterado', conflito: '⚠️ Conflito' }

/** Prévia legível de um dado_novo, conforme a tabela afetada — só os campos que importam pra decisão humana. */
function resumoDivergencia(d) {
  const dado = d.dado_novo
  if (d.tabela_afetada === 'planos_variantes') {
    return `${dado.nome_plano}${dado.variante ? ` — ${dado.variante}` : ''}`
  }
  if (d.tabela_afetada === 'regras_precificacao') {
    const dims = [
      dado.regiao && `região: ${dado.regiao}`,
      dado.segmento && `segmento: ${dado.segmento}`,
      dado.faixa_vidas_min != null && `vidas: ${dado.faixa_vidas_min}${dado.faixa_vidas_max ? `-${dado.faixa_vidas_max}` : '+'}`,
      dado.faixa_etaria && `faixa: ${dado.faixa_etaria}`,
    ].filter(Boolean).join(', ')
    return `R$ ${dado.valor ?? '—'} (${dims || 'sem dimensão comercial'})`
  }
  if (d.tabela_afetada === 'regras_mercado') {
    return `${dado.chave} — ${JSON.stringify(dado.conteudo).slice(0, 80)}...`
  }
  if (d.tabela_afetada === 'rede_credenciada') {
    return `código: ${dado.codigo_bruto ?? '—'}`
  }
  return JSON.stringify(dado).slice(0, 80)
}

/**
 * SPEC-002 §5 — importação de material de mercado por domínio, com
 * fila de aprovação humana. Vive dentro do PainelInstitucional
 * (MasterCenterSeguradoras.jsx), porque importação é sempre por
 * operadora — nunca cria tela nova.
 */
export default function PainelImportacaoMercado({ operadoraId, usuarioId = null }) {
  const [dominio, setDominio] = useState(DOMINIOS_MERCADO[0].valor)
  const [lotes, setLotes] = useState([])
  const [divergenciasPorLote, setDivergenciasPorLote] = useState({})
  const [enviando, setEnviando] = useState(false)
  const [processandoLoteId, setProcessandoLoteId] = useState(null)
  const [erro, setErro] = useState(null)

  useEffect(() => {
    carregar()
  }, [operadoraId])

  async function carregar() {
    try {
      const lotesCarregados = await listarLotesImportacaoMercado({ operadoraId })
      setLotes(lotesCarregados)

      const mapa = {}
      for (const lote of lotesCarregados) {
        if (lote.status === 'aguardando_aprovacao') {
          mapa[lote.id] = await listarDivergenciasPendentes(lote.id)
        }
      }
      setDivergenciasPorLote(mapa)
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
      await uploadMaterialMercado({ file, dominio, operadoraId, enviadoPor: usuarioId })
      await carregar()
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
      await reprocessarLoteMercado(loteId)
      await carregar()
    } catch (err) {
      setErro(err.message)
    } finally {
      setProcessandoLoteId(null)
    }
  }

  async function handleExcluir(loteId) {
    if (!confirm('Excluir este lote de importação? Divergências pendentes dele também serão descartadas.')) return
    try {
      await excluirLoteMercado(loteId)
      await carregar()
    } catch (err) {
      setErro(err.message)
    }
  }

  async function handleAprovar(divergenciaId, loteId) {
    try {
      await aprovarDivergencia(divergenciaId, usuarioId)
      setDivergenciasPorLote({ ...divergenciasPorLote, [loteId]: await listarDivergenciasPendentes(loteId) })
    } catch (err) {
      setErro(err.message)
    }
  }

  async function handleRejeitar(divergenciaId, loteId) {
    try {
      await rejeitarDivergencia(divergenciaId, usuarioId)
      setDivergenciasPorLote({ ...divergenciasPorLote, [loteId]: await listarDivergenciasPendentes(loteId) })
    } catch (err) {
      setErro(err.message)
    }
  }

  async function handleAprovarTodas(loteId) {
    try {
      await aprovarTodasDivergenciasDoLote(loteId, usuarioId)
      await carregar()
    } catch (err) {
      setErro(err.message)
    }
  }

  return (
    <div className="ls-card" style={{ padding: '0.85rem', marginTop: '0.6rem' }}>
      <strong>Importação de Material de Mercado</strong>
      <p className="config-instrucao">
        Envie tabela de preços, carências, coparticipação, reembolso, regras comerciais ou rede — o motor extrai e
        coloca em fila de aprovação. Nada vira dado vigente sem revisão.
      </p>

      {erro && <p className="ls-modal-erro">{erro}</p>}

      <div className="cotacao-form-linha" style={{ alignItems: 'flex-end' }}>
        <div>
          <label>Domínio</label>
          <select value={dominio} onChange={(e) => setDominio(e.target.value)}>
            {DOMINIOS_MERCADO.map((d) => (
              <option key={d.valor} value={d.valor}>{d.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="ls-btn ls-btn-primary" style={{ display: 'inline-block', cursor: 'pointer' }}>
            {enviando ? 'Enviando...' : '+ Enviar arquivo (PDF/Excel/CSV/TXT)'}
            <input type="file" accept=".pdf,.xlsx,.xls,.csv,.txt" onChange={handleUpload} disabled={enviando} style={{ display: 'none' }} />
          </label>
        </div>
      </div>

      {lotes.length === 0 ? (
        <p className="cliente-vazio" style={{ marginTop: '0.75rem' }}>Nenhum material importado ainda para esta operadora.</p>
      ) : (
        <div style={{ marginTop: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
          {lotes.map((lote) => {
            const divergencias = divergenciasPorLote[lote.id] ?? []
            return (
              <div key={lote.id} className="ls-card" style={{ padding: '0.7rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.4rem' }}>
                  <div>
                    <strong>{lote.nome_arquivo_original}</strong>
                    <span className="ls-badge" style={{ marginLeft: '0.5rem' }}>
                      {DOMINIOS_MERCADO.find((d) => d.valor === lote.dominio)?.label ?? lote.dominio}
                    </span>
                    <span style={{ marginLeft: '0.5rem' }}>{STATUS_LOTE_LABEL[lote.status] ?? lote.status}</span>
                  </div>
                  <div style={{ display: 'flex', gap: '0.4rem' }}>
                    {(lote.status === 'recebido' || lote.status === 'erro') && (
                      <button className="cliente-tabela-btn" onClick={() => handleReprocessar(lote.id)} disabled={processandoLoteId === lote.id}>
                        {processandoLoteId === lote.id ? 'Reprocessando...' : 'Reprocessar'}
                      </button>
                    )}
                    <button className="cliente-tabela-btn cliente-tabela-btn-perigo" onClick={() => handleExcluir(lote.id)}>Excluir</button>
                  </div>
                </div>

                {lote.quantidade_registros_insuficientes > 0 && (
                  <p className="ls-modal-erro" style={{ marginTop: '0.4rem' }}>
                    ⚠️ {lote.quantidade_registros_insuficientes} preço(s) identificado(s), mas sem regra comercial suficiente para
                    registro no catálogo — não entraram na fila, ficam disponíveis só como referência bruta.
                  </p>
                )}

                {divergencias.length > 0 && (
                  <div style={{ marginTop: '0.6rem' }}>
                    <div className="ls-modal-acoes" style={{ justifyContent: 'flex-start' }}>
                      <button className="ls-btn ls-btn-ghost" onClick={() => handleAprovarTodas(lote.id)}>
                        ✓ Aprovar todas ({divergencias.length})
                      </button>
                    </div>
                    <table className="cliente-tabela" style={{ marginTop: '0.4rem' }}>
                      <thead><tr><th>Tipo</th><th>Registro</th><th>Ações</th></tr></thead>
                      <tbody>
                        {divergencias.map((d) => (
                          <tr key={d.id}>
                            <td>{TIPO_DIVERGENCIA_LABEL[d.tipo_divergencia]}</td>
                            <td>{resumoDivergencia(d)}</td>
                            <td className="cliente-tabela-acoes">
                              <button className="cliente-tabela-btn" onClick={() => handleAprovar(d.id, lote.id)}>Aprovar</button>
                              <button className="cliente-tabela-btn cliente-tabela-btn-perigo" onClick={() => handleRejeitar(d.id, lote.id)}>Rejeitar</button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
