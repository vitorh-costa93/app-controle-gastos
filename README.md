# MeuDinheiro — Controle financeiro (Vitor & Jaqueline)

Aplicativo web de controle financeiro pessoal do casal, com cadastro de
lançamentos (manual, áudio, foto, texto e PDF via IA), análise mensal e
simulação de compras/viagens. Conta única compartilhada, sem login individual.

Stack: **Next.js (App Router) + TypeScript + Tailwind CSS + Supabase
(Postgres + Storage) + OpenAI**.

## 1. Configurar o Supabase

Todo o schema do app vive isolado dentro do schema Postgres `meudinheiro`
(não `public`) — assim ele pode conviver no **mesmo projeto Supabase** que
você já usa para outra coisa, sem colidir com tabelas/dados existentes.

1. Use um projeto Supabase existente (ou crie um novo, se tiver vaga no seu
   plano — free permite 2 projetos por organização).
2. No **SQL Editor**, rode os arquivos de `supabase/migrations/` **na ordem**:
   - `0001_init.sql` — cria o schema `meudinheiro`, tabelas, índices,
     triggers, RLS e os grants necessários.
   - `0002_storage.sql` — bucket privado `meudinheiro-uploads` para áudio/foto/PDF.

   (Se preferir, instale o [Supabase CLI](https://supabase.com/docs/guides/cli)
   e rode `supabase db push` apontando para o projeto.)
3. **Importante:** vá em **Settings → API → Data API → Exposed schemas** e
   adicione `meudinheiro` à lista (por padrão só `public` fica exposto à API).
   Sem esse passo, o app recebe erro de "schema not found" nas consultas.
4. Em **Settings → API**, copie `Project URL` e a chave `service_role`.

## 2. Variáveis de ambiente

Copie `.env.example` para `.env.local` e preencha:

```
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
OPENAI_API_KEY=
```

> A `service_role` key só é usada no backend (server actions/route handlers) —
> nunca é enviada ao navegador. Sem `OPENAI_API_KEY`, o app funciona
> normalmente para cadastro manual, análise e simulação; apenas a extração
> por IA (áudio/foto/texto/PDF) e os cards de insight ficam desabilitados com
> uma mensagem explicativa.

## 3. Rodar localmente

```bash
npm install
npm run dev
```

Abra http://localhost:3000 — a rota `/` redireciona para `/cadastro`.

## 4. Deploy na Vercel

1. Importe o repositório em [vercel.com/new](https://vercel.com/new).
2. Em **Environment Variables**, adicione as mesmas três variáveis do passo 2.
3. Deploy automático a cada push no branch principal.

## Arquitetura

- `src/app/(app)/*` — páginas (Cadastro, Análise, Simulação, Configurações).
- `src/components/*` — UI por domínio (cadastro, análise, simulação, ingest, layout, ui).
- `src/lib/domain/*` — regras financeiras puras (sobra, saldo acumulado,
  recorrência, parcelamento, combinação de simulações) — sem IA, sem banco.
- `src/lib/data/*` — server actions (Supabase, sempre com `service_role`).
- `src/lib/ai/*` — extração por IA (OpenAI) e geração de insights.
- `supabase/migrations/*` — schema versionado.

Valores monetários trafegam sempre como **centavos inteiros** no
TypeScript e como `NUMERIC(14,2)` no Postgres — nunca `float`.
