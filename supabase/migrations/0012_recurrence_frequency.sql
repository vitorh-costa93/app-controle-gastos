-- MeuDinheiro — frequência das recorrências fixas.
-- Além de mensal, uma recorrência pode ser bimestral, trimestral, semestral ou anual
-- (ex.: consulta que acontece a cada dois meses). A contagem parte do mês inicial da regra.
set search_path = meudinheiro, public;

alter table recurrence_rules drop constraint if exists recurrence_rules_frequency_check;
alter table recurrence_rules
  add constraint recurrence_rules_frequency_check
  check (frequency in ('monthly', 'bimonthly', 'quarterly', 'semiannual', 'annual'));
