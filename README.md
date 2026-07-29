# Lifcore

Plataforma inteligente para corretores de seguros — LifitSeg.

Módulos: **Lifcare** (Saúde/Odonto — ativo), Lifleet (Auto/Frota — em breve),
Lifplan (Consórcio/Previdência — em breve), Lifsure (Seguros Gerais — em breve).

## Estrutura do projeto

```
src/
  lib/
    supabaseClient.js       → conexão com o banco (Supabase)
    supabaseSchemas.js      → clients para os schemas institucional/operacional
    aiProvider.js           → camada de IA desacoplada (Anthropic hoje, outro provedor amanhã)
    crm/                    → serviços de Clientes, Contratos, Cotações, Demandas, Mensagens
    especialista/           → motor do Especialista de Saúde (classificação, playbooks, chat)
  components/
    TopNav.jsx              → menu superior (módulos)
    SideIconMenu.jsx        → menu lateral (Perfil, Mensagens, Configurações)
    EspecialistaFlutuante.jsx → botão flutuante de Consulta Rápida
  features/
    auth/                   → login e contexto de autenticação
    crm/                    → Pipeline, Ficha do Cliente, Contratos, Cotações, Demandas
    especialista/           → tela de chat do Especialista de Saúde
    configuracoes/          → cadastro de corretor
    perfil/                 → dados do usuário e da corretora
    mensagens/              → templates de mensagem (WhatsApp)
  styles/
    tokens.css              → identidade visual (cores, tipografia)
    crm.css                 → estilos das telas de CRM
```

## Como rodar localmente

1. Instale as dependências:
   ```
   npm install
   ```

2. Copie o arquivo de exemplo de variáveis de ambiente:
   ```
   cp .env.example .env
   ```

3. Preencha o `.env` com:
   - `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` — encontrados em
     Project Settings → API no painel do Supabase
   - `VITE_AI_API_KEY` — sua chave da API da Anthropic (console.anthropic.com)

4. Rode o projeto:
   ```
   npm run dev
   ```

5. Acesse `http://localhost:5173`

## Sobre a camada de IA (`aiProvider.js`)

Todo o sistema deve chamar `askAI(...)` desse arquivo — nunca a API de um
provedor diretamente. Isso permite trocar de Anthropic para outro provedor
no futuro apenas mudando a variável `VITE_AI_PROVIDER`, sem reescrever
lógica de negócio.

**Importante:** a chamada direta do navegador é apenas para validar a
integração nesta fase. Antes de produção com usuários reais, essa chamada
deve migrar para um backend (Supabase Edge Function), para não expor a
chave de API publicamente.

## Perfis de usuário

O sistema reconhece 4 papéis (tabela `perfis` do Supabase):
`master`, `administrador`, `corretor`, `assistente`.

## Schemas do banco de dados

- **`institucional`** — patrimônio da LifitSeg: Biblioteca (ANS, Operadoras,
  Regulamentação), Modelos de Raciocínio, Playbooks, Casos Fundamentais.
  Evolui só por validação humana explícita.
- **`operacional`** — dia a dia: Clientes/Prospects, Contratos, Cotações,
  Demandas, Eventos, Consultas Rápidas, Candidatos a Conhecimento.

## Especialista de Saúde

- **Consulta Rápida** (botão flutuante, sem cliente vinculado): registro
  leve, sem ciclo de vida — pode ser vinculada a um cliente depois.
- **Demanda** (dentro da ficha de um cliente): ciclo de vida completo
  (aberta → em andamento → encerrada), com Especialista como ação opcional
  dentro dela.
- Ao encerrar uma Demanda, o sistema sugere um resumo (via IA) para virar
  Caso Real — mas só vira conhecimento institucional com aprovação humana
  explícita (tabela `candidatos_conhecimento`).
