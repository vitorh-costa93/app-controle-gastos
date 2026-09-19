-- MeuDinheiro — salário variável (Jaqueline) e foto gerada por IA nas simulações
set search_path = meudinheiro, public;

-- ---------------------------------------------------------------------------
-- simulations.image_url — foto gerada por IA (OpenAI) ao criar a simulação
-- Guarda a URL pública já persistida no Storage (a URL original do DALL-E
-- expira em ~1h, por isso a imagem é baixada e salva antes de gravar aqui).
-- ---------------------------------------------------------------------------
alter table simulations add column if not exists image_url text;

-- Bucket público — só ilustrações geradas por IA, sem dado financeiro do usuário,
-- diferente do bucket "meudinheiro-uploads" (privado, comprovantes/áudio/PDF reais).
insert into storage.buckets (id, name, public)
values ('meudinheiro-simulation-images', 'meudinheiro-simulation-images', true)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- salary_entries — histórico mensal de salário variável (ex.: Jaqueline)
-- Só se cadastra o mês que já fechou; meses futuros são projetados em código
-- (média móvel dos últimos 12 meses, por dia útil — ver src/lib/domain/salary.ts).
-- ---------------------------------------------------------------------------
create table salary_entries (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references people(id),
  reference_month text not null check (reference_month ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  amount numeric(14, 2) not null check (amount > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (person_id, reference_month)
);

create index idx_salary_entries_person on salary_entries(person_id);
create index idx_salary_entries_month on salary_entries(reference_month);

create trigger trg_salary_entries_updated_at
  before update on salary_entries
  for each row execute function set_updated_at();

alter table salary_entries enable row level security;

grant all on salary_entries to service_role;
alter default privileges in schema meudinheiro grant all on tables to service_role;
