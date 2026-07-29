import { useEffect, useState } from 'react'
import { criarClienteProspect, calcularPorte, listarGruposEconomicos, buscarOuCriarGrupoEconomico } from '../../lib/crm/clientesService'
import { operacional } from '../../lib/supabaseSchemas'

export default function NovoClienteModal({ onFechar, onCriado }) {
  // Antes de mostrar qualquer formulário, pergunta se é Empresarial (CNPJ)
  // ou PF/Adesão (CPF) — null = ainda não escolheu.
  const [tipoPessoa, setTipoPessoa] = useState(null)

  return (
    <div className="ls-modal-overlay" onClick={onFechar}>
      <div className="ls-modal" onClick={(e) => e.stopPropagation()}>
        {tipoPessoa === null && (
          <EscolhaTipoPessoa onEscolher={setTipoPessoa} onFechar={onFechar} />
        )}

        {tipoPessoa === 'juridica' && (
          <FormularioEmpresarial onFechar={onFechar} onCriado={onCriado} onVoltar={() => setTipoPessoa(null)} />
        )}

        {tipoPessoa === 'fisica' && (
          <FormularioPessoaFisica onFechar={onFechar} onCriado={onCriado} onVoltar={() => setTipoPessoa(null)} />
        )}
      </div>
    </div>
  )
}

/** Primeira tela: escolher entre Empresarial e PF/Adesão */
function EscolhaTipoPessoa({ onEscolher, onFechar }) {
  return (
    <>
      <h3>Novo Prospect</h3>
      <p className="config-instrucao" style={{ marginBottom: '1rem' }}>
        Este cliente é uma empresa ou uma pessoa física?
      </p>
      <div className="ls-modal-acoes" style={{ justifyContent: 'center', gap: '1rem' }}>
        <button className="ls-btn ls-btn-primary" onClick={() => onEscolher('juridica')}>
          🏢 Empresarial (CNPJ)
        </button>
        <button className="ls-btn ls-btn-primary" onClick={() => onEscolher('fisica')}>
          🧑 PF / Adesão (CPF)
        </button>
      </div>
      <div className="ls-modal-acoes" style={{ marginTop: '1rem' }}>
        <button className="ls-btn ls-btn-ghost" onClick={onFechar}>Cancelar</button>
      </div>
    </>
  )
}

/** Formulário original — cliente Pessoa Jurídica (empresa), sem nenhuma mudança de comportamento */
function FormularioEmpresarial({ onFechar, onCriado, onVoltar }) {
  const [form, setForm] = useState({
    razao_social: '',
    cnpj: '',
    segmento: '',
    numero_colaboradores: '',
    data_vigencia: '',
    origem: '',
    nome_grupo: '',
  })
  const [gruposExistentes, setGruposExistentes] = useState([])
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState(null)

  useEffect(() => {
    listarGruposEconomicos().then(setGruposExistentes).catch(() => {})
  }, [])

  function atualizar(campo, valor) {
    setForm((f) => ({ ...f, [campo]: valor }))
  }

  async function handleSalvar() {
    if (!form.razao_social.trim()) {
      setErro('Informe ao menos o nome da empresa.')
      return
    }
    setSalvando(true)
    setErro(null)
    try {
      const { data: org } = await operacional.from('organizacoes').select('id').limit(1).single()
      const numeroVidas = parseInt(form.numero_colaboradores, 10) || null

      let grupoEconomicoId = null
      if (form.nome_grupo.trim()) {
        const grupo = await buscarOuCriarGrupoEconomico(form.nome_grupo, org.id)
        grupoEconomicoId = grupo.id
      }

      await criarClienteProspect({
        organizacao_id: org.id,
        tipo_pessoa: 'juridica',
        razao_social: form.razao_social,
        cnpj: form.cnpj || null,
        segmento: form.segmento || null,
        numero_colaboradores: numeroVidas,
        porte: numeroVidas ? calcularPorte(numeroVidas) : null,
        data_vigencia: form.data_vigencia || null,
        origem: form.origem || null,
        status: 'prospect',
        grupo_economico_id: grupoEconomicoId,
      })
      onCriado()
    } catch (err) {
      setErro(err.message)
    } finally {
      setSalvando(false)
    }
  }

  return (
    <>
      <h3>Novo Prospect — Empresarial</h3>

      <label>Nome da empresa *</label>
      <input value={form.razao_social} onChange={(e) => atualizar('razao_social', e.target.value)} />

      <label>CNPJ</label>
      <input value={form.cnpj} onChange={(e) => atualizar('cnpj', e.target.value)} placeholder="00.000.000/0001-00" />

      <label>Segmento</label>
      <input value={form.segmento} onChange={(e) => atualizar('segmento', e.target.value)} placeholder="Ex: Tecnologia, Indústria..." />

      <label>Número de colaboradores (vidas deste CNPJ)</label>
      <input
        type="number"
        value={form.numero_colaboradores}
        onChange={(e) => atualizar('numero_colaboradores', e.target.value)}
      />

      <label>Grupo Econômico (se este CNPJ for coligado a outros)</label>
      <input
        list="lista-grupos-economicos"
        value={form.nome_grupo}
        onChange={(e) => atualizar('nome_grupo', e.target.value)}
        placeholder="Ex: Grupo Silva Participações (deixe em branco se não houver)"
      />
      <datalist id="lista-grupos-economicos">
        {gruposExistentes.map((g) => (
          <option key={g.id} value={g.nome_grupo} />
        ))}
      </datalist>
      <p className="config-instrucao" style={{ marginTop: '0.3rem', marginBottom: '0.6rem' }}>
        Se já existir um grupo com esse nome, este CNPJ é vinculado a ele automaticamente
        (o total de vidas do grupo passa a somar todos os CNPJs coligados).
      </p>

      <label>Data de vigência/renovação (se souber)</label>
      <input type="date" value={form.data_vigencia} onChange={(e) => atualizar('data_vigencia', e.target.value)} />

      <label>Origem</label>
      <input value={form.origem} onChange={(e) => atualizar('origem', e.target.value)} placeholder="Indicação, prospecção ativa..." />

      {erro && <p className="ls-modal-erro">{erro}</p>}

      <div className="ls-modal-acoes">
        <button className="ls-btn ls-btn-ghost" onClick={onVoltar}>← Voltar</button>
        <button className="ls-btn ls-btn-ghost" onClick={onFechar}>Cancelar</button>
        <button className="ls-btn ls-btn-primary" onClick={handleSalvar} disabled={salvando}>
          {salvando ? 'Salvando...' : 'Criar Prospect'}
        </button>
      </div>
    </>
  )
}

