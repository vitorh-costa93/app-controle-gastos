-- MeuDinheiro — saldo inicial usado como base do saldo acumulado projetado.
-- Sem isso, o saldo acumulado em Simulação sempre partia de zero, ignorando o saldo
-- real já existente na conta (ex.: setembro/2026 tem que fechar em R$ 11.453,18 e o
-- saldo acumulado dali pra frente soma a sobra de cada mês em cima desse valor).
set search_path = meudinheiro, public;

create table if not exists app_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

insert into app_settings (key, value)
values ('starting_balance', jsonb_build_object('month', '2026-09', 'amountCents', 1145318))
on conflict (key) do nothing;
