# Continuidade — MeuDinheiro

Atualizado: 10/11/2026.

## Ajuste — respiro vertical conforme a janela
- Acima de800px de altura, o desktop usa espaço adicional em padding dos painéis, linhas de categorias/contas, separação dos cartões e margens internas. Mantém fontes, gráficos e regras financeiras. Layout compacto de notebook e fluxo mobile preservados.
- Alteração concentrada em modern-analysis.css, sem mudança de lógica. Lint/build passaram; validação visual em1914x942 e1711x908, incluindo gráfico acumulado e filtro individual. Próximo passo: usuário validar o respiro em PRD na mesma janela do print.

## Ajuste — visão geral em uma tela, evolução alternável e ícones
- Desktop moderno agora usa toda a largura útil e grade única de três colunas; saldo compacto, ambos cartões com altura limitada, contas do mês ao lado e evolução/moradia na faixa inferior. Ajustes próprios para altura até800px; mobile continua em fluxo vertical. Expansões de detalhes e grupos extras podem aumentar o conteúdo, sem esconder lançamentos.
- Evolução alterna Mensal (sobra/taxa dos12meses do mês escolhido) e Acumulado (mesmo horizonte dinâmico/base/âncora/CDI e gráfico da Simulação, carregado sob demanda). Novo getSimulationBudget em lib/data/simulation-budget.ts é compartilhado com a página Simulação; não é uma soma diferente das12sobras da Análise. Modo compacto preserva fórmula projectCaixinha e explicita rendimento bruto/100%CDI, com link para Simulação. Pessoa respeitada, saldo inicial consolidado nunca atribuído ao indivíduo; projeção individual usa zero como padrão explícito.
- CategoryIcon é a fonte comum de cores/símbolos: luz amarela, saúde rosa, Nubank roxo/nu, PicPay verde/P, financiamento e psicologia com símbolos próprios. Removida regra que sobrescrevia todas as contas para azul. Rótulos de categoria/banco em tabelas, análises, pivot e configurações usam ícones comuns; selects nativos mantêm texto.
- Validação visual: resolução do print1711x908 com painéis completos e página sem rolagem; notebook1366x768 e mobile390px verificados, inclusive valores dos cartões sem cortes e filtros. Teste test-ui-scope ampliado garante compartilhamento do horizonte/saldo/CDI/pessoa entre Acumulado e Simulação. Lint/build finais antes da publicação automática GitHub/Vercel. Sem migrations ou alterações manuais de gastos.
- Próximo passo: usuário testar painel maximizado e alternância dos gráficos em PRD.

## Implementação — Nova UI reconstruída e conferência
- Usuário aprovou a proposta e avatar em desenho. Nova estrutura moderna com sidebar própria, navegação móvel, Inter Tight, avatar familiar em public/family-avatar.png, CategoryIcon e BankCard compartilhados. Substituída a cascata antiga de estilos por shell e estilos de cada módulo. Toggle clássico preservado; preferência segue por navegador.
- Análise moderna em Visão geral / Análises / Conferência / Tabela dinâmica / Todas as movimentações. Categorias e cartões abrem conferência; banco/categoria/origem se combinam, total do banco independe de categoria, comparação manual é só local e se limpa ao mudar o escopo do banco/mês/pessoa/origem. Usa mês de referência, não período de fechamento de fatura. Dinâmica e tabela conservam contexto e operações; dinâmica contém somente reais.
- Casal apenas consolida; pessoa filtra totais, gráficos, cartões, contas e movimentos. Recorrências/Atenção recebem filtro e navegação preserva pessoa/mês. Pares entre pessoas diferentes em Atenção aparecem apenas na visão consolidada. Pagamentos individuais mostram status consolidado e são leitura; não recebem fingerprint capaz de baixar parcialmente uma conta global. Baixa permanece na visão Casal.
- Cadastro compacto, ícones por categoria, captura horizontal e editor próprio até480px (tela inteira mobile), campos essenciais/duplicidade no topo, detalhes/organização abaixo; foco/teclado/rolagem tratados. Ordem clássica, operações em lote, importação e validações mantidas. Adicionar no header abre o editor no mês/pessoa do contexto.
- Simulação moderna tem composição própria e três abas. Fórmulas de rendimento/IR/CDI/equilíbrio e análises existentes preservadas. Base montada antes de filtrar pessoa; saldo salvo consolidado nunca atribuído a alguém. Individual usa saldo inicial local opcional (zero quando não informado, explicitado); não persiste esse saldo. Cenários de compra continuam hipóteses compartilhadas aplicadas à base selecionada. Chaves de insights acompanham os dados efetivos.
- Validação: lint/build finais passaram; test-ui-scope (conferência/base de simulação), test-payments (17 grupos, incluindo status/baixa parcial), test-transaction-editor, test-manual-duplicates e test-movement-edit passaram. Revisão Sol sem riscos pendentes após corrigir reset indevido do total manual ao trocar categoria. Navegador conferiu desktop/mobile390px, ausência de overflow de página, avatar, filtros Vitor, conferência/dinâmica, editor/mobile e toggle clássico. Sem migration ou edição de lançamentos reais nos testes.
- Publicação autorizada no main do GitHub com deploy automático Vercel, conferir SHA/Ready. Próximo passo: usuário testar Nova UI em https://app-controle-gastos-swart.vercel.app.

