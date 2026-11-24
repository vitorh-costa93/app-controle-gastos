# Continuidade — MeuDinheiro

Atualizado: 24/11/2026.

## Rastreamento Inteligente de Preços na Simulação — Produtos (4 Camadas) & Viagens (Voos RAO/VCP + Resorts por Data) (23/11/2026)
- **Remoção definitiva de fallbacks sintéticos & endurecimento Anti-Falso-Positivo (24/11/2026):**
  - `engine.ts`: removidos todos os fallbacks hardcoded (`KaBuM! R$ 3.349`, `R$ 2.500` e tarifas sintéticas de viagem); `trackProductPrices` e `trackTravelPrices` retornam `null` quando nenhuma oferta real passa nas 4 camadas. Rejeição automática de URLs genéricas de busca (`/busca/`, `/s?k=`, `google.com/search`) e reconhecimento de especialistas oficiais de climatização (`Dufrio`, `CentralAr`, `Leveros`, `Frio Peças`, `WebContinental`, `A.Dias`, `Frigelar`, `STR Ar`) para ar-condicionado.
  - `price-tracking.ts`: se `meta === null` ou queda anômala `> 45%` sem print verificado, preserva integralmente o último preço válido no banco sem gravar snapshot ou alerta falso. `test-price-tracking.mjs` inclui guarda de regressão contra preços sintéticos.
- **Histórico de 18 meses (`18m`), Zoom com scroll do mouse e atualização em lote (24/11/2026):**
  - `history-stats.ts`, `engine.ts` e `PriceHistoryVisorCard.tsx`: adicionada janela `18m` (548 dias) na UI e nas buscas paralelas de produtos e viagens, além de zoom interativo com o scroll do mouse (`wheel` listener + botão `Resetar zoom`) no gráfico histórico.
  - `models.ts`: incluído `gpt-image-2.6-flare` na tabela `PRICES` de estimativa de custo.
- **Simulação Direta v3: Multi-Dropdown, Zero Acordeões, Toggle Mensal e Histórico 1a para Voos/Hospedagem (24/11/2026):**
  - `ScenarioList.tsx`, `SimulacaoPageClient.tsx` e `modern-simulation.css`: substituída a grade grande de cenários por **Multi-Dropdown** compacto no topo + faixa horizontal apenas dos itens selecionados com imagens geradas por IA; CDI movido para a barra superior (largura total 100%, sem coluna lateral vazia).
  - `CashVsInstallmentSection.tsx`: removidos todos os 3 acordeões (`Ver projeção sem compras`, `Ver evolução mensal`, `Ver análise detalhada`) e adicionado toggle direto **`Saldo acumulado`** | **`Dinheiro guardado por mês`** (`BarChart` Sem compra × Com compra) no gráfico principal.
  - `PriceHistoryVisorCard.tsx`, `ProductVisorPanel.tsx` e `PriceTrackingSection.tsx`: alternador **`Abas`** | **`Lado a lado`** no rastreamento e gráfico de histórico 1a + termômetro anti-Black-Fraude para **Hospedagem**, **Voo** e **Total** nas viagens.
  - `engine.ts` e `price-tracking.ts`: busca paralela `fetchTravelPriceHistoryOneYear` (12 meses de voos e resorts) e reforço de busca Black Friday/Blue Week em sites oficiais (ex.: La Torre). `src/components/analise/` preservado intacto.
- **Polimento completo de UI/UX em `/simulacao` (24/11/2026):**
  - `ProductVisorPanel.tsx`, `PriceTrackingSection.tsx`, `CashVsInstallmentSection.tsx`, `ScenarioList.tsx`, `SimulationFormFields.tsx`, `SimulationAssistantDrawer.tsx`, `ChatMarkdown.tsx`, `SimulacaoPageClient.tsx` e `modern-simulation.css`: corrigidos alinhamentos de botões (`size="sm"`), sobreposição dos badges (`Menor preço`, `Melhor entre as compras`), cortes nos eixos X/Y dos gráficos Recharts, responsividade de datas/tabelas em mobile (390px), trava de scroll e `role="dialog"` no drawer de IA, uso consistente de tokens `--color-*` e barra lateral de rendimento `sticky`.
