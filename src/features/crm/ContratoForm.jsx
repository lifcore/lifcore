import { useEffect, useState } from 'react'
import { criarContrato, atualizarContrato, listarCatalogoOperadoras, parseValorBR } from '../../lib/crm/clientesService'
import { listarProdutos } from '../../lib/crm/catalogoInstitucionalService'
import { enviarAnexo } from '../../lib/especialista/uploadService'

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

/** Reconstrói os blocos de plano a partir dos itens salvos (ex: "00-18 (Diretoria)") */
function reconstruirBlocos(itensContrato) {
  if (!itensContrato?.length) return [novoBlocoPlano()]

  const blocosPorPlano = {}
  for (const item of itensContrato) {
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

export default function ContratoForm({ clienteProspectId, contratoExistente, operadoraInicial, itensIniciais, onSalvo, onCancelar }) {
  const [produto, setProduto] = useState(contratoExistente?.produto ?? '')
  const [operadoraNome, setOperadoraNome] = useState(contratoExistente?.operadora_nome_livre ?? operadoraInicial ?? '')
  const [modalidade, setModalidade] = useState(contratoExistente?.modalidade ?? '')
  const [numeroApolice, setNumeroApolice] = useState(contratoExistente?.numero_apolice ?? '')
  const [vigenciaInicio, setVigenciaInicio] = useState(contratoExistente?.vigencia_inicio ?? '')
  const [vigenciaFim, setVigenciaFim] = useState(contratoExistente?.vigencia_fim ?? '')
  const [reajuste, setReajuste] = useState(contratoExistente?.reajuste_percentual ?? '')
  const [status, setStatus] = useState(contratoExistente?.status ?? 'ativo')
  const [catalogoOperadoras, setCatalogoOperadoras] = useState([])
  const [produtos, setProdutos] = useState([])
  const [anexoContratoUrl, setAnexoContratoUrl] = useState(contratoExistente?.anexo_contrato_url ?? null)
  const [anexoPropostaUrl, setAnexoPropostaUrl] = useState(contratoExistente?.anexo_proposta_url ?? null)
  const [enviandoAnexo, setEnviandoAnexo] = useState(null)
  const [blocosPlano, setBlocosPlano] = useState(() => reconstruirBlocos(contratoExistente?.itens_contrato ?? itensIniciais))
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState(null)

  useEffect(() => {
    listarCatalogoOperadoras().then(setCatalogoOperadoras).catch(() => {})
    listarProdutos({ modulo: 'saude' }).then(setProdutos).catch(() => {})
  }, [])

  const totalVidas = blocosPlano.reduce(
    (soma, bloco) => soma + Object.values(bloco.faixas).reduce((s, f) => s + (parseInt(f.vidas, 10) || 0), 0),
    0
  )
  const totalValor = blocosPlano.reduce(
    (soma, bloco) =>
      soma + Object.values(bloco.faixas).reduce((s, f) => s + (parseInt(f.vidas, 10) || 0) * parseValorBR(f.valor), 0),
    0
  )

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

  function handleVigenciaInicioChange(valor) {
    setVigenciaInicio(valor)
    if (valor && !vigenciaFim) {
      const data = new Date(valor)
      data.setFullYear(data.getFullYear() + 1)
      setVigenciaFim(data.toISOString().slice(0, 10))
    }
  }

  async function handleUploadAnexo(tipo, arquivo) {
    if (!arquivo) return
    setEnviandoAnexo(tipo)
    try {
      const resultado = await enviarAnexo(arquivo, `contrato-${clienteProspectId}`)
      if (tipo === 'contrato') setAnexoContratoUrl(resultado.url)
      else setAnexoPropostaUrl(resultado.url)
    } catch (err) {
      setErro(err.message)
    } finally {
      setEnviandoAnexo(null)
    }
  }

  async function handleSalvar() {
    if (!produto) {
      setErro('Selecione o produto (Saúde, Odonto ou Saúde e Odonto).')
      return
    }
    if (!operadoraNome.trim()) {
      setErro('Informe a operadora.')
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

      if (itens.length === 0) {
        setErro('Informe ao menos uma faixa etária com vidas e valor — sem isso o Contrato salva sem receita nenhuma.')
        setSalvando(false)
        return
      }

      const dados = {
        produto,
        operadora_nome_livre: operadoraNome,
        plano: blocosPlano.map((b) => b.plano).filter(Boolean).join(' + ') || null,
        modalidade: modalidade || null,
        numero_apolice: numeroApolice || null,
        vigencia_inicio: vigenciaInicio || null,
        vigencia_fim: vigenciaFim || null,
        reajuste_percentual: reajuste ? parseFloat(reajuste) : null,
        status,
        anexo_contrato_url: anexoContratoUrl,
        anexo_proposta_url: anexoPropostaUrl,
      }

      let contratoResultado
      if (contratoExistente) {
        contratoResultado = await atualizarContrato(contratoExistente.id, dados, itens)
      } else {
        contratoResultado = await criarContrato(clienteProspectId, dados, itens)
      }
      onSalvo(contratoResultado)
    } catch (err) {
      setErro(err.message)
    } finally {
      setSalvando(false)
    }
  }

  return (
    <div className="cotacao-form">
      <datalist id="lista-operadoras-contrato">
        {catalogoOperadoras.map((op) => (
          <option key={op.codigo} value={op.nome} />
        ))}
      </datalist>

      <div className="cotacao-form-linha">
        <div>
          <label>Produto</label>
          <select value={produto} onChange={(e) => setProduto(e.target.value)}>
            <option value="">Selecione...</option>
            {produtos.map((p) => (
              <option key={p.id} value={p.nome}>{p.nome}</option>
            ))}
          </select>
        </div>
        <div>
          <label>Operadora</label>
          <input list="lista-operadoras-contrato" value={operadoraNome} onChange={(e) => setOperadoraNome(e.target.value)} placeholder="Comece a digitar..." />
        </div>
        <div>
          <label>Modalidade</label>
          <input value={modalidade} onChange={(e) => setModalidade(e.target.value)} placeholder="PME1, PME2, Adesão..." />
        </div>
        <div>
          <label>Número da apólice/contrato na operadora</label>
          <input value={numeroApolice} onChange={(e) => setNumeroApolice(e.target.value)} />
        </div>
      </div>

      <div className="cotacao-form-linha">
        <div>
          <label>Reajuste (%)</label>
          <input type="number" step="0.01" value={reajuste} onChange={(e) => setReajuste(e.target.value)} />
        </div>
        <div>
          <label>Status</label>
          <select value={status} onChange={(e) => setStatus(e.target.value)} className="demanda-select-status">
            <option value="ativo">Ativo (cliente nosso)</option>
            <option value="em_negociacao">Em negociação</option>
            <option value="externo_prospeccao">Plano atual — ainda NÃO é nosso cliente (só acompanhar vigência)</option>
            <option value="encerrado">Encerrado</option>
          </select>
        </div>
      </div>

      <div className="cotacao-form-linha">
        <div>
          <label>Vigência início</label>
          <input type="date" value={vigenciaInicio ?? ''} onChange={(e) => handleVigenciaInicioChange(e.target.value)} />
        </div>
        <div>
          <label>Vigência fim (renovação) — sugestão automática de 12 meses, ajuste se for 24</label>
          <input type="date" value={vigenciaFim ?? ''} onChange={(e) => setVigenciaFim(e.target.value)} />
        </div>
      </div>

      <div className="cotacao-form-linha">
        <div>
          <label>📎 Contrato assinado (opcional)</label>
          <input type="file" onChange={(e) => handleUploadAnexo('contrato', e.target.files?.[0])} />
          {enviandoAnexo === 'contrato' && <span className="cotacao-anexo-status">Enviando...</span>}
          {anexoContratoUrl && <a href={anexoContratoUrl} target="_blank" rel="noreferrer" className="cotacao-anexo-link">Ver arquivo enviado</a>}
        </div>
        <div>
          <label>📎 Proposta (opcional)</label>
          <input type="file" onChange={(e) => handleUploadAnexo('proposta', e.target.files?.[0])} />
          {enviandoAnexo === 'proposta' && <span className="cotacao-anexo-status">Enviando...</span>}
          {anexoPropostaUrl && <a href={anexoPropostaUrl} target="_blank" rel="noreferrer" className="cotacao-anexo-link">Ver arquivo enviado</a>}
        </div>
      </div>

      <div className="cotacao-resumo">
        <div className="cotacao-resumo-item">
          <span className="cotacao-resumo-label">Total de vidas (todos os planos)</span>
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
        <summary>Detalhar por faixa etária e plano — use "+ Adicionar outro plano" quando o mesmo contrato tiver grupos diferentes (ex: fábrica, gestores, diretoria)</summary>

        {blocosPlano.map((bloco, index) => (
          <div key={bloco.id} className="cotacao-bloco-plano">
            <div className="cotacao-bloco-plano-header">
              <input
                className="cotacao-bloco-plano-nome"
                placeholder={`Nome do grupo/plano ${index + 1} (ex: Fábrica, Gestores, Diretoria)`}
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
          + Adicionar outro plano (mesmo contrato)
        </button>
      </details>

      {erro && <p className="ls-modal-erro">{erro}</p>}

      <div className="ls-modal-acoes">
        <button className="ls-btn ls-btn-ghost" onClick={onCancelar}>Cancelar</button>
        <button className="ls-btn ls-btn-primary" onClick={handleSalvar} disabled={salvando}>
          {salvando ? 'Salvando...' : contratoExistente ? 'Salvar alterações' : 'Criar Contrato'}
        </button>
      </div>
    </div>
  )
}
