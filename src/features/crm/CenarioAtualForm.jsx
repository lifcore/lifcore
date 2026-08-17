import { useEffect, useState } from 'react'
import { listarCatalogoOperadoras } from '../../lib/crm/clientesService'
import {
  listarCenarioAtual,
  criarPlanoCenarioAtual,
  atualizarPlanoCenarioAtual,
  confirmarValidacaoPlano,
  excluirPlanoCenarioAtual,
  parseValorBR,
} from '../../lib/crm/cenarioAtualService'

const FAIXAS_ETARIAS_ANS = [
  '00-18', '19-23', '24-28', '29-33', '34-38',
  '39-43', '44-48', '49-53', '54-58', '59+',
]

const BADGE_STATUS = {
  conferido: '🟢 Conferido',
  atencao: '🟡 Atenção',
  incompleto: '🔴 Incompleto',
}

function faixasVazias() {
  return Object.fromEntries(FAIXAS_ETARIAS_ANS.map((f) => [f, { vidas: '', valor: '' }]))
}

function faixasParaEdicao(faixasSalvas) {
  const base = faixasVazias()
  for (const f of faixasSalvas ?? []) {
    if (base[f.faixa_etaria]) {
      base[f.faixa_etaria] = { vidas: f.quantidade_vidas ?? '', valor: f.valor_unitario ?? '' }
    }
  }
  return base
}

function planoVazio() {
  return {
    id: null,
    _localId: crypto.randomUUID(),
    operadora_id: '',
    operadora_nome_livre: '',
    plano: '',
    produto: 'saude',
    vigencia_inicio: '',
    fonte: 'manual',
    quantidade_vidas_informada: '',
    mensalidade_informada: '',
    acomodacao: '',
    abrangencia: '',
    coparticipacao: '',
    reembolso: '',
    observacoes: '',
    status_validacao: 'incompleto',
    faixas: faixasVazias(),
    _salvo: false,
  }
}

/**
 * SPEC-001A — Seção "Cenário Atual" dentro da Cotação existente (§9 UX
 * sugerida). Só faz sentido depois que a Cotação já tem `id` — cenário
 * atual é sempre vinculado a uma Cotação salva.
 *
 * Peça 1: cadastro manual apenas. Importação de documento/Excel-CSV
 * (SPEC-001A §2) é peça futura, que vai preencher estes mesmos campos com
 * `fonte: 'documento' | 'planilha'` em vez de criar tela própria.
 */