- **Painel Visor de Ofertas, Histórico de Preços (40d/3m/6m/1a) e Melhor Data de Compra (24/11/2026):**
  - `ProductVisorPanel.tsx`, `PriceTrackingSection.tsx` e `history-stats.ts`: produtos exibem layout estilo Visor com imagem + ações à esquerda, lista de `Ofertas` com destaque verde `Menor preço` e expansão `Ver todas as ofertas`, gráfico de área verde com padrão `1a` e eixo temporal proporcional cobrindo os 365 dias inteiros (`40d` / `3m` / `6m` / `1a`), além de termômetro anti-Black-Fraude (`Como está o preço hoje` vs mediana).
  - `engine.ts` (`fetchProductPriceHistoryOneYear` em paralelo com `trackProductPrices`) e `price-tracking.ts`: busca dedicada dos últimos 12 meses completos em comparadores brasileiros e preservação acumulativa de `historicalPrices` entre atualizações.
  - `best-purchase-date.ts`, `ScenarioList.tsx` e `SimulacaoPageClient.tsx`: selo automático de viabilidade/melhor data de compra em cada cenário com base na série acumulada projetada.
- **Chat IA com Markdown e upload de imagens (24/11/2026):**
  - `ChatMarkdown.tsx`: renderização segura de Markdown (`**negrito**`, `*itálico*`, listas com `-` e numeradas, títulos, separadores, código inline e links) nas respostas do assistente sem expor asteriscos crus.
  - `SimulationAssistantDrawer.tsx` e `simulation-chat.ts`: suporte a envio de até 4 imagens por mensagem (seletor de arquivo, colagem `Ctrl+V` e drag-and-drop com compressão client-side em canvas) encaminhadas via `input_image` na Responses API da OpenAI.
- **Viagem independente (Hospedagem & Voo separados), Gráfico de Pagamento e Assistente IA (24/11/2026):**
  - `PriceTrackingSection.tsx` e `engine.ts`: viagens agora exibem **Hospedagem** e **Passagem Aérea** em cards independentes (cada um com toggle `Entra na conta`, sem venda casada), além de cartão de embarque com datas, horários de saída/chegada, origem (`VCP` vs `RAO`) e escalas.
  - `SimulationFormFields.tsx`, `engine.ts` e `PriceTrackingSection.tsx`: cadastro de viagem com `Entrada/Saída da hospedagem`, toggle `Usar as mesmas datas para o voo` e composição de viajantes quebrada por `Adultos`, `Crianças` e `Pets`.
  - `SimulacaoPageClient.tsx`: gráfico de evolução do orçamento recortado exclusivamente para o período de pagamento (`minPayMonth → maxPayMonth`); `recordSnapshotAndEvaluateAlerts` deduplica alertas não lidos por simulação.
  - `simulation-chat.ts` e `SimulationAssistantDrawer.tsx`: Chatbot IA conectado ao orçamento real + `web_search_preview` usando `resolveModelFor("insight")`, com criação direta de cenários em 1 clique.
- **UI em aba única com Cenários no topo (23/11/2026):**
  - `SimulacaoPageClient.tsx`, `ScenarioList.tsx` e `NewSimulationForm.tsx`: removidas as 3 sub-abas (`Projeção do dinheiro`, `Comparar compra`, `Cenários salvos`); o bloco `Cenários` agora fica no topo em grid de 2 colunas com botão `+ Nova simulação` (modal) alimentando diretamente todas as análises abaixo, mantendo multi-seleção e acordeões sob demanda.
- **IA auto-atualizável (`src/lib/ai/models.ts`, `openai.ts`, `engine.ts`):** implementadas `pickLatestFromList` e `resolveModelFor` (cache 12h via `/v1/models`, escolhendo automaticamente a versão mais recente da família `gpt-*-luna` e `gpt-image-*`, espelhando `dashboard-psi`), conectadas em todas as chamadas de texto, visão, imagem e transcrição.
- **UI Compacta e Cron Black Friday 2h (23/11/2026):**
  - `PriceTrackingSection.tsx`, `CashVsInstallmentSection.tsx` e `SimulacaoPageClient.tsx`: visão compacta em página única (resumo de preço + veredito + saldos líquidos + gráfico principal visíveis; detalhes de lojas/viagem/histórico, tabela mês a mês, IA, ponto de equilíbrio, CDI e evolução mensal recolhidos sob demanda), preservando multi-seleção de cenários.
  - `price-tracking.ts` + banco `meudinheiro.simulations`: `refreshMultipleSimulationsTracking` contempla todas as simulações ativas `product`/`travel` com `auto_track = true` usando `Promise.allSettled` (incluindo `Ar Condicionado - Equipamento`).
  - `.github/workflows/price-tracking-black-friday.yml`: cron de 2 em 2 horas exclusivo da semana de Black Friday (até `2026-11-30`).
