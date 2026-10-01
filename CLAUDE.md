@AGENTS.md

# MeuDinheiro — controle financeiro (Vitor & Jaqueline)

App pessoal do casal. Stack: Next.js 15 (App Router) / React 19 / TypeScript / Tailwind / Supabase (schema `meudinheiro`, não `public`) / OpenAI. Deploy na Vercel. Contexto de setup no `README.md`.

## Regras do projeto

- O salário real da Jaqueline vem do `dashboard-psi`; não duplique essa lógica aqui, espelhe o que o psi informa.
- Nunca exponha `SUPABASE_SERVICE_ROLE_KEY`, chaves da OpenAI ou `.env*`; tudo isso fica só no servidor.
- O projeto Supabase é compartilhado com o iRacing Analytics (free tier): migrations só no schema `meudinheiro`, sem tocar em `public`.
- Mantenha Supabase e Vercel no plano free; não afrouxe limites de tamanho/cache sem pedido explícito.
- Antes de mexer, confira `git status -sb` e `git log origin/main..` para ver a sincronia; não confie em hashes registrados aqui.
- Push em `main`, deploy e migrations estão liberados pelo usuário; rode `npm run lint` e `npm run build` e revise o diff antes de subir.
- GitHub, Vercel e Supabase só pelas CLIs oficiais (`gh`, `vercel`, `supabase`).

## Economia de tokens

As instruções globais (`~/.claude/CLAUDE.md`) valem aqui. Resumo:

- Sessão padrão: Sonnet 5.5, esforço médio. Subagentes sempre com `model` definido: leitura/busca/monitoramento em Haiku ou Sonnet; Opus só para lógica difícil.
- Assunto novo: salve o que precisa continuar (commit, spec ou memória) e peça `/clear` (ou `clear_session` no app desktop) em vez de empilhar turnos.
- Abra cada resposta com a linha "Delegação:" e avise "Recomendo /clear agora" com mensagem de continuação quando a etapa fechar.
