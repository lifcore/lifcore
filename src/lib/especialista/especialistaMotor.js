import { askAI } from '../aiProvider'
import {
  buscarBibliotecaRelevante,
  buscarCasosRelevantes,
  buscarModalidadeAplicavel,
  buscarRegulamentacaoPorCodigo,
} from './bibliotecaService'

/**
 * Motor único do Especialista de Saúde — v3 ("GIN").
 *
 * Reformulado a partir do novo material institucional: o Relatório de
 * Arquitetura Cognitiva (REL-001) passa a ser a base fixa e permanente
 * de comportamento do especialista — substitui de vez o antigo "menu de
 * 17 Modelos de Raciocínio" por uma arquitetura mais madura (identidade
 * própria, 5 modos cognitivos: Comercial, Técnico, Concierge, Analítico
 * e Estratégico), mesma filosofia usada no motor do Auto/Frota (REL-001
 * próprio, "arquitetura cognitiva" ao invés de checklist).
 *
 * A Biblioteca cresceu de 3 para 13 categorias (REG, MOD, COB, COBODO,
 * RED, REDODO, OPS, ODO, AUD, COM, ANA, DOC, COT) — cada uma buscada
 * por relevância direta ao texto, como já funcionava.
 *
 * Os 60 Casos Reais existentes (experiência de atendimentos de verdade)
 * são preservados e continuam sendo buscados normalmente — o material
 * novo é só documentação institucional, não substitui essa experiência.
 */
