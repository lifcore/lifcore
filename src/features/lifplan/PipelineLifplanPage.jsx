import { useEffect, useState } from 'react'
import '../../styles/lcds-tokens.css'
import { useNavigate } from 'react-router-dom'
import {
  listarClientesProspects,
  atualizarStatusClienteProspect,
  listarVigenciasProximas,
} from '../../lib/crm/clientesService'
import { listarCorretores } from '../../lib/crm/apolicesService'
import { formatarDataBR, dataLocalISO } from '../../lib/utils/formatarData'
import NovoClienteLifplanModal from './NovoClienteLifplanModal'
import { useAuth } from '../auth/AuthContext'
import SeletorCarteira from '../../components/SeletorCarteira'

const COLUNAS = [
  { status: 'prospect', titulo: 'Novo Prospect' },
  { status: 'em_negociacao', titulo: 'Em Negociação' },
  { status: 'cliente', titulo: 'Cliente Ativo' },
]

const TRADUZIR_SITUACAO = {
  aberto: 'Aberta',
  em_andamento: 'Em andamento',
  aguardando_operadora: 'Aguard. instituição',
  aguardando_cliente: 'Aguard. cliente',
  resolvido: 'Resolvida',
}

export default function PipelineLifplanPage() {
  const { perfil } = useAuth()
  const ehMaster = perfil?.papel === 'master'
  const [itens, setItens] = useState([])
  const [vigencias, setVigencias] = useState([])
  const [carregando, setCarregando] = useState(true)
  const [modalAberto, setModalAberto] = useState(false)
  const [mostrarFuturas, setMostrarFuturas] = useState(false)
  const [busca, setBusca] = useState('')
  const [corretores, setCorretores] = useState([])
  const [corretorVisualizado, setCorretorVisualizado] = useState(perfil?.id ?? null)
  const navigate = useNavigate()

  useEffect(() => {
    if (ehMaster) listarCorretores().then(setCorretores).catch(() => {})
  }, [ehMaster])

  useEffect(() => {
    carregar()
  }, [mostrarFuturas, busca, corretorVisualizado])

  async function carregar() {
    setCarregando(true)
    const [lista, vigenciasProximas] = await Promise.all([
      listarClientesProspects({ mostrarFuturas: mostrarFuturas || busca.trim().length > 0, modulo: 'lifplan', corretorId: corretorVisualizado }),
      listarVigenciasProximas(90, 'lifplan', corretorVisualizado),
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
            i.cnpj?.toLowerCase().includes(busca.toLowerCase()) ||
            i.cpf?.toLowerCase().includes(busca.toLowerCase())
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
    <div className="pipeline-page" data-theme="lcds">
      <div className="pipeline-header">
        <h2>Lifplan — Planejamento Patrimonial</h2>
        <div className="pipeline-header-acoes">
          {ehMaster && (
            <SeletorCarteira
              valorSelecionado={corretorVisualizado ?? perfil.id}
              aoSelecionar={setCorretorVisualizado}
              opcoes={[
                { id: perfil.id, rotulo: 'Meus clientes', icone: '👤' },
                ...corretores
                  .filter((c) => c.id !== perfil.id)
                  .map((c, i) => ({ id: c.id, rotulo: `Carteira de: ${c.nome_completo}`, icone: '🗂️', separadorAntes: i === 0 })),
              ]}
            />
          )}
          <input
            type="text"
            className="pipeline-busca"
            placeholder="🔍 Buscar por nome, CNPJ ou CPF..."
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
                      onClick={() => navigate(`/lifplan/clientes/${item.id}`)}
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

          <div className="pipeline-coluna pipeline-coluna-vigencias">
            <div className="pipeline-coluna-titulo">
              ⏰ Vigências Próximas
              <span className="pipeline-coluna-contador">{vigencias.length}</span>
            </div>
            <div className="pipeline-coluna-cards">
              {vigencias.map((v) => (
                <div
                  key={v.id}
                  className="pipeline-card"
                  onClick={() => navigate(`/lifplan/clientes/${v.id}`)}
                >
                  <div className="pipeline-card-topo">
                    <span className="pipeline-card-data">{formatarDataBR(v.data_vigencia)}</span>
                  </div>
                  <div className="pipeline-card-nome">{v.razao_social}</div>
                </div>
              ))}
              {vigencias.length === 0 && (
                <div className="pipeline-coluna-vazia">Nenhuma data relevante nos próximos 90 dias.</div>
              )}
            </div>
          </div>
        </div>
      )}

      {modalAberto && (
        <NovoClienteLifplanModal
          corretorAlvoId={corretorVisualizado}
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