import { useEffect, useState } from 'react'
import { criarCotacao, atualizarCotacao, calcularPorte, listarCatalogoOperadoras, parseValorBR } from '../../lib/crm/clientesService'
import { useAuth } from '../auth/AuthContext'
import CenarioAtualForm from './CenarioAtualForm'
import PropostasEstudoForm from './PropostasEstudoForm'
import './cotacoesGrupo.css'

const FAIXAS_ETARIAS_ANS = [
  '00-18', '19-23', '24-28', '29-33', '34-38',
  '39-43', '44-48', '49-53', '54-58', '59+',
]

function novoBlocoPlano(nome = '') {
  return {
    id: crypto.randomUUID(),
    plano: nome,
    faixas: Object.fromEntries(FAIXAS_ETARIAS_ANS.map((f) => [f, { vidas: '', valor: '' }])),
  }
}

/** Reconstrói os blocos de plano a partir dos itens salvos (ex: "00-18 (Plano X)") */
function reconstruirBlocos(itensCotacao) {
  if (!itensCotacao?.length) return [novoBlocoPlano()]

  const blocosPorPlano = {}
  for (const item of itensCotacao) {
    const match = item.faixa_etaria.match(/^(.+?)\s*\((.+)\)$/)
    const faixa = match ? match[1] : item.faixa_etaria
    const nomePlano = match ? match[2] : ''

    if (!blocosPorPlano[nomePlano]) blocosPorPlano[nomePlano] = novoBlocoPlano(nomePlano)
    if (blocosPorPlano[nomePlano].faixas[faixa]) {
      blocosPorPlano[nomePlano].faixas[faixa] = {
        vidas: item.quantidade_vidas ?? '',
        valor: item.valor ?? '',
      }
    }
  }
  return Object.values(blocosPorPlano)
}

/**
 * CORREÇÃO (Sprint Vendas Central — vínculo Operadora, aprovada pelo
 * Chief): antes usava datalist de texto livre, sem vínculo real —
 * `listarCatalogoOperadoras` nem trazia `id` (corrigido junto, em
 * clientesService.js). Agora é select vinculado ao catálogo real,
 * gravando `operadora_id` verdadeiro. Sem cadastro rápido aqui (Lifcare
 * usa o catálogo compartilhado institucional; cadastro de operadora
 * nova continua pela tela de Configurações, fora de escopo desta
 * correção).
 *
 * ADIÇÃO (SPEC-001A, Peça 1 do Motor de Estudo de Mercado): seção
 * "Cenário Atual" embutida abaixo da Cotação já salva — nunca cria tela
 * ou aba nova (regra fixa do projeto), só aparece depois que a Cotação
 * já tem `id` real no banco, porque `cenario_atual_planos.cotacao_id`
 * é obrigatório.
 *
 * ADIÇÃO (SPEC-001, Peça 3 do Motor de Estudo de Mercado): seção
 * "Propostas de Mercado" — upload do Multicálculo, prévia editável e
 * comparativo financeiro. Usa a composição de vidas por faixa desta
 * própria Cotação (`itensParaFinanceiro`, mesma estrutura que já vai
 * pro banco em `itens_cotacao`) pra calcular a mensalidade real de cada
 * proposta — nunca lê o "total" que o próprio Multicálculo mostra, que
 * é só uma referência genérica de 1 vida por faixa, não a composição
 * real do cliente.
 *
 * ATENÇÃO: `useAuth()` é uma suposição de nome de hook/export a partir
 * do padrão do projeto (arquivo `AuthContext.jsx`) — não tive acesso ao
 * conteúdo desse arquivo. Se o export real for diferente (nome do hook
 * ou do campo do usuário), ajustar só a linha do import e a leitura de
 * `usuario?.id` abaixo.
 *
 * CORREÇÃO (achado real de teste, 17/08 — Raphael): o formulário
 * fechava sozinho assim que uma Cotação NOVA era salva, escondendo
 * Cenário Atual/Propostas de Mercado antes do corretor conseguir ver
 * que elas tinham acabado de aparecer — dava a falsa impressão de que
 * precisava criar uma segunda Cotação pra "continuar preenchendo".
 * Agora, na primeira criação, o formulário fica aberto (via `onCriado`,
 * novo prop opcional) até o corretor clicar em "Concluir e voltar à
 * lista", explicitamente.
 *
 * ACHADO (21/08) — editar uma Cotação criada pelo Multicálculo abria
 * este formulário em branco, com o formato antigo de faixas ANS
 * ("00-18") em vez da composição real. Causa: `reconstruirBlocos`
 * espera `faixa_etaria` no formato "00-18 (Nome do Plano)" — o
 * Multicálculo salva como "0 a 18" (sem parênteses, dígitos sem zero à
 * esquerda), formato completamente diferente, então nenhuma faixa batia
 * e o corretor via um card vazio, desconectado do que foi criado de
 * verdade.
 *
 * CORRIGIDO: Cotação vinda do Multicálculo (identificada por já ter
 * `grupo_comparacao_id` — só o Multicálculo grava esse campo hoje) usa
 * uma edição PRÓPRIA e mais simples (`EdicaoCotacaoMulticalculo`,
 * abaixo) — operadora/plano/composição de preço aparecem como
 * referência (não editáveis, vieram da Biblioteca de Mercado, não é
 * dado digitado à mão), só a validade é editável. Cotação antiga
 * continua usando o formulário completo de sempre, sem nenhuma mudança.
 */