- **Schema `meudinheiro` (`supabase/migrations/20261123171000_simulation_price_tracking.sql`):**
  - Colunas `category` (`'product' | 'travel'`), `auto_track`, `tracker_config`, `best_offer_meta` e `last_tracked_at` adicionadas em `meudinheiro.simulations`.
  - Criadas as tabelas `meudinheiro.simulation_price_snapshots` (histórico real de preços com separação de voo e hospedagem para viagens) e `meudinheiro.simulation_price_alerts` (alertas de queda e linha de base).
- **Motor Anti-Falso-Positivo de 4 Camadas para Produtos (`src/lib/price-tracking/engine.ts` e `catalog.ts`):**
  - Coleta multi-fonte (Mercado Livre Brasil API pública `condition=new`, busca web HTML e JSON-LD Schema.org com proteção SSRF) auditada por regras determinísticas + `gpt-6-luna` (`verifyProductOfferFourLayers`).
  - Camada 1: Identidade exata e piso anti-acessório (`minSanityPriceCents` + exclusão de controles/jogos/capas/suportes).
  - Camada 2: Exclusivamente item 100% novo e em estoque (rejeita usados, seminovos, reembalados, open box, vitrine e outlet).
  - Camada 3: Extração do **menor valor à vista (PIX universal)** e do **menor valor parcelado universal (cartão comum)** **na mesma loja**, descartando preços condicionados a cartão próprio da loja ou cashback futuro.
  - Camada 4: Whitelist de lojas e vendedores oficiais 1P (KaBuM!, Amazon.com.br 1P, Magalu 1P, Mercado Livre Loja Oficial, Fast Shop).
- **Motor de Viagens por Data — Passagens Aéreas Multi-Origem (`RAO`/`VCP`) + Estadia/Resort (`trackTravelPrices`):**
  - Permite selecionar o **Destino / Aeroporto** (ex.: `Maceió - AL (MCZ)`, `Recife (REC)`, etc.), a **Estadia / Resort** (ex.: `Japaratinga Lounge Resort`, `Salinas Maragogi All Inclusive`, etc.) e as **Datas de Ida/Check-in e Volta/Check-out**.
  - Compara voos saindo de **Ribeirão Preto (`RAO`)** (com escala) e **Campinas (`VCP`)** (direto ou escala) para os passageiros + tarifa do resort para as exatas diárias (incluindo promoções de Black Friday), somando automaticamente **Melhor Voo + Estadia** no preço à vista e no parcelado da Simulação.
- **UI na Simulação, Alertas Mobile e Cron (`SimulationFormFields.tsx`, `PriceTrackingSection.tsx`, `ScenarioList.tsx`, `/api/cron/price-tracking`):**
  - Seletor **`Compra / Produto`** vs **`Viagem (Voo + Estadia)`** no formulário de simulação; com rastreamento ativo, o usuário não precisa imputar valor manual — o sistema preenche o menor valor real à vista e parcelado automaticamente.
  - Painel `PriceTrackingSection` na aba `Comparar compra` com tabela de lojas auditadas, comparativo de voos `RAO` vs `VCP` + Resort, seletor rápido de datas para recotar viagens, gráfico de histórico temporal, alertas Push no navegador/celular + integração Telegram Bot e cron diário em `vercel.json`.

