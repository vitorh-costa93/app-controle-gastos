-- MeuDinheiro — backfill: cria a regra de recorrência para lançamentos que já
-- estavam marcados como "Fixo" mas nunca projetaram valor pros meses seguintes
-- (o vínculo com recurrence_rules só passou a ser criado automaticamente agora).
set search_path = meudinheiro, public;

do $$
declare
  t record;
  new_rule_id uuid;
begin
  for t in
    select id, description, person_id, direction, type_id, category_id, amount, registration_date
    from transactions
    where fixed_variable = 'fixed'
      and recurrence_rule_id is null
      and deleted_at is null
  loop
    insert into recurrence_rules (description, person_id, direction, type_id, category_id, amount, start_date)
    values (
      coalesce(nullif(t.description, ''), 'Lançamento fixo'),
      t.person_id, t.direction, t.type_id, t.category_id, t.amount, t.registration_date
    )
    returning id into new_rule_id;

    update transactions set recurrence_rule_id = new_rule_id where id = t.id;
  end loop;
end $$;
