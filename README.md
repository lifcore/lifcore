# CoreON

Plataforma cognitiva da LifitSeg Consultoria de Benefícios.

## Estrutura do projeto

```
src/
  lib/
    supabaseClient.js   → conexão com o banco de dados (Supabase)
    aiProvider.js       → camada de IA desacoplada (Anthropic hoje, outro provedor amanhã)
  features/
    auth/               → login e contexto de autenticação
    layout/             → tela principal pós-login
  styles/
    index.css           → estilos base
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
integração nesta fase inicial. Antes de ir para produção com usuários
reais, essa chamada deve migrar para um backend (Supabase Edge Function,
por exemplo), para não expor a chave de API publicamente.

## Perfis de usuário

O sistema reconhece 4 papéis (definidos na tabela `perfis` do Supabase):
`master`, `administrador`, `corretor`, `assistente`.

## Próximos passos

Aguardando as especificações do Kit de Engenharia (Constituição, Blueprint,
Framework dos Especialistas) para modelar os módulos de negócio
(Knowledge Engine, Decision Engine, Especialista de Saúde).
