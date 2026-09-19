-- MeuDinheiro — schema inicial
-- Conta única compartilhada (Vitor & Jaqueline), sem autenticação individual.
-- Todo acesso ao banco acontece via camada server-side (service role); RLS fica
-- habilitado e sem policies para bloquear qualquer acesso direto do navegador.
--
-- Tudo isolado no schema "meudinheiro" (não "public"), para poder conviver no
-- mesmo projeto Supabase com outras tabelas/dados já existentes sem colidir.

create schema if not exists meudinheiro;
set search_path = meudinheiro, public;

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- people
-- ---------------------------------------------------------------------------
create table people (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  initials text not null,
  color text not null default '#0a6cff',
  active boolean not null default true,
  created_at timestamptz not null default now()
);

insert into people (name, initials, color) values
  ('Vitor', 'VC', '#0a6cff'),
  ('Jaqueline', 'JC', '#af52de');

-- ---------------------------------------------------------------------------
-- categories
-- ---------------------------------------------------------------------------
create table categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  color text not null default '#8e8e93',
  active boolean not null default true,
  created_at timestamptz not null default now()
);

insert into categories (name, color) values
  ('Alimentação', '#ff9f0a'),
  ('Supermercado', '#ff9f0a'),
  ('Streaming', '#af52de'),
  ('Moradia', '#0a6cff'),
  ('Transporte', '#34c759'),
  ('Saúde', '#ff375f'),
  ('Entretenimento', '#af52de'),
  ('Viagem', '#0a6cff'),
  ('Educação', '#0a6cff'),
  ('Compras', '#ff9f0a'),
  ('Salário', '#34c759'),
  ('Outros', '#8e8e93');

