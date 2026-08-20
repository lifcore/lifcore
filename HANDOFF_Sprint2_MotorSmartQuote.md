# HANDOFF — Sprint 2: Motor Smart Quote
### Continuação de outro chat (encerrado por falta de créditos, não por decisão) — LifCore / Connect Center

---

## 0. Contexto rápido — por que este handoff existe

O trabalho continuou em outro chat/conta depois da sessão de ontem/hoje que fechou com os 2 handoffs anteriores (`HANDOFF_Ajuste_Sistema_Biblioteca.md` e `HANDOFF_Continuacao_Preparacao_Biblioteca.md`). Nesse outro chat, a **Sprint 1 (Biblioteca + Importador) foi construída e concluída de verdade** — schema no ar, 8 operadoras importadas e auditadas. Esse chat **acabou os créditos no meio da Sprint 2** (Motor Smart Quote), exatamente no momento em que o Claude de lá tinha acabado de pedir 3 arquivos pra revisar antes de escrever qualquer código novo.

**Este handoff existe pra abrir um chat novo que continue exatamente daquele ponto — não do zero.**

Importante: eu (Claude, nesta conversa) **não vi** o conteúdo real do trabalho da Sprint 1 nem os 3 arquivos mencionados abaixo — só tenho acesso ao que o Raphael colou aqui (resultado da auditoria + a mensagem do Chief + a última resposta do Claude de lá, cortada no meio). Tudo que está marcado como "confirmado" vem desses documentos; tudo que está marcado como "verificar" precisa ser conferido no chat novo antes de assumir como verdade.

---

## 1. Sprint 1 — CONFIRMADO CONCLUÍDA

Auditoria fechou 100%, 8 operadoras, todas com cobertura real, nenhuma zerada:

| Operadora | Coberturas |
|---|---|
| Amil | 7.958 |
| Bradesco | 9.089 (1.899 Hospitalar + 7.190 padrão) |
| Hapvida | 3.620 |
| Omint | 3.894 |
| Porto Seguro | 6.555 |
| Sobam | 12 |
| SulAmérica | 6.197 (3.586 Saúde + 2.611 Hospitalar) |
| Unimed Jundiaí | 420 |

Critério do Chief pra considerar fechado: "se os valores e vínculos baterem com a fonte, congelamos o BMR-005 e partimos com uma fundação comprovada." Passou.

**Faltam 3 operadoras** — arquivos já preparados pelo Raphael, upload pode acontecer depois, **não bloqueia** o início da Sprint 2.

### Decisão de schema registrada (Chief, ainda não verificada ao vivo neste handoff)
- Rede **não duplicada por plano** — modelo relacional: `HOSPITAIS` (hospital_id, nome, município, região, categoria) + `PLANO_REDE` (plano_id, hospital_id, cobertura), não um blob de rede dentro de cada plano.
- Banco com entidades consultáveis de verdade (não só arquivo/JSON guardado): `planos`, `precos`, `rede`, `regras`, `operadoras`, `regioes`, `produtos`, `versoes_biblioteca`.
- Estrutura de biblioteca preparada pra crescer, sem amarrar a Jundiaí/Campinas/São Paulo especificamente.

**Verificar no chat novo**: nomes reais das tabelas (há menção a prefixo `mercado_saude_*` na última resposta do Claude anterior, mas não confirmado o schema completo).

---

## 2. AÇÃO IMEDIATA — antes de escrever qualquer código da Sprint 2

Isso é literalmente onde o chat anterior parou. Não pular esta etapa.

Existem 3 arquivos **já no código**, de antes daquela conversa, nunca lidos pelo Claude de lá — só conhecidos pelo inventário de arquivos:

- `src/lib/crm/smartQuoteService.js`
- `src/lib/crm/smartQuoteLogica.js`
- `supabase/functions/processar-estudo-mercado/motor-estudo/index.ts` (e `estrategias/multicalculo.ts`)

**Pedir esses 3 arquivos e ler antes de escrever qualquer linha nova.** Podem ser:
- (a) 80% do que a Sprint 2A precisa, só faltando plugar nas tabelas novas da biblioteca; ou
- (b) resquício do modelo antigo, pra descartar — do mesmo jeito que aconteceu com `processar-catalogo-mercado` na sessão anterior.

**Por que isso é inegociável, não só cautela:** já custou uma tabela inteira duplicada uma vez (`seguradora_produtos`) por não checar antes de construir. Não repetir.

---

## 3. Duas perguntas do Raphael, feitas no chat anterior, nunca respondidas

Não foram resolvidas antes do chat travar — carregar pro chat novo, resolver logo no início, **não assumir resposta**:

