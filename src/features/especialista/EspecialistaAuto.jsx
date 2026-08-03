import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  buscarClienteProspectCompleto,
  salvarContato,
  atualizarClienteProspect,
  excluirClienteProspect,
  atualizarStatusClienteProspect,
  criarDemandaManual,
  atualizarDemanda,
  adicionarAtualizacaoManual,
  excluirCotacao,
} from '../../lib/crm/clientesService'
import { listarApolicesDoCliente, excluirApoliceAuto } from '../../lib/crm/lifleetService'
import { listarTemplates, montarLinkWhatsApp, personalizarMensagem } from '../../lib/crm/templatesService'
import { formatarDataBR } from '../../lib/utils/formatarData'
import { DadosCadastraisTab } from '../crm/ClienteDetailPage'
import CotacaoAutoForm from './CotacaoAutoForm'
import CotacaoComparativaAutoForm from './CotacaoComparativaAutoForm'
import ApoliceAutoForm from './ApoliceAutoForm'
import EspecialistaAuto from '../especialista/EspecialistaAuto'
import { buscarHistoricoChatAuto } from '../../lib/especialista/especialistaAuto'
import { gerarResumoCandidato, criarCandidatoConhecimento, aprovarCandidatoComoCasoReal, rejeitarCandidato } from '../../lib/crm/aprendizadoService'
import { listarCorretores } from '../../lib/crm/apolicesService'
import { useAuth } from '../auth/AuthContext'
import BotaoGerarRelatorio from '../../components/BotaoGerarRelatorio'
import BotaoOperacaoCritica from '../../components/BotaoOperacaoCritica'

const ABAS = ['Dados Cadastrais', 'Cotações', 'Apólices', 'Demandas']

export default function ClienteDetailLifleetPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { perfil } = useAuth()
  const ehMaster = perfil?.papel === 'master'
  const [dados, setDados] = useState(null)
  const [apolices, setApolices] = useState([])
  const [abaAtiva, setAbaAtiva] = useState('Demandas')
  const [mostrarWhatsApp, setMostrarWhatsApp] = useState(false)
  const [mostrarTransferir, setMostrarTransferir] = useState(false)

  useEffect(() => {
    carregar()
  }, [id])

  async function carregar() {
    const [resultado, listaApolices] = await Promise.all([
      buscarClienteProspectCompleto(id),
      listarApolicesDoCliente(id),
    ])
    setDados(resultado)
    setApolices(listaApolices)
  }

  async function excluirEVoltar() {
    await excluirClienteProspect(id)
    navigate('/lifleet')
  }

  async function handleMarcarInativo() {
    await atualizarStatusClienteProspect(id, 'inativo')
    navigate('/lifleet')
  }

  if (!dados) return <p className="cliente-carregando">Carregando...</p>

  const { cliente, contatos, cotacoes, demandas, grupoInfo } = dados
  const contatoPrimario = contatos.find((c) => c.tipo === 'primario') ?? {}
  const contatoSecundario = contatos.find((c) => c.tipo === 'secundario') ?? {}

  return (
    <div className="cliente-detail-page">
      <button className="cliente-voltar" onClick={() => navigate('/lifleet')}>&larr; Voltar ao pipeline</button>

      <div className="cliente-detail-header">
        <div>
          <h2>{cliente.razao_social}</h2>
          <span className={`ls-badge ls-badge-${cliente.status}`}>{cliente.status}</span>
        </div>
        <div className="cliente-detail-header-direita">
          {cliente.data_vigencia && (
            <div className="cliente-vigencia">
              Vigência: <strong>{formatarDataBR(cliente.data_vigencia)}</strong>
            </div>
          )}
          <div className="cliente-acoes-perigo">
            <button className="ls-btn ls-btn-accent" onClick={() => setMostrarWhatsApp(true)}>💬 WhatsApp</button>
            <BotaoGerarRelatorio clienteId={cliente.id} />
            {ehMaster && (
              <button className="ls-btn ls-btn-ghost" onClick={() => setMostrarTransferir(true)}>🔁 Transferir</button>
            )}
            <button className="ls-btn ls-btn-ghost" onClick={handleMarcarInativo}>Marcar Inativo</button>
            <BotaoOperacaoCritica
              label="Excluir"
              tabelaAfetada="operacional.clientes_prospects"
              registroId={cliente.id}
              dadosAntes={cliente}
              executar={excluirEVoltar}
              className="cliente-btn-excluir"
            />
          </div>
        </div>
      </div>

      {mostrarTransferir && (
        <TransferirClienteLifleetModal
          clienteId={cliente.id}
          corretorAtualId={cliente.corretor_id}
          onFechar={() => setMostrarTransferir(false)}
          onTransferido={() => {
            setMostrarTransferir(false)
            navigate('/lifleet')
          }}
        />
      )}

      <div className="cliente-abas">
        {ABAS.map((aba) => (
          <button
            key={aba}
            className={`cliente-aba ${abaAtiva === aba ? 'cliente-aba-ativa' : ''}`}
            onClick={() => setAbaAtiva(aba)}
          >
            {aba}
          </button>
        ))}
      </div>

      <div className="cliente-aba-conteudo">
        {abaAtiva === 'Dados Cadastrais' && (
          <DadosCadastraisTab
            cliente={cliente}
            contatoPrimario={contatoPrimario}
            contatoSecundario={contatoSecundario}
            grupoInfo={grupoInfo}
            onSalvo={carregar}
          />
        )}

        {abaAtiva === 'Cotações' && (
          <CotacoesAutoTab clienteId={cliente.id} cotacoes={cotacoes} onAtualizado={carregar} />
        )}

        {abaAtiva === 'Apólices' && (
          <ApolicesTab
            apolices={apolices}
            clienteProspectId={cliente.id}
            tipoPessoa={cliente.tipo_pessoa}
            onAtualizado={carregar}
          />
        )}

        {abaAtiva === 'Demandas' && (
          <DemandasLifleetTab demandas={demandas} cliente={cliente} onAtualizado={carregar} />
        )}
      </div>

      {mostrarWhatsApp && (
        <WhatsAppLifleetModal
          contatoPrimario={contatoPrimario}
          nomeEmpresa={cliente.razao_social}
          apoliceRecente={apolices[0] ?? null}
          onFechar={() => setMostrarWhatsApp(false)}
        />
      )}
    </div>
  )
}

