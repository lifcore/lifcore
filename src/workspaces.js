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
 *
 * ATUALIZAÇÃO (BMR-004/CLU-002, Fase 1 — 11/08): `stages` deixou de ser
 * uma lista própria por módulo e passou a espelhar diretamente os 5
 * valores universais de `operacional.cotacoes.status` (mesmo enum em
 * todos os módulos, sem exceção). Lifplan sai de `enabled: false` para
 * `true` — o bloqueio original era falta de coluna própria pras etapas
 * antigas (analise_credito/assinatura); como as etapas agora são o
 * próprio `cotacoes.status` (que já existe pra todos os módulos),
 * o bloqueio deixou de existir. `documentoFinal` do Lifplan passa de
 * `null` para `'apolice'` (mesma tabela `apolices` que Lifleet/Lifsure/
 * LiShield, confirmado na unificação do Customer 360).
 *
 * ATUALIZAÇÃO (BMR-004/CLU-002, Fase 4 — 11/08): auditoria da
 * Governança de Funcionalidades encontrou `features.customer360`
 * desatualizado — marcado `false` (⏳) em Lifleet/Lifsure/LiShield/
 * Lifplan, quando na verdade o Customer 360 está no ar nos 5 módulos
 * desde 08/08 (Sprint de replicação). Corrigido pra `true` nos 4 —
 * Registry alinhado à realidade confirmada por leitura direta do
 * código (ClienteDetail*Page.jsx dos 4 módulos).
 */

const CICLO_COMERCIAL_UNIVERSAL = ['em_negociacao', 'emissao', 'fechada', 'perdida', 'expirada']

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
      stages: CICLO_COMERCIAL_UNIVERSAL,
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
      stages: CICLO_COMERCIAL_UNIVERSAL,
      documentoFinal: 'apolice',
    },
    features: {
      workspaceHeader: true,
      customer360: true,
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
      stages: CICLO_COMERCIAL_UNIVERSAL,
      documentoFinal: 'apolice',
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
      stages: CICLO_COMERCIAL_UNIVERSAL,
      documentoFinal: 'apolice',
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
      // BMR-004/CLU-002 (11/08): habilitado. O bloqueio original (Sprint
      // 009/CLU-001) era falta de coluna própria pras etapas antigas
      // (analise_credito/assinatura, sem tabela/campo no banco). Como
      // as etapas agora são o próprio `cotacoes.status` — que já existe
      // pra todos os módulos — o bloqueio não existe mais. Comunicação
      // universal sem exceção nos 5 módulos, por decisão do Chief.
      enabled: true,
      stages: CICLO_COMERCIAL_UNIVERSAL,
      documentoFinal: 'apolice',
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
