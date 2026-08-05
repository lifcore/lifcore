import { useLocation } from 'react-router-dom'
import './inline-toolbar.css'

/**
 * Inline Toolbar (Sprint Visual — Fase 2, OA-001 REV B). 40px, fica
 * entre o TopNav OS e a Sidebar/Conteúdo.
 *
 * NESTA ENTREGA: só o título contextual (derivado da rota atual) foi
 * ligado — "Ações" e "Filtros" ainda não foram migrados pra cá.
 * Migrar isso exigiria tocar em praticamente toda tela do sistema
 * (cada Pipeline, cada ClienteDetail, cada Center já tem seu próprio
 * jeito de mostrar título/botão/filtro) — trabalho grande demais pra
 * uma entrega só, e o próprio Chief pediu pra evitar Big Bang. Fica
 * como próxima etapa da Fase 2, tela por tela.
 */

const TITULO_POR_ROTA = [
  { prefixo: '/lifleet/clientes/', titulo: 'Lifleet — Ficha do Cliente' },
  { prefixo: '/lifleet', titulo: 'Lifleet — Auto&Frota' },
  { prefixo: '/lifsure/clientes/', titulo: 'Lifsure — Ficha do Cliente' },
  { prefixo: '/lifsure', titulo: 'Lifsure — Seguros Gerais' },
  { prefixo: '/lishield/clientes/', titulo: 'LiShield — Ficha do Cliente' },
  { prefixo: '/lishield', titulo: 'LiShield — Seguros Técnicos' },
  { prefixo: '/lifplan/clientes/', titulo: 'Lifplan — Ficha do Cliente' },
  { prefixo: '/lifplan', titulo: 'Lifplan — Planejamento Patrimonial' },
  { prefixo: '/clientes/', titulo: 'Lifcare — Ficha do Cliente' },
  { prefixo: '/financeiro', titulo: 'Financeiro' },
  { prefixo: '/painel', titulo: 'Painel Executivo' },
  { prefixo: '/auditoria', titulo: 'Auditoria' },
  { prefixo: '/claims', titulo: 'Claims Center — Central Operacional' },
  { prefixo: '/growth', titulo: 'Growth Center — Customer Journey & Pipeline Hub' },
  { prefixo: '/knowledge', titulo: 'Knowledge Center — Rule Registry & Template Governance' },
  { prefixo: '/perfil', titulo: 'Meu Perfil' },
  { prefixo: '/mensagens', titulo: 'Mensagens Padrão' },
  { prefixo: '/apolices', titulo: 'Apólices — Administração' },
  { prefixo: '/configuracoes', titulo: 'Configurações' },
  { prefixo: '/', titulo: 'Lifcare — Saúde&Odonto' },
]

function tituloDaRota(pathname) {
  const encontrado = TITULO_POR_ROTA.find((r) => pathname.startsWith(r.prefixo))
  return encontrado?.titulo ?? 'LifCore'
}

export default function InlineToolbar() {
  const location = useLocation()
  const titulo = tituloDaRota(location.pathname)

  return (
    <div className="inline-toolbar">
      <span className="inline-toolbar-titulo">{titulo}</span>
      <div className="inline-toolbar-acoes" />
    </div>
  )
}