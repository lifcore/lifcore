import { useEffect, useState } from 'react'
import { criarClienteProspect, calcularPorte, listarGruposEconomicos, buscarOuCriarGrupoEconomico } from '../../lib/crm/clientesService'
import { operacional } from '../../lib/supabaseSchemas'

export default function NovoClienteModal({ onFechar, onCriado }) {
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
    <div className="ls-modal-overlay" onClick={onFechar}>
      <div className="ls-modal" onClick={(e) => e.stopPropagation()}>
        <h3>Novo Prospect</h3>

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
          <button className="ls-btn ls-btn-ghost" onClick={onFechar}>Cancelar</button>
          <button className="ls-btn ls-btn-primary" onClick={handleSalvar} disabled={salvando}>
            {salvando ? 'Salvando...' : 'Criar Prospect'}
          </button>
        </div>
      </div>
    </div>
  )
}
