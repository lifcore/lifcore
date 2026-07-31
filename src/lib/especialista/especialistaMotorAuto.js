import { askAI } from '../aiProvider'
import {
  buscarBibliotecaRelevanteAuto,
  buscarCasosRelevantesAuto,
  buscarDocumentoAutoPorCodigo,
} from './bibliotecaServiceAuto'

/**
 * Motor único do Especialista de Auto/Frota (LifAuto/LifFleet).
 *
 * Segue o MESMO princípio arquitetural do motor de Saúde (uma única
 * chamada de raciocínio, sem Playbooks fixos, sem checklist obrigatório
 * travando a resposta) — mas com uma diferença estrutural importante:
 *
 * Em vez de um "menu de Modelos de Raciocínio" (REASON) citado como
 * referência solta, o Auto tem um documento único e mais robusto — o
 * RELATÓRIO DE ENGENHARIA COGNITIVA (REL-001) — que é injetado por
 * INTEIRO em toda chamada, como a base fixa e permanente de como o
 * especialista deve se comportar, raciocinar e se comunicar. Ele não
 * é buscado por relevância (é sempre o mesmo, sempre presente).
 *
 * A Biblioteca (COM/APO/REG/RES/SIN/SEG) continua sendo buscada por
 * relevância direta ao texto, como no Saúde. Casos Reais começam
 * vazios de propósito — crescem organicamente a partir do ciclo real
 * de atendimento (Demandas encerradas → resumo sugerido → aprovação
 * humana), nunca importados prontos.
 */
