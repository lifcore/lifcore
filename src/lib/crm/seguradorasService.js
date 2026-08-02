/**
 * seguradorasService.js
 * Service layer do Master Center unificado de Seguradoras/Operadoras.
 *
 * Ajuste o import do client Supabase abaixo para o caminho real do seu
 * projeto (ex: '../supabaseClient' ou onde quer que ele esteja).
 */
import { supabase } from './supabaseClient';

const MODULOS_VALIDOS = ['lifcare', 'lifleet', 'lifsure', 'lishield', 'lifplan'];

// ---------------------------------------------------------------------
// Seguradoras (cadastro mestre)
// ---------------------------------------------------------------------

export async function listarSeguradoras({ busca = '', apenasAtivas = false } = {}) {
  let query = supabase
    .from('seguradoras')
    .select(`
      *,
      seguradora_conexoes ( id, modulo, tipo_conexao, status, codigo_sucursal, ambiente )
    `)
    .order('nome_fantasia', { ascending: true });

  if (apenasAtivas) query = query.eq('ativo', true);
  if (busca) query = query.ilike('nome_fantasia', `%${busca}%`);

  const { data, error } = await query;
  if (error) throw error;
  return data;
}

export async function obterSeguradora(id) {
  const { data, error } = await supabase
    .from('seguradoras')
    .select(`
      *,
      seguradora_conexoes ( id, modulo, tipo_conexao, status, codigo_sucursal, ambiente, observacoes )
    `)
    .eq('id', id)
    .single();

  if (error) throw error;
  return data;
}

export async function criarSeguradora({ nomeFantasia, razaoSocial, cnpj, site, contatoComercial }) {
  if (!nomeFantasia || !nomeFantasia.trim()) {
    throw new Error('Nome fantasia é obrigatório.');
  }

  const { data, error } = await supabase
    .from('seguradoras')
    .insert({
      nome_fantasia: nomeFantasia.trim(),
      razao_social: razaoSocial || null,
      cnpj: cnpj || null,
      site: site || null,
      contato_comercial: contatoComercial || null,
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function atualizarSeguradora(id, campos) {
  const { data, error } = await supabase
    .from('seguradoras')
    .update(campos)
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function inativarSeguradora(id) {
  return atualizarSeguradora(id, { ativo: false });
}

// ---------------------------------------------------------------------
// Conexões por módulo
// ---------------------------------------------------------------------

export async function upsertConexao({
  seguradoraId,
  modulo,
  tipoConexao = 'manual',
  status = 'pendente',
  codigoSucursal = null,
  ambiente = null,
  observacoes = null,
}) {
  if (!MODULOS_VALIDOS.includes(modulo)) {
    throw new Error(`Módulo inválido: ${modulo}. Esperado um de: ${MODULOS_VALIDOS.join(', ')}`);
  }

  const { data, error } = await supabase
    .from('seguradora_conexoes')
    .upsert(
      {
        seguradora_id: seguradoraId,
        modulo,
        tipo_conexao: tipoConexao,
        status,
        codigo_sucursal: codigoSucursal,
        ambiente,
        observacoes,
      },
      { onConflict: 'seguradora_id,modulo' }
    )
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function removerConexao(conexaoId) {
  const { error } = await supabase
    .from('seguradora_conexoes')
    .delete()
    .eq('id', conexaoId);

  if (error) throw error;
  return true;
}

// ---------------------------------------------------------------------
// Helper para os formulários de Apólice (select vinculado por seguradora_id)
// ---------------------------------------------------------------------

export async function listarSeguradorasParaSelect(modulo = null) {
  let query = supabase
    .from('seguradoras')
    .select('id, nome_fantasia')
    .eq('ativo', true)
    .order('nome_fantasia', { ascending: true });

  const { data, error } = await query;
  if (error) throw error;

  // Se filtrar por módulo, opcionalmente destacar quais já têm conexão
  // configurada naquele módulo (útil pra UX, não é obrigatório usar)
  return data;
}