export default function CotacaoForm({ clienteProspectId, cotacaoExistente, casoId, onSalvo, onCriado, onCancelar }) {
  const { usuario } = useAuth()

  // Só o Multicálculo grava grupo_comparacao_id hoje — identificador
  // seguro pra saber que essa Cotação não tem o formato de faixas ANS
  // que o resto deste formulário espera.
  if (cotacaoExistente?.grupo_comparacao_id) {
    return (
      <EdicaoCotacaoMulticalculo
        cotacaoExistente={cotacaoExistente}
        onSalvo={onSalvo}
        onCancelar={onCancelar}
      />
    )
  }

  return <CotacaoFormCompleto clienteProspectId={clienteProspectId} cotacaoExistente={cotacaoExistente} casoId={casoId} onSalvo={onSalvo} onCriado={onCriado} onCancelar={onCancelar} usuario={usuario} />
}

/**
 * Edição simplificada pra Cotação do Multicálculo — ver nota acima.
 * Operadora/plano/composição de preço são só referência (read-only,
 * mesmo visual do card de Cotações em ClienteDetailPage.jsx, pra ficar
 * consistente); só a validade é editável de verdade. Reaproveita
 * `atualizarCotacao` passando os `itens_cotacao` existentes de volta
 * sem nenhuma mudança — nunca reescreve preço vindo da Biblioteca de
 * Mercado.
 */
