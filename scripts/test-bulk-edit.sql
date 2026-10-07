-- Executar com BEGIN/ROLLBACK: fixtures temporárias, sem tocar lançamentos do usuário.
begin;
do $$
declare
  p uuid; c uuid; a uuid; b uuid; rule uuid; original_rule uuid;
  projected_id uuid; count_saved integer; before_amount numeric;
begin
  insert into meudinheiro.people(name,initials,color) values ('Codex fixture bulk ' || gen_random_uuid(), 'CF', '#112233') returning id into p;
  insert into meudinheiro.categories(name,color) values ('Codex fixture category ' || gen_random_uuid(),'#112233') returning id into c;
  insert into meudinheiro.transactions(registration_date,reference_month,person_id,direction,fixed_variable,amount,description,bank)
    values ('2090-10-01','2090-10',p,'expense','variable',100,'Fixture A','picpay') returning id into a;
  insert into meudinheiro.transactions(registration_date,reference_month,person_id,direction,fixed_variable,amount,description,bank)
    values ('2090-10-02','2090-10',p,'expense','variable',200,'Fixture B','nubank') returning id into b;
  count_saved := meudinheiro.bulk_edit_movements(array[a::text,b::text], jsonb_build_object('category_id',c,'bank','nubank'));
  if count_saved <> 2 or (select count(*) from meudinheiro.transactions where id in(a,b) and category_id=c and bank='nubank') <> 2 then raise exception 'Falha: atualização dos dois registros'; end if;
  if (select amount from meudinheiro.transactions where id=a) <> 100 or (select installment_total from meudinheiro.transactions where id=b) <> 1 then raise exception 'Falha: campos não escolhidos'; end if;
  perform meudinheiro.bulk_edit_movements(array[a::text,b::text], '{"category_id":null}');
  if exists(select 1 from meudinheiro.transactions where id in(a,b) and category_id is not null) then raise exception 'Falha: limpar categoria'; end if;
  begin
    perform meudinheiro.bulk_edit_movements(array[a::text,'00000000-0000-0000-0000-000000000000'], '{"direction":"income"}');
    raise exception 'Falha: registro inexistente aceito';
  exception when others then
    if SQLERRM not like 'Lote:%' then raise; end if;
  end;
  if (select direction from meudinheiro.transactions where id=a) <> 'expense' then raise exception 'Falha: lote parcialmente salvo'; end if;
  insert into meudinheiro.recurrence_rules(description,person_id,direction,amount,start_date,end_date,bank)
    values ('Fixture regra',p,'expense',100,'2090-10-01','2091-01-01','picpay') returning id into rule;
  insert into meudinheiro.recurrence_rule_amount_versions(recurrence_rule_id,effective_from,amount) values(rule,'2090-10',100),(rule,'2090-12',200);
  perform meudinheiro.bulk_edit_movements(array['projected:' || rule || ':2090-11'], jsonb_build_object('category_id',c));
  select id into projected_id from meudinheiro.transactions where recurrence_rule_id=rule and reference_month='2090-11' and deleted_at is null;
  if projected_id is null or (select amount from meudinheiro.transactions where id=projected_id) <> 100 or
     (select bank from meudinheiro.transactions where id=projected_id) <> 'picpay' or
     (select category_id from meudinheiro.recurrence_rules where id=rule) is not null then raise exception 'Falha: projeção e preservação da série'; end if;
  begin
    perform meudinheiro.bulk_edit_movements(array['projected:' || rule || ':2090-11'], '{"direction":"income"}');
    raise exception 'Falha: projeção já materializada aceita';
  exception when others then if SQLERRM not like 'Lote:%' then raise; end if; end;
  perform meudinheiro.bulk_edit_movements(array[projected_id::text], '{"fixed_variable":"variable"}');
  if (select recurrence_rule_id from meudinheiro.transactions where id=projected_id) is not null or
     not (select '2090-11'=any(skipped_months) and active from meudinheiro.recurrence_rules where id=rule) then raise exception 'Falha: separar mês da série'; end if;
  perform meudinheiro.bulk_edit_movements(array['projected:' || rule || ':2090-12'], '{"reference_month":"2091-01"}');
  select id into projected_id from meudinheiro.transactions where recurrence_rule_id=rule and reference_month='2091-01' and deleted_at is null;
  if projected_id is null or (select amount from meudinheiro.transactions where id=projected_id) <> 200 or
     not (select '2090-12'=any(skipped_months) from meudinheiro.recurrence_rules where id=rule) then raise exception 'Falha: mover projeção'; end if;
  begin
    perform meudinheiro.bulk_edit_movements(array['projected:' || rule || ':2090-10'], '{"reference_month":"2091-01"}');
    raise exception 'Falha: colisão de recorrência aceita';
  exception when others then if SQLERRM not like 'Lote:%' then raise; end if; end;
  if exists(select 1 from meudinheiro.transactions where recurrence_rule_id=rule and reference_month='2090-10') then raise exception 'Falha: rollback materialização'; end if;
  perform meudinheiro.bulk_edit_movements(array[a::text], '{"fixed_variable":"fixed","reference_month":"2090-11"}');
  select recurrence_rule_id into original_rule from meudinheiro.transactions where id=a;
  if original_rule is null or (select bank from meudinheiro.recurrence_rules where id=original_rule) <> 'nubank' or
    (select start_date from meudinheiro.recurrence_rules where id=original_rule) <> '2090-11-01' then raise exception 'Falha: criação fixo'; end if;
  update meudinheiro.transactions set installment_total=2 where id=b;
  begin
    perform meudinheiro.bulk_edit_movements(array[b::text], '{"fixed_variable":"fixed"}');
    raise exception 'Falha: parcela convertida sem restrição';
  exception when others then if SQLERRM not like 'Lote:%' then raise; end if; end;
  if has_function_privilege('anon','meudinheiro.bulk_edit_movements(text[],jsonb)','execute') or
     has_function_privilege('authenticated','meudinheiro.bulk_edit_movements(text[],jsonb)','execute') or
     not has_function_privilege('service_role','meudinheiro.bulk_edit_movements(text[],jsonb)','execute') then raise exception 'Falha: permissão RPC'; end if;
  perform meudinheiro.set_recurrence_month_override(rule,'2090-10',150);
  perform meudinheiro.set_recurrence_month_override(rule,'2090-10',160);
  if (select count(*) from meudinheiro.transactions where recurrence_rule_id=rule and reference_month='2090-10' and deleted_at is null) <> 1 then raise exception 'Falha: override duplicado'; end if;
  perform meudinheiro.delete_recurring_occurrence(rule,'2090-10','month');
  if not (select skipped_months @> array['2090-10','2090-11','2090-12'] from meudinheiro.recurrence_rules where id=rule) then raise exception 'Falha: skip perdido'; end if;
  begin
    perform meudinheiro.set_recurrence_month_override(rule,'2090-10',150);
    raise exception 'Falha: mês excluído recriado';
  exception when others then if SQLERRM not like 'Lote:%' then raise; end if; end;
end $$;
select 'OK: lote atomico, campos preservados, projeção, histórico, mês, recorrência e permissões' as result;
rollback;
