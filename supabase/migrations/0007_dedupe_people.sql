-- MeuDinheiro — remove pessoas duplicadas (sobra de reexecuções da migration 0001,
-- que inseria "Vitor"/"Jaqueline" de novo a cada rodada completa, sem checar duplicata).
set search_path = meudinheiro, public;

do $$
declare
  p record;
  canonical_id uuid;
begin
  for p in
    select name, min(created_at) as first_created
    from people
    group by name
    having count(*) > 1
  loop
    select id into canonical_id
    from people
    where name = p.name and created_at = p.first_created
    limit 1;

    -- Reaponta tudo que referenciava um duplicado para o registro canônico antes de remover.
    update transactions set person_id = canonical_id
      where person_id in (select id from people where name = p.name and id <> canonical_id);

    update recurrence_rules set person_id = canonical_id
      where person_id in (select id from people where name = p.name and id <> canonical_id);

    update salary_entries set person_id = canonical_id
      where person_id in (select id from people where name = p.name and id <> canonical_id);

    delete from people where name = p.name and id <> canonical_id;
  end loop;
end $$;

-- Trava pra nunca mais duplicar.
alter table people add constraint people_name_unique unique (name);
