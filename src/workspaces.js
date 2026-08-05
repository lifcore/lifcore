/**
 * Workspace Registry (Sprint 006 — Workspace Intelligence Engine, Bloco A).
 *
 * Fonte única de verdade sobre cada Workspace do LifCore.OS. Antes desta
 * Sprint, essa informação estava duplicada em pelo menos 2 lugares
 * (SideIconMenu.jsx tinha sua própria detecção de rota, TopNav.jsx
 * tinha sua própria lista de módulos) — cada um podendo divergir do
 * outro com o tempo. Agora existe um só.
 *
 * Nesta Sprint: só REGISTRO. KPIs rápidos e Copilot padrão existem como
 * campo, mas vazios/não conectados — nenhum cálculo novo, nenhuma
 * mudança nos motores de IA (diretrizes dos Blocos E e F).
 */

export const WORKSPACES = {
  lifcare: {
    id: 'lifcare',
    nome: 'Lifcare',
    descricao: 'Saúde & Odonto',
    rota: '/',
    prefixosRota: ['/', '/clientes/'],
    corInstitucional: '#f59e0b',
    especialistaPadrao: 'saude',
    kpisRapidos: [],
    breadcrumbPadrao: ['Workspaces', 'Lifcare'],
    commercialLifecycle: {
      enabled: true,
      // Sprint 009 (CLU-001): "Implantação" fica fora desta Sprint —
      // o ciclo aqui cobre só até o contrato existir, não o pós-venda.
      stages: ['em_analise', 'proposta_emitida', 'analise_operadora', 'assinatura', 'aprovada'],
      documentoFinal: 'contrato',
    },
    features: {
      workspaceHeader: true,
      customer360: true,
      commercialLifecycle: true,
      comparisonQuote: false,
      claims: true,
      finance: false,
      connect: false,
    },
  },
  auto: {
    id: 'auto',
    nome: 'Lifleet',
    descricao: 'Auto & Frota',
    rota: '/lifleet',
    prefixosRota: ['/lifleet'],
    corInstitucional: '#f59e0b',
    especialistaPadrao: 'auto',
    kpisRapidos: [],
    breadcrumbPadrao: ['Workspaces', 'Lifleet'],
    commercialLifecycle: {
      enabled: true,
      stages: ['em_analise', 'proposta_emitida', 'aprovada'],
      documentoFinal: 'apolice',
    },
    features: {
      workspaceHeader: true,
      customer360: false,
      commercialLifecycle: true,
      comparisonQuote: true,
      claims: true,
      finance: false,
      connect: false,
    },
  },
  lifsure: {
    id: 'lifsure',
    nome: 'Lifsure',
    descricao: 'Seguros Gerais',
    rota: '/lifsure',
    prefixosRota: ['/lifsure'],
    corInstitucional: '#f59e0b',
    especialistaPadrao: 'lifsure',
    kpisRapidos: [],
    breadcrumbPadrao: ['Workspaces', 'Lifsure'],
    commercialLifecycle: {
      enabled: true,
      stages: ['em_analise', 'proposta_emitida', 'aprovada'],
      documentoFinal: 'apolice',
    },
    features: {
      workspaceHeader: true,
      customer360: false,
      commercialLifecycle: true,
      comparisonQuote: false,
      claims: true,
      finance: false,
      connect: false,
    },
  },
  lishield: {
    id: 'lishield',
    nome: 'LiShield',
    descricao: 'Seguros Técnicos',
    rota: '/lishield',
    prefixosRota: ['/lishield'],
    corInstitucional: '#f59e0b',
    especialistaPadrao: 'lishield',
    kpisRapidos: [],
    breadcrumbPadrao: ['Workspaces', 'LiShield'],
    commercialLifecycle: {
      enabled: true,
      stages: ['em_analise', 'proposta_emitida', 'aprovada'],
      documentoFinal: 'apolice',
    },
    features: {
      workspaceHeader: true,
      customer360: false,
      commercialLifecycle: true,
      comparisonQuote: false,
      claims: true,
      finance: false,
      connect: false,
    },
  },
  lifplan: {
    id: 'lifplan',
    nome: 'Lifplan',
    descricao: 'Planejamento Patrimonial',
    rota: '/lifplan',
    prefixosRota: ['/lifplan'],
    corInstitucional: '#f59e0b',
    especialistaPadrao: 'lifplan',
    kpisRapidos: [],
    breadcrumbPadrao: ['Workspaces', 'Lifplan'],
    commercialLifecycle: {
      // Sprint 009 (CLU-001): etapas registradas por completude
      // conceitual, mas NÃO acionáveis ainda — "Análise de Crédito",
      // "Assinatura" e "Emissão" não têm tabela/campo próprio no
      // banco hoje. Ativar isso sem essa base seria antecipar schema
      // (proibido pela própria Sprint). `enabled: false` sinaliza pro
      // motor genérico que este Workspace ainda não deve ser acionado.
      enabled: false,
      stages: ['em_analise', 'proposta_emitida', 'analise_credito', 'assinatura', 'aprovada'],
      documentoFinal: null,
    },
    features: {
      workspaceHeader: true,
      customer360: false,
      commercialLifecycle: false,
      comparisonQuote: false,
      claims: true,
      finance: false,
      connect: false,
    },
  },

  // Control Centers e Governança também são Workspaces — só não têm
  // Pipeline/Kanban nem Especialista padrão associado.
  financeiro: {
    id: 'financeiro',
    nome: 'Financeiro',
    descricao: null,
    rota: '/financeiro',
    prefixosRota: ['/financeiro'],
    corInstitucional: '#f59e0b',
    especialistaPadrao: null,
    kpisRapidos: [],
    breadcrumbPadrao: ['Control Centers', 'Financeiro'],
  },
  claims: {
    id: 'claims',
    nome: 'Claims Center',
    descricao: null,
    rota: '/claims',
    prefixosRota: ['/claims'],
    corInstitucional: '#f59e0b',
    especialistaPadrao: null,
    kpisRapidos: [],
    breadcrumbPadrao: ['Control Centers', 'Claims Center'],
  },
  growth: {
    id: 'growth',
    nome: 'Growth Center',
    descricao: null,
    rota: '/growth',
    prefixosRota: ['/growth'],
    corInstitucional: '#f59e0b',
    especialistaPadrao: null,
    kpisRapidos: [],
    breadcrumbPadrao: ['Control Centers', 'Growth Center'],
  },
  knowledge: {
    id: 'knowledge',
    nome: 'Knowledge Center',
    descricao: null,
    rota: '/knowledge',
    prefixosRota: ['/knowledge'],
    corInstitucional: '#f59e0b',
    especialistaPadrao: null,
    kpisRapidos: [],
    breadcrumbPadrao: ['Control Centers', 'Knowledge Center'],
  },
  painel: {
    id: 'painel',
    nome: 'Painel Executivo',
    descricao: null,
    rota: '/painel',
    prefixosRota: ['/painel'],
    corInstitucional: '#f59e0b',
    especialistaPadrao: null,
    kpisRapidos: [],
    breadcrumbPadrao: ['Control Centers', 'Painel Executivo'],
  },
  auditoria: {
    id: 'auditoria',
    nome: 'Auditoria',
    descricao: null,
    rota: '/auditoria',
    prefixosRota: ['/auditoria'],
    corInstitucional: '#f59e0b',
    especialistaPadrao: null,
    kpisRapidos: [],
    breadcrumbPadrao: ['Governança', 'Auditoria'],
  },
  configuracoes: {
    id: 'configuracoes',
    nome: 'Configurações',
    descricao: null,
    rota: '/configuracoes',
    prefixosRota: ['/configuracoes'],
    corInstitucional: '#f59e0b',
    especialistaPadrao: null,
    kpisRapidos: [],
    breadcrumbPadrao: ['Governança', 'Configurações'],
  },
}

/** Ordem oficial dos 5 Workspaces operacionais (Top Navigation) */
export const WORKSPACES_OPERACIONAIS = ['lifcare', 'auto', 'lifsure', 'lishield', 'lifplan']

/**
 * Detecta qual Workspace está ativo a partir da rota atual. Fonte
 * única — antes desta Sprint, essa mesma lógica existia duplicada em
 * SideIconMenu.jsx e TopNav.jsx, podendo divergir com o tempo.
 */
export function detectarWorkspaceAtivo(pathname) {
  // Prefixos mais específicos primeiro (evita "/lifcare" bater com "/" antes da hora)
  const candidatos = Object.values(WORKSPACES)
    .filter((w) => w.id !== 'lifcare')
    .sort((a, b) => b.rota.length - a.rota.length)

  for (const workspace of candidatos) {
    if (workspace.prefixosRota.some((p) => pathname.startsWith(p))) return workspace.id
  }

  // Lifcare por último — é quem usa "/" como prefixo, que bateria com tudo se viesse antes
  if (WORKSPACES.lifcare.prefixosRota.some((p) => pathname === p || pathname.startsWith(p))) {
    return 'lifcare'
  }

  return null
}

export function obterWorkspace(id) {
  return WORKSPACES[id] ?? null
}