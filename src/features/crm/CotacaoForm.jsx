import { useEffect, useState } from 'react'
import { criarCotacao, atualizarCotacao, calcularPorte, listarCatalogoOperadoras, parseValorBR } from '../../lib/crm/clientesService'

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

export default function CotacaoForm({ clienteProspectId, cotacaoExistente, casoId, onSalvo, onCancelar }) {
  const [operadoraNome, setOperadoraNome] = useState(cotacaoExistente?.operadora_nome_livre ?? '')
  const [validade, setValidade] = useState(cotacaoExistente?.validade ?? '')
  const [blocosPlano, setBlocosPlano] = useState(() => reconstruirBlocos(cotacaoExistente?.itens_cotacao))
  const [catalogoOperadoras, setCatalogoOperadoras] = useState([])
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState(null)

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
    if (!operadoraNome.trim() || !totalVidas) {
      setErro('Informe ao menos a operadora e o número de vidas em algum plano.')
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
        operadora_nome_livre: operadoraNome,
        porte: porteCalculado ?? 'Negociado',
        numero_vidas: totalVidas,
        plano: blocosPlano.map((b) => b.plano).filter(Boolean).join(' + ') || null,
        validade: validade || null,
      }

      if (cotacaoExistente) {
        await atualizarCotacao(cotacaoExistente.id, dados, itens)
      } else {
        await criarCotacao({ clienteProspectId, casoId: casoId ?? null, dados: { ...dados, status: 'em_analise' }, itens })
      }
      onSalvo()
    } catch (err) {
      setErro(err.message)
    } finally {
      setSalvando(false)
    }
  }

  return (
    <div className="cotacao-form">
      <datalist id="lista-operadoras-cotacao">
        {catalogoOperadoras.map((op) => (
          <option key={op.codigo} value={op.nome} />
        ))}
      </datalist>

      <div className="cotacao-form-linha">
        <div>
          <label>Operadora</label>
          <input list="lista-operadoras-cotacao" value={operadoraNome} onChange={(e) => setOperadoraNome(e.target.value)} placeholder="Ex: Amil, SulAmérica..." />
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
    </div>
  )
}
