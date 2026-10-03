-- MeuDinheiro — excluir uma recorrência só num mês
set search_path = meudinheiro, public;

-- Meses ("YYYY-MM") em que a recorrência não vale, sem encerrá-la nos demais.
alter table recurrence_rules add column if not exists skipped_months text[] not null default '{}';
