-- MeuDinheiro — Rastreamento inteligente de preços (Produtos & Viagens com Voos Multi-Origem + Resorts por data)
-- Estritamente isolado no schema meudinheiro.

alter table meudinheiro.simulations
  add column if not exists category text not null default 'product' check (category in ('product', 'travel')),
  add column if not exists auto_track boolean not null default false,
  add column if not exists tracker_config jsonb not null default '{}'::jsonb,
  add column if not exists best_offer_meta jsonb,
  add column if not exists last_tracked_at timestamptz;

create table if not exists meudinheiro.simulation_price_snapshots (
  id uuid primary key default gen_random_uuid(),
  simulation_id uuid not null references meudinheiro.simulations(id) on delete cascade,
  captured_at timestamptz not null default now(),
  category text not null check (category in ('product', 'travel')),
  store_or_provider text not null,
  cash_price numeric(14, 2) not null check (cash_price > 0),
  installment_total numeric(14, 2) not null check (installment_total > 0),
  installments integer not null default 1 check (installments >= 1),
  flight_cash_price numeric(14, 2),
  flight_origin text,
  stay_cash_price numeric(14, 2),
  stay_installment_total numeric(14, 2),
  offer_url text,
  verified_new boolean not null default true,
  verification_meta jsonb not null default '{}'::jsonb
);

create index if not exists idx_sim_price_snapshots_sim_captured
  on meudinheiro.simulation_price_snapshots (simulation_id, captured_at desc);

create table if not exists meudinheiro.simulation_price_alerts (
  id uuid primary key default gen_random_uuid(),
  simulation_id uuid not null references meudinheiro.simulations(id) on delete cascade,
  snapshot_id uuid references meudinheiro.simulation_price_snapshots(id) on delete set null,
  created_at timestamptz not null default now(),
  alert_type text not null,
  title text not null,
  message text not null,
  previous_cash_price numeric(14, 2),
  new_cash_price numeric(14, 2) not null,
  drop_percent numeric(6, 2),
  offer_url text,
  read_at timestamptz,
  notified_channels text[] not null default '{}'
);

create index if not exists idx_sim_price_alerts_sim_created
  on meudinheiro.simulation_price_alerts (simulation_id, created_at desc);
