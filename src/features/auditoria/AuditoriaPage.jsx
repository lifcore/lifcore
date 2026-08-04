import { useEffect, useState } from 'react'
import '../../styles/lcds-tokens.css'
import { listarAuditoria } from '../../lib/governanca/governancaService'

const ACOES = [
  { id: 'exclusao', label: 'Exclusão' },
  { id: 'edicao_critica', label: 'Edição crítica' },
  { id: 'recuperacao', label: 'Recuperação' },
  { id: 'saneamento', label: 'Saneamento' },
  { id: 'reorganizacao', label: 'Reorganização' },
]

export default function AuditoriaPage() {
  const [registros, setRegistros] = useState([])
  const [filtroTabela, setFiltroTabela] = useState('')
  const [filtroAcao, setFiltroAcao] = useState('')
  const [carregando, setCarregando] = useState(true)

  useEffect(() => {
    carregar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtroTabela, filtroAcao])

  async function carregar() {
    setCarregando(true)
    const filtros = {}
    if (filtroTabela) filtros.tabelaAfetada = filtroTabela
    if (filtroAcao) filtros.acao = filtroAcao
    const lista = await listarAuditoria(filtros)
    setRegistros(lista)
    setCarregando(false)
  }

  return (
    <div className="config-page" data-theme="lcds">
      <h2>Auditoria</h2>
      <p className="config-instrucao">
        Histórico de operações administrativas críticas (exclusão definitiva, saneamento,
        recuperação, reorganização) executadas via Governança Master, nos últimos 50 registros.
      </p>

      <div className="cotacao-form-linha" style={{ marginBottom: '1rem' }}>
        <div>
          <label>Tabela afetada</label>
          <input
            value={filtroTabela}
            onChange={(e) => setFiltroTabela(e.target.value)}
            placeholder="Ex: operacional.comissoes"
          />
        </div>
        <div>
          <label>Ação</label>
          <select value={filtroAcao} onChange={(e) => setFiltroAcao(e.target.value)}>
            <option value="">Todas</option>
            {ACOES.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
          </select>
        </div>
      </div>

      {carregando ? (
        <p className="cliente-carregando">Carregando...</p>
      ) : registros.length === 0 ? (
        <p className="cliente-vazio">Nenhum registro de auditoria encontrado.</p>
      ) : (
        <table className="cliente-tabela">
          <thead>
            <tr>
              <th>Data</th><th>Ação</th><th>Tabela</th><th>Registro</th><th>Motivo</th><th>Papel</th>
            </tr>
          </thead>
          <tbody>
            {registros.map((r) => (
              <tr key={r.id}>
                <td>{new Date(r.created_at).toLocaleString('pt-BR')}</td>
                <td><span className="ls-badge">{r.acao}</span></td>
                <td className="ls-mono">{r.tabela_afetada}</td>
                <td className="ls-mono">{r.registro_id}</td>
                <td>{r.motivo}</td>
                <td>{r.usuario_papel ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}