import { askAI } from '../aiProvider'
import {
  buscarPlaybook,
  buscarModelosRaciocinio,
  buscarBibliotecaRelevante,
  buscarCasosFundamentais,
  buscarOperadoraPorNome,
  buscarRegulamentacaoPorPorte,
  buscarRegulamentacaoPorCodigo,
} from './bibliotecaService'

/**
 * Motor de execução de Playbooks — implementa as etapas centrais
 * do ENG-003 (Consulta à Biblioteca, Seleção do Modelo de
 * Raciocínio, Execução do Playbook, Geração da Resposta) e a
 * estrutura de execução definida no ENG-004.
 *
 * IMPORTANTE: a IA nunca responde diretamente à demanda (ENG-004,
 * seção 3). Ela sempre executa dentro dos limites de um Playbook,
 * com o conhecimento institucional já reunido e injetado no prompt.
 */
export async function executarPlaybook({ codigoPlaybook, demandaTexto, classificacao, imagens = [], porteCliente = null }) {
  const playbook = await buscarPlaybook(codigoPlaybook)
  if (!playbook) {
    throw new Error(
      `Playbook ${codigoPlaybook} não encontrado ou inativo. Verifique institucional.playbooks.`
    )
  }

  // Etapa 5 (ENG-003): reúne os Modelos de Raciocínio referenciados pelo Playbook
  const modelosRaciocinio = await buscarModelosRaciocinio(playbook.modelos_raciocinio)

  // Etapa 4 (ENG-003): consulta as fontes institucionais indicadas pelo Playbook,
  // priorizando os documentos mais relevantes para esta demanda específica
  const fontesConsultadas = {}
  for (const fonte of playbook.fontes_consulta ?? []) {
    fontesConsultadas[fonte] = await buscarBibliotecaRelevante(fonte, demandaTexto, 5)
  }

  // Prioridade de busca da regulamentação (REG):
  // 1º o porte real do cliente cadastrado (mais confiável, se houver);
  // 2º a modalidade que o classificador inferiu do próprio texto da
  //    demanda, útil quando a conversa acontece sem cliente vinculado.
  const CODIGO_REG_POR_MODALIDADE = {
    PF: 'REG-001',
    Adesao: 'REG-002',
    PME1: 'REG-003',
    PME2: 'REG-004',
    Negociado: 'REG-005',
  }

  let regulamentacaoAplicavel = porteCliente ? await buscarRegulamentacaoPorPorte(porteCliente) : null
  if (!regulamentacaoAplicavel) {
    const codigoPorModalidade = CODIGO_REG_POR_MODALIDADE[classificacao.modalidade_detectada]
    if (codigoPorModalidade) {
      regulamentacaoAplicavel = await buscarRegulamentacaoPorCodigo(codigoPorModalidade)
    }
  }

  // Casos Fundamentais relacionados a este playbook (experiência real da LifitSeg)
  const casosRelacionados = playbook.casos_relacionados?.length
    ? await buscarCasosFundamentais(playbook.casos_relacionados)
    : []

  // Se a demanda menciona uma operadora, busca o cadastro institucional dela
  let operadoraInfo = null
  if (classificacao.operadora_mencionada) {
    operadoraInfo = await buscarOperadoraPorNome(classificacao.operadora_mencionada)
  }

  // Verifica informações obrigatórias do Playbook (ENG-004, seção "Informações Obrigatórias")
  const informacoesFaltantes = classificacao.informacoes_ausentes ?? []

  const systemPrompt = construirPromptSistema({
    playbook,
    modelosRaciocinio,
    fontesConsultadas,
    casosRelacionados,
    operadoraInfo,
    regulamentacaoAplicavel,
    condicaoSaudeRelevante: classificacao.condicao_saude_relevante,
    temAnexo: imagens.length > 0,
  })

  const resultadoIA = await askAI({
    systemPrompt,
    messages: [{ role: 'user', content: demandaTexto }],
    maxTokens: 1800,
    images: imagens,
  })

  return {
    playbook,
    modelosRaciocinio,
    fontesConsultadas,
    casosRelacionados,
    operadoraInfo,
    regulamentacaoAplicavel,
    informacoesFaltantes,
    respostaBruta: resultadoIA.text,
  }
}

/**
 * Constrói o prompt estruturado que a IA vai executar, seguindo
 * fielmente a "Saída Esperada" definida no ENG-004: diagnóstico,
 * fundamentação, riscos, alternativas, recomendação, próximos passos.
 */
