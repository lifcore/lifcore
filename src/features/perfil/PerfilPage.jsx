import { useEffect, useState } from 'react'
import '../../styles/lcds-tokens.css'
import { useAuth } from '../auth/AuthContext'
import { supabase } from '../../lib/supabaseClient'
import { operacional } from '../../lib/supabaseSchemas'
import { buscarPreferenciasIa, salvarPreferenciasIa, PREFERENCIAS_IA_PADRAO } from '../../lib/especialista/preferenciasIaService'

export default function PerfilPage() {
  const { perfil } = useAuth()
  const [abaAtiva, setAbaAtiva] = useState('perfil')
  const [nome, setNome] = useState(perfil?.nome_completo ?? '')
  const [telefone, setTelefone] = useState(perfil?.telefone ?? '')
  const [cpf, setCpf] = useState(perfil?.cpf ?? '')
  const [endereco, setEndereco] = useState(perfil?.endereco ?? '')
  const [banco, setBanco] = useState(perfil?.banco ?? '')
  const [agencia, setAgencia] = useState(perfil?.agencia ?? '')
  const [conta, setConta] = useState(perfil?.conta ?? '')
  const [tipoConta, setTipoConta] = useState(perfil?.tipo_conta ?? 'corrente')
  const [chavePix, setChavePix] = useState(perfil?.chave_pix ?? '')
  const [salvandoPerfil, setSalvandoPerfil] = useState(false)
  const [sucessoPerfil, setSucessoPerfil] = useState(null)

  const [corretora, setCorretora] = useState({ razao_social: '', cnpj: '', susep: '', telefone: '', endereco: '' })
  const [salvandoCorretora, setSalvandoCorretora] = useState(false)
  const [sucessoCorretora, setSucessoCorretora] = useState(null)
  const podeEditarCorretora = perfil?.papel === 'master' || perfil?.papel === 'administrador'

  useEffect(() => {
    operacional
      .from('organizacoes')
      .select('*')
      .limit(1)
      .single()
      .then(({ data }) => {
        if (data) setCorretora(data)
      })
  }, [])

  async function handleSalvarPerfil() {
    setSalvandoPerfil(true)
    setSucessoPerfil(null)
    const { error } = await supabase
      .from('perfis')
      .update({
        nome_completo: nome,
        telefone,
        cpf,
        endereco,
        banco,
        agencia,
        conta,
        tipo_conta: tipoConta,
        chave_pix: chavePix,
      })
      .eq('id', perfil.id)
    setSalvandoPerfil(false)
    if (!error) setSucessoPerfil('Perfil atualizado com sucesso.')
  }

  async function handleSalvarCorretora() {
    setSalvandoCorretora(true)
    setSucessoCorretora(null)
    const { error } = await operacional
      .from('organizacoes')
      .update({
        cnpj: corretora.cnpj,
        susep: corretora.susep,
        telefone: corretora.telefone,
        endereco: corretora.endereco,
      })
      .eq('id', corretora.id)
    setSalvandoCorretora(false)
    if (!error) setSucessoCorretora('Dados da corretora atualizados.')
  }

  return (
    <div className="config-page" data-theme="lcds">
      <h2>Meu Perfil</h2>

      <div className="cliente-abas" style={{ marginBottom: '1rem' }}>
        <button className={`cliente-aba ${abaAtiva === 'perfil' ? 'cliente-aba-ativa' : ''}`} onClick={() => setAbaAtiva('perfil')}>Perfil</button>
        <button className={`cliente-aba ${abaAtiva === 'ia' ? 'cliente-aba-ativa' : ''}`} onClick={() => setAbaAtiva('ia')}>🤖 Experiência Inteligente</button>
      </div>

      {abaAtiva === 'ia' && <ExperienciaInteligenteTab usuarioId={perfil?.id} />}

      {abaAtiva === 'perfil' && (
      <>
      <div className="ls-card config-card">
        <div className="config-form-grid">
          <div>
            <label>Nome completo</label>
            <input value={nome} onChange={(e) => setNome(e.target.value)} />
          </div>
          <div>
            <label>E-mail (login)</label>
            <input value={perfil?.email ?? ''} disabled />
          </div>

          <div>
            <label>Telefone / Celular</label>
            <input value={telefone ?? ''} onChange={(e) => setTelefone(e.target.value)} placeholder="(11) 91234-5678" />
          </div>
          <div>
            <label>CPF</label>
            <input value={cpf ?? ''} onChange={(e) => setCpf(e.target.value)} placeholder="000.000.000-00" />
          </div>

          <div>
            <label>Papel</label>
            <input value={perfil?.papel ?? ''} disabled />
          </div>
          <div>
            <label>Endereço (opcional)</label>
            <input value={endereco ?? ''} onChange={(e) => setEndereco(e.target.value)} placeholder="Rua, número, cidade..." />
          </div>
        </div>

        <h4 style={{ marginTop: '1.5rem' }}>Dados Bancários</h4>
        <p className="config-instrucao">Usados para pagamento de comissão.</p>

        <div className="config-form-grid">
          <div>
            <label>Banco</label>
            <input value={banco ?? ''} onChange={(e) => setBanco(e.target.value)} placeholder="Ex: Itaú, Nubank..." />
          </div>
          <div>
            <label>Agência</label>
            <input value={agencia ?? ''} onChange={(e) => setAgencia(e.target.value)} />
          </div>

          <div>
            <label>Conta</label>
            <input value={conta ?? ''} onChange={(e) => setConta(e.target.value)} />
          </div>
          <div>
            <label>Tipo de Conta</label>
            <select value={tipoConta} onChange={(e) => setTipoConta(e.target.value)}>
              <option value="corrente">Corrente</option>
              <option value="poupanca">Poupança</option>
            </select>
          </div>

          <div className="config-campo-largo">
            <label>Chave PIX (opcional)</label>
            <input value={chavePix ?? ''} onChange={(e) => setChavePix(e.target.value)} placeholder="CPF, e-mail, telefone ou chave aleatória" />
          </div>
        </div>

        {sucessoPerfil && <p className="config-sucesso">{sucessoPerfil}</p>}

        <button className="ls-btn ls-btn-primary" onClick={handleSalvarPerfil} disabled={salvandoPerfil} style={{ marginTop: '1rem' }}>
          {salvandoPerfil ? 'Salvando...' : 'Salvar perfil'}
        </button>
      </div>

      <div className="ls-card config-card" style={{ marginTop: '1.25rem' }}>
        <h4 style={{ marginTop: 0 }}>Dados da Corretora</h4>
        <p className="config-instrucao">
          Não aparecem nas mensagens automáticas — ficam aqui só para consulta rápida,
          caso um cliente peça CNPJ/SUSEP da LifitSeg.
        </p>

        <div className="config-form-grid">
          <div className="config-campo-largo">
            <label>Razão Social</label>
            <input value={corretora.razao_social ?? ''} disabled />
          </div>

          <div>
            <label>CNPJ</label>
            <input
              value={corretora.cnpj ?? ''}
              onChange={(e) => setCorretora({ ...corretora, cnpj: e.target.value })}
              disabled={!podeEditarCorretora}
            />
          </div>

          <div>
            <label>Registro SUSEP</label>
            <input
              value={corretora.susep ?? ''}
              onChange={(e) => setCorretora({ ...corretora, susep: e.target.value })}
              disabled={!podeEditarCorretora}
            />
          </div>

          <div>
            <label>Telefone</label>
            <input
              value={corretora.telefone ?? ''}
              onChange={(e) => setCorretora({ ...corretora, telefone: e.target.value })}
              disabled={!podeEditarCorretora}
            />
          </div>

          <div>
            <label>Endereço</label>
            <input
              value={corretora.endereco ?? ''}
              onChange={(e) => setCorretora({ ...corretora, endereco: e.target.value })}
              disabled={!podeEditarCorretora}
            />
          </div>
        </div>

        {sucessoCorretora && <p className="config-sucesso">{sucessoCorretora}</p>}

        {podeEditarCorretora ? (
          <button className="ls-btn ls-btn-primary" onClick={handleSalvarCorretora} disabled={salvandoCorretora} style={{ marginTop: '1rem' }}>
            {salvandoCorretora ? 'Salvando...' : 'Salvar dados da corretora'}
          </button>
        ) : (
          <p className="config-instrucao">Somente master/administrador podem editar estes dados.</p>
        )}
      </div>
      </>
      )}
    </div>
  )
}

