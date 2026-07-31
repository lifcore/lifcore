import { askAI } from '../aiProvider'
import {
  buscarBibliotecaRelevanteLifsure,
  buscarCasosRelevantesLifsure,
  buscarDocumentoLifsurePorCodigo,
} from './bibliotecaServiceLifsure'

/**
 * Motor único do Especialista LifSure (Seguros Gerais — 21 produtos).
 *
 * Segue o REL-001 ("Sistema Cognitivo Operacional") — que não é um
 * catálogo de produto, é um FRAMEWORK DE DIAGNÓSTICO: antes de sugerir
 * qualquer seguro, o especialista deve avaliar até 8 dimensões de risco
 * (Atividade, Patrimônio, Responsabilidade a Terceiros, Responsabilidade
 * Profissional, Pessoas-Chave, Transporte, Contratos, Funcionários) e
 * seguir sempre RISCO → IMPACTO → PROTEÇÃO → PRODUTO (nunca o contrário).
 *
 * Com 21 produtos possíveis, essa lógica "risco primeiro" é o que evita
 * o especialista ficar preso a um produto só porque foi o que o
 * corretor perguntou — ele deve enxergar o resto da exposição também.
 */
export async function gerarRespostaEspecialistaLifsure({ demandaTexto, historicoContexto = '', historicoMensagens = [], produtoMencionado = null, imagens = [] }) {
  const textoBusca = historicoContexto ? `${historicoContexto}\n${demandaTexto}` : demandaTexto

  const [
    sistemaCognitivo,
    docsSeg,
    docsCob,
    docsAna,
    docsEng,
    docsSub,
    docsSin,
    docsCom,
    docsAst,
    docsExp,
    docsDoc,
    docsOps,
    docsMer,
    docsReg,
    casosRelevantes,
  ] = await Promise.all([
    buscarDocumentoLifsurePorCodigo('REL-001'),
    buscarBibliotecaRelevanteLifsure('SEG', produtoMencionado ?? textoBusca, 3),
    buscarBibliotecaRelevanteLifsure('COB', textoBusca, 2),
    buscarBibliotecaRelevanteLifsure('ANA', textoBusca, 2),
    buscarBibliotecaRelevanteLifsure('ENG', textoBusca, 1),
    buscarBibliotecaRelevanteLifsure('SUB', textoBusca, 2),
    buscarBibliotecaRelevanteLifsure('SIN', textoBusca, 2),
    buscarBibliotecaRelevanteLifsure('COM', textoBusca, 1),
    buscarBibliotecaRelevanteLifsure('AST', produtoMencionado ?? textoBusca, 2),
    buscarBibliotecaRelevanteLifsure('EXP', textoBusca, 1),
    buscarBibliotecaRelevanteLifsure('DOC', textoBusca, 1),
    buscarBibliotecaRelevanteLifsure('OPS', textoBusca, 1),
    buscarBibliotecaRelevanteLifsure('MER', textoBusca, 1),
    buscarBibliotecaRelevanteLifsure('REG', textoBusca, 1),
    buscarCasosRelevantesLifsure(textoBusca, 4),
  ])

  const blocoBiblioteca = [...docsSeg, ...docsCob, ...docsAna, ...docsEng, ...docsSub, ...docsSin, ...docsCom, ...docsAst, ...docsExp, ...docsDoc, ...docsOps, ...docsMer, ...docsReg]
    .map((d) => `### [${d.codigo}] ${d.titulo}\n${d.conteudo.slice(0, 1200)}`)
    .join('\n\n')

  const blocoCasos = casosRelevantes
    .map((c) => {
      const temEstrutura = c.contexto || c.resultado || c.licoes_aprendidas
      const corpo = temEstrutura
        ? `Contexto: ${c.contexto ?? ''}\nResultado: ${c.resultado ?? ''}\nLições aprendidas: ${c.licoes_aprendidas ?? ''}`
        : (c.conteudo_completo ?? '').slice(0, 1000)
      return `### ${c.codigo} — ${c.titulo}\n${corpo}`
    })
    .join('\n\n')

  const systemPrompt = `${sistemaCognitivo?.conteudo ?? ''}

---

## Você está atuando agora, em uma conversa real com um corretor da LifitSeg

Tudo o que foi descrito acima é o seu Sistema Cognitivo permanente — sua identidade, missão, o Motor
Cognitivo de Diagnóstico (8 dimensões de risco), a regra RISCO → IMPACTO → PROTEÇÃO → PRODUTO, e a
Matriz de Oportunidade Consultiva. Aplique isso agora, nesta demanda específica.

Hoje você atua exclusivamente com corretores — nunca fala diretamente com o cliente final.

## Como você raciocina — importante
Você NÃO precisa percorrer rigidamente as 8 dimensões em toda mensagem — use julgamento. Se a
pergunta for pontual e simples (ex: "qual o LMI desse produto?"), responda direto. Reserve o
diagnóstico completo (todas as dimensões relevantes) para quando o corretor estiver estruturando uma
proposta nova ou pedir uma análise de risco de verdade. Releia a mensagem (e o histórico) antes de
perguntar algo — nunca repita uma pergunta sobre algo que já foi informado.

## Calibre o tamanho da resposta ao peso real da pergunta — importante
Pergunta social, trivial ou teste → resposta breve, direta, sem estrutura de parecer. Análise de risco
de verdade → aí sim vale a profundidade do Motor Cognitivo. Resposta longa pra pergunta sem
substância é desperdício de tempo do corretor e de custo de processamento.

## Limite de escopo — importante
Você é especialista em Seguros Gerais (Vida, Patrimonial, Transportes, Responsabilidade Civil e
demais ramos do catálogo LifSure), ponto. Você NÃO é especialista em Plano de Saúde/Odontológico
(módulo LifCare) nem em Seguro Auto/Frota (módulo Lifleet). Se a pergunta for claramente sobre um
desses outros ramos, NÃO tente responder usando conhecimento geral — diga com clareza que está fora
do seu domínio. **Sempre que isso acontecer, você DEVE também preencher o campo ESPECIALISTA_SUGERIDO
no cabeçalho da resposta** com a palavra exata "saude" ou "auto" (sem aspas, sem markdown) — a
explicação em texto sozinha não é suficiente, o campo precisa vir preenchido junto.

## Biblioteca LifSure relevante para esta demanda (fonte PRINCIPAL — tem mais peso que os casos abaixo)
${blocoBiblioteca || '(nenhum documento especialmente relevante encontrado — responda com cautela e diga isso se for o caso)'}

## Casos reais da LifitSeg relacionados (experiência de atendimentos de verdade — combine com a Biblioteca acima, nunca use sozinho como prova de uma regra)
${blocoCasos || '(nenhum caso relacionado encontrado ainda — a base de casos reais do LifSure ainda está em formação)'}

${imagens.length > 0 ? '## Documento/imagem anexado\nUm arquivo foi anexado a esta demanda. Analise seu conteúdo com atenção antes de responder, e cite explicitamente o que encontrou nele.\n' : ''}

## Formato da resposta
Responda EXATAMENTE neste formato, sem markdown ao redor, sem texto antes do cabeçalho:

CATEGORIA: Consultivo | Técnico | Comercial | Sinistro | Subscrição
SUBCATEGORIA: string curta descrevendo o assunto
PRECISA_MAIS_INFORMACAO: true ou false
ESPECIALISTA_SUGERIDO: escreva exatamente a palavra "null" (sem aspas, sem markdown), ou "saude"/"auto" se for claramente o caso
---RESPOSTA---
Sua resposta completa em português vem aqui, livre — pode ter parágrafos, quebras de linha, listas,
emojis, à vontade, sem nenhuma restrição de formato. Siga seu Sistema Cognitivo de forma natural (sem
precisar rotular cada dimensão rigidamente). Se precisar de mais dados, faça só a(s) pergunta(s)
essencial(is) para ESSE caso.`

  const turnosAnteriores = historicoMensagens
    .filter((m) => m.autor === 'corretor' || m.autor === 'especialista' || m.autor === 'sistema')
    .map((m) => ({
      role: m.autor === 'especialista' ? 'assistant' : 'user',
      content: m.autor === 'sistema' ? `[Atualização registrada no caso pelo corretor]: ${m.texto}` : m.texto,
    }))

  const resultado = await askAI({
    systemPrompt,
    messages: [...turnosAnteriores, { role: 'user', content: demandaTexto }],
    maxTokens: 4000,
    images: imagens,
  })

  const parsed = parsearRespostaComSeparador(resultado.text)

  const respostaTexto = parsed.resposta
  const respostaTextoSemFormatacao = respostaTexto.replace(/[*_`#]/g, '')
  const especialistaSugeridoDetectado =
    parsed.especialistaSugerido ??
    (/especialista\s+d[eo]\s+sa[uú]de/i.test(respostaTextoSemFormatacao)
      ? 'saude'
      : /especialista\s+d[eo]\s+auto/i.test(respostaTextoSemFormatacao)
        ? 'auto'
        : null)

  return {
    categoria: parsed.categoria,
    subcategoria: parsed.subcategoria,
    precisaMaisInformacao: parsed.precisaMaisInformacao,
    especialistaSugerido: especialistaSugeridoDetectado,
    respostaTexto,
    casosRelacionados: casosRelevantes,
  }
}

/**
 * Lê o formato "cabeçalho + ---RESPOSTA---+ texto livre" — o mesmo
 * padrão robusto usado nos motores de Saúde e Auto (evita o bug de
 * JSON quebrando com respostas longas de parágrafos).
 */
function parsearRespostaComSeparador(textoBruto) {
  const marcador = '---RESPOSTA---'
  const posicaoMarcador = textoBruto.indexOf(marcador)

  if (posicaoMarcador === -1) {
    return { categoria: null, subcategoria: null, precisaMaisInformacao: false, especialistaSugerido: null, resposta: textoBruto.trim() }
  }

  const cabecalho = textoBruto.slice(0, posicaoMarcador)
  const resposta = textoBruto.slice(posicaoMarcador + marcador.length).trim()

  function extrairCampo(nomeCampo) {
    const m = cabecalho.match(new RegExp(`${nomeCampo}\\s*:\\s*(.+)`, 'i'))
    return m ? m[1].trim() : null
  }

  const especialistaSugeridoBruto = extrairCampo('ESPECIALISTA_SUGERIDO') ?? ''
  const matchSaude = /\bsa[uú]de\b/i.test(especialistaSugeridoBruto)
  const matchAuto = /\bauto\b/i.test(especialistaSugeridoBruto)

  return {
    categoria: extrairCampo('CATEGORIA'),
    subcategoria: extrairCampo('SUBCATEGORIA'),
    precisaMaisInformacao: (extrairCampo('PRECISA_MAIS_INFORMACAO') ?? '').toLowerCase() === 'true',
    especialistaSugerido: matchSaude ? 'saude' : matchAuto ? 'auto' : null,
    resposta,
  }
}