function EdicaoCotacaoMulticalculo({ cotacaoExistente, onSalvo, onCancelar }) {
  const [validade, setValidade] = useState(cotacaoExistente.validade ?? '')
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState(null)

  const itens = cotacaoExistente.itens_cotacao ?? []
  const total = itens.reduce((soma, item) => soma + (item.quantidade_vidas ?? 0) * Number(item.valor ?? 0), 0)

  async function handleSalvar() {
    setSalvando(true)
    setErro(null)
    try {
      const dados = {
        operadora_id: cotacaoExistente.operadora_id,
        operadora_nome_livre: cotacaoExistente.operadora_nome_livre,
        porte: cotacaoExistente.porte,
        numero_vidas: cotacaoExistente.numero_vidas,
        plano: cotacaoExistente.plano,
        validade: validade || null,
      }
      const itensParaSalvar = itens.map((item) => ({
        faixa_etaria: item.faixa_etaria,
        quantidade_vidas: item.quantidade_vidas,
        valor: item.valor,
      }))
      await atualizarCotacao(cotacaoExistente.id, dados, itensParaSalvar)
      onSalvo()
    } catch (err) {
      setErro(err.message)
    } finally {
      setSalvando(false)
    }
  }

  return (
    <div className="cotacao-form">
      <p className="cenario-atual-descricao">
        Cotação criada pelo Multicálculo (Biblioteca de Mercado) — operadora, plano e valores vêm da fonte de
        preços real, por isso aparecem só como referência aqui. Se precisar de um valor diferente, gere uma nova
        comparação no Multicálculo.
      </p>

      <div className="cotacao-form-linha">
        <div>
          <label>Operadora</label>
          <input type="text" value={cotacaoExistente.operadora_nome_livre ?? ''} disabled />
        </div>
        <div>
          <label>Plano</label>
          <input type="text" value={cotacaoExistente.plano ?? ''} disabled />
        </div>
        <div>
          <label>Validade da proposta</label>
          <input type="date" value={validade ?? ''} onChange={(e) => setValidade(e.target.value)} />
        </div>
      </div>

      <div className="cotacao-item-valores">
        {itens.map((item) => {
          const subtotal = (item.quantidade_vidas ?? 0) * Number(item.valor ?? 0)
          return (
            <span key={item.id ?? item.faixa_etaria} className="cotacao-item-valor">
              {item.faixa_etaria} ({item.quantidade_vidas ?? 0}x): R$ {subtotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </span>
          )
        })}
        <span className="cotacao-item-valor cotacao-item-valor-total">
          Total: R$ {total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
        </span>
      </div>

      {erro && <p className="ls-modal-erro">{erro}</p>}

      <div className="ls-modal-acoes">
        <button className="ls-btn ls-btn-ghost" onClick={onCancelar}>Cancelar</button>
        <button className="ls-btn ls-btn-primary" onClick={handleSalvar} disabled={salvando}>
          {salvando ? 'Salvando...' : 'Salvar alterações'}
        </button>
      </div>
    </div>
  )
}

function CotacaoFormCompleto({ clienteProspectId, cotacaoExistente, casoId, onSalvo, onCriado, onCancelar, usuario }) {
  const [operadoraId, setOperadoraId] = useState(cotacaoExistente?.operadora_id ?? '')
  const [operadoraNome, setOperadoraNome] = useState(cotacaoExistente?.operadora_nome_livre ?? '')
  const [validade, setValidade] = useState(cotacaoExistente?.validade ?? '')
  const [blocosPlano, setBlocosPlano] = useState(() => reconstruirBlocos(cotacaoExistente?.itens_cotacao))
  const [catalogoOperadoras, setCatalogoOperadoras] = useState([])
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState(null)
  const [cotacaoSalvaId, setCotacaoSalvaId] = useState(cotacaoExistente?.id ?? null)

  useEffect(() => {
    listarCatalogoOperadoras().then(setCatalogoOperadoras).catch(() => {})
  }, [])

  const totalVidas = blocosPlano.reduce(
    (soma, bloco) =>
      soma + Object.values(bloco.faixas).reduce((s, f) => s + (parseInt(f.vidas, 10) || 0), 0),
    0
  )
  const totalValor = blocosPlano.reduce(
    (soma, bloco) =>
      soma +
      Object.values(bloco.faixas).reduce(
        (s, f) => s + (parseInt(f.vidas, 10) || 0) * parseValorBR(f.valor),
        0
      ),
    0
  )
  const porteCalculado = totalVidas ? calcularPorte(totalVidas) : null

  /** Mesma composição que vai pro banco em itens_cotacao — usada ao vivo pelo comparativo financeiro das Propostas de Mercado, sem precisar esperar salvar. */
  const itensParaFinanceiro = []
  for (const bloco of blocosPlano) {
    for (const faixa of FAIXAS_ETARIAS_ANS) {
      const { vidas } = bloco.faixas[faixa]
      if (vidas) {
        itensParaFinanceiro.push({
          faixa_etaria: blocosPlano.length > 1 && bloco.plano ? `${faixa} (${bloco.plano})` : faixa,
          quantidade_vidas: parseInt(vidas, 10),
        })
      }
    }
  }

  function selecionarOperadora(id) {
    setOperadoraId(id)
    setOperadoraNome(catalogoOperadoras.find((op) => op.id === id)?.nome ?? '')
  }

  function atualizarFaixa(blocoId, faixa, campo, valor) {
    setBlocosPlano((blocos) =>
      blocos.map((b) =>
        b.id === blocoId
          ? { ...b, faixas: { ...b.faixas, [faixa]: { ...b.faixas[faixa], [campo]: valor } } }
          : b
      )
    )
  }

  function atualizarNomePlano(blocoId, nome) {
    setBlocosPlano((blocos) => blocos.map((b) => (b.id === blocoId ? { ...b, plano: nome } : b)))
  }

  function adicionarBloco() {
    setBlocosPlano((blocos) => [...blocos, novoBlocoPlano()])
  }

  function removerBloco(blocoId) {
    setBlocosPlano((blocos) => (blocos.length > 1 ? blocos.filter((b) => b.id !== blocoId) : blocos))
  }

  async function handleSalvar() {
    if (!operadoraId || !totalVidas) {
      setErro('Selecione a operadora do catálogo e informe o número de vidas em algum plano.')
      return
    }
    setSalvando(true)
    setErro(null)

    try {
      const itens = []
      for (const bloco of blocosPlano) {
        for (const faixa of FAIXAS_ETARIAS_ANS) {
          const { vidas, valor } = bloco.faixas[faixa]
          if (vidas && valor) {
            itens.push({
              faixa_etaria: blocosPlano.length > 1 && bloco.plano ? `${faixa} (${bloco.plano})` : faixa,
              quantidade_vidas: parseInt(vidas, 10),
              valor: parseValorBR(valor),
            })
          }
        }
      }

      const dados = {
        operadora_id: operadoraId,
        operadora_nome_livre: operadoraNome,
        porte: porteCalculado ?? 'Negociado',
        numero_vidas: totalVidas,
        plano: blocosPlano.map((b) => b.plano).filter(Boolean).join(' + ') || null,
        validade: validade || null,
      }

      if (cotacaoExistente) {
        await atualizarCotacao(cotacaoExistente.id, dados, itens)
        setCotacaoSalvaId(cotacaoExistente.id)
        onSalvo()
      } else {
        const novaCotacao = await criarCotacao({ clienteProspectId, casoId: casoId ?? null, dados: { ...dados, status: 'em_analise' }, itens })
        setCotacaoSalvaId(novaCotacao.id)
        // CORREÇÃO (achado real de teste, 17/08): na primeira vez que a
        // Cotação é criada, NÃO fecha o formulário — Cenário Atual e
        // Propostas de Mercado só aparecem depois que existe um id
        // real, e fechar aqui escondia essas seções antes do corretor
        // conseguir vê-las (obrigava reabrir manualmente via "Editar",
        // gerando a falsa impressão de precisar criar outra Cotação).
        // `onCriado` mantém o mesmo formulário aberto, agora em modo
        // edição, com as seções já visíveis.
        if (onCriado) {
          onCriado(novaCotacao)
        } else {
          onSalvo()
        }
      }
    } catch (err) {
      setErro(err.message)
    } finally {
      setSalvando(false)
    }
  }

  return (
    <div className="cotacao-form">
      <div className="cotacao-form-linha">
        <div>
          <label>Operadora</label>
          <select value={operadoraId} onChange={(e) => selecionarOperadora(e.target.value)}>
            <option value="">Selecione...</option>
            {catalogoOperadoras.map((op) => (
              <option key={op.id} value={op.id}>{op.nome}</option>
            ))}
          </select>
        </div>
        <div>
          <label>Validade da proposta</label>
          <input type="date" value={validade ?? ''} onChange={(e) => setValidade(e.target.value)} />
        </div>
      </div>

      <div className="cotacao-resumo">
        <div className="cotacao-resumo-item">
          <span className="cotacao-resumo-label">Porte</span>
          <span className="cotacao-resumo-valor">{porteCalculado ?? '—'}</span>
        </div>
        <div className="cotacao-resumo-item">
          <span className="cotacao-resumo-label">Total de vidas</span>
          <span className="cotacao-resumo-valor">{totalVidas}</span>
        </div>
        <div className="cotacao-resumo-item cotacao-resumo-destaque">
          <span className="cotacao-resumo-label">Valor total mensal</span>
          <span className="cotacao-resumo-valor">
            R$ {totalValor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
          </span>
        </div>
      </div>

      <details className="cotacao-detalhes" open={blocosPlano.length > 1 || totalVidas > 0}>
        <summary>Detalhar por faixa etária e plano (opcional)</summary>

        {blocosPlano.map((bloco, index) => (
          <div key={bloco.id} className="cotacao-bloco-plano">
            <div className="cotacao-bloco-plano-header">
              <input
                className="cotacao-bloco-plano-nome"
                placeholder={`Nome do plano ${index + 1} (ex: Especial 100)`}
                value={bloco.plano}
                onChange={(e) => atualizarNomePlano(bloco.id, e.target.value)}
              />
              {blocosPlano.length > 1 && (
                <button className="cotacao-remover-bloco" onClick={() => removerBloco(bloco.id)}>✕</button>
              )}
            </div>

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
                    value={bloco.faixas[faixa].vidas}
                    onChange={(e) => atualizarFaixa(bloco.id, faixa, 'vidas', e.target.value)}
                  />
                  <input
                    type="text"
                    inputMode="decimal"
                    placeholder="R$ (ex: 350,00)"
                    value={bloco.faixas[faixa].valor}
                    onChange={(e) => atualizarFaixa(bloco.id, faixa, 'valor', e.target.value)}
                  />
                </div>
              ))}
            </div>
          </div>
        ))}

        <button className="ls-btn ls-btn-ghost cotacao-add-bloco" onClick={adicionarBloco}>
          + Adicionar outro plano
        </button>
      </details>

      {erro && <p className="ls-modal-erro">{erro}</p>}

      <div className="ls-modal-acoes">
        <button className="ls-btn ls-btn-ghost" onClick={onCancelar}>Cancelar</button>
        <button className="ls-btn ls-btn-primary" onClick={handleSalvar} disabled={salvando}>
          {salvando ? 'Salvando...' : cotacaoExistente ? 'Salvar alterações' : 'Registrar Cotação'}
        </button>
      </div>

      {cotacaoSalvaId && (
        <div className="cenario-atual-secao">
          <hr className="cenario-atual-separador" />
          <CenarioAtualForm cotacaoId={cotacaoSalvaId} usuarioId={usuario?.id ?? null} />

          <hr className="cenario-atual-separador" />
          <PropostasEstudoForm cotacaoId={cotacaoSalvaId} clienteProspectId={clienteProspectId} itensCotacao={itensParaFinanceiro} usuarioId={usuario?.id ?? null} />

          {/* CORREÇÃO 17/08 — antes só existia "Cancelar" (que soa como
              descartar) pra sair daqui. Agora tem uma ação explícita de
              concluir, já que o formulário fica aberto de propósito
              depois de criar, pra dar tempo do corretor preencher
              Cenário Atual e Propostas antes de voltar pra lista. */}
          <div className="ls-modal-acoes" style={{ marginTop: '1rem' }}>
            <button className="ls-btn ls-btn-primary" onClick={onSalvo}>
              ✓ Concluir e voltar à lista
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
