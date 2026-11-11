# Lista de desejos — plano posterior à Nova UI

Solicitado em 11/11/2026. Planejamento somente: não implementado nesta entrega. O escopo atual continua com limites opcionais por categoria e reserva de emergência, sem meta de viagem.

## 1. Lista e simulação de compra

- Cadastrar descrição, pessoa (Vitor ou Jaqueline), imagem opcional, link, prioridade, preço à vista, total parcelado, número de parcelas e mês desejado. Estados: na lista, comprado e arquivado.
- Começar com preços informados manualmente. A comparação à vista versus parcelado deve reutilizar as análises existentes, incluindo rendimento, CDI e impostos, sem criar um cálculo paralelo.
- Na Simulação, selecionar quais desejos compõem o cenário. Comparar o saldo base com o saldo após compras, mês a mês, e mostrar o primeiro mês negativo. Preservar cenário sem desejos e todos os filtros por pessoa.
- Usar `getSimulationBudget` como fonte da projeção e o mesmo motor financeiro da Simulação. A tela de desejos organiza os cenários; não substitui o motor atual.

## 2. Quando cada compra cabe

- Permitir fixar um mês ou solicitar sugestão, respeitando prioridade e parcelas de todos os desejos selecionados. A proposta é o primeiro mês viável dentro de um horizonte explícito, não uma promessa de poder de compra.
- Explicitar hipóteses: renda real/projetada, compromissos existentes, saldo inicial, rendimento e valores destinados à reserva. Se não houver mês viável, mostrar o motivo e o horizonte analisado.
- Tratar aportes futuros à reserva somente quando configurados pelo usuário; o saldo já guardado não vira automaticamente dinheiro disponível para compras. Uma transferência para reserva não deve virar uma segunda despesa na projeção consolidada.
- Limites de categoria continuam opcionais. Quando existentes, mostrar impacto da compra e eventuais excessos; ausência de limite não bloqueia simulação nem cria pendência.
- Visão Casal consolida os titulares reais. Uma sugestão individual não pode usar silenciosamente dinheiro da outra pessoa.

## 3. Converter intenção em lançamento real

- Ação Comprar abre a confirmação dos dados, banco, pessoa, valor final e parcelamento. Registrar a compra com o fluxo existente somente por ação explícita do usuário.
- Ligar o desejo à compra/parcelas. Ao confirmar, retirar o impacto hipotético do cenário para não somar simulação e lançamento real duas vezes.
- Preferir vínculos e gravação atômica ou chave de idempotência; falhas e tentativas repetidas não podem duplicar compras. Arquivar um desejo não exclui transações reais.

## 4. Acompanhamento de preço

- Avaliar fontes permitidas e cobertura por loja antes de escolher a integração. Primeira versão pode aceitar atualização manual e histórico; não prometer captura universal de qualquer link.
- Definir preço desejado, frequência de atualização, histórico com data/fonte e aviso de preço desatualizado. Comparar o mesmo produto/variante e distinguir preço à vista, frete e condições de pagamento.
- Alertas primeiro dentro do aplicativo. Outros canais ficam para uma etapa com configuração e autorização próprias. Proteger consultas de URLs contra acesso a redes privadas, limitar tamanho/tempo das respostas e manter segredos no servidor.
- Avaliar consumo e limites gratuitos de Vercel/Supabase; cache e tarefas com limite de frequência, sem uma consulta por produto a cada abertura da página.

## Ordem de entrega e aceite

1. Lista manual e cenário na Simulação: conferir vista/parcelas, titularidade, datas e cálculos atuais; nenhuma compra real criada por simular.
2. Sugestão de mês: testar prioridades, meses sem renda, nenhuma data viável, cenários combinados e dinheiro reservado protegido.
3. Conversão em compra: testar falhas, repetição, vínculo às parcelas e ausência de dupla contagem.
4. Preço e avisos: validar fonte/variante, indisponibilidade, preço antigo, segurança de links e limites de consumo.

Cada etapa terá lint/build e testes dos contratos alterados antes da publicação em produção. O acompanhamento de preço depende da avaliação de fontes; as primeiras etapas não dependem dessa integração.