## Correção de Bugs P0/P1, Otimização P2 e Limpeza P3 (23/11/2026)
- **P0 — Gastos estimados por pessoa (`estimates.ts`, `EstimatedExpensesEditor.tsx`, `RecorrenciasView.tsx`, `cadastro/page.tsx`):** `setEstimatedExpenses` agora recebe `scopePersonId` opcional e preserva os itens das demais pessoas quando a tela está filtrada por pessoa; linhas incompletas exibem erro de validação explícito em vez de descarte silencioso.
- **P0 — Copy do veredito na Simulação (`CashVsInstallmentSection.tsx`):** corrigido texto para exibir sempre `"R$ X a mais no seu saldo final pagando à vista / parcelando"`.
- **P1 — Conferência, Cenários, Configurações e Navegação:**
  - `AnaliseTransactionsTable.tsx`: adicionado seletor **Colunas** (ocultando `Direção`, `Fixo/Variável` e `Tipo` por padrão para evitar overflow horizontal em notebooks) e `whitespace-nowrap` no subtotal de `Valor`.
  - `ScenarioList.tsx` e `CashVsInstallmentSection.tsx`: `flex-wrap` nos cards de cenários para não cortar o menu `⋮` na barra lateral e `whitespace-nowrap` nas células de valores/sinais.
  - `ReferenceListEditor.tsx`, `StartingBalanceEditor.tsx`, `SalaryProjectionEditor.tsx` e `configuracoes/page.tsx`: sincronização imediata da lista ao criar/remover itens (`useEffect` + `router.refresh()`), exibição de erros de gravação, bloqueio explícito de meses gerenciados pelo `dashboard-psi`, histórico de salários colapsado nos 8 meses mais recentes e `items-start` no grid de 3 colunas.
  - `page.tsx`, `Sidebar.tsx` e `BottomNav.tsx`: rota `/` redireciona para `/analise`, removido `?` vazio em `BottomNav` e removido `ChevronDown` decorativo.
- **P2 & P3 — Performance IA, Estado e Código Morto:**
  - `simulacao/page.tsx` e `SimulacaoPageClient.tsx`: removido `key={personId || "couple"}` (preserva `individualBalances` e aba ativa ao trocar pessoa), suprimida chamada dupla de IA quando `CashVsInstallmentSection` já exibe `Análise da IA`, e removido o bloco legado `!isModern`.
  - Removidos 11 componentes órfãos da UI v1 (`CategoryChangesCard`, `CategoryDonutChart`, `CommitmentsChart`, `CompositionCard`, `KpiCard`, `PersonComparisonCard`, `SavingsRateCard`, `TopExpensesCard`, `UnplannedCard`, `MonthTable`, `TransactionTable`) e corrigido plural `"1 coluna de valor"` em `PivotTable.tsx`.
- Validação: `test-ui-scope.mjs`, `npm run lint` e `npm run build` aprovados antes do push em `main`/Vercel.

## Simulação — múltiplas compras sem cenário "Principal" (22/11/2026)
- `cash-vs-installments.ts` e `cash-vs-installments-input.ts`: `buildCashVsInstallmentInput` e `compareCashVsInstallments` agora combinam fluxos à vista e parcelados de múltiplas compras (`cashOutflowsCents` e `installmentOutflowsCents`), respeitando meses de início e prazos distintos.
- `CashVsInstallmentSection.tsx`, `ScenarioList.tsx` e `SimulacaoPageClient.tsx`: removido completamente o conceito de compra "Principal"; todas as compras marcadas nos checkboxes (`selectedIds`) entram juntas em toda a análise (comparativo À vista × Parcelado, gráficos, IA, ponto de equilíbrio, sensibilidade, evolução do orçamento e resumo de impacto).
- Validação: `test-ui-scope.mjs`, `npm run lint` e `npm run build` aprovados antes do push em `main`/Vercel.

## Nova regra da Reserva de Emergência e salário por data (19/11/2026)
- `simulation-baseline.ts`, `salary.ts` e `simulation-analysis.ts`: até o dia 15 do mês atual (Brasília), o mês seguinte usa o salário estimado (ano anterior × YoY) e gastos estimados (`"simulation"`); após o dia 15, o mês seguinte usa o valor real reportado em entradas e os gastos reais da Análise (`"analysis"`), mantendo os meses posteriores estimados.
- `EmergencyReserve.tsx`, `PlanningEditor.tsx` e `AnalisePageClient.tsx`: **Editar reserva** agora permite informar e salvar o saldo real da caixinha no mês atual (`setStartingBalance`), ancorando o mês atual e os meses seguintes e atualizando a tela imediatamente.
- Validação: `test-reserve-scope.mjs`, `test-balance-projection.mjs`, `test-ui-scope.mjs`, `npm run lint` e `npm run build` aprovados antes do push em `main`/Vercel.

