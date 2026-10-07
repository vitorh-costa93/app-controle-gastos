-- Sem inferir cartão para registros existentes.
alter table meudinheiro.transactions
  add column bank text check (bank in ('picpay', 'nubank'));

alter table meudinheiro.recurrence_rules
  add column bank text check (bank in ('picpay', 'nubank'));
