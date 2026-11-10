# MeuDinheiro — proposta de reconstrução da Nova UI

10/11/2026. Proposta visual; ainda não implementada. Imagens geradas com a ferramenta integrada de geração de imagens. Valores, taxas, avatares e gráficos são ilustrativos; textos e números das imagens não constituem contratos de implementação.

## Direção

Reconstruir a experiência moderna com composição própria, em vez de acrescentar painéis à página clássica e sobrescrever estilos globalmente. Preservar o toggle e compartilhar os serviços, cálculos, validações e permissões existentes entre as duas apresentações.

- Referência principal: print enviado pelo usuário. Painéis brancos compactos, fundo cinza suave, barra lateral estreita, tipografia Inter Tight, hierarquia numérica e cartões físicos bem renderizados.
- Base proposta: corpo 12–13px, títulos de painel 14–16px, título de página 18px, saldo principal 36–40px; moeda e centavos menores. Ajustar legibilidade na aplicação real.
- Espaçamento de 4px, intervalos de 12–16px entre painéis, raio de 12px, bordas suaves; azul nas ações, cores dos bancos nos cartões e cores semânticas consistentes.
- Ilustrações pequenas com o mesmo material, iluminação e escala; gerar recursos próprios para implementação. Cartões com textura, chip e símbolo de aproximação, sem inventar número, limite ou vencimento.
- Estados de carregamento, vazio, erro, foco e salvamento fazem parte dos componentes. Contraste, navegação por teclado e alvos de toque precisam de validação real; as imagens não validam acessibilidade.

## Telas

### Visão do mês

![Visão do mês](visao-do-mes.png)

Saldo e composição no topo, divisão do casal e cartões no centro, contas do início do mês e moradia à direita. Abas Visão geral / Análises / Tabela dinâmica, mantendo todos os indicadores, filtros e bookmarks existentes. As análises não serão duplicadas abaixo de um novo painel.

O painel de contas reutiliza os agrupamentos existentes. Plano de Saúde reconhece Unimed em Saúde, Internet corresponde à categoria Internet. Faturas mantêm prioridade para impedir dupla contagem. Pagamento e organização continuam com as regras atuais. Acerto entre pessoas só deve mostrar valor quando houver regra validada; o mockup não cria uma nova regra de divisão.

### Lançamentos

![Lançamentos](lancamentos.png)

Tabela como área principal, ações de captura compactas e editor lateral com contexto visível. Preservar filtros, 14 colunas acessíveis, ordenação, paginação, seleção e edição em lote, importação e tratamento de recorrências/parcelas. Alerta de duplicidade junto do preenchimento, sem alertar sobre o próprio registro editado; continuar disponível nas duas UIs.

Organização de pagamentos no editor: forma, agregação, grupo, vencimento e participação no início do mês. Mapear as opções visuais para as capacidades existentes; qualquer ampliação de contrato exige validação específica.

### Simulação

![Simulação](simulacao.png)

Projeção do dinheiro / Comparar compra / Cenários salvos. Comparação entre não comprar, comprar à vista e parcelar em destaque, com saldo líquido e gráfico. Manter rendimento bruto e líquido, IR regressivo, sobras/aportes, evolução mensal, ponto de equilíbrio, sensibilidade ao CDI, múltiplos cenários, edição, arquivamento e insights existentes. Os resultados devem vir dos cálculos atuais, sem fórmulas novas baseadas no desenho.

### Demais áreas e mobile

Recorrências, Categorias, Configurações, importação e Atenção reutilizam a mesma barra de ferramentas, tabela, campos, painel lateral e mensagens. Não há mockups específicos dessas áreas nesta proposta. No mobile, reorganizar prioridades em uma coluna, navegação acessível, cartões navegáveis e editor em tela cheia; tabelas conservam acesso a todas as colunas e ações. Criar e validar layouts mobile na implementação.

## Execução proposta

1. Componentes de apresentação modernos e estrutura de navegação isolados; preservar escolha de interface.
2. Visão mensal completa e ativos visuais de qualidade, com dados reais e sem repetição das análises.
3. Lançamentos, editores e fluxos de captura/atenção no mesmo padrão.
4. Simulação e demais áreas, preservando contratos financeiros e operações existentes.
5. Validar telas completas desktop/mobile, teclado, carregamento/erros, regressões financeiras, lint e build antes da publicação funcional.

Prompt utilizado nas três gerações: screenshot de aplicação financeira MeuDinheiro em português, inspirado na composição compacta do print, Inter Tight, painéis brancos em fundo cinza, navegação estreita e toggle; variantes Visão do mês com cartões Nubank/PicPay realistas e contas agregadas, Lançamentos com editor lateral e alerta de duplicidade, Simulação com comparações e detalhamento de rendimento/IR. Cada geração especificou as seções e a hierarquia acima. Método: geração integrada, sem CLI externa.