export async function gerarRespostaEspecialista({
  demandaTexto,
  historicoContexto = '',
  historicoMensagens = [],
  tipoPessoa = null,
  porteCliente = null,
  graduacaoCliente = null,
  imagens = [],
}) {
  const textoBusca = historicoContexto ? `${historicoContexto}\n${demandaTexto}` : demandaTexto

  const [
    ginArquiteturaCognitiva,
    docsReg,
    docsCob,
    docsCobOdo,
    docsRed,
    docsRedOdo,
    docsOps,
    docsOdo,
    docsAud,
    docsCom,
    docsAna,
    docsDoc,
    docsCot,
    casosRelevantes,
  ] = await Promise.all([
    buscarRegulamentacaoPorCodigo('REL-001'),
    buscarBibliotecaRelevante('REG', textoBusca, 3),
    buscarBibliotecaRelevante('COB', textoBusca, 3),
    buscarBibliotecaRelevante('COBODO', textoBusca, 1),
    buscarBibliotecaRelevante('RED', textoBusca, 2),
    buscarBibliotecaRelevante('REDODO', textoBusca, 1),
    buscarBibliotecaRelevante('OPS', textoBusca, 2),
    buscarBibliotecaRelevante('ODO', textoBusca, 1),
    buscarBibliotecaRelevante('AUD', textoBusca, 1),
    buscarBibliotecaRelevante('COM', textoBusca, 2),
    buscarBibliotecaRelevante('ANA', textoBusca, 1),
    buscarBibliotecaRelevante('DOC', textoBusca, 2),
    buscarBibliotecaRelevante('COT', textoBusca, 1),
    buscarCasosRelevantes(textoBusca, 4),
  ])

  const modalidadeAplicavel = await buscarModalidadeAplicavel({ tipoPessoa, porte: porteCliente, graduacao: graduacaoCliente })

  const blocoBiblioteca = [...docsReg, ...docsCob, ...docsCobOdo, ...docsRed, ...docsRedOdo, ...docsOps, ...docsOdo, ...docsAud, ...docsCom, ...docsAna, ...docsDoc, ...docsCot]
    .map((d) => `### [${d.codigo}] ${d.titulo}\n${d.conteudo.slice(0, 1200)}`)
    .join('\n\n')

  const blocoModalidade = modalidadeAplicavel
    ? `### Regras da modalidade deste cliente (${modalidadeAplicavel.codigo} — ${modalidadeAplicavel.titulo})\n${modalidadeAplicavel.conteudo}`
    : ''

  const blocoCasos = casosRelevantes
    .map((c) => {
      const temEstrutura = c.contexto || c.resultado || c.licoes_aprendidas
      const corpo = temEstrutura
        ? `Contexto: ${c.contexto ?? ''}\nResultado: ${c.resultado ?? ''}\nLições aprendidas: ${c.licoes_aprendidas ?? ''}`
        : (c.conteudo_completo ?? '').slice(0, 1000)
      return `### ${c.codigo} — ${c.titulo}\n${corpo}`
    })
    .join('\n\n')

  const systemPrompt = `${ginArquiteturaCognitiva?.conteudo ?? ''}

---

## Você está atuando agora, em uma conversa real dentro do LifCare

Tudo o que foi descrito acima é a sua Arquitetura Cognitiva permanente — sua identidade (GIN), missão,
limites de atuação, filosofia, os cinco modos cognitivos (Comercial, Técnico, Concierge, Analítico,
Estratégico) e as condutas obrigatórias/proibidas. Aplique isso agora, nesta demanda específica,
selecionando o modo (ou combinação de modos) mais adequado ao que está sendo pedido.

Hoje você atua com corretores da LifitSeg. No futuro, também atenderá beneficiários e gestores de RH
diretamente — quando isso acontecer, adapte a linguagem ao interlocutor, como já previsto no Capítulo XI.

## Como você raciocina — importante
Você NÃO segue um checklist fixo de perguntas. Leia a demanda com atenção, veja o que JÁ foi informado
na própria mensagem (ou no histórico da conversa) e pergunte SÓ o que for realmente essencial pra
responder ESSE caso específico. Nunca repita uma pergunta sobre algo que o corretor já disse — releia a
mensagem inteira antes de decidir o que perguntar. Se a pergunta puder ser respondida só com a
Biblioteca abaixo, sem precisar de nenhum dado de negócio, responda direto.

## Calibre o tamanho da resposta ao peso real da pergunta — importante
Nem toda mensagem merece uma análise completa nos cinco modos cognitivos. Se a mensagem for social,
trivial, um teste, uma pergunta solta sem substância técnica (ex: "qual meu nome?", "oi, tudo bem?",
uma curiosidade rápida), responda de forma BREVE e direta — uma ou duas frases, sem estrutura de
parecer técnico. Reserve respostas longas, estruturadas e com todas as etapas do seu raciocínio
SOMENTE para demandas técnicas de verdade dentro do seu domínio, onde essa profundidade realmente
agrega valor. Gastar um texto extenso numa pergunta sem substância é desperdício — tanto pro corretor
que precisa ler, quanto em custo de processamento.

## Limite de escopo — importante
Você é especialista em Plano de Saúde e Odontológico (módulo LifCare), ponto. Você NÃO é especialista em
Seguro Auto, Frota, Vida, Residencial, previdência, consórcio ou qualquer outro ramo. Se a pergunta for
claramente sobre outro ramo, NÃO tente responder usando conhecimento geral — diga com clareza que está
fora do seu domínio e sinalize isso no campo ESPECIALISTA_SUGERIDO do cabeçalho (veja o formato abaixo).

## Biblioteca GIN relevante para esta demanda (fonte PRINCIPAL — tem mais peso que os casos abaixo)
${blocoBiblioteca || '(nenhum documento especialmente relevante encontrado — responda com cautela e diga isso se for o caso)'}

${blocoModalidade}

## Casos reais da LifitSeg relacionados (experiência de atendimentos de verdade — combine com a Biblioteca acima, nunca use sozinho como prova de uma regra)
${blocoCasos || '(nenhum caso relacionado encontrado)'}

## Regra permanente de atenção — aplique por julgamento sempre que fizer sentido
Se a demanda envolver uma condição de saúde já existente (gravidez, cirurgia agendada, doença crônica,
tratamento em andamento), lembre-se das regras gerais (Lei 9.656/1998 e normas ANS, válidas para todas
as modalidades): carência máxima para parto a termo até 300 dias; demais procedimentos até 180 dias;
urgência e emergência até 24 horas. Essas carências contam do zero a cada troca de plano, salvo
redução/isenção negociada ou aproveitamento via portabilidade. Alerte isso PROATIVAMENTE, mesmo que o
corretor não tenha perguntado diretamente.

${imagens.length > 0 ? '## Documento/imagem anexado\nUm arquivo foi anexado a esta demanda. Analise seu conteúdo com atenção antes de responder, e cite explicitamente o que encontrou nele.\n' : ''}

## Formato da resposta
Responda EXATAMENTE neste formato, sem markdown ao redor, sem texto antes do cabeçalho:

CATEGORIA: Comercial | Técnico | Concierge | Analítico | Estratégico
SUBCATEGORIA: string curta descrevendo o assunto
PRECISA_MAIS_INFORMACAO: true ou false
ESPECIALISTA_SUGERIDO: null, ou "auto" se a pergunta for claramente sobre Seguro Auto/Frota
---RESPOSTA---
Sua resposta completa em português vem aqui, livre — pode ter parágrafos, quebras de linha, listas,
emojis, à vontade, sem nenhuma restrição de formato. Siga sua Arquitetura Cognitiva de forma natural
(sem precisar rotular cada etapa/modo rigidamente). Se precisar de mais dados, faça só a(s)
pergunta(s) essencial(is) para ESSE caso.`

  const turnosAnteriores = historicoMensagens
    .filter((m) => m.autor === 'corretor' || m.autor === 'especialista')
    .map((m) => ({ role: m.autor === 'corretor' ? 'user' : 'assistant', content: m.texto }))

  const resultado = await askAI({
    systemPrompt,
    messages: [...turnosAnteriores, { role: 'user', content: demandaTexto }],
    maxTokens: 4000,
    images: imagens,
  })

  const parsed = parsearRespostaComSeparador(resultado.text)

  const respostaTexto = parsed.resposta
  const especialistaSugeridoDetectado =
    parsed.especialistaSugerido ??
    (/especialista de auto/i.test(respostaTexto) ? 'auto' : null)

  return {
    categoria: parsed.categoria,
    subcategoria: parsed.subcategoria,
    precisaMaisInformacao: parsed.precisaMaisInformacao,
    especialistaSugerido: especialistaSugeridoDetectado,
    respostaTexto,
    regulamentacaoAplicavel: modalidadeAplicavel,
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
    // A IA não seguiu o formato esperado — ainda assim entregamos o
    // texto bruto ao corretor, nunca travamos aqui.
    return { categoria: null, subcategoria: null, precisaMaisInformacao: false, especialistaSugerido: null, resposta: textoBruto.trim() }
  }

  const cabecalho = textoBruto.slice(0, posicaoMarcador)
  const resposta = textoBruto.slice(posicaoMarcador + marcador.length).trim()

  function extrairCampo(nomeCampo) {
    const m = cabecalho.match(new RegExp(`${nomeCampo}\\s*:\\s*(.+)`, 'i'))
    return m ? m[1].trim() : null
  }

  const especialistaSugeridoBruto = (extrairCampo('ESPECIALISTA_SUGERIDO') ?? '').toLowerCase()

  return {
    categoria: extrairCampo('CATEGORIA'),
    subcategoria: extrairCampo('SUBCATEGORIA'),
    precisaMaisInformacao: (extrairCampo('PRECISA_MAIS_INFORMACAO') ?? '').toLowerCase() === 'true',
    especialistaSugerido: ['null', '', 'none', 'nenhum'].includes(especialistaSugeridoBruto) ? null : especialistaSugeridoBruto,
    resposta,
  }
}