## Ajustes — Evolução do saldo, layout notebook e ordem mobile (19/11/2026)
- `BalanceEvolution.tsx`, `balance-evolution.css` e `nosso-mes.css`: gráficos Mensal e Acumulado agora usam altura explícita (`190px`) em vez de `height="100%"` dentro de flex sem altura fixa (que resolvia para `0px` no Recharts).
- `nosso-mes.css` (`1100px–1599px`): `.nm-overview` usa `align-items: stretch` e `.modern-payments` estica até a base da linha 3 (`height: 100%`), eliminando o espaço vazio abaixo de **Contas do início do mês**.
- `nosso-mes.css`: no mobile (`<= 850px`), ordem definida como KPIs (`.nm-month`, `order: 0`) → **Contas do início do mês** (`.modern-payments`, `order: 1`) → demais cards. Em notebook (`1100px–1599px`), layout em 2 colunas organizadas com Reserva ao lado dos KPIs e Contas ao lado de Distribuição/Cartões.
- Validação: `npm run lint` e `npm run build` aprovados antes do push em `main`/Vercel.

## Ajustes — Contas no mobile primeiro e Parcela X/Y (18/11/2026)
- `nosso-mes.css` (`@media (max-width: 850px)`): `.nm-lower` usa `display: contents` e `.modern-payments` recebe `order: -1`, exibindo **Contas do início do mês** em primeiro no mobile e mantendo o layout desktop intacto.
- `payments.ts`, `MonthlyPaymentsPanel.tsx` e `InspectionDrawer.tsx`: itens parcelados (`installmentTotal > 1`) passam a exibir `Parcela X/Y` (sem duplicar quando a descrição já contém `X/Y`).
- Validação: `test-payments.mjs`, `npm run lint` e `npm run build` aprovados antes do push em `main`/Vercel.

## Consolidação da Nova UI, Conferência e Pop-up de Escopo (17/11/2026)
- Nova UI consolidada de forma definitiva: removido `InterfaceToggle` do cabeçalho (`ModernHeader.tsx`) e fixado `isModern: true` em `InterfaceProvider.tsx`.
- Sub-abas de `/analise` reduzidas para **Visão geral**, **Conferência** e **Tabela dinâmica** (removidas **Análises** e **Todas as movimentações** de `AnalisePageClient.tsx`, `ConferencePanel.tsx`, `InspectionDrawer.tsx` e `analise/page.tsx`).
- Conferência (`ConferencePanel.tsx` + `modern-analysis.css`): removidos os painéis **Gastos por categoria** e **Lançamentos do banco**; reduzida a altura do `BankCard` ao lado de **Conferir com o banco** e expandida a tabela `AnaliseTransactionsTable` para 100% da largura.
- Adicionada coluna **Validação** (toggle) em `AnaliseTransactionsTable.tsx` persistida em `meudinheiro.transactions.validated` (migration `20261117164500_add_transaction_validated.sql` aplicada via `supabase db query --remote --yes` somente no schema `meudinheiro`), com `setTransactionValidated` em `transactions.ts`.
- Removido o botão de sliders (`Organizar pagamento`) da coluna **Ações** em `CadastroRecordsTable.tsx`, mantendo a organização de pagamento embutida dentro do fluxo do lápis (`TransactionEditor`, `InstallmentEditModal` e `RecurrenceRuleEditModal`).
- `TransactionEditor.tsx` agora abre como pop-up centralizado (`Modal size="lg"`), não mais menu lateral direito. Ao clicar em **Salvar** ou **Excluir** em `TransactionEditor`, `InstallmentEditModal` ou `RecurrenceRuleEditModal`, abre `ScopeConfirmModal` perguntando se a mudança vale para **Esse mês**, **Todos os meses** ou **Esse mês e os próximos** (`updateTransactionWithScope`, `deleteTransactionWithScope`, `updateInstallmentGroupWithScope`, `deleteInstallmentGroupWithScope`, `updateRecurrenceAmountAllMonths`, `deleteRecurringOccurrence` e `savePaymentOrganization`).
- Verificação: `test-transaction-editor.mjs`, `test-ui-scope.mjs` e `test-payments.mjs` passaram.

