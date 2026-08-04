import { useEffect, useState } from 'react'
import '../../styles/centers.css'
import '../../styles/lcds-tokens.css'
import InfoTooltip from '../../components/InfoTooltip'
import KpiCard from '../../components/KpiCard'
import { Link } from 'react-router-dom'
import { contarClientesPorModulo, contarDemandasAbertas, contarConsultasPorEspecialista, contarIndicadoresPorCorretor, obterSaudeFinanceira, obterSaudeOperacional } from '../../lib/crm/painelExecutivoService'
import { indicadoresOperacionais } from '../../lib/crm/comissoesService'
import { listarCorretores } from '../../lib/crm/apolicesService'
import { obterFilaOperacional, obterResumoFilaOperacional } from '../../lib/crm/operationalQueueService'
import { executarValidacaoIntegridade, obterResumoIntegridade } from '../../lib/crm/masterDataIntegrityService'
import { useAuth } from '../auth/AuthContext'
import { formatarDataBR } from '../../lib/utils/formatarData'

const MODULOS = [
  { id: 'saude', label: 'Lifcare', rota: '/' },
  { id: 'auto', label: 'Lifleet', rota: '/lifleet' },
  { id: 'lifsure', label: 'LifSure', rota: '/lifsure' },
  { id: 'lishield', label: 'LiShield', rota: '/lishield' },
  { id: 'lifplan', label: 'LifPlan', rota: '/lifplan' },
]

