-- MeuDinheiro — desativa recorrências cujo lançamento de origem já foi excluído.
-- Corrige o estado deixado por exclusões feitas antes desta correção existir
-- (a recorrência continuava ativa e projetando valor mesmo sem o lançamento real).
set search_path = meudinheiro, public;

update recurrence_rules
set active = false
where id in (
  select recurrence_rule_id
  from transactions
  where recurrence_rule_id is not null
    and deleted_at is not null
);