- Refinamento da lista de desejos: usuário espera rastreamento automático em várias lojas, comparação e histórico para oportunidades como Black Friday. PLANO_DESEJOS.md atualizado com identificação do produto/variante, cobertura explícita, preço final conhecido e impacto na simulação. Somente planejamento; integração e fontes ainda serão avaliadas, sem prometer cobertura universal.

## Ajustes — reserva compartilhada, contas pertinentes e alturas (16/11/2026)
- Reserva sempre usa useBalanceProjection sem pessoa, com saldo inicial consolidado e rendimento da Simulação. Cobertura/meta por meses usa householdCategoryBreakdown calculado na análise com fontes já carregadas, incluindo projeções e ambas pessoas, sem novas consultas. Card identificado Casal. Evolução continua individual e carrega sua própria projeção apenas no modo Acumulado quando filtrada.
- MonthlyPaymentsPanel oculta grupos sem valor ou itens e deriva contagem/progresso/total/pendente da lista visível. Confirmação de pagamento segue exclusiva da visão Casal; configurações dos grupos preservadas.
- Desktop >=1600px: coluna Cartões/Recorrências distribui altura em duas linhas proporcionais até alinhar com os blocos vizinhos; cartões e linhas de recorrências aproveitam a altura adicional. Layout menor preservado.
- Validação: test-reserve-scope, test-payment-visibility, test-ui-scope, test-balance-projection, lint e build aprovados. Testes isolados sem gravações financeiras. Automação Chrome inventariou navegador mas falhou ao abrir aba (timeoutMs); sem validação visual interativa nesta etapa.
- Publicar em main/Vercel e confirmar Ready/SHA. Próximo passo: usuário conferir os três filtros e espaçamento em PRD.
## Ajuste — avatar centralizado e sem contorno (11/11/2026)
- Rodapé da Nova UI centraliza avatar, nome e descrição. Recorte circular em CSS remove a borda azul incorporada ao PNG, preservando o arquivo original e a ilustração aprovada; chevron permanece à direita.
- Alteração somente em globals.css; sem mudanças de dados. Lint e build de produção verificados antes da publicação em main/Vercel.
- Próximo passo: conferir o rodapé em PRD. Navegador interativo indisponível nesta sessão.
## Ajuste — seletor compacto e percentual da reserva (11/11/2026)
- Seletor Casal/Vitor/Jaqueline da Nova UI: caixa visual32px no desktop, botões28px, texto11px e padding reduzido; em pointer coarse botões40px para toque. Preservadas seleção, teclado e escopo por pessoa.
- EmergencyReserve exibe porcentagem da meta junto do valor-alvo, com até uma casa decimal em pt-BR. Usa mesmo saldo acumulado/meta; negativos contam0% disponível, ausência de meta/saldo não fabrica percentual, acima da meta permite mostrar mais de100% e limita só a largura da barra. Barra com role progressbar e valores acessíveis.
- Mudanças em modern-analysis.css, nosso-mes.css e EmergencyReserve.tsx; sem alteração de dados/cálculos da projeção. Lint/build finais antes da publicação main/Vercel; conferir Ready/SHA. Navegador interativo indisponível na sessão.
- Próximo passo: usuário conferir seletor e porcentagem na Nova UI em PRD.

## Logos adicionais e ícones pela descrição (11/11/2026)
- Jaú Serve reconhece também Jau Ser, incluindo nomes abreviados de fatura. Marcas locais adicionadas: Pichau, HBO Max, ExitLag/Exit Lag, Allianz e CBI of Miami (identidade CBI confirmada pelo usuário). Fontes em docs/design/BRAND_ASSETS.md.
- lib/description-icons.ts centraliza símbolos de serviços. DescriptionIcon prioriza marca da descrição, símbolo da descrição e só então categoria; unhas/sobrancelhas/personal etc. não herdam logo Nubank só por agrupamento de pagamento. CategoryIcon também reutiliza símbolos quando há categoria específica.
- DescriptionSymbolIcon mantém caixas/cores comuns e pictogramas vetoriais: esmalte, sobrancelha e dente, além de personal, academia, cabelo, massagem, pilates, nutrição, terapia, faxina, reparos, pet, combustível, mercado, alimentação, internet/telefone, seguro, transporte, farmácia, luz e água. Associação somente visual; sem mudar categoria/pessoa/valores/banco nem consultar terceiros com descrições.
- Verificação focada: 16 descrições/limites de palavras e 11 aliases de marcas passaram, integridade de imagens e previews conferidos. Lint/build finais antes de publicar main/Vercel. Sem migrations; navegador interativo indisponível na sessão.
- Próximo passo: usuário conferir os lançamentos reais na Nova UI e demais tabelas/painéis que já usam os componentes compartilhados.

