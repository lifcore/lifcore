import { useEffect, useState } from 'react'
import InfoTooltip from '../../components/InfoTooltip'
import {
  listarCatalogoSeguradoras,
  criarSeguradora,
  atualizarDadosSeguradora,
} from '../../lib/crm/apolicesService'
import {
  listarGestoresPorOperadora,
  upsertGestorModulo,
  excluirGestorModulo,
} from '../../lib/crm/seguradorasService'
import {
  MODULOS_PRODUTO,
  TIPOS_PARCEIRO,
  TIPOS_CANAL,
  listarProdutos,
  criarProduto,
  listarProdutosDaOperadora,
  habilitarProdutoNaOperadora,
  desabilitarProdutoNaOperadora,
  listarCanaisDaOperadora,
  adicionarCanalOperadora,
  removerCanalOperadora,
  atualizarCamposInstitucionais,
} from '../../lib/crm/catalogoInstitucionalService'
import BotaoOperacaoCritica from '../../components/BotaoOperacaoCritica'
import PainelImportacaoMercado from './PainelImportacaoMercado'
import { useAuth } from '../auth/AuthContext'

const MODULOS_GESTOR = [
  { id: 'saude', label: 'Lifcare (Saúde)' },
  { id: 'auto', label: 'Lifleet (Auto)' },
  { id: 'lifsure', label: 'LifSure' },
  { id: 'lishield', label: 'LiShield' },
  { id: 'lifplan', label: 'LifPlan' },
]

const MODULO_LABEL = Object.fromEntries(MODULOS_GESTOR.map((m) => [m.id, m.label]))

const TIPO_PARCEIRO_LABEL = {
  seguradora: 'Seguradora',
  operadora_saude: 'Operadora de Saúde',
  operadora_odonto: 'Operadora Odontológica',
  administradora: 'Administradora',
}
const MODELO_FINANCEIRO_LABEL = { recorrente: 'Receita recorrente', unica: 'Receita única' }
const COMPETENCIA_LABEL = { mensal: 'Mensal', unica: 'Única', renovacao: 'Renovação' }
const SITUACAO_INTEGRACAO_LABEL = { disponivel: 'Integração disponível', em_estudo: 'Em estudo', manual: 'Manual' }
const TIPO_CANAL_LABEL = {
  arquivo_producao: 'Arquivo de produção',
  arquivo_comissao: 'Arquivo de comissão',
  portal: 'Portal',
  swagger: 'Swagger',
  sandbox: 'Sandbox',
  api_oficial: 'API Oficial',
  xml: 'XML',
  csv: 'CSV',
}

export default function SeguradorasCard() {
  const [seguradoras, setSeguradoras] = useState([])
  const [carregando, setCarregando] = useState(true)
  const [mostrarForm, setMostrarForm] = useState(false)
  const [mostrarCatalogo, setMostrarCatalogo] = useState(false)

  useEffect(() => {
    carregar()
  }, [])

  async function carregar() {
    setCarregando(true)
    const lista = await listarCatalogoSeguradoras()
    setSeguradoras(lista)
    setCarregando(false)
  }

  return (
    <div className="ls-card" style={{ marginTop: '1.5rem' }}>
      <h3>
        🏢 Parceiros Institucionais
        <InfoTooltip
          titulo="Parceiros Institucionais"
          texto="Cadastro central de seguradoras/operadoras — mesma tabela usada nos formulários de Apólice (fonte única). Inclui gestor de relacionamento por módulo, produtos habilitados e canais de integração disponíveis (Sprint 005 — fundação pro Finance/Connect Center, sem nenhuma lógica financeira ainda)."
        />
      </h3>

      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
        {!mostrarForm && (
          <button className="ls-btn ls-btn-accent" onClick={() => setMostrarForm(true)}>
            + Nova Seguradora
          </button>
        )}
        <button className="ls-btn ls-btn-ghost" onClick={() => setMostrarCatalogo((v) => !v)}>
          {mostrarCatalogo ? 'Fechar Catálogo de Produtos' : '📦 Catálogo de Produtos'}
        </button>
      </div>

      {mostrarForm && (
        <NovaSeguradoraForm
          onSalvo={() => { setMostrarForm(false); carregar() }}
          onCancelar={() => setMostrarForm(false)}
        />
      )}

      {mostrarCatalogo && <CatalogoProdutos />}

      {carregando ? (
        <p className="cliente-carregando">Carregando...</p>
      ) : seguradoras.length === 0 ? (
        <p className="cliente-vazio" style={{ marginTop: '1rem' }}>Nenhuma seguradora cadastrada ainda.</p>
      ) : (
        <div style={{ marginTop: '1rem' }}>
          {seguradoras.map((s) => (
            <SeguradoraItem key={s.id} seguradora={s} onAtualizado={carregar} />
          ))}
        </div>
      )}
    </div>
  )
}

