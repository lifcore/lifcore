import { useEffect, useState } from 'react'
import {
  DOMINIOS_MERCADO,
  uploadMaterialMercado,
  reprocessarLoteMercado,
  validarLoteComSegundaIA,
  excluirLoteMercado,
  listarLotesImportacaoMercado,
} from '../../lib/crm/catalogoMercadoService'
import { listarRegioesTarifarias } from '../../lib/crm/catalogoInstitucionalService'

// v3 (18/08, correção de arquitetura) — sem aprovação bloqueante, e sem
// requisição única esperando o lote inteiro: cada chamada processa 1
// bloco, o frontend encadeia as chamadas (dispararProcessamentoMercado
// já faz isso) e mostra progresso ao vivo via onProgresso.
const STATUS_LOTE_LABEL = {
  recebido: 'Recebido — processando...',
  processando_parcial: '🔵 Em andamento — clique em Continuar',
  concluido: '🟢 Concluído',
  concluido_com_erros: '🟡 Concluído com erros — ver relatório',
  erro: '🔴 Erro no processamento',
  nao_implementado: '⚪ Domínio ainda não implementado',
}

/**
 * SPEC-002 §5, revisado 18/08 (Arquitetura v3 — correção de execução,
 * diretriz do Chief) — importação de material de mercado por domínio.
 * Grava direto nas tabelas de domínio, com sinal de confiança no próprio
 * registro — sem fila de aprovação. Cada chamada à Edge Function processa
 * no máximo 1 bloco (nunca o lote inteiro numa requisição só, pra nunca
 * mais depender de timeout de HTTP); o frontend encadeia as chamadas
 * necessárias e mostra progresso em tempo real. Validação cruzada por
 * segunda IA é ação totalmente separada, sob demanda, nunca bloqueia a
 * ingestão. Vive dentro do PainelInstitucional (MasterCenterSeguradoras.jsx),
 * porque importação é sempre por operadora — nunca cria tela nova.
 */