/** Formulário novo — cliente Pessoa Física / Adesão (sem CNPJ, sem quadro de colaboradores) */
function FormularioPessoaFisica({ onFechar, onCriado, onVoltar }) {
  const [form, setForm] = useState({
    nome_completo: '',
    cpf: '',
    graduacao: '',
    data_vigencia: '',
    origem: '',
  })
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState(null)

  function atualizar(campo, valor) {
    setForm((f) => ({ ...f, [campo]: valor }))
  }

  async function handleSalvar() {
    if (!form.nome_completo.trim()) {
      setErro('Informe o nome completo do cliente.')
      return
    }
    setSalvando(true)
    setErro(null)
    try {
      const { data: org } = await operacional.from('organizacoes').select('id').limit(1).single()

      await criarClienteProspect({
        organizacao_id: org.id,
        tipo_pessoa: 'fisica',
        razao_social: form.nome_completo,
        cpf: form.cpf || null,
        graduacao: form.graduacao || null,
        data_vigencia: form.data_vigencia || null,
        origem: form.origem || null,
        status: 'prospect',
      })
      onCriado()
    } catch (err) {
      setErro(err.message)
    } finally {
      setSalvando(false)
    }
  }

  return (
    <>
      <h3>Novo Prospect — PF / Adesão</h3>

      <label>Nome completo *</label>
      <input value={form.nome_completo} onChange={(e) => atualizar('nome_completo', e.target.value)} />

      <label>CPF</label>
      <input value={form.cpf} onChange={(e) => atualizar('cpf', e.target.value)} placeholder="000.000.000-00" />

      <label>Graduação (se for plano de Adesão via associação/sindicato)</label>
      <input
        value={form.graduacao}
        onChange={(e) => atualizar('graduacao', e.target.value)}
        placeholder="Ex: Engenheiro, Advogado, Contabilista... (deixe em branco se não for Adesão)"
      />

      <label>Data de vigência/renovação (se já tiver um plano)</label>
      <input type="date" value={form.data_vigencia} onChange={(e) => atualizar('data_vigencia', e.target.value)} />
      <p className="config-instrucao" style={{ marginTop: '0.3rem', marginBottom: '0.6rem' }}>
        Deixe em branco se for um plano novo (a maioria dos casos de PF/Adesão).
      </p>

      <label>Origem</label>
      <input value={form.origem} onChange={(e) => atualizar('origem', e.target.value)} placeholder="Indicação, prospecção ativa..." />

      {erro && <p className="ls-modal-erro">{erro}</p>}

      <div className="ls-modal-acoes">
        <button className="ls-btn ls-btn-ghost" onClick={onVoltar}>← Voltar</button>
        <button className="ls-btn ls-btn-ghost" onClick={onFechar}>Cancelar</button>
        <button className="ls-btn ls-btn-primary" onClick={handleSalvar} disabled={salvando}>
          {salvando ? 'Salvando...' : 'Criar Prospect'}
        </button>
      </div>
    </>
  )
}