export async function gerarRespostaEspecialistaAuto({ demandaTexto, historicoContexto = '', historicoMensagens = [], seguradoraMencionada = null, imagens = [] }) {
  const textoBusca = historicoContexto ? `${historicoContexto}\n${demandaTexto}` : demandaTexto

  const [
    relatorioCognitivo,
    docsComercial,
    docsApolices,
    docsRegulamentacao,
    docsRessarcimento,
    docsSinistro,
    docsSeguradoras,
    casosRelevantes,
  ] = await Promise.all([
    buscarDocumentoAutoPorCodigo('REL-001'),
    buscarBibliotecaRelevanteAuto('COM', textoBusca, 3),
    buscarBibliotecaRelevanteAuto('APO', textoBusca, 3),
    buscarBibliotecaRelevanteAuto('REG', textoBusca, 2),
    buscarBibliotecaRelevanteAuto('RES', textoBusca, 2),
    buscarBibliotecaRelevanteAuto('SIN', textoBusca, 3),
    buscarBibliotecaRelevanteAuto('SEG', seguradoraMencionada ?? textoBusca, 2),
    buscarCasosRelevantesAuto(textoBusca, 4),
  ])

  const blocoBiblioteca = [...docsComercial, ...docsApolices, ...docsRegulamentacao, ...docsRessarcimento, ...docsSinistro, ...docsSeguradoras]
    .map((d) => `### [${d.codigo}] ${d.titulo}\n${d.conteudo.slice(0, 900)}`)
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

  const systemPrompt = `${relatorioCognitivo?.conteudo ?? ''}

---

## Você está atuando agora, em uma conversa real com um corretor da LifitSeg

Tudo o que foi descrito acima é o seu perfil institucional permanente — sua natureza, seus princípios,
seu modelo cognitivo de 5 etapas (Compreensão → Diagnóstico → Análise Técnica → Orientação → Confirmação),
o que você deve e não deve fazer. Aplique isso agora, nesta demanda específica.

Toda mensagem que você recebe aqui é de um corretor da LifitSeg falando sobre um cliente dele — o
sistema já garante isso (é uma tela interna, de uso exclusivo dos corretores). Você NUNCA fala
diretamente com o cliente final ou com a seguradora aqui, e não precisa confirmar isso com quem está
te escrevendo, mesmo que a frase esteja ambígua ou mal pontuada. Vá direto ao ponto técnico da demanda.

## Como você raciocina — importante
Você NÃO segue um checklist fixo de perguntas. Leia a demanda com atenção, veja o que JÁ foi informado
na própria mensagem (ou no histórico da conversa) e pergunte SÓ o que for realmente essencial pra
responder ESSE caso específico. Nunca repita uma pergunta sobre algo que o corretor já disse — releia a
mensagem inteira antes de decidir o que perguntar.

## Calibre o tamanho da resposta ao peso real da pergunta — importante
Nem toda mensagem merece uma análise completa nas cinco etapas do seu modelo cognitivo. Se a mensagem
for social, trivial, um teste, uma pergunta solta sem substância técnica (ex: "qual meu nome?", "oi,
tudo bem?", uma curiosidade rápida), responda de forma BREVE e direta — uma ou duas frases, sem
estrutura de parecer técnico. Reserve respostas longas e estruturadas SOMENTE para demandas técnicas
de verdade dentro do seu domínio (Auto/Frota), onde essa profundidade realmente agrega valor. Gastar
um texto extenso numa pergunta sem substância é desperdício — tanto pro corretor que precisa ler,
quanto em custo de processamento.

## Limite de escopo — importante
Você é especialista em Seguro Auto e Seguro Frota, ponto. Você NÃO é especialista em plano de saúde/
odontológico (módulo LifCare) nem em Vida, Patrimonial, Transportes, Responsabilidade Civil e demais
Seguros Gerais (módulo LifSure). Se a pergunta do corretor for claramente sobre outro ramo, NÃO tente
responder usando conhecimento geral — diga com clareza que isso está fora do seu domínio (Auto/Frota)
e oriente o corretor a usar o Especialista correto para aquele ramo. Não invente uma resposta só
porque você "sabe" algo sobre o assunto de forma genérica — sua responsabilidade técnica é estritamente
Auto e Frota. **Sempre que isso acontecer, você DEVE também preencher o campo ESPECIALISTA_SUGERIDO no
cabeçalho da resposta com a palavra exata "saude" ou "lifsure" (sem aspas, sem markdown), conforme o
caso — a explicação em texto sozinha não é suficiente, o campo precisa vir preenchido junto.**

## Biblioteca técnica relevante para esta demanda (Comercial, Apólices, Regulamentação, Ressarcimento, Sinistro, Seguradoras)
${blocoBiblioteca || '(nenhum documento especialmente relevante encontrado — responda com cautela e diga isso se for o caso)'}

## Casos reais da LifitSeg relacionados (referência de experiência acumulada — só existem os que já foram vividos e aprovados; combine com a Biblioteca acima, nunca use sozinho como prova de uma regra)
${blocoCasos || '(nenhum caso relacionado encontrado ainda — a base de casos reais do Auto ainda está em formação)'}

${imagens.length > 0 ? '## Documento/imagem anexado\nUm arquivo foi anexado a esta demanda. Analise seu conteúdo com atenção antes de responder, e cite explicitamente o que encontrou nele.\n' : ''}

## Formato da resposta
Responda EXATAMENTE neste formato, sem markdown ao redor, sem texto antes do cabeçalho:

CATEGORIA: Comercial | Apólices | Sinistro | Ressarcimento | Regulamentação
SUBCATEGORIA: string curta descrevendo o assunto
PRECISA_MAIS_INFORMACAO: true ou false
ESPECIALISTA_SUGERIDO: escreva exatamente a palavra "null" (sem aspas, sem markdown), ou "saude" (Plano de Saúde/Odontológico) ou "lifsure" (Vida, Patrimonial, RC, Transportes e demais Seguros Gerais), conforme o caso. Nada mais nessa linha.
---RESPOSTA---
Sua resposta completa em português vem aqui, livre — pode ter parágrafos, quebras de linha, listas,
emojis, à vontade, sem nenhuma restrição de formato. Siga as 5 etapas do seu modelo cognitivo de forma
natural (sem precisar rotular cada etapa rigidamente). Se precisar de mais dados, faça só a(s)
pergunta(s) essencial(is) para ESSE caso. Preço nunca deve ser o único critério em comparações.`

  // Monta a conversa de verdade — os turnos anteriores entram como
  // mensagens de usuário/assistente reais, não só como texto de apoio
  // pra busca. Sem isso, a IA nunca "vê" o que já foi dito antes.
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

  // Rede de segurança: se a IA esquecer de preencher o campo estruturado
  // mas a resposta em texto claramente mencionar o outro especialista,
  // detecta por palavra-chave — não depende só da IA seguir o formato à risca.
  const respostaTexto = parsed.resposta
  const respostaTextoSemFormatacao = respostaTexto.replace(/[*_`#]/g, '')
  const especialistaSugeridoDetectado =
    parsed.especialistaSugerido ??
    (/especialista\s+d[eo]\s+sa[uú]de/i.test(respostaTextoSemFormatacao)
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
 * Lê o formato "cabeçalho + ---RESPOSTA---+ texto livre" — muito mais
 * robusto que JSON pra respostas longas com parágrafos, porque o texto
 * da resposta nunca precisa ser escapado (não vive dentro de uma string
 * JSON, então uma quebra de linha "de verdade" nunca quebra o formato).
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
  const matchLifsure = /\blifsure\b/i.test(especialistaSugeridoBruto)

  return {
    categoria: extrairCampo('CATEGORIA'),
    subcategoria: extrairCampo('SUBCATEGORIA'),
    precisaMaisInformacao: (extrairCampo('PRECISA_MAIS_INFORMACAO') ?? '').toLowerCase() === 'true',
    especialistaSugerido: matchSaude ? 'saude' : matchLifsure ? 'lifsure' : null,
    resposta,
  }
}
