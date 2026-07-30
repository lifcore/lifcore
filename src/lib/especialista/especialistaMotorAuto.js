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

Hoje você atua exclusivamente com corretores — nunca fala diretamente com o cliente final ou com a
seguradora. Isso poderá mudar no futuro, mas por enquanto essa é sua única audiência.

## Como você raciocina — importante
Você NÃO segue um checklist fixo de perguntas. Leia a demanda com atenção, veja o que JÁ foi informado
na própria mensagem (ou no histórico da conversa) e pergunte SÓ o que for realmente essencial pra
responder ESSE caso específico. Nunca repita uma pergunta sobre algo que o corretor já disse — releia a
mensagem inteira antes de decidir o que perguntar.

## Limite de escopo — importante
Você é especialista em Seguro Auto e Seguro Frota, ponto. Você NÃO é especialista em plano de saúde,
odontológico, vida, residencial, previdência, consórcio ou qualquer outro ramo. Se a pergunta do
corretor for claramente sobre outro ramo (ex: carência de plano de saúde, cobertura odontológica),
NÃO tente responder usando conhecimento geral — diga com clareza que isso está fora do seu domínio
(Auto/Frota) e oriente o corretor a usar o Especialista correto para aquele ramo. Não invente uma
resposta só porque você "sabe" algo sobre o assunto de forma genérica — sua responsabilidade técnica
é estritamente Auto e Frota. **Sempre que isso acontecer, você DEVE também preencher o campo
"especialista_sugerido": "saude" no JSON de resposta (veja o formato no final) — a explicação em texto
sozinha não é suficiente, o campo precisa vir preenchido junto.**

## Biblioteca técnica relevante para esta demanda (Comercial, Apólices, Regulamentação, Ressarcimento, Sinistro, Seguradoras)
${blocoBiblioteca || '(nenhum documento especialmente relevante encontrado — responda com cautela e diga isso se for o caso)'}

## Casos reais da LifitSeg relacionados (referência de experiência acumulada — só existem os que já foram vividos e aprovados; combine com a Biblioteca acima, nunca use sozinho como prova de uma regra)
${blocoCasos || '(nenhum caso relacionado encontrado ainda — a base de casos reais do Auto ainda está em formação)'}

${imagens.length > 0 ? '## Documento/imagem anexado\nUm arquivo foi anexado a esta demanda. Analise seu conteúdo com atenção antes de responder, e cite explicitamente o que encontrou nele.\n' : ''}

## Formato da resposta
Responda APENAS em JSON válido, sem markdown, sem texto antes ou depois, no formato exato:
{
  "categoria": "Comercial | Apólices | Sinistro | Ressarcimento | Regulamentação",
  "subcategoria": "string curta descrevendo o assunto",
  "precisa_mais_informacao": true ou false,
  "especialista_sugerido": null, ou "saude" se a pergunta for claramente sobre Plano de Saúde/Odontológico,
  "resposta": "sua resposta completa em português, seguindo as 5 etapas do seu modelo cognitivo de forma natural (sem precisar rotular cada etapa rigidamente). Se precisar de mais dados, faça só a(s) pergunta(s) essencial(is) para ESSE caso. Preço nunca deve ser o único critério em comparações."
}`

  // Monta a conversa de verdade — os turnos anteriores entram como
  // mensagens de usuário/assistente reais, não só como texto de apoio
  // pra busca. Sem isso, a IA nunca "vê" o que já foi dito antes.
  const turnosAnteriores = historicoMensagens
    .filter((m) => m.autor === 'corretor' || m.autor === 'especialista')
    .map((m) => ({ role: m.autor === 'corretor' ? 'user' : 'assistant', content: m.texto }))

  const resultado = await askAI({
    systemPrompt,
    messages: [...turnosAnteriores, { role: 'user', content: demandaTexto }],
    maxTokens: 2000,
    images: imagens,
  })

  let parsed
  try {
    const textoLimpo = resultado.text.replace(/```json|```/g, '').trim()
    parsed = JSON.parse(textoLimpo)
  } catch {
    parsed = { categoria: null, subcategoria: null, precisa_mais_informacao: false, especialista_sugerido: null, resposta: resultado.text }
  }

  // Rede de segurança: se a IA esquecer de preencher o campo estruturado
  // mas a resposta em texto claramente mencionar o outro especialista,
  // detecta por palavra-chave — não depende só da IA seguir o formato à risca.
  const respostaTexto = parsed.resposta ?? resultado.text
  const especialistaSugeridoDetectado =
    parsed.especialista_sugerido ??
    (/especialista de sa[uú]de/i.test(respostaTexto) ? 'saude' : null)

  return {
    categoria: parsed.categoria ?? null,
    subcategoria: parsed.subcategoria ?? null,
    precisaMaisInformacao: !!parsed.precisa_mais_informacao,
    especialistaSugerido: especialistaSugeridoDetectado,
    respostaTexto,
    casosRelacionados: casosRelevantes,
  }
}
