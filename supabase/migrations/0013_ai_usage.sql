-- MeuDinheiro — log de uso/custo das chamadas à OpenAI (custo ESTIMADO pela tabela de preços do app).
-- Acesso só pela camada servidor (service role); RLS ligado sem policies, como o resto do schema.
set search_path = meudinheiro, public;

create table if not exists ai_usage (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  task text not null,
  model text not null,
  ok boolean not null default true,
  input_tokens integer not null default 0,
  cached_tokens integer not null default 0,
  output_tokens integer not null default 0,
  reasoning_tokens integer not null default 0,
  cost_usd numeric(10, 6),
  duration_ms integer,
  error text
);

create index if not exists ai_usage_created_at_idx on ai_usage (created_at desc);

alter table ai_usage enable row level security;