export default function PainelImportacaoMercado({ operadoraId, usuarioId = null }) {
  const [dominio, setDominio] = useState(DOMINIOS_MERCADO[0].valor)
  const [regioes, setRegioes] = useState([])
  const [regiaoTarifariaId, setRegiaoTarifariaId] = useState('')
  const [lotes, setLotes] = useState([])
  const [enviando, setEnviando] = useState(false)
  const [processandoLoteId, setProcessandoLoteId] = useState(null)
  const [validandoLoteId, setValidandoLoteId] = useState(null)
  const [progressoPorLote, setProgressoPorLote] = useState({})
  const [erro, setErro] = useState(null)

  useEffect(() => {
    carregar()
    listarRegioesTarifarias().then(setRegioes).catch((err) => setErro(err.message))
  }, [operadoraId])

  async function carregar() {
    try {
      const lotesCarregados = await listarLotesImportacaoMercado({ operadoraId })
      setLotes(lotesCarregados)
    } catch (err) {
      setErro(err.message)
    }
  }

  async function handleUpload(e) {
    const file = e.target.files?.[0]
    if (!file) return
    if (!regiaoTarifariaId) {
      setErro('Selecione a região tarifária antes de enviar o arquivo — cada tabela vale para uma região só.')
      e.target.value = ''
      return
    }
    setEnviando(true)
    setErro(null)
    try {
      await uploadMaterialMercado({ file, dominio, operadoraId, regiaoTarifariaId, enviadoPor: usuarioId })
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
      await reprocessarLoteMercado(loteId, {
        onProgresso: (resultado) => {
          setProgressoPorLote((atual) => ({ ...atual, [loteId]: resultado }))
        },
      })
      await carregar()
    } catch (err) {
      setErro(err.message)
    } finally {
      setProcessandoLoteId(null)
      setProgressoPorLote((atual) => {
        const { [loteId]: _descartado, ...resto } = atual
        return resto
      })
    }
  }

  async function handleValidar(loteId) {
    setValidandoLoteId(loteId)
    setErro(null)
    try {
      await validarLoteComSegundaIA(loteId)
      await carregar()
    } catch (err) {
      setErro(err.message)
    } finally {
      setValidandoLoteId(null)
    }
  }

  async function handleExcluir(loteId) {
    if (!confirm('Excluir este lote de importação? Os dados já gravados por ele no catálogo não serão desfeitos automaticamente.')) return
    try {
      await excluirLoteMercado(loteId)
      await carregar()
    } catch (err) {
      setErro(err.message)
    }
  }

  return (
    <div className="ls-card" style={{ padding: '0.85rem', marginTop: '0.6rem' }}>
      <strong>Importação de Material de Mercado</strong>
      <p className="config-instrucao">
        Envie tabela de preços, rede credenciada ou regras gerais (planos, carências, coparticipação, reembolso,
        regras comerciais) — o motor extrai e grava direto no catálogo, com sinal de confiança em cada registro.
        Sem fila de aprovação: revise pelo relatório de cada lote quando terminar.
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
          <label>Região Tarifária</label>
          <select value={regiaoTarifariaId} onChange={(e) => setRegiaoTarifariaId(e.target.value)}>
            <option value="">Selecione...</option>
            {regioes.map((r) => (
              <option key={r.id} value={r.id}>{r.nome}</option>
            ))}
          </select>
        </div>
        <div>
          <label
            className="ls-btn ls-btn-primary"
            style={{ display: 'inline-block', cursor: regiaoTarifariaId ? 'pointer' : 'not-allowed', opacity: regiaoTarifariaId ? 1 : 0.5 }}
          >
            {enviando ? 'Enviando...' : '+ Enviar arquivo (PDF/Excel/CSV/TXT)'}
            <input
              type="file"
              accept=".pdf,.xlsx,.xls,.csv,.txt"
              onChange={handleUpload}
              disabled={enviando || !regiaoTarifariaId}
              style={{ display: 'none' }}
            />
          </label>
        </div>
      </div>

      {lotes.length === 0 ? (
        <p className="cliente-vazio" style={{ marginTop: '0.75rem' }}>Nenhum material importado ainda para esta operadora.</p>
      ) : (
        <div style={{ marginTop: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
          {lotes.map((lote) => {
            const resumo = lote.resumo_execucao
            const podeReprocessar = lote.status === 'recebido' || lote.status === 'erro' || lote.status === 'concluido_com_erros' || lote.status === 'processando_parcial'
            const podeValidar = (resumo?.blocos_sucesso ?? 0) > 0
            const progresso = progressoPorLote[lote.id]
            return (
              <div key={lote.id} className="ls-card" style={{ padding: '0.7rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.4rem' }}>
                  <div>
                    <strong>{lote.nome_arquivo_original}</strong>
                    <span className="ls-badge" style={{ marginLeft: '0.5rem' }}>
                      {DOMINIOS_MERCADO.find((d) => d.valor === lote.dominio)?.label ?? lote.dominio}
                    </span>
                    <span className="ls-badge" style={{ marginLeft: '0.4rem' }}>
                      {lote.regioes_tarifarias?.nome ?? 'região não identificada'}
                    </span>
                    <span style={{ marginLeft: '0.5rem' }}>{STATUS_LOTE_LABEL[lote.status] ?? lote.status}</span>
                  </div>
                  <div style={{ display: 'flex', gap: '0.4rem' }}>
                    {podeReprocessar && (
                      <button className="cliente-tabela-btn" onClick={() => handleReprocessar(lote.id)} disabled={processandoLoteId === lote.id}>
                        {processandoLoteId === lote.id
                          ? 'Processando...'
                          : lote.status === 'processando_parcial'
                            ? 'Continuar processamento'
                            : lote.status === 'concluido_com_erros'
                              ? 'Retomar blocos com erro'
                              : 'Reprocessar'}
                      </button>
                    )}
                    {podeValidar && (
                      <button className="cliente-tabela-btn" onClick={() => handleValidar(lote.id)} disabled={validandoLoteId === lote.id}>
                        {validandoLoteId === lote.id ? 'Validando...' : 'Validar com 2ª IA'}
                      </button>
                    )}
                    <button className="cliente-tabela-btn cliente-tabela-btn-perigo" onClick={() => handleExcluir(lote.id)}>Excluir</button>
                  </div>
                </div>

                {/* Progresso ao vivo — só aparece durante o loop de processamento
                    desse lote específico. Cada bloco processado atualiza aqui,
                    em vez de um "processando..." genérico e opaco. */}
                {processandoLoteId === lote.id && progresso && (
                  <p style={{ marginTop: '0.4rem', fontSize: '0.85em', opacity: 0.8 }}>
                    {progresso.fase === 'blocos_criados'
                      ? `Preparando ${progresso.total_blocos} bloco(s)...`
                      : progresso.bloco_processado != null
                        ? `Bloco ${progresso.bloco_processado} processado — ${progresso.blocos_sucesso ?? 0} de ${progresso.total_blocos ?? '?'} concluído(s) até agora.`
                        : 'Processando...'}
                  </p>
                )}

                {/* Relatório simples de execução — substitui a antiga fila de aprovação.
                    Vem direto de lotes_importacao_mercado.resumo_execucao, sem query extra. */}
                {resumo && resumo.total_blocos > 0 && (
                  <div style={{ marginTop: '0.5rem' }}>
                    {resumo.blocos_erro === 0 ? (
                      <p style={{ opacity: 0.75, fontSize: '0.9em' }}>
                        ✓ {resumo.blocos_sucesso} de {resumo.total_blocos} bloco(s) processados com sucesso.
                        {resumo.blocos_pendentes > 0 && ` ${resumo.blocos_pendentes} ainda pendente(s) — clique em Continuar processamento.`}
                      </p>
                    ) : (
                      <div className="ls-modal-erro">
                        ⚠️ {resumo.blocos_erro} de {resumo.total_blocos} bloco(s) com erro — {resumo.blocos_sucesso} concluído(s) normalmente:
                        <ul style={{ margin: '0.3rem 0 0 1.1rem', padding: 0 }}>
                          {resumo.erros.map((e, i) => (
                            <li key={i}>
                              Bloco {e.numero_bloco}
                              {e.pagina_inicio ? ` (página ${e.pagina_inicio}${e.pagina_fim && e.pagina_fim !== e.pagina_inicio ? `–${e.pagina_fim}` : ''})` : ''}
                              {e.etapa ? ` [parou em ${e.etapa}]` : ''}: {e.mensagem}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
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