/**
 * Catálogo Oficial de Produtos (Bloco B). CAT-010: produto pertence
 * sempre ao Master, nunca a uma seguradora — por isso vive aqui, fora
 * do cadastro de cada parceiro individual.
 */
function CatalogoProdutos() {
  const [produtos, setProdutos] = useState([])
  const [carregando, setCarregando] = useState(true)
  const [modulo, setModulo] = useState(MODULOS_PRODUTO[0])
  const [nome, setNome] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState(null)

  useEffect(() => {
    carregar()
  }, [])

  async function carregar() {
    setCarregando(true)
    setProdutos(await listarProdutos())
    setCarregando(false)
  }

  async function handleCriar() {
    if (!nome.trim()) {
      setErro('Informe o nome do produto.')
      return
    }
    setSalvando(true)
    setErro(null)
    try {
      await criarProduto({ modulo, nome })
      setNome('')
      carregar()
    } catch (err) {
      setErro(err.message)
    } finally {
      setSalvando(false)
    }
  }

  return (
    <div className="ls-card" style={{ marginTop: '0.75rem' }}>
      <strong>Catálogo Oficial de Produtos</strong>
      <p className="config-instrucao">
        Produto pertence sempre ao Master — a seguradora só marca quais desses produtos ela comercializa
        (logo abaixo, no cadastro de cada uma).
      </p>

      <div className="cotacao-form-linha">
        <div>
          <label>Módulo</label>
          <select value={modulo} onChange={(e) => setModulo(e.target.value)}>
            {MODULOS_PRODUTO.map((m) => (
              <option key={m} value={m}>{MODULO_LABEL[m] ?? m}</option>
            ))}
          </select>
        </div>
        <div>
          <label>Nome do produto</label>
          <input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex: PME 30-99, Frota, Residencial..." />
        </div>
      </div>

      {erro && <p className="ls-modal-erro">{erro}</p>}

      <div className="ls-modal-acoes">
        <button className="ls-btn ls-btn-primary" onClick={handleCriar} disabled={salvando}>
          {salvando ? 'Salvando...' : '+ Adicionar Produto'}
        </button>
      </div>

      {carregando ? (
        <p className="cliente-carregando">Carregando catálogo...</p>
      ) : produtos.length === 0 ? (
        <p className="cliente-vazio">Nenhum produto cadastrado ainda.</p>
      ) : (
        <table className="cliente-tabela" style={{ marginTop: '0.75rem' }}>
          <thead><tr><th>Módulo</th><th>Produto</th></tr></thead>
          <tbody>
            {produtos.map((p) => (
              <tr key={p.id}>
                <td>{MODULO_LABEL[p.modulo] ?? p.modulo}</td>
                <td>{p.nome}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

function NovaSeguradoraForm({ onSalvo, onCancelar }) {
  const [nome, setNome] = useState('')
  const [razaoSocial, setRazaoSocial] = useState('')
  const [cnpj, setCnpj] = useState('')
  const [site, setSite] = useState('')
  const [categoriaSeguro, setCategoriaSeguro] = useState('')
  const [tipoParceiro, setTipoParceiro] = useState(TIPOS_PARCEIRO[0])
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState(null)

  async function handleSalvar() {
    if (!nome.trim()) {
      setErro('Informe o nome da seguradora.')
      return
    }
    setSalvando(true)
    setErro(null)
    try {
      const nova = await criarSeguradora({ nome, razaoSocial, cnpj, site, categoriaSeguro })
      await atualizarCamposInstitucionais(nova.id, { tipoParceiro })
      onSalvo()
    } catch (err) {
      setErro(err.message)
    } finally {
      setSalvando(false)
    }
  }

  return (
    <div className="ls-card" style={{ marginTop: '0.75rem' }}>
      <div className="cotacao-form-linha">
        <div>
          <label>Nome</label>
          <input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex: Bradesco Seguros" />
        </div>
        <div>
          <label>Tipo de parceiro</label>
          <select value={tipoParceiro} onChange={(e) => setTipoParceiro(e.target.value)}>
            {TIPOS_PARCEIRO.map((t) => (
              <option key={t} value={t}>{TIPO_PARCEIRO_LABEL[t] ?? t}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="cotacao-form-linha">
        <div>
          <label>Razão social</label>
          <input value={razaoSocial} onChange={(e) => setRazaoSocial(e.target.value)} />
        </div>
        <div>
          <label>CNPJ</label>
          <input value={cnpj} onChange={(e) => setCnpj(e.target.value)} placeholder="00.000.000/0000-00" />
        </div>
      </div>

      <div className="cotacao-form-linha">
        <div>
          <label>Categoria de seguro</label>
          <input value={categoriaSeguro} onChange={(e) => setCategoriaSeguro(e.target.value)} placeholder="Ex: Saúde, Auto..." />
        </div>
        <div>
          <label>Site</label>
          <input value={site} onChange={(e) => setSite(e.target.value)} placeholder="https://..." />
        </div>
      </div>

      {erro && <p className="ls-modal-erro">{erro}</p>}

      <div className="ls-modal-acoes">
        <button className="ls-btn ls-btn-ghost" onClick={onCancelar}>Cancelar</button>
        <button className="ls-btn ls-btn-primary" onClick={handleSalvar} disabled={salvando}>
          {salvando ? 'Salvando...' : 'Salvar Seguradora'}
        </button>
      </div>
    </div>
  )
}

function SeguradoraItem({ seguradora, onAtualizado }) {
  const [expandido, setExpandido] = useState(null) // null | 'gestores' | 'institucional'
  const [gestores, setGestores] = useState([])
  const [carregandoGestores, setCarregandoGestores] = useState(false)

  async function toggleGestores() {
    if (expandido !== 'gestores') {
      setCarregandoGestores(true)
      const lista = await listarGestoresPorOperadora(seguradora.id)
      setGestores(lista)
      setCarregandoGestores(false)
      setExpandido('gestores')
    } else {
      setExpandido(null)
    }
  }

  async function recarregarGestores() {
    const lista = await listarGestoresPorOperadora(seguradora.id)
    setGestores(lista)
    onAtualizado()
  }

  const gestoresPorModulo = new Map(gestores.map((g) => [g.modulo, g]))

  return (
    <div className="ls-card" style={{ marginTop: '0.75rem', padding: '0.85rem 1rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
        <div>
          <strong>{seguradora.nome}</strong>
          <span className="ls-badge" style={{ marginLeft: '0.5rem' }}>
            {TIPO_PARCEIRO_LABEL[seguradora.tipo_parceiro] ?? 'Seguradora'}
          </span>
          {seguradora.cnpj && (
            <span className="config-instrucao" style={{ marginLeft: '0.5rem', fontSize: '0.8rem' }}>
              CNPJ: {seguradora.cnpj}
            </span>
          )}
        </div>
        <div style={{ display: 'flex', gap: '0.4rem' }}>
          <button className="cliente-tabela-btn" onClick={() => setExpandido(expandido === 'institucional' ? null : 'institucional')}>
            {expandido === 'institucional' ? 'Fechar' : 'Dados Institucionais'}
          </button>
          <button className="cliente-tabela-btn" onClick={toggleGestores}>
            {expandido === 'gestores' ? 'Fechar' : 'Ver gestores'}
          </button>
        </div>
      </div>

      {expandido === 'institucional' && (
        <PainelInstitucional seguradora={seguradora} onAtualizado={onAtualizado} />
      )}

      {expandido === 'gestores' && (
        <div style={{ marginTop: '0.75rem' }}>
          {carregandoGestores ? (
            <p className="cliente-carregando">Carregando gestores...</p>
          ) : (
            <table className="cliente-tabela">
              <thead>
                <tr><th>Módulo</th><th>Gestor</th><th>Contato</th><th>Ações</th></tr>
              </thead>
              <tbody>
                {MODULOS_GESTOR.map((m) => (
                  <LinhaGestor
                    key={m.id}
                    modulo={m}
                    operadoraId={seguradora.id}
                    gestor={gestoresPorModulo.get(m.id)}
                    onAtualizado={recarregarGestores}
                  />
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  )
}

/**
 * Painel de Dados Institucionais (Blocos A, C e D): tipo de parceiro,
 * modelo financeiro/competência (preparatório, sem lógica de cálculo),
 * produtos habilitados (Bloco B) e canais de integração (Bloco D).
 */
function PainelInstitucional({ seguradora, onAtualizado }) {
  const { usuario } = useAuth()
  const [tipoParceiro, setTipoParceiro] = useState(seguradora.tipo_parceiro ?? 'seguradora')
  const [modeloFinanceiro, setModeloFinanceiro] = useState(seguradora.modelo_financeiro ?? '')
  const [competenciaFinanceira, setCompetenciaFinanceira] = useState(seguradora.competencia_financeira ?? '')
  const [situacaoIntegracao, setSituacaoIntegracao] = useState(seguradora.situacao_integracao ?? 'manual')
  const [salvandoCampos, setSalvandoCampos] = useState(false)

  const [produtosDisponiveis, setProdutosDisponiveis] = useState([])
  const [produtosHabilitados, setProdutosHabilitados] = useState([])
  const [carregandoProdutos, setCarregandoProdutos] = useState(true)

  const [canais, setCanais] = useState([])
  const [novoTipoCanal, setNovoTipoCanal] = useState(TIPOS_CANAL[0])
  const [novaObservacaoCanal, setNovaObservacaoCanal] = useState('')
  const [carregandoCanais, setCarregandoCanais] = useState(true)

  useEffect(() => {
    carregarProdutos()
    carregarCanais()
  }, [])

  async function carregarProdutos() {
    setCarregandoProdutos(true)
    const [todos, habilitados] = await Promise.all([
      listarProdutos(),
      listarProdutosDaOperadora(seguradora.id),
    ])
    setProdutosDisponiveis(todos)
    setProdutosHabilitados(habilitados)
    setCarregandoProdutos(false)
  }

  async function carregarCanais() {
    setCarregandoCanais(true)
    setCanais(await listarCanaisDaOperadora(seguradora.id))
    setCarregandoCanais(false)
  }

  async function handleSalvarCampos() {
    setSalvandoCampos(true)
    try {
      await atualizarCamposInstitucionais(seguradora.id, { tipoParceiro, modeloFinanceiro, competenciaFinanceira, situacaoIntegracao })
      onAtualizado()
    } finally {
      setSalvandoCampos(false)
    }
  }

  async function handleToggleProduto(produto) {
    const vinculo = produtosHabilitados.find((p) => p.id === produto.id)
    if (vinculo) {
      await desabilitarProdutoNaOperadora(vinculo.vinculoId)
    } else {
      await habilitarProdutoNaOperadora(seguradora.id, produto.id)
    }
    carregarProdutos()
  }

  async function handleAdicionarCanal() {
    await adicionarCanalOperadora(seguradora.id, novoTipoCanal, novaObservacaoCanal || null)
    setNovaObservacaoCanal('')
    carregarCanais()
  }

  async function handleRemoverCanal(canalId) {
    await removerCanalOperadora(canalId)
    carregarCanais()
  }

  const idsHabilitados = new Set(produtosHabilitados.map((p) => p.id))

  return (
    <div style={{ marginTop: '0.75rem' }}>
      <div className="ls-card" style={{ padding: '0.85rem' }}>
        <strong>Classificação Institucional</strong>
        <div className="cotacao-form-linha" style={{ marginTop: '0.5rem' }}>
          <div>
            <label>Tipo de parceiro</label>
            <select value={tipoParceiro} onChange={(e) => setTipoParceiro(e.target.value)}>
              {TIPOS_PARCEIRO.map((t) => <option key={t} value={t}>{TIPO_PARCEIRO_LABEL[t] ?? t}</option>)}
            </select>
          </div>
          <div>
            <label>Modelo financeiro</label>
            <select value={modeloFinanceiro} onChange={(e) => setModeloFinanceiro(e.target.value)}>
              <option value="">Não definido</option>
              {Object.entries(MODELO_FINANCEIRO_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
        </div>
        <div className="cotacao-form-linha">
          <div>
            <label>Competência</label>
            <select value={competenciaFinanceira} onChange={(e) => setCompetenciaFinanceira(e.target.value)}>
              <option value="">Não definida</option>
              {Object.entries(COMPETENCIA_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
          <div>
            <label>Situação de integração</label>
            <select value={situacaoIntegracao} onChange={(e) => setSituacaoIntegracao(e.target.value)}>
              {Object.entries(SITUACAO_INTEGRACAO_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
        </div>
        <div className="ls-modal-acoes">
          <button className="ls-btn ls-btn-primary" onClick={handleSalvarCampos} disabled={salvandoCampos}>
            {salvandoCampos ? 'Salvando...' : 'Salvar classificação'}
          </button>
        </div>
      </div>

      <div className="ls-card" style={{ padding: '0.85rem', marginTop: '0.6rem' }}>
        <strong>Produtos habilitados</strong>
        {carregandoProdutos ? (
          <p className="cliente-carregando">Carregando produtos...</p>
        ) : produtosDisponiveis.length === 0 ? (
          <p className="cliente-vazio">Nenhum produto no catálogo ainda — cadastre em "📦 Catálogo de Produtos".</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', marginTop: '0.5rem' }}>
            {produtosDisponiveis.map((p) => (
              <label key={p.id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', margin: 0 }}>
                <input type="checkbox" style={{ width: 'auto' }} checked={idsHabilitados.has(p.id)} onChange={() => handleToggleProduto(p)} />
                <span className="ls-badge">{MODULO_LABEL[p.modulo] ?? p.modulo}</span>
                {p.nome}
              </label>
            ))}
          </div>
        )}
      </div>

      <div className="ls-card" style={{ padding: '0.85rem', marginTop: '0.6rem' }}>
        <strong>Canais de integração</strong>
        <p className="config-instrucao">Preparatório — nenhuma integração real acontece por aqui ainda.</p>

        {carregandoCanais ? (
          <p className="cliente-carregando">Carregando canais...</p>
        ) : canais.length === 0 ? (
          <p className="cliente-vazio">Nenhum canal registrado ainda.</p>
        ) : (
          <table className="cliente-tabela">
            <thead><tr><th>Canal</th><th>Observações</th><th></th></tr></thead>
            <tbody>
              {canais.map((c) => (
                <tr key={c.id}>
                  <td>{TIPO_CANAL_LABEL[c.tipo_canal] ?? c.tipo_canal}</td>
                  <td>{c.observacoes ?? '—'}</td>
                  <td>
                    <button className="cliente-tabela-btn cliente-tabela-btn-perigo" onClick={() => handleRemoverCanal(c.id)}>Remover</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <div className="cotacao-form-linha" style={{ marginTop: '0.6rem' }}>
          <div>
            <label>Tipo de canal</label>
            <select value={novoTipoCanal} onChange={(e) => setNovoTipoCanal(e.target.value)}>
              {TIPOS_CANAL.map((t) => <option key={t} value={t}>{TIPO_CANAL_LABEL[t] ?? t}</option>)}
            </select>
          </div>
          <div>
            <label>Observações (opcional)</label>
            <input value={novaObservacaoCanal} onChange={(e) => setNovaObservacaoCanal(e.target.value)} placeholder="Ex: acesso via portal parceiro, aguardando credencial..." />
          </div>
        </div>
        <div className="ls-modal-acoes">
          <button className="ls-btn ls-btn-ghost" onClick={handleAdicionarCanal}>+ Adicionar Canal</button>
        </div>
      </div>

      {/* SPEC-002 (Connect Center), Peça 2 — importação de material de
          mercado por domínio, sempre por operadora, com fila de
          aprovação. Nenhuma tela nova — vive aqui, ao lado de Canais. */}
      <PainelImportacaoMercado operadoraId={seguradora.id} usuarioId={usuario?.id ?? null} />
    </div>
  )
}

function LinhaGestor({ modulo, operadoraId, gestor, onAtualizado }) {
  const [editando, setEditando] = useState(false)
  const [nome, setNome] = useState(gestor?.nome ?? '')
  const [telefone, setTelefone] = useState(gestor?.telefone ?? '')
  const [whatsapp, setWhatsapp] = useState(gestor?.whatsapp ?? '')
  const [email, setEmail] = useState(gestor?.email ?? '')
  const [salvando, setSalvando] = useState(false)

  async function handleSalvar() {
    setSalvando(true)
    try {
      await upsertGestorModulo({ operadoraId, modulo: modulo.id, nome, telefone, whatsapp, email })
      setEditando(false)
      onAtualizado()
    } finally {
      setSalvando(false)
    }
  }

  if (editando) {
    return (
      <tr>
        <td colSpan={4}>
          <div className="ls-card" style={{ padding: '0.75rem' }}>
            <strong>{modulo.label}</strong>
            <div className="cotacao-form-linha" style={{ marginTop: '0.5rem' }}>
              <div><label>Nome</label><input value={nome} onChange={(e) => setNome(e.target.value)} /></div>
              <div><label>Telefone</label><input value={telefone} onChange={(e) => setTelefone(e.target.value)} /></div>
            </div>
            <div className="cotacao-form-linha">
              <div><label>WhatsApp</label><input value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} /></div>
              <div><label>E-mail</label><input value={email} onChange={(e) => setEmail(e.target.value)} /></div>
            </div>
            <div className="ls-modal-acoes">
              <button className="cliente-tabela-btn" onClick={() => setEditando(false)}>Cancelar</button>
              <button className="cliente-tabela-btn" onClick={handleSalvar} disabled={salvando}>
                {salvando ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </div>
        </td>
      </tr>
    )
  }

  return (
    <tr>
      <td>{modulo.label}</td>
      <td>{gestor?.nome || '—'}</td>
      <td>
        {gestor?.telefone && <div>{gestor.telefone}</div>}
        {gestor?.email && <div>{gestor.email}</div>}
        {!gestor?.telefone && !gestor?.email && '—'}
      </td>
      <td className="cliente-tabela-acoes">
        <button className="cliente-tabela-btn" onClick={() => setEditando(true)}>
          {gestor ? 'Editar' : 'Definir gestor'}
        </button>
        {gestor && (
          <BotaoOperacaoCritica
            label="Remover"
            tabelaAfetada="operacional.seguradora_gestores"
            registroId={gestor.id}
            dadosAntes={gestor}
            executar={() => excluirGestorModulo(gestor.id)}
            onSucesso={onAtualizado}
            className="cliente-tabela-btn cliente-tabela-btn-perigo"
          />
        )}
      </td>
    </tr>
  )
} 