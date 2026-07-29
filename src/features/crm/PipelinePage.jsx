import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  listarClientesProspects,
  atualizarStatusClienteProspect,
  listarVigenciasProximas,
} from '../../lib/crm/clientesService'
import NovoClienteModal from './NovoClienteModal'
import { formatarDataBR, dataLocalISO } from '../../lib/utils/formatarData'

const COLUNAS = [
  { status: 'prospect', titulo: 'Novo Prospect' },
  { status: 'em_negociacao', titulo: 'Em Negociação' },
  { status: 'cliente', titulo: 'Cliente Ativo' },
]

const TRADUZIR_SITUACAO = {
  aberto: 'Aberta',
  em_andamento: 'Em andamento',
  aguardando_operadora: 'Aguard. operadora',
  aguardando_cliente: 'Aguard. cliente',
  resolvido: 'Resolvida',
}

export default function PipelinePage() {
  const [itens, setItens] = useState([])
  const [vigencias, setVigencias] = useState([])
  const [carregando, setCarregando] = useState(true)
  const [modalAberto, setModalAberto] = useState(false)
  const [mostrarFuturas, setMostrarFuturas] = useState(false)
  const [busca, setBusca] = useState('')
  const navigate = useNavigate()

  useEffect(() => {
    carregar()
  }, [mostrarFuturas, busca])

  async function carregar() {
    setCarregando(true)
    const [lista, vigenciasProximas] = await Promise.all([
      listarClientesProspects({ mostrarFuturas: mostrarFuturas || busca.trim().length > 0 }),
      listarVigenciasProximas(90),
    ])
    setItens(lista)
    setVigencias(vigenciasProximas)
    setCarregando(false)
  }

  function itensDaColuna(status) {
    const filtrados = busca.trim()
      ? itens.filter(
          (i) =>
            i.razao_social?.toLowerCase().includes(busca.toLowerCase()) ||
            i.cnpj?.toLowerCase().includes(busca.toLowerCase())
        )
      : itens
    return filtrados.filter((i) => i.status === status)
  }

  async function handleDrop(e, novoStatus) {
    e.preventDefault()
    const id = e.dataTransfer.getData('text/plain')
    await atualizarStatusClienteProspect(id, novoStatus)
    carregar()
  }

  const hoje = dataLocalISO()

  return (
    <div className="pipeline-page">
      <div className="pipeline-header">
        <div>
          <h2>Pipeline — Saúde</h2>
          <p className="pipeline-subtitulo">
            {mostrarFuturas
              ? 'Mostrando todos os clientes e prospects, com ações futuras.'
              : 'Mostrando ações dos próximos 15 dias (atrasadas sempre aparecem).'}
          </p>
        </div>
        <div className="pipeline-header-acoes">
          <input
            type="text"
            className="pipeline-busca"
            placeholder="🔍 Buscar por nome ou CNPJ..."
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
          />
          <button className="ls-btn ls-btn-ghost" onClick={() => setMostrarFuturas((v) => !v)}>
            {mostrarFuturas ? '↩ Só ações de hoje' : '→ Ver ações futuras'}
          </button>
          <button className="ls-btn ls-btn-accent" onClick={() => setModalAberto(true)}>
            + Novo Prospect
          </button>
        </div>
      </div>

      {vigencias.length > 0 && (
        <div className="pipeline-alertas">
          <strong>⏰ Vigências próximas (90 dias):</strong>
          <div className="pipeline-alertas-lista">
            {vigencias.map((v) => (
              <span
                key={v.id}
                className="pipeline-alerta-item"
                onClick={() => navigate(`/clientes/${v.id}`)}
              >
                {v.razao_social} — {formatarDataBR(v.data_vigencia)}
              </span>
            ))}
          </div>
        </div>
      )}

      {carregando ? (
        <p className="pipeline-carregando">Carregando pipeline...</p>
      ) : (
        <div className="pipeline-colunas">
          {COLUNAS.map((coluna) => (
            <div
              key={coluna.status}
              className="pipeline-coluna"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => handleDrop(e, coluna.status)}
            >
              <div className="pipeline-coluna-titulo">
                {coluna.titulo}
                <span className="pipeline-coluna-contador">{itensDaColuna(coluna.status).length}</span>
              </div>

              <div className="pipeline-coluna-cards">
                {itensDaColuna(coluna.status).map((item) => {
                  const contatoPrincipal = item.contatos?.find((c) => c.tipo === 'primario')
                  const atrasada = item.proxima_acao_data && item.proxima_acao_data < hoje
                  return (
                    <div
                      key={item.id}
                      className={`pipeline-card ${atrasada ? 'pipeline-card-atrasada' : ''}`}
                      draggable
                      onDragStart={(e) => e.dataTransfer.setData('text/plain', item.id)}
                      onClick={() => navigate(`/clientes/${item.id}`)}
                    >
                      <div className="pipeline-card-topo">
                        <span className={`pipeline-card-data ${atrasada ? 'pipeline-card-data-atrasada' : ''}`}>
                          {item.proxima_acao_data
                            ? formatarDataBR(item.proxima_acao_data)
                            : 'Sem data definida'}
                        </span>
                        <span className={`pipeline-card-status-badge ${atrasada ? 'pipeline-card-status-atrasado' : 'pipeline-card-status-ok'}`}>
                          {TRADUZIR_SITUACAO[item.situacaoDemandaAtual] ?? (atrasada ? 'Atrasada' : item.proxima_acao_data ? 'No prazo' : '—')}
                        </span>
                      </div>
                      <div className="pipeline-card-nome">{item.razao_social}</div>
                      {contatoPrincipal?.nome && (
                        <div className="pipeline-card-contato">👤 {contatoPrincipal.nome}</div>
                      )}
                    </div>
                  )
                })}
                {itensDaColuna(coluna.status).length === 0 && (
                  <div className="pipeline-coluna-vazia">Nenhum item aqui ainda.</div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {modalAberto && (
        <NovoClienteModal
          onFechar={() => setModalAberto(false)}
          onCriado={() => {
            setModalAberto(false)
            carregar()
          }}
        />
      )}
    </div>
  )
}
