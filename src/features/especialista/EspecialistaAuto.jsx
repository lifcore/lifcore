import { useEffect, useRef, useState } from 'react'
import { useAuth } from '../auth/AuthContext'
import { atenderDemandaAuto, buscarHistoricoChatAuto, encerrarConversaAuto } from '../../lib/especialista/especialistaAuto'
import { atenderConsultaRapidaAuto, vincularConsultaComoDemandaAuto } from '../../lib/especialista/consultaRapidaAuto'
import { listarClientesProspects } from '../../lib/crm/clientesService'
import { enviarAnexo } from '../../lib/especialista/uploadService'
import './especialista.css'

/**
 * Especialista de Auto/Frota — mesmo padrão de dois modos do Especialista
 * de Saúde: Demanda (vinculado a um cliente, ciclo DM-AUTO completo) e
 * Consulta Rápida (solta, pode virar Demanda depois).
 */
export default function EspecialistaAuto({ clienteProspectIdInicial = null, casoIdContinuacao = null }) {
  const { perfil } = useAuth()
  const modoDemanda = !!clienteProspectIdInicial || !!casoIdContinuacao

  const [mensagens, setMensagens] = useState([])
  const [casoAtualId, setCasoAtualId] = useState(casoIdContinuacao)
  const [consultaAtualId, setConsultaAtualId] = useState(null)
  const [conversaEncerrada, setConversaEncerrada] = useState(false)
  const [demanda, setDemanda] = useState('')
  const [arquivo, setArquivo] = useState(null)
  const [carregando, setCarregando] = useState(false)
  const [carregandoHistorico, setCarregandoHistorico] = useState(!!casoIdContinuacao)
  const [erro, setErro] = useState(null)
  const [mostrarVincular, setMostrarVincular] = useState(false)
  const fimDoChatRef = useRef(null)

  useEffect(() => {
    if (casoIdContinuacao) {
      buscarHistoricoChatAuto(casoIdContinuacao)
        .then((historico) => setMensagens(historico))
        .finally(() => setCarregandoHistorico(false))
    }
  }, [casoIdContinuacao])

  useEffect(() => {
    fimDoChatRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [mensagens])

  async function handleEnviar() {
    if (!demanda.trim() || carregando) return
    const textoEnviado = demanda
    setDemanda('')
    setCarregando(true)
    setErro(null)
    setMensagens((msgs) => [...msgs, { autor: 'corretor', texto: textoEnviado, criadoEm: new Date().toISOString() }])

    try {
      let imagens = []
      if (arquivo) {
        const anexo = await enviarAnexo(arquivo, casoAtualId ?? consultaAtualId ?? 'temp-' + Date.now())
        imagens = [anexo]
      }

      let resposta
      if (modoDemanda) {
        resposta = await atenderDemandaAuto({
          demandaTexto: textoEnviado,
          usuarioId: perfil?.id,
          organizacaoId: perfil?.organizacao_id ?? null,
          clienteProspectId: clienteProspectIdInicial,
          casoIdContinuacao: casoAtualId,
          imagens,
        })
        if (!casoAtualId) setCasoAtualId(resposta.caso.id)
      } else {
        resposta = await atenderConsultaRapidaAuto({
          demandaTexto: textoEnviado,
          usuarioId: perfil?.id,
          organizacaoId: perfil?.organizacao_id ?? null,
          consultaIdExistente: consultaAtualId,
          imagens,
        })
        if (!consultaAtualId) setConsultaAtualId(resposta.consulta.id)
      }

      setArquivo(null)

      setMensagens((msgs) => [
        ...msgs,
        { autor: 'especialista', texto: resposta.resposta.textoCompleto, criadoEm: new Date().toISOString() },
      ])
    } catch (err) {
      setErro(err.message)
    } finally {
      setCarregando(false)
    }
  }

  async function handleImprimir() {
    const janela = window.open('', '_blank')
    const conteudoHtml = mensagens
      .map(
        (m) => `
        <div style="margin-bottom:14px; padding:10px 14px; border-radius:8px; background:${m.autor === 'corretor' ? '#0e2a3d' : '#f5f7fa'}; color:${m.autor === 'corretor' ? 'white' : '#1c2a2f'}; max-width:80%; margin-left:${m.autor === 'corretor' ? 'auto' : '0'};">
          <strong style="font-size:11px; text-transform:uppercase; opacity:0.7;">${m.autor === 'corretor' ? 'Consultor' : 'Especialista'}</strong>
          <p style="white-space:pre-wrap; margin:4px 0 0;">${(m.texto || '').replace(/</g, '&lt;')}</p>
        </div>`
      )
      .join('')

    janela.document.write(`
      <html>
        <head>
          <title>Conversa com o Especialista de Auto</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 24px; max-width: 700px; margin: 0 auto; }
            h1 { font-size: 18px; color: #0e2a3d; }
          </style>
        </head>
        <body>
          <h1>Especialista de Auto/Frota — Registro da Conversa</h1>
          <p style="color:#666; font-size:12px;">Impresso em ${new Date().toLocaleString('pt-BR')}</p>
          <hr />
          ${conteudoHtml}
        </body>
      </html>
    `)
    janela.document.close()
    janela.focus()
    janela.print()
  }

  async function handleEncerrar() {
    if (casoAtualId) await encerrarConversaAuto(casoAtualId)
    setConversaEncerrada(true)
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleEnviar()
    }
  }

  return (
    <div className="especialista-container especialista-chat-container">
      <div className="especialista-chat-header">
        <div>
          <h2>Especialista de Auto/Frota</h2>
        </div>
        <div className="especialista-chat-header-botoes">
          {mensagens.length > 0 && (
            <button className="ls-btn ls-btn-ghost" onClick={handleImprimir}>🖨️ Imprimir</button>
          )}
          {!modoDemanda && consultaAtualId && !conversaEncerrada && (
            <button className="ls-btn ls-btn-ghost" onClick={() => setMostrarVincular(true)}>
              Vincular a um cliente
            </button>
          )}
          {casoAtualId && !conversaEncerrada && (
            <button className="especialista-btn-encerrar" onClick={handleEncerrar}>Encerrar conversa</button>
          )}
        </div>
      </div>

      <div className="especialista-chat-corpo">
        {carregandoHistorico && <p className="especialista-carregando-historico">Carregando conversa...</p>}

        {mensagens.map((msg, i) => (
          <div key={i} className={`especialista-bolha especialista-bolha-${msg.autor}`}>
            <span className="especialista-bolha-autor">
              {msg.autor === 'corretor' ? 'Você' : msg.autor === 'sistema' ? 'Sistema' : 'Especialista'}
            </span>
            <p>{msg.texto}</p>
            {msg.anexoUrl && (
              <a href={msg.anexoUrl} target="_blank" rel="noreferrer" className="especialista-bolha-anexo">📎 Ver anexo</a>
            )}
          </div>
        ))}

        {carregando && (
          <div className="especialista-bolha especialista-bolha-especialista especialista-bolha-carregando">
            <span className="especialista-bolha-autor">Especialista</span>
            <p>Analisando...</p>
          </div>
        )}

        <div ref={fimDoChatRef} />
      </div>

      {erro && <p className="especialista-erro">Erro: {erro}</p>}

      {conversaEncerrada ? (
        <p className="especialista-conversa-encerrada">✓ Conversa encerrada e registrada no histórico do cliente.</p>
      ) : (
        <>
          <textarea
            className="especialista-input"
            value={demanda}
            onChange={(e) => setDemanda(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Digite sua mensagem... (Enter para enviar, Shift+Enter para quebrar linha)"
            rows={3}
          />

          <div className="especialista-anexo-linha">
            <label className="especialista-anexo-label">
              📎 {arquivo ? arquivo.name : 'Anexar documento (opcional)'}
              <input
                type="file"
                accept="image/*,application/pdf"
                onChange={(e) => setArquivo(e.target.files?.[0] ?? null)}
                hidden
              />
            </label>
            {arquivo && (
              <button className="especialista-anexo-remover" onClick={() => setArquivo(null)}>✕</button>
            )}
          </div>

          <button onClick={handleEnviar} disabled={carregando}>
            {carregando ? 'Enviando...' : 'Enviar'}
          </button>
        </>
      )}

      {mostrarVincular && (
        <VincularClienteAutoModal
          consultaId={consultaAtualId}
          usuarioId={perfil?.id}
          organizacaoId={perfil?.organizacao_id}
          onFechar={() => setMostrarVincular(false)}
          onVinculado={(novoCaso) => {
            setMostrarVincular(false)
            setMensagens((msgs) => [
              ...msgs,
              {
                autor: 'sistema',
                texto: `Conversa vinculada com sucesso à demanda ${novoCaso.codigo}. A partir de agora, ela aparece na aba Demandas desse cliente.`,
                criadoEm: new Date().toISOString(),
              },
            ])
          }}
        />
      )}
    </div>
  )
}

function VincularClienteAutoModal({ consultaId, usuarioId, organizacaoId, onFechar, onVinculado }) {
  const [busca, setBusca] = useState('')
  const [clientes, setClientes] = useState([])
  const [carregando, setCarregando] = useState(false)
  const [erro, setErro] = useState(null)

  useEffect(() => {
    listarClientesProspects({ mostrarFuturas: true, modulo: 'auto' }).then(setClientes)
  }, [])

  const filtrados = clientes.filter((c) => c.razao_social?.toLowerCase().includes(busca.toLowerCase()))

  async function handleVincular(clienteId) {
    setCarregando(true)
    setErro(null)
    try {
      const novoCaso = await vincularConsultaComoDemandaAuto({
        consultaId,
        clienteProspectId: clienteId,
        organizacaoId,
        usuarioId,
      })
      onVinculado(novoCaso)
    } catch (err) {
      setErro(err.message)
    } finally {
      setCarregando(false)
    }
  }

  return (
    <div className="ls-modal-overlay" onClick={onFechar}>
      <div className="ls-modal" onClick={(e) => e.stopPropagation()}>
        <h3>Vincular a um cliente</h3>
        <input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar cliente por nome..."
          style={{ marginBottom: '0.75rem' }}
        />
        <div className="especialista-lista-clientes">
          {filtrados.map((c) => (
            <button
              key={c.id}
              className="especialista-cliente-item"
              onClick={() => handleVincular(c.id)}
              disabled={carregando}
            >
              {c.razao_social}
            </button>
          ))}
          {filtrados.length === 0 && <p className="cliente-vazio-inline">Nenhum cliente encontrado.</p>}
        </div>
        {erro && <p className="ls-modal-erro">{erro}</p>}
        <div className="ls-modal-acoes">
          <button className="ls-btn ls-btn-ghost" onClick={onFechar}>Cancelar</button>
        </div>
      </div>
    </div>
  )
}
