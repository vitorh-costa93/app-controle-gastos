-- Marca se o lançamento já foi validado pelo usuário na conferência do aplicativo.
alter table meudinheiro.transactions
  add column if not exists validated boolean not null default false;
