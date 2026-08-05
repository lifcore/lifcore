import { useEffect, useState } from 'react'
import './customer360.css'
import { obterTimelineCliente } from '../../lib/crm/timelineService'

const ICONE_ORIGEM = { cadastro: '🆕', comercial: '📄', claims: '🗂️' }

/**
 * Customer Timeline Widget (Sprint 008, Bloco A). Busca via
 * timelineService (consolida eventos_comerciais + eventos de Claims +
 * data de criação do lead), nunca decide sozinho o que é evento.
 */
export default function CustomerTimelineWidget({ clienteCriadoEm, cotacaoIds, casoIds }) {
  const [linha, setLinha] = useState(null)

  useEffect(() => {
    obterTimelineCliente({ clienteCriadoEm, cotacaoIds, casoIds }).then(setLinha)
  }, [clienteCriadoEm, JSON.stringify(cotacaoIds), JSON.stringify(casoIds)])

  if (!linha) return <p className="cliente-carregando">Carregando timeline...</p>
  if (linha.length === 0) return <p className="cliente-vazio">Nenhum evento registrado ainda.</p>

  return (
    <div className="c360-timeline">
      {linha.map((item, i) => (
        <div key={i} className="c360-timeline-item">
          <div className="c360-timeline-marcador">{ICONE_ORIGEM[item.origem] ?? '•'}</div>
          <div className="c360-timeline-conteudo">
            <div className="c360-timeline-data">{new Date(item.data).toLocaleDateString('pt-BR')}</div>
            <div className="c360-timeline-titulo">{item.titulo}</div>
            {item.descricao && <div className="c360-timeline-descricao">{item.descricao}</div>}
          </div>
        </div>
      ))}
    </div>
  )
}