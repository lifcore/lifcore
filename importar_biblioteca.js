/**
 * Script de importação da Biblioteca Institucional para o Supabase.
 *
 * O QUE FAZ:
 *   1. Lê todos os arquivos CASO-SAU-*.txt da pasta do Volume V
 *      e importa para institucional.casos_fundamentais
 *   2. Lê os arquivos da pasta ANS (Volume IV) e importa para
 *      institucional.biblioteca (categoria = 'ANS')
 *   3. Lê os arquivos da pasta Operadoras e importa para
 *      institucional.biblioteca (categoria = 'Operadoras') e
 *      cria também o registro em institucional.operadoras
 *
 * COMO RODAR:
 *   1. npm install @supabase/supabase-js --save-dev
 *   2. Preencha as variáveis abaixo (ou use variáveis de ambiente)
 *   3. node scripts/importar_biblioteca.js
 *
 * IMPORTANTE: use a SERVICE ROLE KEY aqui (não a publishable/anon),
 * porque este script escreve na Biblioteca Institucional, que é
 * protegida por RLS para master/administrador. Nunca coloque a
 * service role key no código do frontend — só use aqui, localmente,
 * neste script de importação pontual.
 */

import { createClient } from '@supabase/supabase-js'
import fs from 'fs'
import path from 'path'

// ============================================================
// CONFIGURAÇÃO — preencha antes de rodar
// ============================================================
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://SEU-PROJETO.supabase.co'
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'COLE_AQUI_A_SERVICE_ROLE_KEY'

// Ajuste esses caminhos para onde os arquivos estão no seu computador
const CAMINHO_CASOS = './Volume V - BIBLIOTECA DE EXPERIÊNCIA/Especialista Saúde'
const CAMINHO_ANS = './Volume IV - BIBLIOTECA DO CONHECIMENTO/ANS'
const CAMINHO_OPERADORAS = './Volume IV - BIBLIOTECA DO CONHECIMENTO/Operadoras'
// ============================================================

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  db: { schema: 'institucional' },
})

async function importarCasosFundamentais() {
  console.log('\n📂 Importando Casos Fundamentais (Volume V)...')
  const arquivos = fs.readdirSync(CAMINHO_CASOS).filter((f) => f.endsWith('.txt'))

  let importados = 0
  for (const arquivo of arquivos) {
    const conteudo = fs.readFileSync(path.join(CAMINHO_CASOS, arquivo), 'utf-8')
    const codigo = extrairCodigo(arquivo, conteudo) // ex: CASO-SAU-001
    if (!codigo) {
      console.warn(`  ⚠️  Não consegui identificar o código em: ${arquivo} — pulando`)
      continue
    }

    const titulo = extrairTitulo(conteudo) || codigo
    const categoria = extrairCampo(conteudo, 'Categoria')
    const subcategoria = extrairCampo(conteudo, 'Subcategoria')
    const complexidade = extrairCampo(conteudo, 'Complexidade')
    const operadora = extrairCampo(conteudo, 'Operadora')
    const origem = extrairCampo(conteudo, 'Origem')

    const { error } = await supabase.from('casos_fundamentais').upsert(
      {
        codigo,
        titulo,
        categoria,
        subcategoria,
        complexidade,
        operadora,
        origem,
        contexto: extrairSecao(conteudo, 'Contexto'),
        situacao_inicial: extrairSecao(conteudo, 'Situação Inicial'),
        problema: extrairSecao(conteudo, 'Problema'),
        objetivo: extrairSecao(conteudo, 'Objetivo'),
        analise: extrairSecao(conteudo, 'Análise'),
        resultado: extrairSecao(conteudo, 'Resultado'),
        licoes_aprendidas: extrairSecao(conteudo, 'Lições Aprendidas'),
        conteudo_completo: conteudo, // sempre salvo, como fallback garantido
      },
      { onConflict: 'codigo' }
    )

    if (error) {
      console.error(`  ❌ Erro ao importar ${codigo}:`, error.message)
    } else {
      importados++
      console.log(`  ✅ ${codigo} — ${titulo}`)
    }
  }
  console.log(`\n📊 ${importados}/${arquivos.length} casos importados com sucesso.`)
}