-- ---------------------------------------------------------------------------
-- transaction_types
-- ---------------------------------------------------------------------------
create table transaction_types (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

insert into transaction_types (name) values
  ('Cartão de crédito'),
  ('Seguro'),
  ('Salário'),
  ('Pix'),
  ('Débito'),
  ('Transferência'),
  ('Outros');

-- ---------------------------------------------------------------------------
-- recurrence_rules
-- ---------------------------------------------------------------------------
create table recurrence_rules (
  id uuid primary key default gen_random_uuid(),
  description text not null,
  person_id uuid not null references people(id),
  direction text not null check (direction in ('income', 'expense')),
  type_id uuid references transaction_types(id),
  category_id uuid references categories(id),
  amount numeric(14, 2) not null check (amount > 0),
  frequency text not null default 'monthly' check (frequency in ('monthly')),
  start_date date not null,
  end_date date,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_recurrence_rules_active on recurrence_rules(active);
create index idx_recurrence_rules_person on recurrence_rules(person_id);

-- ---------------------------------------------------------------------------
-- transactions
-- ---------------------------------------------------------------------------
create table transactions (
  id uuid primary key default gen_random_uuid(),
  registration_date date not null,
  reference_month text not null check (reference_month ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  person_id uuid not null references people(id),
  direction text not null check (direction in ('income', 'expense')),
  fixed_variable text not null check (fixed_variable in ('fixed', 'variable')),
  type_id uuid references transaction_types(id),
  category_id uuid references categories(id),
  installment_current smallint not null default 1 check (installment_current >= 1),
  installment_total smallint not null default 1 check (installment_total >= 1),
  amount numeric(14, 2) not null check (amount > 0),
  description text,
  considered boolean not null default true,
  source text not null default 'manual'
    check (source in ('manual', 'audio', 'photo', 'text', 'pdf')),
  ai_confidence jsonb,
  recurrence_rule_id uuid references recurrence_rules(id),
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_transactions_reference_month on transactions(reference_month);
create index idx_transactions_registration_date on transactions(registration_date);
create index idx_transactions_person on transactions(person_id);
create index idx_transactions_category on transactions(category_id);
create index idx_transactions_type on transactions(type_id);
create index idx_transactions_recurrence_rule on transactions(recurrence_rule_id);
create index idx_transactions_not_deleted on transactions(deleted_at) where deleted_at is null;

-- ---------------------------------------------------------------------------
-- uploaded_files
-- ---------------------------------------------------------------------------
create table uploaded_files (
  id uuid primary key default gen_random_uuid(),
  storage_path text,
  source_type text not null check (source_type in ('audio', 'photo', 'text', 'pdf')),
  status text not null default 'received'
    check (status in ('received', 'processing', 'processed', 'review_needed', 'confirmed', 'error')),
  raw_text text,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- ai_processing_jobs
-- ---------------------------------------------------------------------------
create table ai_processing_jobs (
  id uuid primary key default gen_random_uuid(),
  uploaded_file_id uuid references uploaded_files(id),
  status text not null default 'queued'
    check (status in ('queued', 'processing', 'completed', 'error')),
  error text,
  created_at timestamptz not null default now(),
  processed_at timestamptz
);

create index idx_ai_jobs_uploaded_file on ai_processing_jobs(uploaded_file_id);

-- ---------------------------------------------------------------------------
-- ai_extracted_transactions
-- ---------------------------------------------------------------------------
create table ai_extracted_transactions (
  id uuid primary key default gen_random_uuid(),
  ai_processing_job_id uuid not null references ai_processing_jobs(id),
  extracted_data jsonb not null,
  confidence jsonb,
  included boolean not null default true,
  reviewed boolean not null default false,
  final_transaction_id uuid references transactions(id),
  created_at timestamptz not null default now()
);

create index idx_ai_extracted_job on ai_extracted_transactions(ai_processing_job_id);

-- ---------------------------------------------------------------------------
-- simulations (cenários salvos)
-- ---------------------------------------------------------------------------
create table simulations (
  id uuid primary key default gen_random_uuid(),
  description text not null,
  total_amount numeric(14, 2) not null check (total_amount > 0),
  installments smallint not null default 1 check (installments >= 1),
  start_date date not null,
  active boolean not null default true,
  ai_summary text,
  ai_summary_generated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_simulations_active on simulations(active);

-- ---------------------------------------------------------------------------
-- user_settings (linha única — preferências do casal)
-- ---------------------------------------------------------------------------
create table user_settings (
  id smallint primary key default 1 check (id = 1),
  currency text not null default 'BRL',
  projection_horizon_months smallint not null default 16,
  updated_at timestamptz not null default now()
);

insert into user_settings (id) values (1);

-- ---------------------------------------------------------------------------
-- updated_at trigger
-- ---------------------------------------------------------------------------
create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger trg_transactions_updated_at
  before update on transactions
  for each row execute function set_updated_at();

create trigger trg_recurrence_rules_updated_at
  before update on recurrence_rules
  for each row execute function set_updated_at();

create trigger trg_simulations_updated_at
  before update on simulations
  for each row execute function set_updated_at();

create trigger trg_user_settings_updated_at
  before update on user_settings
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS — habilitado, sem policies. Todo acesso passa pelo backend (service role).
-- ---------------------------------------------------------------------------
alter table people enable row level security;
alter table categories enable row level security;
alter table transaction_types enable row level security;
alter table recurrence_rules enable row level security;
alter table transactions enable row level security;
alter table uploaded_files enable row level security;
alter table ai_processing_jobs enable row level security;
alter table ai_extracted_transactions enable row level security;
alter table simulations enable row level security;
alter table user_settings enable row level security;

-- ---------------------------------------------------------------------------
-- Grants — necessário para o PostgREST (usado pelo supabase-js) enxergar o
-- schema "meudinheiro". Depois de rodar esta migration, adicione "meudinheiro"
-- em Settings → API → Data API → Exposed schemas no painel do Supabase.
-- ---------------------------------------------------------------------------
grant usage on schema meudinheiro to service_role, authenticated, anon;
grant all on all tables in schema meudinheiro to service_role;
grant all on all sequences in schema meudinheiro to service_role;
alter default privileges in schema meudinheiro grant all on tables to service_role;
alter default privileges in schema meudinheiro grant all on sequences to service_role;
