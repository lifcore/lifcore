// src/lib/connect/providerRegistryService.js
//
// CONNECT-004C — primeira camada de leitura do Provider Registry.
// Confirmado por busca no repositório inteiro: nenhum service do
// frontend consumia essas 6 tabelas antes desta Sprint.
//
// Só leitura, de propósito — nenhuma função aqui grava nada. Escrita
// fica pra quando a tela de gestão de Provedores no Connect Center
// for desenhada (ainda não está, é passo seguinte desta Sprint).

import { supabase } from '../supabaseClient'

const SCHEMA = 'institucional'

function db() {
  return supabase.schema(SCHEMA)
}

/** Lista todos os Providers cadastrados no Registry. */
export async function listarProviders() {
  const { data, error } = await db().from('providers').select('*').order('nome')
  if (error) throw new Error(`Erro ao listar providers: ${error.message}`)
  return data ?? []
}

/** Busca um Provider específico pelo slug. */
export async function obterProviderPorSlug(slug) {
  const { data, error } = await db().from('providers').select('*').eq('slug', slug).maybeSingle()
  if (error) throw new Error(`Erro ao buscar provider: ${error.message}`)
  return data
}

/** Lista os ambientes configurados de um Provider (sandbox/produção, etc). */
export async function listarEnvironmentsDoProvider(providerId) {
  const { data, error } = await db()
    .from('provider_environments')
    .select('*')
    .eq('provider_id', providerId)
    .order('ambiente')
  if (error) throw new Error(`Erro ao listar ambientes do provider: ${error.message}`)
  return data ?? []
}

/** Lista as identidades (códigos de negócio, ex: codigo_corretor da Tokio) de um ambiente. Nunca contém segredo — ver nota no BMR sobre a lacuna de credenciais. */
export async function listarIdentitiesDoEnvironment(environmentId) {
  const { data, error } = await db()
    .from('provider_identities')
    .select('*')
    .eq('environment_id', environmentId)
  if (error) throw new Error(`Erro ao listar identidades do ambiente: ${error.message}`)
  return data ?? []
}

/** Lista as capabilities declaradas de um Provider (ex: 'cotacao', 'consulta_veiculo', 'lead_ads'). */
export async function listarCapabilitiesDoProvider(providerId) {
  const { data, error } = await db()
    .from('provider_capabilities')
    .select('*')
    .eq('provider_id', providerId)
  if (error) throw new Error(`Erro ao listar capabilities do provider: ${error.message}`)
  return data ?? []
}

/** Lista os contratos técnicos (protocolo/endpoint/versão) de um Provider. */
export async function listarContractsDoProvider(providerId) {
  const { data, error } = await db()
    .from('provider_contracts')
    .select('*')
    .eq('provider_id', providerId)
  if (error) throw new Error(`Erro ao listar contratos do provider: ${error.message}`)
  return data ?? []
}

/** Lista os itens de catálogo sincronizados de um Provider (ex: tabela de coberturas da Tokio) — é o que o futuro DME vai consumir. */
export async function listarCatalogoDoProvider(providerId, catalogo) {
  let query = db().from('provider_catalog_itens').select('*').eq('provider_id', providerId)
  if (catalogo) query = query.eq('catalogo', catalogo)
  const { data, error } = await query
  if (error) throw new Error(`Erro ao listar catálogo do provider: ${error.message}`)
  return data ?? []
}

/**
 * Visão consolidada de um Provider — pra tela de detalhe do Connect
 * Center. Combina 3 leituras (provider + ambientes + capabilities),
 * sem duplicar lógica de cada uma.
 */
export async function obterVisaoCompletaDoProvider(slug) {
  const provider = await obterProviderPorSlug(slug)
  if (!provider) return null

  const [environments, capabilities] = await Promise.all([
    listarEnvironmentsDoProvider(provider.id),
    listarCapabilitiesDoProvider(provider.id),
  ])

  return { ...provider, environments, capabilities }
}
