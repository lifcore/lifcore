/**
 * Script de migração de dados: Catálogo de Seguradoras + Connect Center
 * -> tabelas unificadas `seguradoras` + `seguradora_conexoes`
 *
 * COMO RODAR:
 *   node migrar-dados-seguradoras.js           (modo dry-run, não grava nada)
 *   node migrar-dados-seguradoras.js --commit  (grava de verdade)
 *
 * IMPORTANTE — AJUSTE ANTES DE RODAR:
 * Não tenho acesso ao schema real das tabelas atuais de catálogo e do
 * Connect Center, então os nomes de tabela/coluna abaixo são os nomes
 * mais prováveis dado o que você descreveu. Confira e ajuste as
 * constantes CATALOGO_TABLE / CONNECT_CENTER_TABLE e os nomes de coluna
 * antes de rodar — o script vai falhar de forma clara (erro do Supabase)
 * se algum nome estiver errado, não vai corromper dado nenhum.
 *
 * ESTRATÉGIA (conforme decidido):
 *  - Matching automático por nome EXATO após normalização (trim, lower,
 *    remoção de acentos).
 *  - O que bater: cria 1 registro em `seguradoras` + migra as conexões
 *    do Connect Center para `seguradora_conexoes`.
 *  - O que NÃO bater automaticamente: entra no relatório de exceções
 *    (arquivo `exceptions-report.json`) para sua revisão manual. Nada
 *    é decidido "por semelhança" sem você aprovar.
 *  - Apólices antigas: NÃO são vinculadas retroativamente (decisão
 *    tomada). Este script não toca na tabela de apólices.
 */

import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

// ---- AJUSTE ESTAS CONSTANTES CONFORME SEU SCHEMA REAL ----------------
const CATALOGO_TABLE = 'seguradoras_catalogo'; // tabela atual do catálogo
const CATALOGO_NOME_COL = 'nome';              // coluna com o nome da seguradora

const CONNECT_CENTER_TABLE = 'connect_center_seguradoras'; // tabela atual do Connect Center
const CC_NOME_COL = 'nome_seguradora';
const CC_MODULO_COL = 'modulo';
const CC_TIPO_CONEXAO_COL = 'tipo_conexao';
const CC_STATUS_COL = 'status';
const CC_SUCURSAL_COL = 'codigo_sucursal';
const CC_AMBIENTE_COL = 'ambiente';
// -----------------------------------------------------------------------

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('Defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY nas variáveis de ambiente antes de rodar.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
const isCommit = process.argv.includes('--commit');

function normalizarNome(nome) {
  return (nome || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, ''); // remove acentos
}

async function main() {
  console.log(`Modo: ${isCommit ? 'COMMIT (vai gravar)' : 'DRY-RUN (nada será gravado)'}`);

  const { data: catalogo, error: errCatalogo } = await supabase
    .from(CATALOGO_TABLE)
    .select('*');
  if (errCatalogo) {
    console.error(`Erro lendo ${CATALOGO_TABLE}:`, errCatalogo.message);
    process.exit(1);
  }

  const { data: conexoes, error: errConexoes } = await supabase
    .from(CONNECT_CENTER_TABLE)
    .select('*');
  if (errConexoes) {
    console.error(`Erro lendo ${CONNECT_CENTER_TABLE}:`, errConexoes.message);
    process.exit(1);
  }

  console.log(`Catálogo: ${catalogo.length} seguradoras encontradas.`);
  console.log(`Connect Center: ${conexoes.length} configurações de conexão encontradas.`);

  // Agrupa conexões do Connect Center por nome normalizado
  const conexoesPorNome = new Map();
  for (const conn of conexoes) {
    const chave = normalizarNome(conn[CC_NOME_COL]);
    if (!conexoesPorNome.has(chave)) conexoesPorNome.set(chave, []);
    conexoesPorNome.get(chave).push(conn);
  }

  const matched = [];   // bateu por nome exato -> migração automática
  const exceptions = []; // não bateu -> revisão manual

  for (const item of catalogo) {
    const chave = normalizarNome(item[CATALOGO_NOME_COL]);
    if (conexoesPorNome.has(chave)) {
      matched.push({
        catalogoItem: item,
        conexoes: conexoesPorNome.get(chave),
      });
      conexoesPorNome.delete(chave); // marca como consumido
    } else {
      exceptions.push({
        motivo: 'Seguradora no catálogo sem correspondência exata no Connect Center',
        catalogoItem: item,
      });
    }
  }

  // O que sobrou em conexoesPorNome são conexões do Connect Center sem
  // seguradora correspondente no catálogo — também vai para exceções
  for (const [chave, conns] of conexoesPorNome.entries()) {
    exceptions.push({
      motivo: 'Conexão no Connect Center sem seguradora correspondente no catálogo',
      nomeNormalizado: chave,
      conexoes: conns,
    });
  }

  console.log(`\nMatching automático: ${matched.length} seguradoras.`);
  console.log(`Exceções para revisão manual: ${exceptions.length}.`);

  // Grava relatório de exceções sempre, mesmo em dry-run
  fs.writeFileSync(
    'exceptions-report.json',
    JSON.stringify(exceptions, null, 2),
    'utf-8'
  );
  console.log('Relatório de exceções salvo em exceptions-report.json — revise antes de tratar manualmente.');

  if (!isCommit) {
    console.log('\nDry-run concluído. Nenhum dado foi gravado. Rode com --commit para efetivar.');
    return;
  }

  // ---- Efetivação (somente os que bateram automaticamente) ----------
  let sucesso = 0;
  let falhas = 0;

  for (const { catalogoItem, conexoes: connsDoItem } of matched) {
    const { data: novaSeguradora, error: errInsert } = await supabase
      .from('seguradoras')
      .insert({
        nome_fantasia: catalogoItem[CATALOGO_NOME_COL],
        ativo: true,
      })
      .select()
      .single();

    if (errInsert) {
      console.error(`Falha ao inserir seguradora "${catalogoItem[CATALOGO_NOME_COL]}":`, errInsert.message);
      falhas++;
      continue;
    }

    const conexoesParaInserir = connsDoItem.map((c) => ({
      seguradora_id: novaSeguradora.id,
      modulo: c[CC_MODULO_COL],
      tipo_conexao: c[CC_TIPO_CONEXAO_COL] || 'manual',
      status: c[CC_STATUS_COL] || 'pendente',
      codigo_sucursal: c[CC_SUCURSAL_COL] || null,
      ambiente: c[CC_AMBIENTE_COL] || null,
    }));

    const { error: errConn } = await supabase
      .from('seguradora_conexoes')
      .insert(conexoesParaInserir);

    if (errConn) {
      console.error(`Falha ao inserir conexões de "${catalogoItem[CATALOGO_NOME_COL]}":`, errConn.message);
      falhas++;
      continue;
    }

    sucesso++;
  }

  console.log(`\nMigração concluída: ${sucesso} seguradoras migradas com sucesso, ${falhas} falhas.`);
  console.log('Lembre-se de tratar as exceções em exceptions-report.json manualmente.');
}

main().catch((err) => {
  console.error('Erro inesperado:', err);
  process.exit(1);
});