function formatarMoeda(valor) {
  return (Number(valor) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export default function PainelExecutivoPage() {
  const { perfil } = useAuth()
  const [clientesPorModulo, setClientesPorModulo] = useState(null)
  const [demandas, setDemandas] = useState(null)
  const [financeiro, setFinanceiro] = useState(null)
  const [consultasPorEspecialista, setConsultasPorEspecialista] = useState(null)
  const [indicadoresPorCorretor, setIndicadoresPorCorretor] = useState(null)
  const [saudeFinanceira, setSaudeFinanceira] = useState(null)
  const [saudeOperacional, setSaudeOperacional] = useState(null)
  const [corretores, setCorretores] = useState([])
  const [carregando, setCarregando] = useState(true)

  const [filaResumo, setFilaResumo] = useState(null)
  const [filaItens, setFilaItens] = useState([])
  const [somenteMeuTrabalho, setSomenteMeuTrabalho] = useState(true)
  const [filtroPrioridade, setFiltroPrioridade] = useState('')
  const [carregandoFila, setCarregandoFila] = useState(true)
  const [abaAtiva, setAbaAtiva] = useState('geral')

  useEffect(() => {
    carregar()
  }, [])

  useEffect(() => {
    carregarFila()
  }, [somenteMeuTrabalho])

  async function carregarFila() {
    setCarregandoFila(true)
    const corretorId = somenteMeuTrabalho ? perfil?.id : undefined
    const [resumo, itens] = await Promise.all([
      obterResumoFilaOperacional({ corretorId }),
      obterFilaOperacional({ corretorId }),
    ])
    setFilaResumo(resumo)
    setFilaItens(itens)
    setCarregandoFila(false)
  }

  async function carregar() {
    setCarregando(true)
    const [clientes, dem, fin, consultas, porCorretor, listaCorretores, saude, saudeOp] = await Promise.all([
      contarClientesPorModulo(),
      contarDemandasAbertas(),
      indicadoresOperacionais(),
      contarConsultasPorEspecialista(),
      contarIndicadoresPorCorretor(),
      listarCorretores(),
      obterSaudeFinanceira(),
      obterSaudeOperacional(),
    ])
    setClientesPorModulo(clientes)
    setDemandas(dem)
    setFinanceiro(fin)
    setConsultasPorEspecialista(consultas)
    setIndicadoresPorCorretor(porCorretor)
    setCorretores(listaCorretores)
    setSaudeFinanceira(saude)
    setSaudeOperacional(saudeOp)
    setCarregando(false)
  }

  if (carregando) return <p className="cliente-carregando">Carregando painel...</p>

  const nomesPorId = Object.fromEntries(corretores.map((c) => [c.id, c.nome_completo]))

  // Ranking simples: mais clientes ativos primeiro. Sem cálculo de
  // conversão/receita individual — depende de dado financeiro por
  // corretor que ainda não existe modelado.
  const rankingCorretores = Object.entries(indicadoresPorCorretor)
    .map(([corretorId, dados]) => ({ corretorId, nome: nomesPorId[corretorId] ?? 'Corretor', ...dados }))
    .sort((a, b) => b.clientesAtivos - a.clientesAtivos)

  return (
    <div className="config-page" data-theme="lcds">
      <h2>
        Painel Executivo
        <InfoTooltip
          titulo="Painel Executivo"
          texto="Visão consolidada dos 5 módulos — clientes por etapa, demandas em aberto e indicadores financeiros, tudo em um lugar só."
        />
      </h2>

      <div className="cliente-abas" style={{ marginBottom: '1rem' }}>
        <button className={`cliente-aba ${abaAtiva === 'geral' ? 'cliente-aba-ativa' : ''}`} onClick={() => setAbaAtiva('geral')}>Visão Geral</button>
        <button className={`cliente-aba ${abaAtiva === 'integridade' ? 'cliente-aba-ativa' : ''}`} onClick={() => setAbaAtiva('integridade')}>🛡️ Integridade dos Dados</button>
      </div>

      {abaAtiva === 'integridade' && <IntegridadeDadosTab />}

      {abaAtiva === 'geral' && (
      <>
      <h3 className="secao-titulo">
        Fila Operacional
        <InfoTooltip
          titulo="Fila Operacional"
          texto="Consolida pendências reais do Finance, Growth e Lifleet numa única lista, ordenada por prioridade. Não cria nem altera nada — cada item leva direto pra tela de origem, onde a ação de verdade acontece."
        />
      </h3>

      <div className="filtros-linha" style={{ marginBottom: '0.75rem' }}>
        <button className="ls-btn ls-btn-ghost" onClick={() => setSomenteMeuTrabalho((v) => !v)}>
          {somenteMeuTrabalho ? '👤 Meu trabalho' : '👥 Toda a equipe'}
        </button>
        <div>
          <label>Prioridade</label>
          <select value={filtroPrioridade} onChange={(e) => setFiltroPrioridade(e.target.value)}>
            <option value="">Todas</option>
            <option value="critica">Crítica</option>
            <option value="alta">Alta</option>
            <option value="media">Média</option>
            <option value="baixa">Baixa</option>
          </select>
        </div>
      </div>

      {carregandoFila ? (
        <p className="cliente-carregando">Carregando fila...</p>
      ) : (
        <>
          <div className="kpi-grid">
            <KpiCard label="Total de pendências" valor={filaResumo.total} />
            <KpiCard
              label="Críticas"
              valor={filaResumo.criticas}
              trendTexto={filaResumo.criticas > 0 ? 'requer atenção imediata' : 'nenhuma crítica agora'}
              trendTipo={filaResumo.criticas > 0 ? 'negativo' : 'positivo'}
              destacado={filaResumo.criticas > 0}
            />
            <KpiCard label="Alta prioridade" valor={filaResumo.altas} />
            <KpiCard
              label="Tempo médio em fila"
              valor={filaResumo.tempoMedioDias !== null ? filaResumo.tempoMedioDias : '—'}
              unidade={filaResumo.tempoMedioDias !== null ? 'dias (experimental)' : undefined}
            />
          </div>

          {filaItens.length === 0 ? (
            <p className="cliente-vazio">Nenhuma pendência encontrada — fila zerada.</p>
          ) : (
            <div className="ls-card" style={{ padding: 0, marginTop: '0.75rem' }}>
              <table className="cliente-tabela">
                <thead>
                  <tr><th>Prioridade</th><th>Tipo</th><th>Módulo</th><th>Cliente/Seguradora</th><th>Detalhe</th><th></th></tr>
                </thead>
                <tbody>
                  {filaItens
                    .filter((i) => !filtroPrioridade || i.prioridade === filtroPrioridade)
                    .slice(0, 30)
                    .map((i, idx) => (
                      <tr key={idx}>
                        <td>
                          <span className={
                            i.prioridade === 'critica' ? 'lcds-badge-critico' :
                            i.prioridade === 'alta' ? 'lcds-badge-alerta' :
                            'ls-badge'
                          } style={{ textTransform: 'capitalize' }}>
                            {i.prioridade}
                          </span>
                        </td>
                        <td>{i.tipo}</td>
                        <td>{i.modulo}</td>
                        <td>{i.clienteNome}</td>
                        <td className="kpi-detalhe" style={{ margin: 0 }}>{i.descricao}</td>
                        <td><Link to={i.rota} className="cliente-tabela-btn">Ver</Link></td>
                      </tr>
                    ))}
                </tbody>
              </table>
              {filaItens.length > 30 && (
                <p className="config-instrucao">Mostrando 30 de {filaItens.length} pendências — refine o filtro de prioridade para ver mais.</p>
              )}
            </div>
          )}
        </>
      )}

      <h3 className="secao-titulo">Clientes por módulo</h3>
      <div className="kpi-grid">
        {MODULOS.map((m) => {
          const c = clientesPorModulo[m.id]
          const totalAtivo = c.prospect + c.em_negociacao + c.cliente
          return (
            <KpiCard
              key={m.id}
              to={m.rota}
              label={m.label}
              valor={totalAtivo}
              trendTexto={`${c.prospect} prospect · ${c.em_negociacao} negociação · ${c.cliente} ativos`}
              trendTipo="neutro"
              rodapeLabel="Demandas"
              rodapeValor={`${demandas.porModulo[m.id]} em aberto`}
            />
          )
        })}
      </div>

      <h3 className="secao-titulo">Demandas em aberto (total)</h3>
      <div className="kpi-grid" style={{ maxWidth: '220px' }}>
        <KpiCard label="Demandas em aberto" valor={demandas.total} />
      </div>

      <h3 className="secao-titulo">Consultas por especialista (histórico total)</h3>
      <div className="kpi-grid">
        {MODULOS.map((m) => (
          <KpiCard key={m.id} label={m.label} valor={consultasPorEspecialista[m.id]} />
        ))}
      </div>

      <h3 className="secao-titulo">Ranking por corretor</h3>
      <div className="ls-card" style={{ padding: 0 }}>
        <table className="cliente-tabela">
          <thead>
            <tr>
              <th>Corretor</th><th>Prospect</th><th>Negociação</th><th>Ativos</th><th>Demandas abertas</th><th>Demandas resolvidas</th>
            </tr>
          </thead>
          <tbody>
            {rankingCorretores.map((c) => (
              <tr key={c.corretorId}>
                <td>{c.nome}</td>
                <td>{c.clientesProspect}</td>
                <td>{c.clientesNegociacao}</td>
                <td>{c.clientesAtivos}</td>
                <td>{c.demandasAbertas}</td>
                <td>{c.demandasResolvidas}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h3 className="secao-titulo">Saúde Operacional</h3>
      <div className="kpi-grid">
        <KpiCard to="/claims" label="Casos Abertos" valor={saudeOperacional.totalAbertos} />
        <KpiCard
          to="/claims"
          label="Casos Críticos"
          valor={saudeOperacional.totalCriticos}
          trendTexto="abertos há 15+ dias"
          trendTipo="atencao"
          destacado
        />
        <KpiCard
          label="Tempo Médio de Resolução"
          valor={saudeOperacional.tempoMedioResolucaoDias ?? '—'}
          unidade={saudeOperacional.tempoMedioResolucaoDias !== null ? 'dias' : undefined}
        />
        <KpiCard label="Total de Casos" valor={saudeOperacional.totalCasos} />
      </div>

      <h3 className="secao-titulo">Saúde Financeira</h3>
      <div className="kpi-grid">
        <KpiCard
          to="/financeiro?aba=contasareceber"
          label="Total a Receber"
          valor={formatarMoeda(saudeFinanceira.totalAReceber)}
        />
        <KpiCard
          to="/financeiro?aba=contasareceber"
          label="Total em Atraso"
          valor={formatarMoeda(saudeFinanceira.totalEmAtraso)}
          trendTexto={`${saudeFinanceira.percentualEmAtraso.toFixed(1)}% do total a receber`}
          trendTipo="negativo"
          destacado
        />
        <KpiCard
          to="/financeiro?aba=contasareceber"
          label="Faixa Crítica (90+ dias)"
          valor={formatarMoeda(saudeFinanceira.totalFaixaCritica90)}
          trendTexto={`${saudeFinanceira.quantidadeFaixaCritica90} lançamento(s)`}
          trendTipo="negativo"
          destacado
        />
        <KpiCard
          to="/financeiro?aba=repasses"
          label="Repasses Pendentes"
          valor={formatarMoeda(saudeFinanceira.totalRepassesPendentes)}
        />
        <KpiCard
          to="/financeiro?aba=conciliacao"
          label="Conciliado"
          valor={formatarMoeda(saudeFinanceira.totalConciliado)}
          trendTexto={`${saudeFinanceira.percentualConciliado.toFixed(1)}% conciliado`}
          trendTipo="positivo"
        />
        <KpiCard
          to="/financeiro?aba=pendencias"
          label="Volume Aguardando Ação"
          valor={formatarMoeda(saudeFinanceira.volumeAguardandoAcao)}
        />
      </div>

      <h3 className="secao-titulo">Financeiro (Comissões)</h3>
      <div className="kpi-grid">
        <KpiCard label="Previsto" valor={formatarMoeda(financeiro.totalPrevisto)} />
        <KpiCard label="Recebido" valor={formatarMoeda(financeiro.totalRecebido)} />
        <KpiCard label="Pendente" valor={formatarMoeda(financeiro.totalPendente)} />
        <KpiCard label="Repassado" valor={formatarMoeda(financeiro.totalRepassado)} />
      </div>
      <Link to="/financeiro" className="ls-btn ls-btn-ghost" style={{ marginTop: '0.75rem', display: 'inline-block' }}>
        Ver detalhes no Financeiro →
      </Link>
      </>
      )}
    </div>
  )
}

/**
 * Aba "Integridade dos Dados" (Sprint 004 — Master Data Integrity
 * Engine v1). Só lê e classifica — nunca corrige nada aqui. Cada linha
 * leva direto pro módulo de origem, onde a correção de verdade
 * acontece (diretriz "domínio é dono dos seus próprios dados").
 */
const SEVERIDADE_LABEL = {
  critica: { texto: '🔴 Crítica', badge: 'lcds-badge-critico' },
  alta: { texto: '🟠 Alta', badge: 'lcds-badge-alerta' },
  media: { texto: '🟡 Média', badge: 'lcds-badge-alerta' },
  baixa: { texto: '🔵 Baixa', badge: 'ls-badge' },
}

function IntegridadeDadosTab() {
  const [resumo, setResumo] = useState(null)
  const [inconsistencias, setInconsistencias] = useState([])
  const [filtroSeveridade, setFiltroSeveridade] = useState('')
  const [carregando, setCarregando] = useState(true)

  useEffect(() => {
    carregar()
  }, [])

  async function carregar() {
    setCarregando(true)
    const [r, itens] = await Promise.all([obterResumoIntegridade(), executarValidacaoIntegridade()])
    setResumo(r)
    setInconsistencias(itens)
    setCarregando(false)
  }

  if (carregando) return <p className="cliente-carregando">Analisando integridade da plataforma...</p>

  const filtradas = filtroSeveridade ? inconsistencias.filter((i) => i.severidade === filtroSeveridade) : inconsistencias

  return (
    <div>
      <p className="config-instrucao">
        Detecta referências quebradas e inconsistências entre módulos — nunca corrige nada automaticamente.
        A correção continua sendo responsabilidade de cada módulo de origem.
      </p>

      <div className="kpi-grid">
        <KpiCard label="Total de inconsistências" valor={resumo.total} />
        <KpiCard
          label="Críticas"
          valor={resumo.criticas}
          trendTexto={resumo.criticas > 0 ? 'requer atenção imediata' : 'nenhuma agora'}
          trendTipo={resumo.criticas > 0 ? 'negativo' : 'positivo'}
          destacado={resumo.criticas > 0}
        />
        <KpiCard label="Altas" valor={resumo.altas} />
        <KpiCard label="Médias" valor={resumo.medias} />
        <KpiCard label="Baixas" valor={resumo.baixas} />
      </div>

      <div className="filtros-linha" style={{ marginTop: '1rem', marginBottom: '0.75rem' }}>
        <div>
          <label>Severidade</label>
          <select value={filtroSeveridade} onChange={(e) => setFiltroSeveridade(e.target.value)}>
            <option value="">Todas</option>
            <option value="critica">Crítica</option>
            <option value="alta">Alta</option>
            <option value="media">Média</option>
            <option value="baixa">Baixa</option>
          </select>
        </div>
      </div>

      {filtradas.length === 0 ? (
        <p className="cliente-vazio">Nenhuma inconsistência encontrada — plataforma consistente.</p>
      ) : (
        <div className="ls-card" style={{ padding: 0 }}>
          <table className="cliente-tabela">
            <thead>
              <tr><th>Código</th><th>Severidade</th><th>Categoria</th><th>Módulo</th><th>Descrição</th><th></th></tr>
            </thead>
            <tbody>
              {filtradas.slice(0, 50).map((i, idx) => (
                <tr key={idx}>
                  <td className="ls-mono">{i.codigo}</td>
                  <td><span className={SEVERIDADE_LABEL[i.severidade].badge}>{SEVERIDADE_LABEL[i.severidade].texto}</span></td>
                  <td>{i.categoria}</td>
                  <td>{i.modulo}</td>
                  <td className="kpi-detalhe" style={{ margin: 0 }}>{i.descricao}</td>
                  <td>{i.rota && <Link to={i.rota} className="cliente-tabela-btn">Abrir Registro</Link>}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtradas.length > 50 && (
            <p className="config-instrucao">Mostrando 50 de {filtradas.length} — refine o filtro de severidade para ver mais.</p>
          )}
        </div>
      )}
    </div>
  )
}