## Correção — editar meta da reserva e novas marcas (11/11/2026)
- Usuário esclareceu que deseja editar a META, não o saldo. PlanningEditor removeu acesso ao saldo de referência; Editar meta abre valor em reais como opção principal, com alternativa por meses essenciais. Configuração compartilhada entre pessoas; saldo segue acumulado automaticamente. Saldo de referência permanece somente em Configurações.
- reserveConfig.targetAmountCents aceita inteiro positivo ou null; ausência em configurações antigas vira null, preservando metas por meses. Card usa valor explícito se configurado e mostra Meta/progresso separados do saldo. Após salvar, fecha o editor; não altera starting_balance nem movimentos, verificado no test-planning.mjs.
- Novas marcas locais: 99Food, Vivo Brasil, Savegnago, Shopee, Jaú Serve e Supabase; iFood reconhece também IFD*. Descrição reconhecida prevalece sobre Nubank/NuPay, incluindo prefixos de parcelamento. Origens em docs/design/BRAND_ASSETS.md. Arquivos conferidos visualmente, aliases e integridade validados.
- Integração: test-planning.mjs e test-balance-projection.mjs passaram; lint/build finais antes de publicar GitHub/main e Vercel. Sem migrations ou alterações nos saldos reais. Navegador interativo indisponível na sessão; conferir UI em PRD.
- Próximo passo: Nova UI > Reserva > Editar meta; definir objetivo em reais e conferir progresso e novos logos com os lançamentos existentes.

## Reserva vinculada ao acumulado e marca original (11/11/2026)
- Usuário confirmou: reserva = TODO saldo acumulado, incluindo rendimento. Substitui a regra anterior de saldo por depósitos/retiradas próprios; registros antigos preservados, sem exclusão, mas não compõem a nova reserva.
- EmergencyReserve usa balanceSeriesCents pelo mês selecionado, mesma série bruta a 100% do CDI da Simulação. useBalanceProjection compartilha uma carga entre reserva e BalanceEvolution e invalida resultados em mudanças de pessoa/dados/configuração/retry. Fórmula original de BaseCaixinhaYield extraída literalmente para balance-projection.ts, sem alterar análises ricas.
- Editar reserva permite configurar cobertura/essenciais e saldo no fim de um mês, gravando o mesmo starting_balance de Configurações/Simulação. Saldo de referência continua consolidado (editar em Casal); visões individuais partem de zero, regra preexistente. Leitura estrita impede tratar falhas como saldo zero e gravação valida mês/centavos seguros. Fora do horizonte mostra indisponibilidade; saldo negativo mantém valor e não cria cobertura positiva.
- Sidebar moderna agora reutiliza public/icon.svg, a marca original dos ícones da aba/PWA, em lugar do M tipográfico. Favicon original preservado.
- Testes test-balance-projection.mjs, test-ui-scope.mjs e test-planning.mjs passaram; focused_reviewer sem P1/P2. Lint/build na integração antes de publicar main/Vercel; conferir Ready/SHA. Sem migrations ou modificações manuais dos dados do usuário. Navegador interativo indisponível nesta sessão.
- Próximo passo: testar Nova UI > Editar reserva (Casal), informar saldo/mês de referência e comparar a reserva com o ponto do mesmo mês no Acumulado/Simulação.

