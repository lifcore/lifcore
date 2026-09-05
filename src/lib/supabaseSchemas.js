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

// NOVO — ponte temporária de compatibilidade (decisão registrada:
// C.6 do modelo-alvo da Biblioteca ANS). As tabelas mercado_saude_* não
// foram excluídas, foram movidas pra este schema separado quando o
// Sistema A antigo foi descontinuado como fonte da nova Biblioteca.
// Client usado exclusivamente por motorSmartQuoteService.js (Multicálculo)
// enquanto a fundação ANS não estiver pronta pra substituí-lo. Não
// reintroduzir essas tabelas em "institucional" — a ponte é o client
// mudar de schema, nunca o dado voltar de schema.
export const legadoBibliotecaPreAns = supabase.schema('legado_biblioteca_pre_ans')
