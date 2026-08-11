import { useState, useEffect } from 'react'
import { useAuth } from '../auth/AuthContext'
import { operacional } from '../../lib/supabaseSchemas'
import { parseValorBR } from '../../lib/crm/clientesService'
import { criarApoliceAuto, atualizarApoliceAuto } from '../../lib/crm/lifleetService'
import { listarCatalogoSeguradoras } from '../../lib/crm/apolicesService'

function novoVeiculo() {
  return {
    id: crypto.randomUUID(),
    placa: '',
    marca: '',
    modelo: '',
    ano_fabricacao: '',
    ano_modelo: '',
    chassi: '',
    renavam: '',
    tipo_veiculo: '',
    uso: 'Particular',
  }
}

export default function ApoliceAutoForm({ clienteProspectId, tipoPessoa, apoliceExistente, onSalvo, onCancelar }) {
  const { perfil } = useAuth()
  const [seguradoraNome, setSeguradoraNome] = useState(apoliceExistente?.operadora_nome_livre ?? '')
  const [numeroApolice, setNumeroApolice] = useState(apoliceExistente?.numero_apolice ?? '')
  const [premio, setPremio] = useState(apoliceExistente?.premio ?? '')
  const [formaPagamentoVezes, setFormaPagamentoVezes] = useState(apoliceExistente?.forma_pagamento_vezes ?? '1')
  const [comissionamento, setComissionamento] = useState(apoliceExistente?.comissionamento_percentual ?? '')
  const [vigenciaInicio, setVigenciaInicio] = useState(apoliceExistente?.vigencia_inicio ?? '')
  const [vigenciaFim, setVigenciaFim] = useState(apoliceExistente?.vigencia_fim ?? '')
  const [catalogoSeguradoras, setCatalogoSeguradoras] = useState([])
  const [veiculos, setVeiculos] = useState(() => {
    if (apoliceExistente?.veiculos?.length) {
      return apoliceExistente.veiculos.map((v) => ({ ...v, id: v.id ?? crypto.randomUUID() }))
    }
    return [novoVeiculo()]
  })
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState(null)

  const ehPessoaFisica = tipoPessoa === 'fisica'

  useEffect(() => {
    listarCatalogoSeguradoras().then(setCatalogoSeguradoras).catch(() => {})
  }, [])

  function atualizarVeiculo(id, campo, valor) {
    setVeiculos((lista) => lista.map((v) => (v.id === id ? { ...v, [campo]: valor } : v)))
  }

  function adicionarVeiculo() {
    if (ehPessoaFisica) return // regra: PF nunca tem mais de 1 veículo por apólice
    setVeiculos((lista) => [...lista, novoVeiculo()])
  }

  function removerVeiculo(id) {
    setVeiculos((lista) => (lista.length > 1 ? lista.filter((v) => v.id !== id) : lista))
  }

  async function handleSalvar() {
    if (!seguradoraNome.trim() || !premio) {
      setErro('Informe ao menos a seguradora e o valor da apólice.')
      return
    }
    if (veiculos.some((v) => !v.placa.trim())) {
      setErro('Informe a placa de todos os veículos.')
      return
    }
    setSalvando(true)
    setErro(null)
    try {
      const veiculosLimpos = veiculos.map(({ id, ...resto }) => ({
        ...resto,
        ano_fabricacao: resto.ano_fabricacao ? parseInt(resto.ano_fabricacao, 10) : null,
        ano_modelo: resto.ano_modelo ? parseInt(resto.ano_modelo, 10) : null,
      }))

      const dados = {
        operadora_nome_livre: seguradoraNome,
        numero_apolice: numeroApolice || null,
        premio: parseValorBR(premio),
        forma_pagamento_vezes: parseInt(formaPagamentoVezes, 10) || 1,
        comissionamento_percentual: comissionamento ? parseValorBR(comissionamento) : null,
        vigencia_inicio: vigenciaInicio || null,
        vigencia_fim: vigenciaFim || null,
      }

      let apoliceResultado
      if (apoliceExistente) {
        apoliceResultado = await atualizarApoliceAuto({
          apoliceId: apoliceExistente.id,
          clienteProspectId,
          tipoPessoa,
          dados,
          veiculos: veiculosLimpos,
        })
      } else {
        const { data: org } = await operacional.from('organizacoes').select('id').limit(1).single()
        apoliceResultado = await criarApoliceAuto({
          corretorId: perfil.id,
          organizacaoId: org.id,
          clienteProspectId,
          tipoPessoa,
          dados,
          veiculos: veiculosLimpos,
        })
      }
      onSalvo(apoliceResultado)
    } catch (err) {
      setErro(err.message)
    } finally {
      setSalvando(false)
    }
  }

  return (
    <div className="cotacao-form">
      <datalist id="lista-seguradoras-apolice-lifleet">
        {catalogoSeguradoras.map((s) => (
          <option key={s.id} value={s.nome} />
        ))}
      </datalist>

      <div className="cotacao-form-linha">
        <div>
          <label>Seguradora</label>
          <input
            list="lista-seguradoras-apolice-lifleet"
            value={seguradoraNome}
            onChange={(e) => setSeguradoraNome(e.target.value)}
            placeholder="Comece a digitar..."
          />
        </div>
        <div>
          <label>Número da apólice</label>
          <input value={numeroApolice} onChange={(e) => setNumeroApolice(e.target.value)} />
        </div>
        <div>
          <label>Valor fechado (R$)</label>
          <input value={premio} onChange={(e) => setPremio(e.target.value)} placeholder="Ex: 3200,00" />
        </div>
      </div>

      <div className="cotacao-form-linha">
        <div>
          <label>Forma de pagamento (nº de vezes)</label>
          <input type="number" value={formaPagamentoVezes} onChange={(e) => setFormaPagamentoVezes(e.target.value)} />
        </div>
        <div>
          <label>Comissionamento (%) — informativo</label>
          <input value={comissionamento} onChange={(e) => setComissionamento(e.target.value)} placeholder="Ex: 20" />
        </div>
        <div>
          <label>Vigência início</label>
          <input type="date" value={vigenciaInicio} onChange={(e) => setVigenciaInicio(e.target.value)} />
        </div>
        <div>
          <label>Vigência fim</label>
          <input type="date" value={vigenciaFim} onChange={(e) => setVigenciaFim(e.target.value)} />
        </div>
      </div>

      <h4 style={{ marginTop: '1.25rem' }}>
        {ehPessoaFisica ? 'Veículo' : 'Veículo(s) — mais de 1 vira Frota automaticamente'}
      </h4>

      {veiculos.map((v, index) => (
        <div key={v.id} className="ls-card" style={{ padding: '0.85rem', marginBottom: '0.75rem' }}>
          {!ehPessoaFisica && veiculos.length > 1 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.4rem' }}>
              <strong>Veículo {index + 1}</strong>
              <button className="cotacao-remover-bloco" onClick={() => removerVeiculo(v.id)}>✕</button>
            </div>
          )}
          <div className="cotacao-form-linha">
            <div>
              <label>Placa *</label>
              <input value={v.placa} onChange={(e) => atualizarVeiculo(v.id, 'placa', e.target.value.toUpperCase())} placeholder="ABC1D23" />
            </div>
            <div>
              <label>Marca</label>
              <input value={v.marca} onChange={(e) => atualizarVeiculo(v.id, 'marca', e.target.value)} />
            </div>
            <div>
              <label>Modelo</label>
              <input value={v.modelo} onChange={(e) => atualizarVeiculo(v.id, 'modelo', e.target.value)} />
            </div>
          </div>
          <div className="cotacao-form-linha">
            <div>
              <label>Ano fabricação</label>
              <input type="number" value={v.ano_fabricacao} onChange={(e) => atualizarVeiculo(v.id, 'ano_fabricacao', e.target.value)} />
            </div>
            <div>
              <label>Ano modelo</label>
              <input type="number" value={v.ano_modelo} onChange={(e) => atualizarVeiculo(v.id, 'ano_modelo', e.target.value)} />
            </div>
            <div>
              <label>Tipo</label>
              <input value={v.tipo_veiculo} onChange={(e) => atualizarVeiculo(v.id, 'tipo_veiculo', e.target.value)} placeholder="Passeio, Moto, Utilitário..." />
            </div>
            <div>
              <label>Uso</label>
              <select value={v.uso} onChange={(e) => atualizarVeiculo(v.id, 'uso', e.target.value)}>
                <option value="Particular">Particular</option>
                <option value="Comercial">Comercial</option>
              </select>
            </div>
          </div>
          <div className="cotacao-form-linha">
            <div>
              <label>Chassi</label>
              <input value={v.chassi} onChange={(e) => atualizarVeiculo(v.id, 'chassi', e.target.value)} />
            </div>
            <div>
              <label>Renavam</label>
              <input value={v.renavam} onChange={(e) => atualizarVeiculo(v.id, 'renavam', e.target.value)} />
            </div>
          </div>
        </div>
      ))}

      {ehPessoaFisica ? (
        <p className="config-instrucao">
          Cliente Pessoa Física: cada apólice cobre só 1 veículo. Para outro carro, crie uma nova apólice.
        </p>
      ) : (
        <button className="ls-btn ls-btn-ghost cotacao-add-bloco" onClick={adicionarVeiculo}>
          + Adicionar outro veículo (frota)
        </button>
      )}

      {erro && <p className="ls-modal-erro">{erro}</p>}

      <div className="ls-modal-acoes">
        <button className="ls-btn ls-btn-ghost" onClick={onCancelar}>Cancelar</button>
        <button className="ls-btn ls-btn-primary" onClick={handleSalvar} disabled={salvando}>
          {salvando ? 'Salvando...' : apoliceExistente ? 'Salvar alterações' : 'Lançar Apólice'}
        </button>
      </div>
    </div>
  )
}
