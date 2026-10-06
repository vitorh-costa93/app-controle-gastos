<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# MeuDinheiro — regras do projeto
- Publique toda melhoria ou correção concluída no GitHub e na Vercel em produção após as verificações obrigatórias, sem nova confirmação. O usuário testa sempre em PRD; autorização permanente registrada em 06/10/2026.
- Next.js/React/TypeScript; código em `src/`, banco em `supabase/`. Setup no `README.md` sob demanda.
- O salário real vem do dashboard-psi: espelhe sua regra, sem duplicar cálculo.
- Banco compartilhado: migrations somente no schema `meudinheiro`, sem alterar `public` ou outros projetos.
- Segredos somente no servidor; preserve limites free de Supabase/Vercel.
- GitHub/Vercel/Supabase pelas CLIs oficiais. Confira `git status -sb` e sincronia antes de mexer.
- Para código, lint e build antes da entrega/publicação; preservar alterações locais.

## Execução econômica
- Leia `docs/CODEX_CONTINUIDADE.md` somente ao retomar trabalho; atualize-o ao fechar uma etapa, sem copiar histórico ou segredos.
- Busque arquivos e seções relevantes antes de carregar documentos inteiros. Seções históricas são contexto sob demanda.
- Tarefas pequenas são diretas; delegue apenas trabalho independente extenso ou revisão de risco, com escopo e critério de aceite.
- Um responsável integra e valida o estado final. Subagentes fazem testes focados e devolvem evidência; não repetem toda a suíte/build por hábito.
- Alterações somente em instruções/documentação exigem revisão de diff e links, sem build de aplicação. Para código, cumpra as verificações abaixo; repita se o estado relevante mudar.
- Consulte `docs/CODEX_CONTEXTO.md` quando existir para localizar seções de contexto.
