import { askAI } from '../aiProvider'
import {
  buscarBibliotecaRelevanteLifplan,
  buscarCasosRelevantesLifplan,
  buscarDocumentoLifplanPorCodigo,
} from './bibliotecaServiceLifplan'

/**
 * Motor único do Especialista LifPlan (Planejamento Patrimonial —
 * consórcio, financiamento, empréstimo, investimento, previdência).
 *
 * Segue o REL-001 ("Constituição Cognitiva") — formato de artigos, com
 * a Hierarquia das Decisões (Pessoas > Família > Empresa > Patrimônio >
 * Proteção > Liquidez > Estratégia > Produtos) como regra suprema.
 *
 * Diferente dos outros quatro: o LifPlan fala SEMPRE com o consultor/
 * vendedor, nunca diretamente com o cliente final — e tem uma
 * ferramenta própria (Descoberta Lúdica de Perfil de Investidor) que
 * ele ensina/sugere ao consultor usar, nunca aplica sozinho.
 */
export async function gerarRespostaEspecialistaLifplan({ demandaTexto, historicoContexto = '', historicoMensagens = [], imagens = [] }) {
  const textoBusca = historicoContexto ? `${historicoContexto}\n${demandaTexto}` : demandaTexto

  const [
    constituicaoCognitiva,
    docsCom,
    docsCre,
    docsInv,
    docsEco,
    docsMat,
    docsCon,
    docsEmp,
    docsLeg,
    docsAud,
    docsRsk,
    docsAdm,
    docsIns,
    casosRelevantes,
  ] = await Promise.all([
    buscarDocumentoLifplanPorCodigo('REL-001'),
    buscarBibliotecaRelevanteLifplan('COM', textoBusca, 2),
    buscarBibliotecaRelevanteLifplan('CRE', textoBusca, 2),
    buscarBibliotecaRelevanteLifplan('INV', textoBusca, 2),
    buscarBibliotecaRelevanteLifplan('ECO', textoBusca, 1),
    buscarBibliotecaRelevanteLifplan('MAT', textoBusca, 2),
    buscarBibliotecaRelevanteLifplan('CON', textoBusca, 2),
    buscarBibliotecaRelevanteLifplan('EMP', textoBusca, 2),
    buscarBibliotecaRelevanteLifplan('LEG', textoBusca, 1),
    buscarBibliotecaRelevanteLifplan('AUD', textoBusca, 1),
    buscarBibliotecaRelevanteLifplan('RSK', textoBusca, 2),
    buscarBibliotecaRelevanteLifplan('ADM', textoBusca, 1),
    buscarBibliotecaRelevanteLifplan('INS', textoBusca, 2),
    buscarCasosRelevantesLifplan(textoBusca, 4),
  ])

  const blocoBiblioteca = [...docsCom, ...docsCre, ...docsInv, ...docsEco, ...docsMat, ...docsCon, ...docsEmp, ...docsLeg, ...docsAud, ...docsRsk, ...docsAdm, ...docsIns]
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

  const systemPrompt = `${constituicaoCognitiva?.conteudo ?? ''}

---

## Você está atuando agora, em uma conversa real dentro do LifPlan

Tudo o que foi descrito acima é a sua Constituição Cognitiva permanente — sua missão, filosofia, ordem
cognitiva, hierarquia das decisões (Pessoas > Família > Empresa > Patrimônio > Proteção > Liquidez >
Estratégia > Produtos, sempre nessa ordem) e a Descoberta Lúdica de Perfil de Investidor (Artigo 21º).
Aplique isso agora, nesta demanda específica.

## Como você raciocina — importante
Você NÃO segue um checklist fixo de perguntas. Leia a demanda com atenção, veja o que JÁ foi informado
na própria mensagem (ou no histórico da conversa) e pergunte SÓ o que for realmente essencial pra
responder ESSE caso específico. Nunca repita uma pergunta sobre algo que o consultor já disse.

## Calibre o tamanho da resposta ao peso real da pergunta — importante
Pergunta social, trivial ou teste → resposta breve, direta, sem estrutura de parecer consultivo
completo. Diagnóstico ou estratégia de verdade → aí sim vale seguir o Método LifPlan por inteiro.

## Limite de escopo — importante
Você é especialista em Planejamento Patrimonial (consórcio, financiamento, empréstimo, investimento,
previdência, gestão empresarial), ponto. Você NÃO é especialista em Plano de Saúde/Odontológico
(LifCare), Seguro Auto/Frota (Lifleet) nem Seguros Gerais — Vida, Patrimonial, RC, Transportes
(LifSure). Se a pergunta for claramente sobre um desses outros ramos, NÃO tente responder usando
conhecimento geral — diga com clareza que está fora do seu domínio e sinalize isso no campo
ESPECIALISTA_SUGERIDO do cabeçalho, com a palavra exata "saude", "auto" ou "lifsure" (sem aspas, sem
markdown), conforme o caso.

## Biblioteca LifPlan relevante para esta demanda (fonte PRINCIPAL — tem mais peso que os casos abaixo)
${blocoBiblioteca || '(nenhum documento especialmente relevante encontrado — responda com cautela e diga isso se for o caso)'}

## Casos reais da LifitSeg relacionados (experiência de atendimentos de verdade — combine com a Biblioteca acima, nunca use sozinho como prova de uma regra)
${blocoCasos || '(nenhum caso relacionado encontrado ainda — a base de casos reais do LifPlan ainda está em formação)'}

${imagens.length > 0 ? '## Documento/imagem anexado\nUm arquivo foi anexado a esta demanda. Analise seu conteúdo com atenção antes de responder, e cite explicitamente o que encontrou nele.\n' : ''}

## Formato da resposta
Responda EXATAMENTE neste formato, sem markdown ao redor, sem texto antes do cabeçalho:

CATEGORIA: Consultivo | Técnico | Comercial | Risco | Auditoria
SUBCATEGORIA: string curta descrevendo o assunto
PRECISA_MAIS_INFORMACAO: true ou false
ESPECIALISTA_SUGERIDO: escreva exatamente a palavra "null" (sem aspas, sem markdown), ou "saude"/"auto"/"lifsure" conforme o caso. Nada mais nessa linha.
---RESPOSTA---
Sua resposta completa em português vem aqui, livre — pode ter parágrafos, quebras de linha, listas,
emojis, à vontade, sem nenhuma restrição de formato. Siga sua Constituição Cognitiva de forma natural
(sem precisar rotular cada artigo rigidamente). Se precisar de mais dados, faça só a(s) pergunta(s)
essencial(is) para ESSE caso.`

  const turnosAnteriores = historicoMensagens
    .filter((m) => m.autor === 'corretor' || m.autor === 'especialista' || m.autor === 'sistema')
    .map((m) => ({
      role: m.autor === 'especialista' ? 'assistant' : 'user',
      content: m.autor === 'sistema' ? `[Atualização registrada no caso pelo consultor]: ${m.texto}` : m.texto,
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
    (/especialista\s+d[eo]\s+auto/i.test(respostaTextoSemFormatacao)
      ? 'auto'
      : /especialista\s+d[eo]\s+sa[uú]de/i.test(respostaTextoSemFormatacao)
        ? 'saude'
        : /especialista\s+(lifsure|d[eo]\s+seguros?\s+gerais)/i.test(respostaTextoSemFormatacao)
          ? 'lifsure'
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
 * padrão robusto usado nos outros três motores.
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
  const matchLifsure = /\blifsure\b/i.test(especialistaSugeridoBruto)

  return {
    categoria: extrairCampo('CATEGORIA'),
    subcategoria: extrairCampo('SUBCATEGORIA'),
    precisaMaisInformacao: (extrairCampo('PRECISA_MAIS_INFORMACAO') ?? '').toLowerCase() === 'true',
    especialistaSugerido: matchSaude ? 'saude' : matchAuto ? 'auto' : matchLifsure ? 'lifsure' : null,
    resposta,
  }
}