## Proposta visual — reconstrução completa da Nova UI
- Refinamento do usuário: gastos sempre de Vitor OU Jaqueline; Casal apenas consolida. Filtro de pessoa deve cobrir todos os dados da visão. Corrigir Pessoa=Casal e remover acerto sugeridos nos primeiros desenhos. Nova tela conferencia.png detalha banco → categoria → movimentações, preserva dinâmica/tabela completa e usa ícones consistentes. Comparação manual opcional com total do banco é proposta, não integração. Regras detalhadas em PROPOSTA.md; nenhuma alteração funcional nesta etapa.
- Usuário rejeitou o resultado incremental e pediu proposta completa mais fiel ao print. Criados três mockups em docs/design/nova-ui-v2 (Visão do mês, Lançamentos, Simulação); especificação em PROPOSTA.md.
- Direção: estrutura moderna própria, componentes consistentes, abas para análise aprofundada, editor contextual, cartões renderizados com qualidade; preservar toggle e contratos financeiros. Mobile e demais áreas descritos, ainda sem mockup específico.
- Estado: proposta visual, sem mudança funcional nesta etapa. Números/taxas/avatares ilustrativos. Próximo passo: implementar a reconstrução seguindo a especificação; não repetir a sobreposição de painéis à UI clássica.

## Ajuste atual — categorias e fidelidade visual
- Padrões corrigidos: Plano de Saúde reconhece Unimed dentro da categoria Saúde; Internet reúne a categoria Internet, independente da descrição. Mapa de categorias vem das referências (inclusive inativas), sem IDs fixos. Prévia no editor e checklist usam a mesma regra; configurações explícitas continuam prevalecendo e compras no cartão ficam na fatura, sem dupla contagem.
- Nova UI mais próxima da referência: cabeçalho compacto, valores com moeda/centavos menores, barra da divisão por pessoa, Nubank roxo e PicPay verde em carrossel funcional, checklist compacto e Moradia com dados reais. UI clássica e análises financeiras preservadas.
- Verificação local: Internet e Unimed apareceram preenchidos no checklist do mês; carrossel alternou bancos e mobile sem overflow. test-payments.mjs passou em 16 grupos; validação final inclui lint/build e os scripts de duplicidade/editor/edição existentes.
- Publicação continua no GitHub main com deploy automático Vercel; conferir o commit e Ready pela CLI oficial. URL de teste: https://app-controle-gastos-swart.vercel.app.

## Etapa atual — interface alternável e pagamentos
- Header global alterna UI atual/Nova UI, padrão atual, escolha por navegador persistida e sincronizada entre abas. Nova UI usa Inter Tight real, cards compactos, ilustrações próprias e cartões em CSS; as fórmulas/análises de Simulação foram preservadas (apenas wrapper visual e estilos).
- Cadastro moderno começa com oito colunas e seletor para acessar todas as 14; filtros/ordenação/paginação/lote continuam completos. Clássico conserva as 14. Editor moderno em painel lateral.
- Alerta de possível duplicado durante preenchimento e nova consulta antes de salvar valem para as duas UIs. Considera pessoa/cartão/direção/valor/parcela/descrição/data; recorrência só no mesmo mês, exclui o próprio ID e parcelas que já serão substituídas. Confirmação explícita para manter ambos ou continuar se consulta falhar. Importação e aba Atenção anteriores preservadas.
- Organização de pagamentos em editor e ações individuais/em lote: método, grupo, dia de vencimento e presença no início do mês, com escopo mensal ou mês/seguintes. Dados em chaves individuais `payment_org:*` de meudinheiro.app_settings; nenhuma migration ou alteração em outros schemas.
- Nova Análise traz contas mensais do casal, com sete sugestões iniciais (sem lançamentos não vira zero). Reutiliza despesas consideradas e recorrências; não cria saídas adicionais. Faturas por banco consolidadas; exibir/ocultar vale para fatura inteira, e cadastrar compra sem editar organização preserva essa decisão.
- Quitação em `payment_paid:*` por mês/grupo, invalidada se itens ou valores mudarem; campo de quitação não muda despesas nem cálculos. Falhas após gravar lançamento permitem repetir só organização, sem recriar despesa. Receitas não gravam perfil de pagamentos.
- Verificações: lint/build/TypeScript e scripts test-payments.mjs (14 grupos), test-manual-duplicates.mjs, test-transaction-editor.mjs (hooks simulados) e test-movement-edit.mjs. Navegador confirmou duplicidade nas duas UIs sem salvar registros, fonte/seleção persistida, leitura mobile sem overflow; revisão independente corrigiu erros de receita, bloqueio após rede e sobrescrita implícita de visibilidade.
- Entrega: GitHub main e Vercel produção do projeto app-controle-gastos (prj_lTAbLzIgZ9luep86udpKHzeomklm). URL: https://app-controle-gastos-swart.vercel.app. Próximo passo do usuário: alternar para Nova UI e revisar agrupamentos sugeridos em Organizar pagamentos. Mockups continham valores ilustrativos; aplicação usa dados reais.

## Contexto anterior (consultar somente se necessário)

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
