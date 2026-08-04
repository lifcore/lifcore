import { useEffect, useState } from 'react'
import '../../styles/lcds-tokens.css'
import { useAuth } from '../auth/AuthContext'
import ApoliceForm from '../crm/ApoliceForm'
import {
  PRODUTOS_APOLICE,
  listarApolices,
  listarCorretores,
  listarCatalogoSeguradoras,
  agruparPorCorretorEProduto,
  excluirApolice,
} from '../../lib/crm/apolicesService'

export default function ApolicesPage() {
  const { perfil } = useAuth()
  const ehMaster = perfil?.papel === 'master' || perfil?.papel === 'administrador'

  const [mostrarForm, setMostrarForm] = useState(false)
  const [apolices, setApolices] = useState([])
  const [corretores, setCorretores] = useState([])
  const [seguradoras, setSeguradoras] = useState([])
  const [filtroCorretor, setFiltroCorretor] = useState('')
  const [filtroProduto, setFiltroProduto] = useState('')
  const [filtroMes, setFiltroMes] = useState('')
  const [carregando, setCarregando] = useState(true)

  useEffect(() => {
    carregar()
    if (ehMaster) {
      listarCorretores().then(setCorretores)
    }
    listarCatalogoSeguradoras().then(setSeguradoras)
  }, [filtroCorretor, filtroProduto, filtroMes])

  async function carregar() {
    setCarregando(true)
    const lista = await listarApolices({
      corretorId: filtroCorretor || undefined,
      produto: filtroProduto || undefined,
      mesReferencia: filtroMes || undefined,
    })
    setApolices(lista)
    setCarregando(false)
  }

  async function handleExcluir(id) {
    if (!window.confirm('Excluir esta apólice?')) return
    await excluirApolice(id)
    carregar()
  }

  const gruposFechamento = ehMaster ? agruparPorCorretorEProduto(apolices, corretores) : []
  const totalGeral = gruposFechamento.reduce((s, g) => s + g.totalPremio, 0)

  return (
    <div className="config-page" data-theme="lcds" style={{ maxWidth: 960 }}>
      <div className="pipeline-header">
        <div>
          <h2>Apólices — Administração</h2>
          <p className="pipeline-subtitulo">
            Lançamento de apólices (Auto, Frota, RC, Residencial, Vida) para acompanhamento e fechamento de comissão.
          </p>
        </div>
        {!mostrarForm && (
          <button className="ls-btn ls-btn-accent" onClick={() => setMostrarForm(true)}>
            + Nova Apólice
          </button>
        )}
      </div>

      {mostrarForm && (
        <div className="ls-card" style={{ padding: '1.25rem', marginBottom: '1.25rem' }}>
          <ApoliceForm
            onSalvo={() => {
              setMostrarForm(false)
              carregar()
            }}
            onCancelar={() => setMostrarForm(false)}
          />
        </div>
      )}

      <div className="mensagens-modulos" style={{ marginBottom: '1rem', border: 'none', gap: '0.6rem' }}>
        {ehMaster && (
          <select value={filtroCorretor} onChange={(e) => setFiltroCorretor(e.target.value)} className="demanda-select-status">
            <option value="">Todos os corretores</option>
            {corretores.map((c) => (
              <option key={c.id} value={c.id}>{c.nome_completo}</option>
            ))}
          </select>
        )}
        <select value={filtroProduto} onChange={(e) => setFiltroProduto(e.target.value)} className="demanda-select-status">
          <option value="">Todos os produtos</option>
          {PRODUTOS_APOLICE.map((p) => (
            <option key={p} value={p}>{p}</option>
          ))}
        </select>
        <input type="month" value={filtroMes} onChange={(e) => setFiltroMes(e.target.value)} className="demanda-select-status" />
      </div>

      {ehMaster && gruposFechamento.length > 0 && (
        <div className="ls-card" style={{ padding: '1rem', marginBottom: '1.25rem', background: 'var(--ls-accent-soft)' }}>
          <h4 style={{ marginTop: 0 }}>Fechamento — Faturamento Bruto por Corretor e Produto</h4>
          <table className="cliente-tabela">
            <thead>
              <tr><th>Corretor</th><th>Produto</th><th>Qtd. Apólices</th><th>Prêmio Total</th></tr>
            </thead>
            <tbody>
              {gruposFechamento.map((g, i) => (
                <tr key={i}>
                  <td>{g.corretorNome}</td>
                  <td>{g.produto}</td>
                  <td>{g.quantidade}</td>
                  <td>R$ {g.totalPremio.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p style={{ textAlign: 'right', fontWeight: 700, marginTop: '0.5rem' }}>
            Total geral: R$ {totalGeral.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
          </p>
          <p className="config-instrucao">
            Este é o bruto de referência para o fechamento manual — o percentual de comissão de cada corretor
            ainda é lançado à parte, conforme o relatório real da seguradora naquele mês.
          </p>
        </div>
      )}

      {carregando ? (
        <p className="pipeline-carregando">Carregando...</p>
      ) : apolices.length === 0 ? (
        <p className="cliente-vazio">Nenhuma apólice lançada ainda.</p>
      ) : (
        <div className="ls-card" style={{ padding: 0 }}>
          <table className="cliente-tabela">
            <thead>
              <tr><th>Cliente</th><th>Produto</th><th>Seguradora</th><th>Prêmio</th><th>Vezes</th><th>Vigência</th>{ehMaster && <th></th>}</tr>
            </thead>
            <tbody>
              {apolices.map((ap) => (
                <tr key={ap.id}>
                  <td>{ap.nome_cliente}</td>
                  <td>{ap.produto}</td>
                  <td>{ap.operadora_nome_livre}</td>
                  <td>R$ {Number(ap.premio).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                  <td>{ap.forma_pagamento_vezes}x</td>
                  <td>{ap.vigencia_fim ? new Date(ap.vigencia_fim).toLocaleDateString('pt-BR') : '—'}</td>
                  {ehMaster && (
                    <td>
                      <button className="cliente-tabela-btn cliente-tabela-btn-perigo" onClick={() => handleExcluir(ap.id)}>Excluir</button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}