export default function CenarioAtualForm({ cotacaoId, usuarioId = null }) {
  const [planos, setPlanos] = useState([])
  const [catalogoOperadoras, setCatalogoOperadoras] = useState([])
  const [carregando, setCarregando] = useState(true)
  const [salvandoId, setSalvandoId] = useState(null)
  const [erro, setErro] = useState(null)

  useEffect(() => {
    listarCatalogoOperadoras().then(setCatalogoOperadoras).catch(() => {})
  }, [])

  useEffect(() => {
    if (!cotacaoId) {
      setCarregando(false)
      return
    }
    carregar()
  }, [cotacaoId])

  async function carregar() {
    setCarregando(true)
    try {
      const dados = await listarCenarioAtual(cotacaoId)
      setPlanos(
        dados.map((p) => ({
          id: p.id,
          _localId: p.id,
          operadora_id: p.operadora_id ?? '',
          operadora_nome_livre: p.operadora_nome_livre ?? '',
          plano: p.plano ?? '',
          produto: p.produto ?? 'saude',
          vigencia_inicio: p.vigencia_inicio ?? '',
          fonte: p.fonte,
          quantidade_vidas_informada: p.quantidade_vidas_informada ?? '',
          mensalidade_informada: p.mensalidade_informada ?? '',
          acomodacao: p.acomodacao ?? '',
          abrangencia: p.abrangencia ?? '',
          coparticipacao: p.coparticipacao ?? '',
          reembolso: p.reembolso ?? '',
          observacoes: p.observacoes ?? '',
          status_validacao: p.status_validacao,
          faixas: faixasParaEdicao(p.faixas),
          divergencia: p.divergencia,
          anual: p.anual,
          custoPorVida: p.custoPorVida,
          _salvo: true,
        }))
      )
      if (dados.length === 0) setPlanos([planoVazio()])
    } catch (err) {
      setErro(err.message)
    } finally {
      setCarregando(false)
    }
  }

  function atualizarCampo(localId, campo, valor) {
    setPlanos((ps) => ps.map((p) => (p._localId === localId ? { ...p, [campo]: valor } : p)))
  }

  function selecionarOperadora(localId, id) {
    const nome = catalogoOperadoras.find((op) => op.id === id)?.nome ?? ''
    setPlanos((ps) =>
      ps.map((p) => (p._localId === localId ? { ...p, operadora_id: id, operadora_nome_livre: nome } : p))
    )
  }

  function atualizarFaixa(localId, faixa, campo, valor) {
    setPlanos((ps) =>
      ps.map((p) =>
        p._localId === localId
          ? { ...p, faixas: { ...p.faixas, [faixa]: { ...p.faixas[faixa], [campo]: valor } } }
          : p
      )
    )
  }

  function adicionarPlano() {
    setPlanos((ps) => [...ps, planoVazio()])
  }

  async function removerPlano(plano) {
    if (plano.id) {
      if (!confirm('Excluir este plano do cenário atual? Esta ação não pode ser desfeita.')) return
      try {
        await excluirPlanoCenarioAtual(plano.id)
      } catch (err) {
        setErro(err.message)
        return
      }
    }
    setPlanos((ps) => (ps.length > 1 ? ps.filter((p) => p._localId !== plano._localId) : [planoVazio()]))
  }

  function montarPayload(plano) {
    const faixasPreenchidas = FAIXAS_ETARIAS_ANS.filter(
      (f) => plano.faixas[f].vidas || plano.faixas[f].valor
    ).map((f) => {
      const vidas = parseInt(plano.faixas[f].vidas, 10) || 0
      const valorUnitario = parseValorBR(plano.faixas[f].valor)
      return {
        faixa_etaria: f,
        quantidade_vidas: vidas || null,
        valor_unitario: valorUnitario || null,
        valor_total: vidas && valorUnitario ? vidas * valorUnitario : null,
        fonte: plano.fonte,
      }
    })

    const dados = {
      operadora_id: plano.operadora_id || null,
      operadora_nome_livre: plano.operadora_nome_livre || null,
      plano: plano.plano || null,
      produto: plano.produto,
      vigencia_inicio: plano.vigencia_inicio || null,
      fonte: plano.fonte,
      quantidade_vidas_informada: plano.quantidade_vidas_informada
        ? parseInt(plano.quantidade_vidas_informada, 10)
        : null,
      mensalidade_informada: plano.mensalidade_informada
        ? parseValorBR(plano.mensalidade_informada)
        : null,
      acomodacao: plano.acomodacao || null,
      abrangencia: plano.abrangencia || null,
      coparticipacao: plano.coparticipacao || null,
      reembolso: plano.reembolso || null,
      observacoes: plano.observacoes || null,
    }

    return { dados, faixas: faixasPreenchidas }
  }

  async function salvarPlano(plano) {
    setSalvandoId(plano._localId)
    setErro(null)
    try {
      const { dados, faixas } = montarPayload(plano)
      if (plano.id) {
        await atualizarPlanoCenarioAtual(plano.id, dados, faixas, { usuarioId })
      } else {
        await criarPlanoCenarioAtual({ cotacaoId, dados, faixas, usuarioId })
      }
      await carregar()
    } catch (err) {
      setErro(err.message)
    } finally {
      setSalvandoId(null)
    }
  }

  async function confirmarConferido(plano) {
    try {
      await confirmarValidacaoPlano(plano.id)
      await carregar()
    } catch (err) {
      setErro(err.message)
    }
  }

  if (!cotacaoId) {
    return (
      <p className="cenario-atual-aviso">
        Salve a Cotação primeiro para poder cadastrar o Cenário Atual do cliente.
      </p>
    )
  }

  if (carregando) return <p>Carregando cenário atual...</p>

  return (
    <div className="cotacao-form cenario-atual-form">
      <h3>Cenário Atual do Cliente</h3>
      <p className="cenario-atual-descricao">
        Plano(s) que o cliente já possui hoje. Fonte de comparação obrigatória para o Estudo de Mercado —
        se o cliente tiver mais de um plano no mesmo contrato, cadastre um bloco para cada um.
      </p>

      {erro && <p className="ls-modal-erro">{erro}</p>}

      {planos.map((plano, index) => {
        const divergencia = plano._salvo ? plano.divergencia : null
        return (
          <div key={plano._localId} className="cotacao-bloco-plano cenario-atual-bloco">
            <div className="cotacao-bloco-plano-header">
              <strong>Plano atual {index + 1}</strong>
              {plano._salvo && (
                <span className="cenario-atual-status-badge">{BADGE_STATUS[plano.status_validacao]}</span>
              )}
              {planos.length > 1 && (
                <button className="cotacao-remover-bloco" onClick={() => removerPlano(plano)}>✕</button>
              )}
            </div>

            {divergencia?.divergente && (
              <div className="cenario-atual-alerta-divergencia">
                ⚠️ Divergência encontrada — revise antes de considerar este plano conferido.
                {divergencia.divergeVidas && (
                  <span> Vidas informadas: {divergencia.vidasInformadas}, soma das faixas: {divergencia.somaVidas}.</span>
                )}
                {divergencia.divergeValor && (
                  <span> Mensalidade informada: R$ {divergencia.valorInformado?.toFixed(2)}, soma das faixas: R$ {divergencia.somaValor.toFixed(2)}.</span>
                )}
                {' '}O sistema não corrige a diferença automaticamente — confirme ou ajuste manualmente.
              </div>
            )}

            <div className="cotacao-form-linha">
              <div>
                <label>Operadora</label>
                <select
                  value={plano.operadora_id}
                  onChange={(e) => selecionarOperadora(plano._localId, e.target.value)}
                >
                  <option value="">Selecione...</option>
                  {catalogoOperadoras.map((op) => (
                    <option key={op.id} value={op.id}>{op.nome}</option>
                  ))}
                </select>
              </div>
              <div>
                <label>Produto</label>
                <select
                  value={plano.produto}
                  onChange={(e) => atualizarCampo(plano._localId, 'produto', e.target.value)}
                >
                  <option value="saude">Saúde</option>
                  <option value="odonto">Odontológico</option>
                </select>
              </div>
              <div>
                <label>Vigência (início)</label>
                <input
                  type="date"
                  value={plano.vigencia_inicio ?? ''}
                  onChange={(e) => atualizarCampo(plano._localId, 'vigencia_inicio', e.target.value)}
                />
              </div>
            </div>

            <div className="cotacao-form-linha">
              <div>
                <label>Nome do plano</label>
                <input
                  type="text"
                  placeholder="Ex: Nacional Flex"
                  value={plano.plano}
                  onChange={(e) => atualizarCampo(plano._localId, 'plano', e.target.value)}
                />
              </div>
              <div>
                <label>Total de vidas (informado)</label>
                <input
                  type="number"
                  value={plano.quantidade_vidas_informada}
                  onChange={(e) => atualizarCampo(plano._localId, 'quantidade_vidas_informada', e.target.value)}
                />
              </div>
              <div>
                <label>Mensalidade total (informada)</label>
                <input
                  type="text"
                  inputMode="decimal"
                  placeholder="R$ (ex: 12500,00)"
                  value={plano.mensalidade_informada}
                  onChange={(e) => atualizarCampo(plano._localId, 'mensalidade_informada', e.target.value)}
                />
              </div>
            </div>

            <div className="cotacao-form-linha">
              <div>
                <label>Acomodação</label>
                <input
                  type="text"
                  value={plano.acomodacao}
                  onChange={(e) => atualizarCampo(plano._localId, 'acomodacao', e.target.value)}
                />
              </div>
              <div>
                <label>Abrangência</label>
                <input
                  type="text"
                  value={plano.abrangencia}
                  onChange={(e) => atualizarCampo(plano._localId, 'abrangencia', e.target.value)}
                />
              </div>
              <div>
                <label>Coparticipação</label>
                <input
                  type="text"
                  value={plano.coparticipacao}
                  onChange={(e) => atualizarCampo(plano._localId, 'coparticipacao', e.target.value)}
                />
              </div>
            </div>

            {plano._salvo && (
              <div className="cenario-atual-derivados">
                <span>Anual estimado: {plano.anual != null ? `R$ ${plano.anual.toFixed(2)}` : '—'}</span>
                <span>Custo por vida: {plano.custoPorVida != null ? `R$ ${plano.custoPorVida.toFixed(2)}` : '—'}</span>
              </div>
            )}

            <details className="cotacao-detalhes">
              <summary>Composição por faixa etária (opcional)</summary>
              <div className="cotacao-faixas-tabela">
                <div className="cotacao-faixas-cabecalho">
                  <span>Faixa etária</span>
                  <span>Nº de vidas</span>
                  <span>Valor por vida</span>
                </div>
                {FAIXAS_ETARIAS_ANS.map((faixa) => (
                  <div key={faixa} className="cotacao-faixas-linha">
                    <span className="ls-mono">{faixa}</span>
                    <input
                      type="number"
                      value={plano.faixas[faixa].vidas}
                      onChange={(e) => atualizarFaixa(plano._localId, faixa, 'vidas', e.target.value)}
                    />
                    <input
                      type="text"
                      inputMode="decimal"
                      placeholder="R$ (ex: 350,00)"
                      value={plano.faixas[faixa].valor}
                      onChange={(e) => atualizarFaixa(plano._localId, faixa, 'valor', e.target.value)}
                    />
                  </div>
                ))}
              </div>
            </details>

            <div className="ls-modal-acoes">
              {plano._salvo && plano.status_validacao !== 'conferido' && (
                <button className="ls-btn ls-btn-ghost" onClick={() => confirmarConferido(plano)}>
                  Marcar como conferido
                </button>
              )}
              <button
                className="ls-btn ls-btn-primary"
                onClick={() => salvarPlano(plano)}
                disabled={salvandoId === plano._localId}
              >
                {salvandoId === plano._localId ? 'Salvando...' : plano._salvo ? 'Salvar alterações' : 'Salvar plano'}
              </button>
            </div>
          </div>
        )
      })}

      <button className="ls-btn ls-btn-ghost cotacao-add-bloco" onClick={adicionarPlano}>
        + Adicionar outro plano atual
      </button>
    </div>
  )
}
