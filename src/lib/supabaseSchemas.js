/**
 * Clientes Supabase configurados para acessar os schemas
 * "institucional" e "operacional" definidos na migração 003.
 *
 * O Supabase JS permite trocar o schema-alvo por instância de
 * client. Reutilizamos a mesma conexão (mesmo projeto), só
 * mudando o schema-alvo de cada client.
 */
import { supabase } from './supabaseClient'

// Client apontando para o schema "institucional" (Biblioteca, REASON, Playbooks, Casos Fundamentais)
export const institucional = supabase.schema('institucional')

// Client apontando para o schema "operacional" (Casos reais, Beneficiários, Eventos)
export const operacional = supabase.schema('operacional')
