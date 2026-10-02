-- MeuDinheiro — preço à vista nas simulações (comparativo à vista × parcelado)
set search_path = meudinheiro, public;

-- cash_price = preço à vista. total_amount/installments continuam sendo o que impacta o orçamento
-- (parcelado quando installments > 1). Nulo nas simulações antigas: sem comparativo até preencher.
alter table simulations add column if not exists cash_price numeric(14, 2) check (cash_price is null or cash_price > 0);