1. **Botão de alterar e excluir de seguradoras** — falta essa ação na tela (Connect Center)? Onde exatamente?
2. **Rede e Regras "subiram" a hierarquia de pastas?** — dado o achado de que Rede pode ser região-agnóstica pra algumas operadoras (não confirmado pra todas), a estrutura de pastas/schema ficou `Operadora > Região > Produto > {Preços, Rede, Regras}` (tudo duplicado por região) ou `Operadora > {Rede, Regras}` + `Operadora > Região > Produto > Preços` (Rede/Regras compartilhados)? **Verificar contra o schema real antes de responder.**

---

## 4. Aviso pra frente — fase de cotação/formulários

Quando a Sprint chegar na parte de desenho de cotação e formulários, o Raphael quer **parar e desenhar o fluxo inteiro com cuidado antes de codificar**, especificamente pra não criar travas desnecessárias (campos obrigatórios demais, sequência rígida demais, etc.). **Avisar ele explicitamente quando chegar nessa fase** — não seguir direto pro código.

---

## 5. Roteiro do Chief pra Sprint 2 — dividido em 3 partes internas

### Sprint 2A — Motor básico
Fluxo: Cliente → Região tarifária → Vidas → Faixas etárias → Tipo de contratação → Produto → Operadora → Planos elegíveis → Preço → Rede → Regras.

Exemplo dado pelo Chief: Jundiaí, 3 vidas (25/32/45), Não MEI, Coparticipação parcial, Amil → motor retorna "Amil Bronze SP Enfermaria, R$ 836,97, plano_id: amil_bronze_sp_enf" e, usando o mesmo `plano_id`: Rede (N prestadores) + Regras (N seções).

**Decisão explícita do Chief: sem IA no Smart Quote, ainda.** Motor determinístico — banco → SQL/filtros → resultado. IA só entra depois, na camada de Estudo de Mercado (Sprint 4), recebendo o payload **já resolvido** (cotação + contrato atual + planos selecionados + regras + rede + preços) — nunca "leia a biblioteca inteira e decida".

### Sprint 2B — Elegibilidade
Regras objetivas de descarte: vidas abaixo do mínimo da operadora, MEI quando o plano não comercializa MEI, região errada para a tabela. **O motor elimina o que objetivamente não pode entrar — a escolha continua sendo do corretor**, não vira máquina de decisão comercial.

### Sprint 2C — Modelo de retorno
Formato estruturado sugerido pelo Chief:
```
COTAÇÃO
├── contexto
├── operadoras
│   └── <Operadora>
│       └── planos[]
└── filtros_aplicados
```
Cada plano no retorno: `plano_id`, `nome`, `operadora`, `produto`, `acomodacao`, `preco_total`, `precos_por_vida`, `coparticipacao`, `rede_disponivel`, `regras_disponiveis`.

---

## 6. Princípio geral, confirmado e não negociável

```
BIBLIOTECA → MOTOR DETERMINÍSTICO → DADOS DA COTAÇÃO → Smart Quote (corretor decide)
                                                       → Estudo de Mercado → IA (narrativa/análise, nunca decisão)
```
A IA nunca é o mecanismo de consulta da biblioteca. Ela recebe só o conjunto de dados já selecionado — nunca "a biblioteca inteira pra descobrir sozinha o que fazer".

---

## 7. O que NÃO fazer nesta etapa

Construir agora: gráficos, geração de PDF, IA, recomendações, telas do Multicálculo/Estudo de Mercado (Sprints 3 e 4). Primeiro provar que o motor recebe contexto de cotação e devolve corretamente planos + preço + rede + regras vinculados por `plano_id`, respeitando região tarifária e filtros objetivos. Só depois disso funcionando de ponta a ponta é que a camada visual/IA entra.

---

## 8. Arquivos a levar pro chat novo

- Este documento
- Os 2 handoffs de hoje (`HANDOFF_Ajuste_Sistema_Biblioteca.md`, `HANDOFF_Continuacao_Preparacao_Biblioteca.md`) — **as seções de "descartar"/"o que continua válido" ainda se aplicam; a seção de "próxima Sprint" neles está desatualizada, já que a Sprint 1 foi concluída em outro chat depois deles.**
- `HANDOFF_ConnectCenter_Extracao_Planos_Precos_Rede_Regras_v002.md` (Chief — padrão de extração, referência se precisar gerar as 3 operadoras que faltam)
- Os 3 arquivos do item 2 (`smartQuoteService.js`, `smartQuoteLogica.js`, `processar-estudo-mercado/motor-estudo/*`) — pedir ao Raphael, não seguir sem eles
