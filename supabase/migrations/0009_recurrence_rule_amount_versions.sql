-- MeuDinheiro — histórico de valores de um custo fixo ao longo do tempo.
-- Antes, editar o valor de uma recorrência sobrescrevia pra sempre (passado e futuro),
-- sem histórico. Agora cada mudança de valor vira uma versão com "vigente a partir de
-- <mês>", nunca retroativa, e todas ficam guardadas para consulta.
set search_path = meudinheiro, public;

create table recurrence_rule_amount_versions (
  id uuid primary key default gen_random_uuid(),
  recurrence_rule_id uuid not null references recurrence_rules(id) on delete cascade,
  effective_from text not null, -- "YYYY-MM"
  amount numeric(14,2) not null,
  created_at timestamptz not null default now(),
  unique (recurrence_rule_id, effective_from)
);

create index idx_recurrence_rule_versions_rule on recurrence_rule_amount_versions(recurrence_rule_id);

alter table recurrence_rule_amount_versions enable row level security;