async function importarPastaComoBiblioteca(caminho, categoria, prefixoCodigo) {
  console.log(`\n📂 Importando ${categoria} (${caminho})...`)
  const arquivos = fs.readdirSync(caminho).filter((f) => f.endsWith('.txt'))

  let importados = 0
  for (const arquivo of arquivos) {
    const conteudo = fs.readFileSync(path.join(caminho, arquivo), 'utf-8')
    const codigo = extrairCodigo(arquivo, conteudo, prefixoCodigo)
    if (!codigo) {
      console.warn(`  ⚠️  Não consegui identificar o código em: ${arquivo} — pulando`)
      continue
    }
    const titulo = extrairTitulo(conteudo) || arquivo.replace('.txt', '')

    const { error } = await supabase.from('biblioteca').upsert(
      { codigo, categoria, titulo, conteudo, origem: 'Biblioteca Oficial LifitSeg' },
      { onConflict: 'codigo' }
    )

    if (error) {
      console.error(`  ❌ Erro ao importar ${codigo}:`, error.message)
    } else {
      importados++
      console.log(`  ✅ ${codigo} — ${titulo}`)
    }
  }
  console.log(`\n📊 ${importados}/${arquivos.length} documentos de ${categoria} importados.`)
}

// ------------------------------------------------------------
// Funções auxiliares de extração de texto
// ------------------------------------------------------------

/** Tenta extrair o código (ex: CASO-SAU-001, ANS-006, OPER-005) do nome do arquivo ou do conteúdo */
function extrairCodigo(nomeArquivo, conteudo, prefixo) {
  const doNome = nomeArquivo.match(/([A-Z]+-[A-Z]*-?\d+)/)
  if (doNome) return doNome[1]

  const doConteudo = conteudo.match(/(?:Código:\s*)?([A-Z]+-[A-Z]*-?\d+)/)
  if (doConteudo) return doConteudo[1]

  return null
}

/** Extrai o título: geralmente a primeira linha significativa após o código, ou um cabeçalho "## " ou "# " */
function extrairTitulo(conteudo) {
  const linhaMarkdown = conteudo.match(/^#{1,2}\s+(.+)$/m)
  if (linhaMarkdown) return linhaMarkdown[1].trim()

  // fallback: segunda linha não vazia do arquivo (padrão usado em alguns CASO-SAU)
  const linhas = conteudo.split('\n').map((l) => l.trim()).filter(Boolean)
  return linhas[1] ?? null
}

/** Extrai um campo simples tipo "Categoria\n\nComercial" */
function extrairCampo(conteudo, nomeCampo) {
  const regex = new RegExp(`${nomeCampo}\\s*\\n+\\s*(.+)`, 'i')
  const match = conteudo.match(regex)
  return match ? match[1].trim() : null
}

/** Extrai uma seção inteira (do cabeçalho até o próximo cabeçalho numerado ou "---") */
function extrairSecao(conteudo, nomeSecao) {
  const regex = new RegExp(
    `#{1,3}\\s*\\d*\\.?\\s*${nomeSecao}\\s*\\n([\\s\\S]*?)(?=\\n#{1,3}\\s*\\d|\\n---|$)`,
    'i'
  )
  const match = conteudo.match(regex)
  return match ? match[1].trim() : null
}

// ------------------------------------------------------------
// Execução
// ------------------------------------------------------------
async function main() {
  console.log('🚀 Iniciando importação da Biblioteca Institucional...')

  if (SUPABASE_SERVICE_ROLE_KEY.includes('COLE_AQUI')) {
    console.error('\n❌ Configure a SUPABASE_SERVICE_ROLE_KEY antes de rodar este script.')
    process.exit(1)
  }

  await importarCasosFundamentais()
  await importarPastaComoBiblioteca(CAMINHO_ANS, 'ANS', 'ANS')
  await importarPastaComoBiblioteca(CAMINHO_OPERADORAS, 'Operadoras', 'OPER')

  console.log('\n✅ Importação concluída.')
}

main().catch((err) => {
  console.error('Erro fatal na importação:', err)
  process.exit(1)
})