/**
 * Aba "🤖 Experiência Inteligente" (Sprint Meu Perfil v2 — AI
 * Experience Engine). Todas as preferências ficam num único JSONB
 * (preferencias_ia), lidas/gravadas via preferenciasIaService — nunca
 * direto pelo componente. O Especialista nunca lê essa tabela
 * diretamente: sempre passa pelo specialistGateway.
 */
function ExperienciaInteligenteTab({ usuarioId }) {
  const [prefs, setPrefs] = useState(PREFERENCIAS_IA_PADRAO)
  const [carregando, setCarregando] = useState(true)
  const [salvando, setSalvando] = useState(false)
  const [sucesso, setSucesso] = useState(null)
  const [erro, setErro] = useState(null)

  useEffect(() => {
    if (!usuarioId) return
    buscarPreferenciasIa(usuarioId)
      .then(setPrefs)
      .finally(() => setCarregando(false))
  }, [usuarioId])

  function atualizar(campo, valor) {
    setPrefs((p) => ({ ...p, [campo]: valor }))
    setSucesso(null)
  }

  function atualizarRecurso(chave, valor) {
    setPrefs((p) => ({ ...p, recursos: { ...p.recursos, [chave]: valor } }))
    setSucesso(null)
  }

  function atualizarEspecialista(chave, valor) {
    setPrefs((p) => ({ ...p, especialistas: { ...p.especialistas, [chave]: valor } }))
    setSucesso(null)
  }

  async function handleSalvar() {
    setSalvando(true)
    setErro(null)
    setSucesso(null)
    try {
      await salvarPreferenciasIa(usuarioId, prefs)
      setSucesso('Preferências salvas — os Especialistas já vão aplicar a partir da próxima mensagem.')
    } catch (err) {
      setErro(err.message)
    } finally {
      setSalvando(false)
    }
  }

  if (carregando) return <p className="cliente-carregando">Carregando preferências...</p>

  return (
    <div className="ls-card config-card">
      <p className="config-instrucao">
        Essas preferências mudam SÓ a forma como os Especialistas de IA se comunicam com você — o
        conhecimento e as regras de cada um continuam exatamente os mesmos.
      </p>

      <div className="config-form-grid">
        <div>
          <label>Estilo de comunicação</label>
          <select value={prefs.estilo} onChange={(e) => atualizar('estilo', e.target.value)}>
            <option value="executivo">Executivo</option>
            <option value="equilibrado">Equilibrado</option>
            <option value="consultivo">Consultivo</option>
            <option value="didatico">Didático</option>
          </select>
        </div>

        <div>
          <label>Profundidade das respostas</label>
          <select value={prefs.profundidade} onChange={(e) => atualizar('profundidade', e.target.value)}>
            <option value="rapida">Resposta rápida</option>
            <option value="completa">Completa</option>
            <option value="estrategica">Análise estratégica</option>
          </select>
        </div>

        <div>
          <label>Formato preferido</label>
          <select value={prefs.formato} onChange={(e) => atualizar('formato', e.target.value)}>
            <option value="texto_corrido">Texto corrido</option>
            <option value="topicos">Tópicos</option>
            <option value="checklist">Checklist</option>
            <option value="plano_acao">Plano de ação</option>
            <option value="comparativo">Comparativo (quando aplicável)</option>
          </select>
        </div>

        <div>
          <label>Tom da comunicação</label>
          <select value={prefs.tom} onChange={(e) => atualizar('tom', e.target.value)}>
            <option value="corporativo">Corporativo</option>
            <option value="tecnico">Técnico</option>
            <option value="consultivo">Consultivo</option>
            <option value="amigavel">Amigável</option>
          </select>
        </div>

        <div>
          <label>Perfil operacional</label>
          <select value={prefs.perfil} onChange={(e) => atualizar('perfil', e.target.value)}>
            <option value="diretor">Diretor</option>
            <option value="gestor">Gestor</option>
            <option value="comercial">Comercial</option>
            <option value="analista">Analista</option>
            <option value="operacional">Operacional</option>
          </select>
        </div>

        <div>
          <label>Objetivo principal</label>
          <select value={prefs.objetivo} onChange={(e) => atualizar('objetivo', e.target.value)}>
            <option value="vendas">Vendas</option>
            <option value="gestao">Gestão</option>
            <option value="operacao">Operação</option>
            <option value="financeiro">Financeiro</option>
            <option value="aprendizado">Aprendizado</option>
            <option value="produtividade">Produtividade</option>
          </select>
        </div>
      </div>

      <h4 style={{ marginTop: '1.5rem' }}>Nível de Iniciativa da IA</h4>
      <p className="config-instrucao">
        A IA apenas recomenda — nunca executa nada automaticamente, em nenhum dos três níveis.
      </p>
      <div className="config-form-grid">
        <div>
          <select value={prefs.iniciativa} onChange={(e) => atualizar('iniciativa', e.target.value)}>
            <option value="passiva">Passiva — responde só o que foi perguntado</option>
            <option value="assistiva">Assistiva — responde + sugestões relacionadas</option>
            <option value="proativa">Proativa — responde + sugestões + riscos/oportunidades</option>
          </select>
        </div>
      </div>

      <h4 style={{ marginTop: '1.5rem' }}>Recursos Inteligentes</h4>
      <div className="config-form-grid">
        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', margin: 0 }}>
          <input type="checkbox" style={{ width: 'auto' }} checked={prefs.recursos.sugestoes} onChange={(e) => atualizarRecurso('sugestoes', e.target.checked)} />
          Sugestões automáticas
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', margin: 0 }}>
          <input type="checkbox" style={{ width: 'auto' }} checked={prefs.recursos.resumos} onChange={(e) => atualizarRecurso('resumos', e.target.checked)} />
          Resumos inteligentes
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', margin: 0 }}>
          <input type="checkbox" style={{ width: 'auto' }} checked={prefs.recursos.alertas} onChange={(e) => atualizarRecurso('alertas', e.target.checked)} />
          Alertas contextuais
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', margin: 0 }}>
          <input type="checkbox" style={{ width: 'auto' }} checked={prefs.recursos.recomendacoes} onChange={(e) => atualizarRecurso('recomendacoes', e.target.checked)} />
          Recomendações operacionais
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', margin: 0 }}>
          <input type="checkbox" style={{ width: 'auto' }} checked={prefs.recursos.explicacoes} onChange={(e) => atualizarRecurso('explicacoes', e.target.checked)} />
          Explicações detalhadas
        </label>
      </div>

      <h4 style={{ marginTop: '1.5rem' }}>Especialistas Disponíveis</h4>
      <p className="config-instrucao">Ocultar não desativa o especialista — só simplifica sua interface.</p>
      <div className="config-form-grid">
        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', margin: 0 }}>
          <input type="checkbox" style={{ width: 'auto' }} checked={prefs.especialistas.saude} onChange={(e) => atualizarEspecialista('saude', e.target.checked)} />
          GIN (Saúde)
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', margin: 0 }}>
          <input type="checkbox" style={{ width: 'auto' }} checked={prefs.especialistas.auto} onChange={(e) => atualizarEspecialista('auto', e.target.checked)} />
          Auto/Frota
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', margin: 0 }}>
          <input type="checkbox" style={{ width: 'auto' }} checked={prefs.especialistas.lifsure} onChange={(e) => atualizarEspecialista('lifsure', e.target.checked)} />
          LifSure
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', margin: 0 }}>
          <input type="checkbox" style={{ width: 'auto' }} checked={prefs.especialistas.lishield} onChange={(e) => atualizarEspecialista('lishield', e.target.checked)} />
          LiShield
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', margin: 0 }}>
          <input type="checkbox" style={{ width: 'auto' }} checked={prefs.especialistas.lifplan} onChange={(e) => atualizarEspecialista('lifplan', e.target.checked)} />
          LifPlan
        </label>
      </div>

      {erro && <p className="ls-modal-erro">{erro}</p>}
      {sucesso && <p className="config-sucesso">{sucesso}</p>}

      <button className="ls-btn ls-btn-primary" onClick={handleSalvar} disabled={salvando} style={{ marginTop: '1.25rem' }}>
        {salvando ? 'Salvando...' : 'Salvar preferências'}
      </button>
    </div>
  )
}