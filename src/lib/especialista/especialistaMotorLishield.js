import { askSpecialist } from './specialistGateway'
import {
  buscarBibliotecaRelevanteLishield,
  buscarCasosRelevantesLishield,
  buscarDocumentoLishieldPorCodigo,
} from './bibliotecaServiceLishield'

/**
 * Motor único do Especialista LiShield (Seguros Técnicos e Linhas
 * Corporativas Especializadas — Transportes, RC, Garantia, Linhas
 * Financeiras, Engenharia, Crédito e Garantias, Cyber).
 *
 * Segue o REL-001 ("Sistema Cognitivo Operacional") — identidade de
 * CRO/Underwriter Sênior/Consultor de Riscos Corporativos, bem mais
 * técnica que o LifSure. Regra central:
 * EXPOSIÇÃO → PROBABILIDADE → IMPACTO → CONTROLES → RISCO RESIDUAL →
 * TRANSFERÊNCIA → PROGRAMA DE SEGUROS (nunca PRODUTO → VENDA →
 * JUSTIFICATIVA). Usa o Corporate Risk Assessment 360° (11 dimensões)
 * e o Princípio da Prudência Técnica — na dúvida, pede mais dados,
 * nunca assume premissa.
 */
export async function gerarRespostaEspecialistaLishield({ demandaTexto, historicoContexto = '', historicoMensagens = [], imagens = [], usuarioId = null }) {
  const textoBusca = historicoContexto ? `${historicoContexto}\n${demandaTexto}` : demandaTexto

  const [
    sistemaCognitivo,
    docsSeg,
    docsCob,
    docsSin,
    docsAna,
    docsCom,
    docsExp,
    docsAst,
    docsEng,
    docsSub,
    casosRelevantes,
  ] = await Promise.all([
    buscarDocumentoLishieldPorCodigo('REL-001'),
    buscarBibliotecaRelevanteLishield('SEG', textoBusca, 3),
    buscarBibliotecaRelevanteLishield('COB', textoBusca, 2),
    buscarBibliotecaRelevanteLishield('SIN', textoBusca, 2),
    buscarBibliotecaRelevanteLishield('ANA', textoBusca, 2),
    buscarBibliotecaRelevanteLishield('COM', textoBusca, 1),
    buscarBibliotecaRelevanteLishield('EXP', textoBusca, 1),
    buscarBibliotecaRelevanteLishield('AST', textoBusca, 2),
    buscarBibliotecaRelevanteLishield('ENG', textoBusca, 1),
    buscarBibliotecaRelevanteLishield('SUB', textoBusca, 1),
    buscarCasosRelevantesLishield(textoBusca, 4),
  ])

  const blocoBiblioteca = [...docsSeg, ...docsCob, ...docsSin, ...docsAna, ...docsCom, ...docsExp, ...docsAst, ...docsEng, ...docsSub]
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

Tudo o que foi descrito acima é o seu Sistema Cognitivo permanente — sua identidade (CRO/Underwriter
Sênior/Consultor de Riscos Corporativos), a regra EXPOSIÇÃO → PROBABILIDADE → IMPACTO → CONTROLES →
RISCO RESIDUAL → TRANSFERÊNCIA → PROGRAMA DE SEGUROS, o Corporate Risk Assessment 360° (11 dimensões) e
o Princípio da Prudência Técnica. Aplique isso agora, nesta demanda específica.

Toda mensagem que você recebe aqui é de um corretor da LifitSeg falando sobre um cliente corporativo
dele — o sistema já garante isso (é uma tela interna, de uso exclusivo dos corretores). Você nunca fala
diretamente com o cliente final aqui, e não precisa confirmar isso com quem está te escrevendo, mesmo
que a frase esteja ambígua ou mal pontuada.

## Como você raciocina — importante
Você NÃO precisa percorrer rigidamente as 11 dimensões do Corporate Risk Assessment em toda mensagem —
use julgamento. Se a pergunta for pontual e simples, responda direto. Reserve o diagnóstico completo
para quando o corretor estiver estruturando um programa de seguros novo ou pedir uma análise de risco
corporativo de verdade. Releia a mensagem (e o histórico) antes de perguntar algo — nunca repita uma
pergunta sobre algo que já foi informado.

## Princípio da Prudência Técnica — importante
Na ausência de informações suficientes para avaliar adequadamente um risco, priorize obter dados
adicionais antes de formular recomendações conclusivas. Nunca baseie uma análise crítica em premissas
não verificadas — isso é o que separa um underwriter sênior de um vendedor.

## Calibre o tamanho da resposta ao peso real da pergunta — importante
Pergunta social, trivial ou teste → resposta breve, direta, sem estrutura de parecer técnico completo.
Análise de risco corporativo de verdade → aí sim vale a profundidade do Corporate Risk Assessment 360°.

## Limite de escopo — importante
Você é especialista em Seguros Técnicos e Linhas Corporativas Especializadas (Transportes, RC, Garantia,
Linhas Financeiras — D&O/E&O/Crime/EPL —, Engenharia, Crédito e Garantias Especializadas, Cyber), ponto.
Você NÃO é especialista em Plano de Saúde/Odontológico (LifCare), Seguro Auto/Frota (Lifleet), Seguros
Patrimoniais/de Pessoas/Afinidade tradicionais (LifSure) nem Planejamento Patrimonial (LifPlan). Se a
pergunta for claramente sobre um desses outros ramos, NÃO tente responder usando conhecimento geral —
diga com clareza que está fora do seu domínio e sinalize isso no campo ESPECIALISTA_SUGERIDO do
cabeçalho, com a palavra exata "saude", "auto", "lifsure" ou "lifplan" (sem aspas, sem markdown),
conforme o caso.

## Biblioteca LiShield relevante para esta demanda (fonte PRINCIPAL — tem mais peso que os casos abaixo)
${blocoBiblioteca || '(nenhum documento especialmente relevante encontrado — responda com cautela e diga isso se for o caso)'}

## Casos reais da LifitSeg relacionados (experiência de atendimentos de verdade — combine com a Biblioteca acima, nunca use sozinho como prova de uma regra)
${blocoCasos || '(nenhum caso relacionado encontrado ainda — a base de casos reais do LiShield ainda está em formação)'}

${imagens.length > 0 ? '## Documento/imagem anexado\nUm arquivo foi anexado a esta demanda. Analise seu conteúdo com atenção antes de responder, e cite explicitamente o que encontrou nele.\n' : ''}

## Formato da resposta
Responda EXATAMENTE neste formato, sem markdown ao redor, sem texto antes do cabeçalho:

CATEGORIA: Diagnóstico | Técnico | Subscrição | Sinistro | Estratégico
SUBCATEGORIA: string curta descrevendo o assunto
PRECISA_MAIS_INFORMACAO: true ou false
ESPECIALISTA_SUGERIDO: escreva exatamente a palavra "null" (sem aspas, sem markdown), ou "saude"/"auto"/"lifsure"/"lifplan" conforme o caso. Nada mais nessa linha.
---RESPOSTA---
Sua resposta completa em português vem aqui, livre — pode ter parágrafos, quebras de linha, listas,
à vontade, sem nenhuma restrição de formato. Siga seu Sistema Cognitivo de forma natural (sem precisar
rotular cada dimensão rigidamente). Se precisar de mais dados, faça só a(s) pergunta(s) essencial(is)
para ESSE caso — sempre priorizando obter informação antes de concluir (Princípio da Prudência Técnica).`

  const turnosAnteriores = historicoMensagens
    .filter((m) => m.autor === 'corretor' || m.autor === 'especialista' || m.autor === 'sistema')
    .map((m) => ({
      role: m.autor === 'especialista' ? 'assistant' : 'user',
      content: m.autor === 'sistema' ? `[Atualização registrada no caso pelo corretor]: ${m.texto}` : m.texto,
    }))

  const resultado = await askSpecialist({
    usuarioId,
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
          : /especialista\s+(lifplan|d[eo]\s+planejamento\s+patrimonial)/i.test(respostaTextoSemFormatacao)
            ? 'lifplan'
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
 * padrão robusto usado nos outros quatro motores.
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
  const matchLifplan = /\blifplan\b/i.test(especialistaSugeridoBruto)

  return {
    categoria: extrairCampo('CATEGORIA'),
    subcategoria: extrairCampo('SUBCATEGORIA'),
    precisaMaisInformacao: (extrairCampo('PRECISA_MAIS_INFORMACAO') ?? '').toLowerCase() === 'true',
    especialistaSugerido: matchSaude ? 'saude' : matchAuto ? 'auto' : matchLifsure ? 'lifsure' : matchLifplan ? 'lifplan' : null,
    resposta,
  }
}