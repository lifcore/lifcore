import { useState } from 'react'
import { criarClienteProspect, calcularPorte } from '../../lib/crm/clientesService'
import { operacional } from '../../lib/supabaseSchemas'
import { useAuth } from '../auth/AuthContext'

export default function NovoClienteModal({ onFechar, onCriado, corretorAlvoId }) {
  const [tipoPessoa, setTipoPessoa] = useState(null)

  return (
    <div className="ls-modal-overlay" onClick={onFechar}>
      <div className="ls-modal" onClick={(e) => e.stopPropagation()}>
        {tipoPessoa === null && (
          <EscolhaTipoPessoa onEscolher={setTipoPessoa} onFechar={onFechar} />
        )}

        {tipoPessoa === 'juridica' && (
          <FormularioEmpresarial onFechar={onFechar} onCriado={onCriado} onVoltar={() => setTipoPessoa(null)} corretorAlvoId={corretorAlvoId} />
        )}

        {tipoPessoa === 'fisica' && (
          <FormularioPessoaFisica onFechar={onFechar} onCriado={onCriado} onVoltar={() => setTipoPessoa(null)} corretorAlvoId={corretorAlvoId} />
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
function novaLinhaEmpresa() {
  return { id: crypto.randomUUID(), cnpj: '', nome: '', numero_colaboradores: '' }
}

/** Formulário original — cliente Pessoa Jurídica (empresa ou grupo econômico com várias empresas) */
function FormularioEmpresarial({ onFechar, onCriado, onVoltar, corretorAlvoId }) {
  const { perfil } = useAuth()
  const [empresas, setEmpresas] = useState([novaLinhaEmpresa()])
  const [nomeGrupo, setNomeGrupo] = useState('')
  const [segmento, setSegmento] = useState('')
  const [dataVigencia, setDataVigencia] = useState('')
  const [origem, setOrigem] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState(null)

  const ehGrupo = empresas.length > 1

  function atualizarEmpresa(id, campo, valor) {
    setEmpresas((lista) => lista.map((e) => (e.id === id ? { ...e, [campo]: valor } : e)))
  }

  function adicionarEmpresa() {
    setEmpresas((lista) => [...lista, novaLinhaEmpresa()])
  }

  function removerEmpresa(id) {
    setEmpresas((lista) => (lista.length > 1 ? lista.filter((e) => e.id !== id) : lista))
  }

  async function handleSalvar() {
    if (!empresas[0].nome.trim()) {
      setErro('Informe ao menos o nome da primeira empresa.')
      return
    }
    if (ehGrupo && !nomeGrupo.trim()) {
      setErro('Como este cadastro tem mais de uma empresa, informe um nome pra identificar o grupo.')
      return
    }
    setSalvando(true)
    setErro(null)
    try {
      const { data: org } = await operacional.from('organizacoes').select('id').limit(1).single()

      const empresasLimpas = empresas.map((e) => ({
        cnpj: e.cnpj || null,
        nome: e.nome,
        numero_colaboradores: parseInt(e.numero_colaboradores, 10) || 0,
      }))
      const numeroVidasTotal = empresasLimpas.reduce((soma, e) => soma + e.numero_colaboradores, 0)

      await criarClienteProspect({
        organizacao_id: org.id,
        corretor_id: corretorAlvoId ?? perfil.id,
        tipo_pessoa: 'juridica',
        razao_social: ehGrupo ? nomeGrupo : empresasLimpas[0].nome,
        cnpj: ehGrupo ? null : empresasLimpas[0].cnpj,
        segmento: segmento || null,
        numero_colaboradores: numeroVidasTotal || null,
        porte: numeroVidasTotal ? calcularPorte(numeroVidasTotal) : null,
        data_vigencia: dataVigencia || null,
        origem: origem || null,
        status: 'prospect',
        empresas_grupo: ehGrupo ? empresasLimpas : null,
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

      {ehGrupo && (
        <>
          <label>Nome do grupo *</label>
          <input
            value={nomeGrupo}
            onChange={(e) => setNomeGrupo(e.target.value)}
            placeholder="Ex: Grupo Silva Participações"
          />
        </>
      )}

      <h4 style={{ marginTop: '0.9rem' }}>
        {ehGrupo ? 'Empresas do grupo' : 'Empresa'}
      </h4>

      {empresas.map((empresa, index) => (
        <div key={empresa.id} className="ls-card" style={{ padding: '0.75rem', marginBottom: '0.6rem' }}>
          {ehGrupo && (
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.3rem' }}>
              <strong>Empresa {index + 1}</strong>
              <button className="cotacao-remover-bloco" onClick={() => removerEmpresa(empresa.id)}>✕</button>
            </div>
          )}
          <div className="cotacao-form-linha">
            <div>
              <label>Nome da empresa {index === 0 ? '*' : ''}</label>
              <input
                value={empresa.nome}
                onChange={(e) => atualizarEmpresa(empresa.id, 'nome', e.target.value)}
              />
            </div>
            <div>
              <label>CNPJ</label>
              <input
                value={empresa.cnpj}
                onChange={(e) => atualizarEmpresa(empresa.id, 'cnpj', e.target.value)}
                placeholder="00.000.000/0001-00"
              />
            </div>
            <div>
              <label>Número de colaboradores</label>
              <input
                type="number"
                value={empresa.numero_colaboradores}
                onChange={(e) => atualizarEmpresa(empresa.id, 'numero_colaboradores', e.target.value)}
              />
            </div>
          </div>
        </div>
      ))}

      <button className="ls-btn ls-btn-ghost cotacao-add-bloco" onClick={adicionarEmpresa}>
        + Adicionar outra empresa (grupo econômico)
      </button>
      <p className="config-instrucao" style={{ marginTop: '0.3rem', marginBottom: '0.8rem' }}>
        Adicionar mais de uma empresa cria um único cadastro pro grupo inteiro — o Especialista
        entende como um só cliente (ex: "50 vidas"), com contratos, cotações e demandas
        centralizados. Deixe só 1 empresa se não for o caso.
      </p>

      <label>Segmento</label>
      <input value={segmento} onChange={(e) => setSegmento(e.target.value)} placeholder="Ex: Tecnologia, Indústria..." />

      <label>Data de vigência/renovação (se souber)</label>
      <input type="date" value={dataVigencia} onChange={(e) => setDataVigencia(e.target.value)} />

      <label>Origem</label>
      <input value={origem} onChange={(e) => setOrigem(e.target.value)} placeholder="Indicação, prospecção ativa..." />

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
function FormularioPessoaFisica({ onFechar, onCriado, onVoltar, corretorAlvoId }) {
  const { perfil } = useAuth()
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
        corretor_id: corretorAlvoId ?? perfil.id,
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

