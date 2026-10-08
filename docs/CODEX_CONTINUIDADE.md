# Continuidade — MeuDinheiro

Atualizado: 07/10/2026.

## Objetivo / implementação
- Importação CSV/PDF/foto/áudio exige cartão global PicPay/Nubank junto do mês. Bank persiste em transações, parcelas e regras; legado continua null. Editor individual permite corrigir banco.
- Cadastro: nova CadastroRecordsTable com 14 colunas ordenáveis e filtráveis; conjunto completo antes paginação, seleção entre páginas. Montagem mensal suprime projeção mesmo quando filtro oculta o real correspondente.
- Cadastro e Análise: seleção de reais e projeções recorrentes e BulkEditDialog para mês/origem/direção/fixo-variável/tipo/categoria/banco. Calculados sem regra ficam fora. Campos não selecionados preservados; máximo500 por lote.
- SQL bulk_edit_movements transacional, SECURITY INVOKER e EXECUTE somente service_role. Edits afetam apenas ocorrências selecionadas; converter pontual em fixo cria regra mensal; parcelas não podem ser convertidas em fixas em lote. Mover mês recorrente marca mês anterior pulado; mudar para variável desvincula só ocorrência.
- Override mensal e exclusão recorrente agora RPCs atômicas compartilhando lock da regra, para evitar duplicatas/perda de skipped_months em concorrência.
- Migrações 20261007142925 e 20261007143122 aplicadas explicitamente via CLI db query numa transação somente schema meudinheiro. Não executado db push geral, pois banco é compartilhado. Git commit09b7bd0 enviado ao main. Vercel production Ready, deployment dpl_4JwL6HgT5eif2riNn6ExNgWGCPnT e SHA conferido.

## Validação
- npm run lint, npm run build e scripts/test-movement-edit.mjs passaram.
- Worker import: máscaras/guard/banco global/parcelas/mappers em fixtures. Worker Cadastro:67 fixtures validaram filtro antes paginação/ordenação/seleção.
- scripts/test-bulk-edit.sql tem BEGIN/ROLLBACK: passou no banco (campos preservados, rollback lote, materialização/histórico/mover/fixo/permissões).
- RPCs em paralelo pelo SDK oficial confirmaram um único real e ambos skips preservados. Fixtures em2090 removidas via CLI; registros reais do usuário preservados.
- Cadastro e Análise locais HTTP200 com controles renderizados. Navegador CUA indisponível, sem QA visual interativo.
- Revisão focused_reviewer concluiu sem pendências após correção de2 riscos de concorrência.
- Advisor apontou app_settings sem RLS já existente (fora da alteração); não modificada essa tabela nem outros schemas.

## Próximo passo
- PRD publicado: https://app-controle-gastos-swart.vercel.app. Smoke Cadastro/Análise HTTP200 com controles do lote presentes. Usuário testa funcionalidades em produção; publicação automática autorizada em AGENTS.md.
- Preferência e alteração anterior d713829 (popup edição valor por mês/seguintes) preservadas.


## Etapa — bookmarks da tabela dinâmica (07/10/2026)
- Banco disponível como dimensão e filtro; sem banco é grupo explícito.
- PivotViews salva título/descrição e configuração completa via server actions, em chaves individuais pivot_bookmark:<uuid> de meudinheiro.app_settings, sem migrations.
- Mês Atual acompanha month da página, guardado como modo relativo no bookmark.
- Arquivos: PivotTable.tsx, PivotViews.tsx, AnalisePageClient.tsx, lib/pivot-bookmarks.ts e lib/data/pivot-bookmarks.ts.
- Lint/build passaram; schema rejeita entradas inválidas; gravação/leitura no Supabase conferida com fixture removida. Guia local next/dist/docs indisponível nesta instalação Next 15.5.25.
- Commit 093143e no main do GitHub; produção Ready (dpl_DrS9USDvtigzUafBifz9feQiDf46), alias app-controle-gastos-swart.vercel.app confirmado. Navegador em PRD conferiu Banco, Views, formulário com título/descrição e Mês Atual selecionável referente a 11/2026 da página, e não ao mês calendário. Próximo passo: usuário testar seus bookmarks em PRD.