function CotacoesAutoTab({ clienteId, cotacoes, onAtualizado }) {
  const [mostrarComparativo, setMostrarComparativo] = useState(false)
  const [cotacaoEditando, setCotacaoEditando] = useState(null)

  async function handleExcluir(cotacaoId) {
    if (!window.confirm('Excluir esta cotação?')) return
    await excluirCotacao(cotacaoId)
    onAtualizado()
  }

  // Agrupa as cotações por rodada de comparação (grupo_comparacao_id).
  // Cotações antigas/soltas (sem grupo) continuam aparecendo como cards
  // individuais, exatamente como já funcionava antes.
  const semGrupo = cotacoes.filter((c) => !c.grupo_comparacao_id)
  const grupos = {}
  for (const c of cotacoes) {
    if (c.grupo_comparacao_id) {
      grupos[c.grupo_comparacao_id] = grupos[c.grupo_comparacao_id] ?? []
      grupos[c.grupo_comparacao_id].push(c)
    }
  }

  return (
    <div>
      {!mostrarComparativo && !cotacaoEditando && (
        <button className="ls-btn ls-btn-accent" onClick={() => setMostrarComparativo(true)}>
          📊 Cotador Comparativo
        </button>
      )}

      {mostrarComparativo && (
        <CotacaoComparativaAutoForm
          clienteProspectId={clienteId}
          onSalvo={() => {
            setMostrarComparativo(false)
            onAtualizado()
          }}
          onCancelar={() => setMostrarComparativo(false)}
        />
      )}

      {cotacaoEditando && (
        <CotacaoAutoForm
          clienteProspectId={clienteId}
          cotacaoExistente={cotacaoEditando}
          onSalvo={() => {
            setCotacaoEditando(null)
            onAtualizado()
          }}
          onCancelar={() => setCotacaoEditando(null)}
        />
      )}

      {cotacoes.length === 0 ? (
        <p className="cliente-vazio">Nenhuma cotação registrada ainda.</p>
      ) : (
        <div className="cotacoes-historico" style={{ marginTop: '1rem' }}>
          {Object.entries(grupos).map(([grupoId, itensGrupo]) => (
            <GrupoComparativo key={grupoId} itens={itensGrupo} onEditar={setCotacaoEditando} onExcluir={handleExcluir} />
          ))}

          {semGrupo.map((cot) => (
            <div key={cot.id} className="ls-card cotacao-item">
              <div className="cotacao-item-header">
                <strong>{cot.operadora_nome_livre}</strong>
                <span>R$ {Number(cot.valor_total ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                <span>Válida até: {cot.validade ? formatarDataBR(cot.validade) : '—'}</span>
              </div>
              <div className="cliente-tabela-acoes" style={{ marginTop: '0.6rem' }}>
                <button className="cliente-tabela-btn" onClick={() => setCotacaoEditando(cot)}>Editar</button>
                <button className="cliente-tabela-btn cliente-tabela-btn-perigo" onClick={() => handleExcluir(cot.id)}>Excluir</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function GrupoComparativo({ itens, onEditar, onExcluir }) {
  const menorValor = Math.min(...itens.map((i) => Number(i.valor_total ?? Infinity)))
  const contexto = itens[0]?.contexto_veiculo

  function handleImprimir() {
    const janela = window.open('', '_blank')
    const linhas = itens
      .map(
        (i) => `
        <tr style="${Number(i.valor_total) === menorValor ? 'background:#eafaf0; font-weight:600;' : ''}">
          <td style="padding:8px 12px; border-bottom:1px solid #eee;">${i.operadora_nome_livre}</td>
          <td style="padding:8px 12px; border-bottom:1px solid #eee;">R$ ${Number(i.valor_total ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
          <td style="padding:8px 12px; border-bottom:1px solid #eee;">${i.observacoes ?? '—'}</td>
        </tr>`
      )
      .join('')

    janela.document.write(`
      <html>
        <head><title>Comparativo de Seguros</title>
          <style>body{font-family:Arial,sans-serif;padding:24px;max-width:700px;margin:0 auto;} h1{font-size:18px;color:#0e2a3d;} table{width:100%;border-collapse:collapse;margin-top:12px;}</style>
        </head>
        <body>
          <h1>Comparativo de Seguro Auto</h1>
          ${contexto ? `<p><strong>Veículo/perfil:</strong> ${contexto}</p>` : ''}
          <table>
            <thead><tr><th style="text-align:left; padding:8px 12px;">Seguradora</th><th style="text-align:left; padding:8px 12px;">Valor</th><th style="text-align:left; padding:8px 12px;">Detalhes</th></tr></thead>
            <tbody>${linhas}</tbody>
          </table>
          <p style="color:#666; font-size:12px; margin-top:16px;">Gerado em ${new Date().toLocaleString('pt-BR')}</p>
        </body>
      </html>
    `)
    janela.document.close()
    janela.focus()
    janela.print()
  }

  return (
    <div className="ls-card" style={{ padding: 0, marginBottom: '1rem' }}>
      <div style={{ padding: '0.75rem 0.9rem', borderBottom: '1px solid var(--ls-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <strong>📊 Comparativo</strong>
          {contexto && <span className="config-instrucao" style={{ marginLeft: '0.5rem' }}>{contexto}</span>}
        </div>
        <button className="cliente-tabela-btn" onClick={handleImprimir}>🖨️ Imprimir/Compartilhar</button>
      </div>
      <table className="cliente-tabela">
        <thead>
          <tr><th>Seguradora</th><th>Valor</th><th>Detalhes</th><th>Ações</th></tr>
        </thead>
        <tbody>
          {itens.map((i) => (
            <tr key={i.id} style={Number(i.valor_total) === menorValor ? { background: 'var(--ls-accent-soft)', fontWeight: 600 } : {}}>
              <td>{i.operadora_nome_livre}{Number(i.valor_total) === menorValor && ' 🏆'}</td>
              <td>R$ {Number(i.valor_total ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
              <td>{i.observacoes ?? '—'}</td>
              <td className="cliente-tabela-acoes">
                <button className="cliente-tabela-btn" onClick={() => onEditar(i)}>Editar</button>
                <button className="cliente-tabela-btn cliente-tabela-btn-perigo" onClick={() => onExcluir(i.id)}>Excluir</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function ApolicesTab({ apolices, clienteProspectId, tipoPessoa, onAtualizado }) {
  const [mostrarForm, setMostrarForm] = useState(false)
  const [apoliceEditando, setApoliceEditando] = useState(null)

  return (
    <div>
      {!mostrarForm && !apoliceEditando && (
        <button className="ls-btn ls-btn-accent" onClick={() => setMostrarForm(true)}>
          + Nova Apólice
        </button>
      )}

      {(mostrarForm || apoliceEditando) && (
        <ApoliceAutoForm
          clienteProspectId={clienteProspectId}
          tipoPessoa={tipoPessoa}
          apoliceExistente={apoliceEditando}
          onSalvo={() => {
            setMostrarForm(false)
            setApoliceEditando(null)
            onAtualizado()
          }}
          onCancelar={() => {
            setMostrarForm(false)
            setApoliceEditando(null)
          }}
        />
      )}

      {apolices.length === 0 ? (
        <p className="cliente-vazio">Nenhuma apólice lançada ainda.</p>
      ) : (
        <div className="cotacoes-historico" style={{ marginTop: '1rem' }}>
          {apolices.map((ap) => (
            <div key={ap.id} className="ls-card cotacao-item">
              <div className="cotacao-item-header">
                <strong>{ap.operadora_nome_livre ?? '—'}</strong>
                <span className={`ls-badge ls-badge-${ap.produto === 'Frota' ? 'cliente' : 'prospect'}`}>{ap.produto}</span>
                {ap.numero_apolice && <span className="ls-mono">Apólice: {ap.numero_apolice}</span>}
                <span>R$ {Number(ap.premio ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                <span>Vigência: {ap.vigencia_fim ? formatarDataBR(ap.vigencia_fim) : '—'}</span>
              </div>
              <div className="cotacao-item-valores">
                {(ap.veiculos ?? []).map((v) => (
                  <span key={v.id} className="cotacao-item-valor">
                    🚗 {v.placa} {v.marca ? `— ${v.marca} ${v.modelo ?? ''}` : ''}
                  </span>
                ))}
              </div>
              <div className="cliente-tabela-acoes" style={{ marginTop: '0.6rem' }}>
                <button className="cliente-tabela-btn" onClick={() => setApoliceEditando(ap)}>Editar</button>
                <BotaoOperacaoCritica
                  label="Excluir"
                  tabelaAfetada="operacional.apolices"
                  registroId={ap.id}
                  dadosAntes={ap}
                  executar={() => excluirApoliceAuto(ap.id)}
                  onSucesso={onAtualizado}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function traduzirSituacaoLifleet(situacao) {
  const mapa = {
    aberto: 'Aberta',
    em_andamento: 'Em andamento',
    aguardando_operadora: 'Aguardando Seguradora',
    aguardando_cliente: 'Aguardando cliente',
    resolvido: 'Resolvida',
    encerrado: 'Fechada',
  }
  return mapa[situacao] ?? situacao
}

function DemandasLifleetTab({ demandas, cliente, onAtualizado }) {
  const [mostrarForm, setMostrarForm] = useState(false)
  const [descricao, setDescricao] = useState('')
  const [dataAcao, setDataAcao] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [demandaSelecionada, setDemandaSelecionada] = useState(null)

  async function handleAbrirDemanda() {
    if (!descricao.trim()) return
    setSalvando(true)
    try {
      await criarDemandaManual({
        clienteProspectId: cliente.id,
        organizacaoId: cliente.organizacao_id,
        descricao,
        dataProximaAcao: dataAcao || null,
        codigoRpc: 'gerar_codigo_demanda_auto',
      })
      setDescricao('')
      setDataAcao('')
      setMostrarForm(false)
      onAtualizado()
    } finally {
      setSalvando(false)
    }
  }

  const demandasOrdenadas = [...demandas].sort((a, b) => {
    const aFinalizada = a.situacao === 'resolvido' || a.situacao === 'encerrado'
    const bFinalizada = b.situacao === 'resolvido' || b.situacao === 'encerrado'
    if (aFinalizada === bFinalizada) return 0
    return aFinalizada ? 1 : -1
  })

  return (
    <div>
      <div className="demandas-header-acoes">
        {!mostrarForm && (
          <button className="ls-btn ls-btn-accent" onClick={() => setMostrarForm(true)}>
            + Abrir Demanda
          </button>
        )}
      </div>

      {mostrarForm && (
        <div className="ls-card demanda-form">
          <label>O que o cliente pediu?</label>
          <input
            value={descricao}
            onChange={(e) => setDescricao(e.target.value)}
            placeholder="Ex: Cliente solicitou inclusão de novo veículo"
          />
          <label>Data para próxima ação</label>
          <input type="date" value={dataAcao} onChange={(e) => setDataAcao(e.target.value)} />
          <div className="ls-modal-acoes">
            <button className="ls-btn ls-btn-ghost" onClick={() => setMostrarForm(false)}>Cancelar</button>
            <button className="ls-btn ls-btn-primary" onClick={handleAbrirDemanda} disabled={salvando}>
              {salvando ? 'Abrindo...' : 'Abrir Demanda'}
            </button>
          </div>
        </div>
      )}

      {demandasOrdenadas.length === 0 ? (
        <p className="cliente-vazio">Nenhuma demanda para este cliente.</p>
      ) : (
        <div className="ls-card" style={{ marginTop: '1rem', padding: 0 }}>
          <table className="cliente-tabela">
            <thead>
              <tr><th>Código</th><th>Demanda</th><th>Situação</th><th>Próxima ação</th><th>Aberto em</th></tr>
            </thead>
            <tbody>
              {demandasOrdenadas.map((d) => {
                const finalizada = d.situacao === 'resolvido' || d.situacao === 'encerrado'
                return (
                  <tr
                    key={d.id}
                    className={`demanda-linha-clicavel ${finalizada ? 'demanda-linha-finalizada' : ''}`}
                    onClick={() => setDemandaSelecionada(d)}
                  >
                    <td className="ls-mono">{d.codigo}</td>
                    <td>{d.demanda_original ?? d.categoria ?? '—'}</td>
                    <td><span className="ls-badge ls-badge-prospect">{traduzirSituacaoLifleet(d.situacao)}</span></td>
                    <td>{d.data_proxima_acao ? formatarDataBR(d.data_proxima_acao) : '—'}</td>
                    <td>{new Date(d.criado_em).toLocaleDateString('pt-BR')}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {demandaSelecionada && (
        <DemandaDetailLifleetModal
          demanda={demandaSelecionada}
          cliente={cliente}
          onFechar={() => setDemandaSelecionada(null)}
          onSalvoSemFechar={onAtualizado}
          onAtualizado={() => {
            setDemandaSelecionada(null)
            onAtualizado()
          }}
        />
      )}
    </div>
  )
}

/**
 * Painel de detalhe da Demanda no Lifleet — mesmo padrão do Lifcare:
 * histórico só leitura por padrão, "Editar" destrava status +
 * atualização, botão "Especialista" abre o Especialista de Auto/Frota
 * vinculado a essa demanda, e encerrar gera um resumo sugerido de Caso
 * Real (nunca vira conhecimento institucional sem aprovação humana).
 */
function DemandaDetailLifleetModal({ demanda, cliente, onFechar, onAtualizado, onSalvoSemFechar }) {
  const { perfil } = useAuth()
  const [editando, setEditando] = useState(false)
  const [situacao, setSituacao] = useState(demanda.situacao)
  const [dataProximaAcao, setDataProximaAcao] = useState(demanda.data_proxima_acao ?? '')
  const [novaAtualizacao, setNovaAtualizacao] = useState('')
  const [historico, setHistorico] = useState([])
  const [carregandoHistorico, setCarregandoHistorico] = useState(true)
  const [salvando, setSalvando] = useState(false)
  const [abrirEspecialista, setAbrirEspecialista] = useState(false)
  const [gerandoResumo, setGerandoResumo] = useState(false)
  const [candidato, setCandidato] = useState(null)

  useEffect(() => {
    buscarHistoricoChatAuto(demanda.id).then((h) => {
      setHistorico(h)
      setCarregandoHistorico(false)
    })
  }, [demanda.id])

  async function handleSalvar() {
    setSalvando(true)
    try {
      const situacaoMudouParaEncerrado = situacao === 'encerrado' && demanda.situacao !== 'encerrado'

      await atualizarDemanda(demanda.id, { situacao, dataProximaAcao })
      if (novaAtualizacao.trim()) {
        await adicionarAtualizacaoManual(demanda.id, novaAtualizacao, perfil?.id)
      }

      if (situacaoMudouParaEncerrado) {
        // Mesma regra do Lifcare: todo ciclo encerrado gera um resumo
        // sugerido, mas NUNCA vira Caso Real sem aprovação humana. É
        // assim que a base de casos do Auto cresce organicamente.
        setGerandoResumo(true)
        const resumo = await gerarResumoCandidato(demanda.id)
        const novoCandidato = await criarCandidatoConhecimento(demanda.id, resumo)
        setCandidato({ ...novoCandidato, resumoObjeto: resumo })
        setGerandoResumo(false)
        setEditando(false)
        return
      }

      const historicoAtualizado = await buscarHistoricoChatAuto(demanda.id)
      setHistorico(historicoAtualizado)
      setNovaAtualizacao('')
      setEditando(false)
      onSalvoSemFechar?.()
    } finally {
      setSalvando(false)
    }
  }

  async function handleAprovarCandidato() {
    await aprovarCandidatoComoCasoReal(candidato.id, perfil?.id)
    onAtualizado()
  }

  async function handleRejeitarCandidato() {
    await rejeitarCandidato(candidato.id)
    onAtualizado()
  }

  if (abrirEspecialista) {
    return (
      <div className="ls-modal-overlay" onClick={onFechar}>
        <div className="especialista-modal" onClick={(e) => e.stopPropagation()}>
          <button className="especialista-modal-fechar" onClick={onFechar}>✕</button>
          <EspecialistaAuto clienteProspectIdInicial={cliente?.id} casoIdContinuacao={demanda.id} />
        </div>
      </div>
    )
  }

  return (
    <div className="ls-modal-overlay" onClick={editando ? undefined : onFechar}>
      <div className="ls-modal demanda-detail-modal" onClick={(e) => e.stopPropagation()}>
        <div className="demanda-detail-header">
          <h3>{demanda.codigo}</h3>
          <div className="demanda-detail-header-botoes">
            <button className="ls-btn ls-btn-accent" onClick={() => setAbrirEspecialista(true)}>
              🧠 Especialista
            </button>
          </div>
        </div>
        <p className="config-instrucao">{demanda.demanda_original}</p>

        <div className="demanda-detail-historico">
          {carregandoHistorico ? (
            <p className="especialista-carregando-historico">Carregando histórico...</p>
          ) : historico.length === 0 ? (
            <p className="cliente-vazio-inline">Nenhuma interação registrada ainda.</p>
          ) : (
            historico.map((m, i) => (
              <div key={i} className={`especialista-bolha especialista-bolha-${m.autor}`}>
                <span className="especialista-bolha-autor">
                  {m.autor === 'corretor' ? 'Corretor' : m.autor === 'sistema' ? 'Atualização' : 'Especialista'}
                </span>
                <p>{m.texto}</p>
              </div>
            ))
          )}
        </div>

        {gerandoResumo && <p className="especialista-carregando-historico">Gerando resumo sugerido...</p>}

        {candidato ? (
          <div className="candidato-aprovacao">
            <h4>✅ Demanda encerrada — sugestão de Caso Real gerada</h4>
            <p className="config-instrucao">
              <strong>{candidato.resumoObjeto.titulo}</strong><br />
              {candidato.resumoObjeto.resultado}
            </p>
            <p className="config-instrucao">
              Isso só vira conhecimento institucional se você aprovar — nada acontece sozinho.
            </p>
            <div className="ls-modal-acoes">
              <button className="ls-btn ls-btn-ghost" onClick={handleRejeitarCandidato}>Rejeitar</button>
              <button className="ls-btn ls-btn-primary" onClick={handleAprovarCandidato}>Aprovar como Caso Real</button>
            </div>
          </div>
        ) : !editando ? (
          <div className="demanda-detail-rodape">
            <span className="ls-badge ls-badge-prospect">{traduzirSituacaoLifleet(situacao)}</span>
            <button className="ls-btn ls-btn-ghost" onClick={() => setEditando(true)}>Editar Demanda</button>
          </div>
        ) : (
          <div className="demanda-detail-edicao">
            <label>Situação</label>
            <select className="demanda-select-status" value={situacao} onChange={(e) => setSituacao(e.target.value)}>
              <option value="aberto">Aberta</option>
              <option value="em_andamento">Em andamento</option>
              <option value="aguardando_operadora">Aguardando Seguradora</option>
              <option value="aguardando_cliente">Aguardando cliente</option>
              <option value="resolvido">Resolvida</option>
              <option value="encerrado">Encerrado</option>
            </select>

            <label>Próxima ação (data)</label>
            <input type="date" value={dataProximaAcao ?? ''} onChange={(e) => setDataProximaAcao(e.target.value)} />

            <label>Adicionar atualização (fica registrado, não pode ser apagado depois)</label>
            <textarea
              value={novaAtualizacao}
              onChange={(e) => setNovaAtualizacao(e.target.value)}
              rows={3}
              style={{ width: '100%', padding: '0.5rem 0.65rem', border: '1px solid var(--ls-border)', borderRadius: 'var(--ls-radius-sm)', fontFamily: 'inherit' }}
            />

            <div className="ls-modal-acoes">
              <button className="ls-btn ls-btn-ghost" onClick={() => setEditando(false)}>Cancelar</button>
              <button className="ls-btn ls-btn-primary" onClick={handleSalvar} disabled={salvando}>
                {salvando ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function WhatsAppLifleetModal({ contatoPrimario, nomeEmpresa, apoliceRecente, onFechar }) {
  const { perfil } = useAuth()
  const [templates, setTemplates] = useState([])
  const [templateSelecionado, setTemplateSelecionado] = useState(null)
  const [textoEditavel, setTextoEditavel] = useState('')
  const [carregando, setCarregando] = useState(true)

  const textoVeiculo = (apoliceRecente?.veiculos ?? [])
    .map((v) => {
      const marcaModelo = [v.marca, v.modelo].filter(Boolean).join(' ')
      return marcaModelo ? `${v.placa} (${marcaModelo})` : v.placa
    })
    .join(', ')
  const textoVigencia = apoliceRecente?.vigencia_fim ? formatarDataBR(apoliceRecente.vigencia_fim) : ''

  useEffect(() => {
    listarTemplates('lifleet').then((lista) => {
      setTemplates(lista)
      setCarregando(false)
    })
  }, [])

  function selecionarTemplate(t) {
    setTemplateSelecionado(t)
    setTextoEditavel(
      personalizarMensagem(t.corpo, {
        nomeContato: contatoPrimario?.nome,
        nomeEmpresa,
        nomeCorretor: perfil?.nome_completo,
        veiculo: textoVeiculo,
        vigencia: textoVigencia,
      })
    )
  }

  function handleAbrirWhatsApp() {
    if (!contatoPrimario?.celular) {
      alert('Este cliente não tem celular cadastrado no Contato Primário. Cadastre em Dados Cadastrais primeiro.')
      return
    }
    const link = montarLinkWhatsApp(contatoPrimario.celular, textoEditavel)
    window.open(link, '_blank')
    onFechar()
  }

  return (
    <div className="ls-modal-overlay" onClick={onFechar}>
      <div className="ls-modal" onClick={(e) => e.stopPropagation()}>
        <h3>Enviar mensagem por WhatsApp</h3>

        {!contatoPrimario?.celular && (
          <p className="ls-modal-erro">
            ⚠️ Sem celular cadastrado no Contato Primário — cadastre antes de enviar.
          </p>
        )}

        {carregando ? (
          <p>Carregando mensagens...</p>
        ) : templates.length === 0 ? (
          <p className="cliente-vazio-inline">
            Nenhuma mensagem padrão cadastrada ainda para o Lifleet. Cadastre em "Mensagens Padrão" no menu lateral.
          </p>
        ) : (
          <>
            <label>Escolha uma mensagem padrão</label>
            <div className="especialista-lista-clientes" style={{ marginBottom: '0.75rem' }}>
              {templates.map((t) => (
                <button
                  key={t.id}
                  className="especialista-cliente-item"
                  onClick={() => selecionarTemplate(t)}
                  style={templateSelecionado?.id === t.id ? { borderColor: 'var(--ls-accent)' } : {}}
                >
                  {t.titulo}
                </button>
              ))}
            </div>

            {templateSelecionado && (
              <>
                <label>Texto (pode editar antes de enviar)</label>
                <textarea
                  value={textoEditavel}
                  onChange={(e) => setTextoEditavel(e.target.value)}
                  rows={5}
                  style={{ width: '100%', padding: '0.5rem 0.65rem', border: '1px solid var(--ls-border)', borderRadius: 'var(--ls-radius-sm)', fontFamily: 'inherit' }}
                />
              </>
            )}
          </>
        )}

        <div className="ls-modal-acoes">
          <button className="ls-btn ls-btn-ghost" onClick={onFechar}>Cancelar</button>
          <button
            className="ls-btn ls-btn-primary"
            onClick={handleAbrirWhatsApp}
            disabled={!templateSelecionado}
          >
            Abrir WhatsApp
          </button>
        </div>
      </div>
    </div>
  )
}

function TransferirClienteLifleetModal({ clienteId, corretorAtualId, onFechar, onTransferido }) {
  const [corretores, setCorretores] = useState([])
  const [corretorDestinoId, setCorretorDestinoId] = useState('')
  const [transferindo, setTransferindo] = useState(false)
  const [erro, setErro] = useState(null)

  useEffect(() => {
    listarCorretores().then(setCorretores)
  }, [])

  async function handleTransferir() {
    if (!corretorDestinoId) {
      setErro('Escolha o corretor de destino.')
      return
    }
    setTransferindo(true)
    setErro(null)
    try {
      await atualizarClienteProspect(clienteId, { corretor_id: corretorDestinoId })
      onTransferido()
    } catch (err) {
      setErro(err.message)
    } finally {
      setTransferindo(false)
    }
  }

  return (
    <div className="ls-modal-overlay" onClick={onFechar}>
      <div className="ls-modal" onClick={(e) => e.stopPropagation()}>
        <h3>Transferir Cliente</h3>
        <p className="config-instrucao">
          Escolha pra qual corretor este cliente deve passar a ser atendido. O histórico
          (apólices, cotações, demandas) é mantido, só o dono do cadastro muda.
        </p>

        <label>Novo corretor responsável</label>
        <select value={corretorDestinoId} onChange={(e) => setCorretorDestinoId(e.target.value)}>
          <option value="">Selecione...</option>
          {corretores.filter((c) => c.id !== corretorAtualId).map((c) => (
            <option key={c.id} value={c.id}>{c.nome_completo}</option>
          ))}
        </select>

        {erro && <p className="ls-modal-erro">{erro}</p>}

        <div className="ls-modal-acoes">
          <button className="ls-btn ls-btn-ghost" onClick={onFechar}>Cancelar</button>
          <button className="ls-btn ls-btn-primary" onClick={handleTransferir} disabled={transferindo}>
            {transferindo ? 'Transferindo...' : 'Transferir'}
          </button>
        </div>
      </div>
    </div>
  )
}