function construirPromptSistema({
  playbook,
  modelosRaciocinio,
  fontesConsultadas,
  casosRelacionados,
  operadoraInfo,
  regulamentacaoAplicavel,
  condicaoSaudeRelevante,
  temAnexo,
}) {
  const blocoModelos = modelosRaciocinio
    .map((m) => `### ${m.codigo} — ${m.titulo}\nObjetivo: ${m.objetivo}\n`)
    .join('\n')

  const blocoFontes = Object.entries(fontesConsultadas)
    .map(
      ([categoria, docs]) =>
        `### Fonte: ${categoria}\n` +
        docs.map((d) => `- [${d.codigo}] ${d.titulo}: ${d.conteudo.slice(0, 500)}`).join('\n')
    )
    .join('\n\n')

  const blocoCasos = casosRelacionados
    .map((c) => {
      // Se os campos estruturados existirem, usa eles (mais compacto).
      // Caso contrário, usa o texto integral importado como fallback.
      const temEstrutura = c.contexto || c.resultado || c.licoes_aprendidas
      if (temEstrutura) {
        return (
          `### ${c.codigo} — ${c.titulo}\n` +
          `Contexto: ${c.contexto ?? ''}\n` +
          `Resultado: ${c.resultado ?? ''}\n` +
          `Lições aprendidas: ${c.licoes_aprendidas ?? ''}\n`
        )
      }
      return `### ${c.codigo} — ${c.titulo}\n${(c.conteudo_completo ?? '').slice(0, 1500)}\n`
    })
    .join('\n\n')

  const blocoOperadora = operadoraInfo
    ? `### Operadora identificada\n${operadoraInfo.nome} (${operadoraInfo.registro_ans ?? 'registro ANS não informado'})\n`
    : ''

  const blocoRegulamentacao = regulamentacaoAplicavel
    ? `### Regulamentação aplicável ao porte deste cliente (${regulamentacaoAplicavel.codigo} — ${regulamentacaoAplicavel.titulo})\n${regulamentacaoAplicavel.conteudo}\n`
    : ''

  const blocoAlertaSaude = condicaoSaudeRelevante
    ? `## ⚠️ ALERTA OBRIGATÓRIO — Condição de saúde já existente detectada: "${condicaoSaudeRelevante}"

Regra geral conhecida (Lei 9.656/1998 e normas da ANS, aplicável a TODAS as modalidades — PF, Adesão, PME1, PME2, Negociado — variando apenas a possibilidade de negociação de redução conforme a modalidade e a operadora):
- Carência máxima para parto a termo: até 300 dias.
- Carência máxima para demais procedimentos: até 180 dias.
- Urgência e emergência: até 24 horas.
- Essas regras valem tanto para contratação nova quanto para inclusão de novo beneficiário em contrato já existente, INDEPENDENTEMENTE de já haver ou não um plano anterior — a carência é sempre contada a partir do início da vigência daquele beneficiário específico no contrato em questão, salvo redução/isenção expressamente negociada ou aproveitamento de carência via portabilidade.

Antes de qualquer recomendação comercial, você DEVE verificar se a condição relatada se enquadra nessas regras (ex: gravidez em curso e busca por plano novo = carência de parto muito provavelmente NÃO será cumprida a tempo) e apresentar esse alerta logo no início do "Diagnóstico", antes de qualquer outra consideração comercial. NUNCA omita esse risco para não "estragar a venda" — omitir isso gera prejuízo real e desconfiança do cliente depois.\n`
    : ''

  return `Você é o Especialista Cognitivo de Saúde da LifitSeg (ENG-003).
Você está executando o Playbook ${playbook.codigo} — ${playbook.nome}.
Objetivo deste playbook: ${playbook.objetivo}

## Seu papel — leia com atenção antes de tudo
Você é APOIO TÉCNICO do corretor. Você nunca fala diretamente com o cliente
ou com a operadora — não tem esse contato, e por isso não pode confirmar
sozinho o que só o corretor (falando com o cliente) ou a operadora (em
atendimento direto) sabe de verdade. Suas respostas orientam o corretor;
a ação final (contatar o cliente, confirmar algo com a operadora, fechar
o caso) é sempre responsabilidade do corretor, nunca sua.
Seu tom é de um consultor interno experiente orientando um colega —
direto, objetivo, sem bate-papo desnecessário. Você não faz perguntas
que não sejam estritamente necessárias, não inventa regras, e não tenta
resolver sozinho o que depende de contato humano com cliente/operadora.

## Ordem de prioridade das suas fontes de conhecimento
1º — Biblioteca Institucional (ANS, Operadoras, Regulamentação por modalidade): é sua fonte PRINCIPAL e a que tem mais peso. Toda resposta deve se apoiar primeiro nela.
2º — Casos Reais da LifitSeg: são referência de EXPERIÊNCIA e direcionamento — mostram como a LifitSeg já tratou situações parecidas na prática. São informação valiosa, mas nunca a base isolada de uma resposta — sempre combine com a Biblioteca acima. Nunca cite um Caso Real como se fosse, sozinho, a prova de uma regra.

## Modelos de Raciocínio aplicáveis
${blocoModelos}

## Biblioteca Institucional consultada (fonte principal)
${blocoFontes}

${blocoRegulamentacao}

## Casos reais da LifitSeg (referência de experiência, não fonte isolada)
${blocoCasos}

${blocoOperadora}

${blocoAlertaSaude}

${temAnexo ? '## Documento/imagem anexado\nUm arquivo foi anexado a esta demanda (pode ser um exame, carta de negativa, relatório de sinistralidade ou documento similar). Analise seu conteúdo com atenção antes de responder, e cite explicitamente o que encontrou nele.\n' : ''}

## Formato obrigatório da resposta
Responda em português, de forma clara e objetiva, estruturada exatamente assim:

**Diagnóstico:** (o que está acontecendo, em termos técnicos)
**Fundamentação:** (quais normas da Biblioteca sustentam essa análise — cite a Biblioteca primeiro; casos reais só como complemento, se agregarem)
**Riscos identificados:** (o que pode dar errado se nada for feito, ou se a ação errada for tomada)
**Alternativas:** (2-3 caminhos possíveis, com prós e contras)
**Recomendação:** (qual caminho a LifitSeg deveria seguir, e por quê)
**Próximos passos:** (ações concretas que o CORRETOR deve tomar — nunca ações que pressupõem que você mesmo vai falar com o cliente ou a operadora)

Se faltar informação essencial para responder com segurança, diga isso
explicitamente ao invés de supor.`
}