## Ajuste — valor da rosca e marcas fiéis (11/11/2026)
- AdaptiveAmount.tsx mede o texto real após carregar Inter Tight e ao redimensionar o gráfico; limita a fonte ao espaço interno com respiro, sem abreviar ou cortar o valor.
- Identidade compartilhada em lib/brand-icons.ts e BrandIcon/DescriptionIcon/CategoryIcon; arquivos locais em public/brands, fontes em docs/design/BRAND_ASSETS.md. Nubank, PicPay, iRacing, Claude, Unimed, Netflix, Spotify, iFood, Amazon, Prime Video, ChatGPT/OpenAI, Google, Gemini e Apple. Sem letras improvisadas ou busca remota por descrição. Unimed usa emblema extraído do logo original, sem redesenho.
- Aplicado a cartões físicos, descrições da dinâmica, recorrências/parcelas, detalhes de categoria, listas de maiores gastos e fora do planejado; demais tabelas/pagamentos herdam componentes comuns. Categorias sem marca mantêm símbolos ilustrativos.
- Lint/build e diff passaram; aliases e integridade dos arquivos verificados na implementação. Publicação autorizada em GitHub/main e Vercel, conferir Ready/SHA. Sem alterações de dados ou cálculos financeiros. Arquivos de ícones conferidos visualmente; navegador CUA indisponível, sem conferência visual interativa da tela nesta sessão.
- Próximo passo: usuário conferir o tamanho do valor na mesma janela do print e a identificação dos serviços com seus lançamentos reais.

## Implementação — Nosso mês na Nova UI (11/11/2026)
- Nova visão geral em ModernOverview.tsx/nosso-mes.css: Inter Tight, matriz de entradas/gastos/sobra por pessoa, distribuição com acesso aos lançamentos, cartões Nubank/PicPay por pessoa, recorrências e reserva. Toggle clássico e análises/Simulação preservados, incluindo evolução mensal/acumulada compartilhada.
- InspectionDrawer mantém visão geral ao conferir cartão/categoria: grupos expandidos, busca/subtotal, origem real/projetada, parcela, pessoa e edição contextual. Real usa TransactionEditor; projetado usa editor de valor existente. Tabela completa e dinâmica preservam escopo. Ícones locais por descrição com fallback em recorrências, tabelas e pagamentos, sem enviar descrições a serviços externos.
- Limites opcionais por mês/pessoa/categoria; consolidação exige ambos configurados. Sem limite não há CTA, denominador ou barra. Planejamento em chaves individuais de meudinheiro.app_settings; sem migration. Reserva usa movimentos reais assinados/idempotentes, pessoa/data e categorias essenciais configuráveis, nunca sobra projetada. PlanningEditor permite excluir limite com campo vazio, depósitos/retiradas e configuração de cobertura.
- Validação: testes isolados test-planning.mjs (validação, persistência, limites completos/parciais, mês/pessoa, repetição e falhas) e test-ui-scope.mjs passaram; revisão focused_reviewer sem P1/P2. Lint/build executados na integração final. Navegador CUA indisponível nesta sessão: não houve validação visual interativa; conferir respiro/composição e mobile em PRD.
- Entrega autorizada no main com deploy automático Vercel; conferir SHA/Ready antes de encerrar. Usuário testa Nova UI em https://app-controle-gastos-swart.vercel.app/analise.
- Próxima etapa separada: docs/design/nosso-mes/PLANO_DESEJOS.md (lista/cenário, sugestão de mês, conversão sem dupla contagem, preço/avisos depois). Não implementada agora. Próximo passo: usuário testar Nova UI com seus dados, configurar limites se desejar e registrar a reserva existente.

## Proposta — Nosso mês com conferência direta e reserva
- Versão vigente: docs/design/nosso-mes/limites-opcionais-e-reserva.png e PROPOSTA.md. Limites de categoria opcionais: sem limite, somente gasto/participação, sem “Definir limite”, barra ou pendência. Editor global discreto. Limite consolidado exige cobertura completa; configuração parcial é explicada no editor.
- Removidos viagem e módulo genérico de metas. Mantida apenas reserva de emergência, com aportes reais e cobertura sobre essenciais; não inferir reserva do saldo projetado. Imagens anteriores são históricas. Valores ilustrativos.
- Preservar rosca/lista clicável para lançamentos e cartão com categorias/descrições expandidas, edição contextual, filtro pessoa/mês e ícones locais de categorias/serviços com associação corrigível. Casal consolida Vitor e Jaqueline.
- Estado histórico: esta proposta visual orientou a implementação acima; as imagens continuam ilustrativas.

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
