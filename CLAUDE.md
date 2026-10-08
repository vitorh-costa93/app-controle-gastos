@AGENTS.md

# MeuDinheiro — controle financeiro (Vitor & Jaqueline)

App pessoal do casal. Stack: Next.js 15 (App Router) / React 19 / TypeScript / Tailwind / Supabase (schema `meudinheiro`, não `public`) / OpenAI. Deploy na Vercel. Setup no `README.md`.

As regras de salário (dashboard-psi), banco compartilhado, segredos, CLIs, lint/build e publicação estão no `AGENTS.md` (importado acima); não repita aqui.

## Específico deste projeto

- Nunca exponha `SUPABASE_SERVICE_ROLE_KEY`, chaves da OpenAI ou `.env*`.
- Mantenha Supabase e Vercel no plano free; não afrouxe limites de tamanho/cache sem pedido explícito.
- Antes de mexer, confira `git status -sb` e `git log origin/main..`; não confie em hashes registrados em docs.

## Economia de tokens

Valem as instruções globais (`~/.claude/CLAUDE.md`). Neste projeto: Sonnet 5.5 médio; Haiku 5.5 para ajustes mecânicos de UI/commit e subagentes de leitura; contexto acima de ~200k ou assunto novo = salvar estado em `docs/CODEX_CONTINUIDADE.md` e `/clear`.
