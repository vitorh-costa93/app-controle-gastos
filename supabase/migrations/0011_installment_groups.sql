-- MeuDinheiro — compras parceladas ("recorrências variáveis").
-- Uma compra em N parcelas vira N lançamentos reais, um por mês, ligados pelo mesmo
-- installment_group_id — assim cada parcela aparece no Cadastro/Análise do mês certo
-- e dá pra listar/encerrar a compra inteira na aba Cadastro → Recorrências.
set search_path = meudinheiro, public;

alter table transactions add column if not exists installment_group_id uuid;

create index if not exists idx_transactions_installment_group
  on transactions(installment_group_id)
  where installment_group_id is not null;
