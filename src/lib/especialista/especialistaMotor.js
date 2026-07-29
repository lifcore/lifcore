import { askAI } from '../aiProvider'
import {
  buscarBibliotecaRelevante,
  buscarCasosRelevantes,
  buscarReasonCompactos,
  buscarRegulamentacaoPorPorte,
  buscarRegulamentacaoPorCodigo,
} from './bibliotecaService'

/**
 * Motor único do Especialista de Saúde — v2.
 *
 * Substitui a arquitetura anterior (classificar → escolher 1 de N
 * Playbooks fixos → checar checklist obrigatório → só então responder).
 *
 * Agora é UMA chamada de raciocínio: a Biblioteca é consultada por
 * relevância direta ao texto (sem precisar "escolher categoria" antes),
 * os Modelos de Raciocínio entram como MENU de referência (não como
 * checklist obrigatório), e a própria IA decide, por julgamento, se
 * precisa perguntar algo — perguntando só o que for essencial PARA
 * AQUELE caso específico, não uma lista genérica pré-definida.
 *
 * Isso elimina de vez a categoria de bug "Playbook travado/inválido",
 * porque não existe mais Playbook como portão de decisão.
 */
export async function gerarRespostaEspecialista({ demandaTexto, historicoContexto = '', porteCliente = null, imagens = [] }) {
  const textoBusca = historicoContexto ? `${historicoContexto}\n${demandaTexto}` : demandaTexto

  const [docsANS, docsOperadoras, docsRegulamentacaoGeral, casosRelevantes, reasonsDisponiveis] = await Promise.all([
    buscarBibliotecaRelevante('ANS', textoBusca, 5),
    buscarBibliotecaRelevante('Operadoras', textoBusca, 3),
    buscarBibliotecaRelevante('Regulamentacao', textoBusca, 2),
    buscarCasosRelevantes(textoBusca, 4),
    buscarReasonCompactos(),
  ])

  // Se soubermos o porte do cliente vinculado, buscamos também a
  // regulamentação específica daquela modalidade (mais precisa que a
  // busca genérica por relevância).
  const regulamentacaoModalidade = porteCliente ? await buscarRegulamentacaoPorPorte(porteCliente) : null

  const blocoBiblioteca = [...docsANS, ...docsOperadoras, ...docsRegulamentacaoGeral]
    .map((d) => `### [${d.codigo}] ${d.titulo}\n${d.conteudo.slice(0, 700)}`)
    .join('\n\n')

  const blocoModalidade = regulamentacaoModalidade
    ? `### Regulamentação da modalidade deste cliente (${regulamentacaoModalidade.codigo} — ${regulamentacaoModalidade.titulo})\n${regulamentacaoModalidade.conteudo}`
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

  const blocoReasons = reasonsDisponiveis
    .map((r) => `- ${r.codigo} (${r.titulo}): ${r.objetivo}`)
    .join('\n')

  const systemPrompt = `Você é o Especialista Cognitivo de Saúde da LifitSeg.

## Seu papel — leia com atenção antes de tudo
Você é APOIO TÉCNICO do corretor. Você nunca fala diretamente com o cliente
ou com a operadora — não tem esse contato, e por isso não pode confirmar
sozinho o que só o corretor (falando com o cliente) ou a operadora (em
atendimento direto) sabe de verdade. Suas respostas orientam o corretor;
a ação final é sempre responsabilidade dele, nunca sua.
Seu tom é de um consultor interno experiente orientando um colega —
direto, objetivo, sem bate-papo desnecessário.

## Como você raciocina (importante)
Você NÃO segue um checklist fixo de perguntas. Você usa julgamento:
leia a demanda, veja o que já foi informado, e pergunte SÓ o que for
realmente essencial pra responder ESSE caso específico — nunca uma
lista genérica de dados que não tem relação direta com a pergunta feita.
Se a pergunta puder ser respondida só com a Biblioteca abaixo (sem
precisar de nenhuma ação real de negócio), responda direto — não
peça CNPJ, quantidade de vidas ou qualquer dado de negócio só para
esclarecer uma regra ou elegibilidade.
Se o cliente já tiver um plano hoje e quiser trocar/comparar (reajuste
alto, insatisfação), a pergunta mais importante costuma ser sobre o
PLANO ATUAL (tipo PF ou CNPJ, quantas vidas) — não dados de um plano novo do zero.

## Modelos de Raciocínio disponíveis (use como guia de abordagem, não como checklist obrigatório)
${blocoReasons}

## Biblioteca Institucional relevante para esta demanda (fonte PRINCIPAL — tem mais peso que os casos abaixo)
${blocoBiblioteca || '(nenhum documento especialmente relevante encontrado — responda com cautela e diga isso se for o caso)'}

${blocoModalidade}

## Casos reais da LifitSeg relacionados (referência de experiência — combine com a Biblioteca acima, nunca use sozinho como prova de uma regra)
${blocoCasos || '(nenhum caso relacionado encontrado)'}

## Regra permanente de atenção — aplique por julgamento sempre que fizer sentido
Se a demanda envolver uma condição de saúde já existente (gravidez, cirurgia
agendada, doença crônica, tratamento em andamento), lembre-se das regras gerais
(Lei 9.656/1998 e normas ANS, válidas para todas as modalidades):
- Carência máxima para parto a termo: até 300 dias.
- Carência máxima para demais procedimentos: até 180 dias.
- Urgência e emergência: até 24 horas.
Essas carências contam do zero a cada troca de plano, salvo redução/isenção
negociada ou aproveitamento via portabilidade — INDEPENDENTE de já haver ou
não um plano anterior. Alerte isso PROATIVAMENTE, mesmo que o corretor não
tenha perguntado diretamente, e mesmo que a demanda ainda esteja incompleta
em outros aspectos — esse alerta nunca deve ficar escondido atrás de outras
perguntas.

${imagens.length > 0 ? '## Documento/imagem anexado\nUm arquivo foi anexado a esta demanda. Analise seu conteúdo com atenção antes de responder, e cite explicitamente o que encontrou nele.\n' : ''}

## Formato da resposta
Responda APENAS em JSON válido, sem markdown, sem texto antes ou depois, no formato exato:
{
  "categoria": "Comercial | Assistencial | Administrativo",
  "subcategoria": "string curta descrevendo o assunto",
  "precisa_mais_informacao": true ou false,
  "resposta": "sua resposta completa em português. Se precisar de mais dados, faça só a(s) pergunta(s) essencial(is) para ESSE caso. Se já tiver o suficiente, responda como um consultor experiente responderia — pode incluir diagnóstico, fundamentação (citando a Biblioteca), riscos, alternativas, recomendação e próximos passos, de forma natural, sem precisar rotular cada seção rigidamente."
}`

  const resultado = await askAI({
    systemPrompt,
    messages: [{ role: 'user', content: demandaTexto }],
    maxTokens: 2000,
    images: imagens,
  })

  let parsed
  try {
    const textoLimpo = resultado.text.replace(/```json|```/g, '').trim()
    parsed = JSON.parse(textoLimpo)
  } catch {
    // Se por algum motivo a IA não devolver JSON válido, ainda assim
    // entregamos a resposta bruta ao corretor — nunca travamos aqui.
    parsed = { categoria: null, subcategoria: null, precisa_mais_informacao: false, resposta: resultado.text }
  }

  return {
    categoria: parsed.categoria ?? null,
    subcategoria: parsed.subcategoria ?? null,
    precisaMaisInformacao: !!parsed.precisa_mais_informacao,
    respostaTexto: parsed.resposta ?? resultado.text,
    regulamentacaoAplicavel: regulamentacaoModalidade,
    casosRelacionados: casosRelevantes,
  }
}
