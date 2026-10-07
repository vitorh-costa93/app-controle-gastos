-- Edição de várias ocorrências numa única transação, sem alterar o restante das séries.
create or replace function meudinheiro.bulk_edit_movements(p_ids text[], p_patch jsonb)
returns integer
language plpgsql
security invoker
set search_path = pg_catalog, meudinheiro
as $$
declare
  target text;
  selected_month text;
  new_month text;
  new_fixed text;
  rule_id uuid;
  new_rule_id uuid;
  r meudinheiro.recurrence_rules%rowtype;
  t meudinheiro.transactions%rowtype;
  seen uuid[] := '{}';
  amount_value numeric;
  month_interval integer;
  month_distance integer;
  affected integer := 0;
begin
  if p_ids is null or cardinality(p_ids) not between 1 and 500 or
     cardinality(p_ids) <> (select count(distinct v) from unnest(p_ids) v) then
    raise exception 'Lote: selecione de 1 a 500 registros distintos.';
  end if;
  if p_patch is null or jsonb_typeof(p_patch) <> 'object' or p_patch = '{}'::jsonb or
     exists (select 1 from jsonb_object_keys(p_patch) k where k not in
       ('reference_month','person_id','direction','fixed_variable','type_id','category_id','bank')) then
    raise exception 'Lote: escolha campos válidos para alterar.';
  end if;
  if exists (select 1 from unnest(p_ids) v where v is null or v !~* '^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|projected:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}:[0-9]{4}-(0[1-9]|1[0-2]))$') then
    raise exception 'Lote: há registros calculados ou inválidos na seleção.';
  end if;
  if p_patch ? 'reference_month' and (p_patch->>'reference_month' is null or p_patch->>'reference_month' !~ '^[0-9]{4}-(0[1-9]|1[0-2])$') then
    raise exception 'Lote: mês inválido.';
  end if;
  if p_patch ? 'direction' and coalesce(p_patch->>'direction','') not in ('income','expense') then
    raise exception 'Lote: direção inválida.';
  end if;
  if p_patch ? 'fixed_variable' and coalesce(p_patch->>'fixed_variable','') not in ('fixed','variable') then
    raise exception 'Lote: natureza inválida.';
  end if;
  if p_patch ? 'bank' and p_patch->>'bank' is not null and p_patch->>'bank' not in ('picpay','nubank') then
    raise exception 'Lote: banco inválido.';
  end if;
  if p_patch ? 'person_id' and not exists (select 1 from meudinheiro.people where id = (p_patch->>'person_id')::uuid and active) then
    raise exception 'Lote: origem indisponível.';
  end if;
  if p_patch ? 'type_id' and p_patch->>'type_id' is not null and not exists (select 1 from meudinheiro.transaction_types where id = (p_patch->>'type_id')::uuid and active) then
    raise exception 'Lote: tipo indisponível.';
  end if;
  if p_patch ? 'category_id' and p_patch->>'category_id' is not null and not exists (select 1 from meudinheiro.categories where id = (p_patch->>'category_id')::uuid and active) then
    raise exception 'Lote: categoria indisponível.';
  end if;

  -- Ordem estável de locks; também coordena materialização com exclusão da mesma regra.
  perform id from meudinheiro.recurrence_rules where id in (
    select recurrence_rule_id from meudinheiro.transactions where id::text = any(p_ids)
    union select split_part(v, ':', 2)::uuid from unnest(p_ids) v where v like 'projected:%'
  ) order by id for update;

  for target in select v from unnest(p_ids) v order by v loop
    if target like 'projected:%' then
      rule_id := split_part(target, ':', 2)::uuid;
      selected_month := split_part(target, ':', 3);
      select * into r from meudinheiro.recurrence_rules where id = rule_id for update;
      if not found or not r.active or selected_month < to_char(r.start_date,'YYYY-MM') or
         (r.end_date is not null and selected_month > to_char(r.end_date,'YYYY-MM')) or
         selected_month = any(coalesce(r.skipped_months, '{}'::text[])) then
        raise exception 'Lote: uma recorrência não está mais disponível. Atualize a página.';
      end if;
      month_interval := case r.frequency when 'bimonthly' then 2 when 'quarterly' then 3 when 'semiannual' then 6 when 'annual' then 12 else 1 end;
      month_distance := (extract(year from (selected_month || '-01')::date)::int - extract(year from r.start_date)::int) * 12 +
                        extract(month from (selected_month || '-01')::date)::int - extract(month from r.start_date)::int;
      if month_distance % month_interval <> 0 then raise exception 'Lote: mês fora da frequência da recorrência.'; end if;
      select * into t from meudinheiro.transactions where recurrence_rule_id = rule_id and reference_month = selected_month and deleted_at is null for update;
      if found then
        raise exception 'Lote: uma projeção já virou lançamento real. Atualize a página antes de editar.';
      end if;
      select amount into amount_value from meudinheiro.recurrence_rule_amount_versions
        where recurrence_rule_id = rule_id and effective_from <= selected_month order by effective_from desc limit 1;
      amount_value := coalesce(amount_value, r.amount);
      insert into meudinheiro.transactions (registration_date, reference_month, person_id, direction, fixed_variable,
        type_id, category_id, bank, amount, description, considered, source, recurrence_rule_id)
      values ((selected_month || '-01')::date, selected_month, r.person_id, r.direction, 'fixed',
        r.type_id, r.category_id, r.bank, amount_value, r.description, true, 'manual', r.id) returning * into t;
    else
      select * into t from meudinheiro.transactions where id = target::uuid and deleted_at is null for update;
      if not found then raise exception 'Lote: um registro não está mais disponível. Atualize a página.'; end if;
    end if;
    if t.id = any(seen) then raise exception 'Lote: há registros repetidos na seleção. Atualize a página.'; end if;
    seen := array_append(seen, t.id);
    new_month := coalesce(p_patch->>'reference_month', t.reference_month);
    new_fixed := coalesce(p_patch->>'fixed_variable', t.fixed_variable);
    new_rule_id := t.recurrence_rule_id;
    if t.recurrence_rule_id is not null and (new_month <> t.reference_month or new_fixed = 'variable') then
      update meudinheiro.recurrence_rules set skipped_months = array(
        select distinct v from unnest(coalesce(skipped_months,'{}'::text[]) || array[t.reference_month]) v order by v
      ) where id = t.recurrence_rule_id;
      if new_fixed = 'variable' then new_rule_id := null; end if;
    end if;
    if new_rule_id is not null and new_month <> t.reference_month and exists (
      select 1 from meudinheiro.transactions where recurrence_rule_id = new_rule_id and reference_month = new_month and deleted_at is null and id <> t.id
    ) then raise exception 'Lote: já existe um lançamento desta recorrência no mês de destino.'; end if;

    if new_fixed = 'fixed' and t.recurrence_rule_id is null and p_patch->>'fixed_variable' = 'fixed' then
      if t.installment_total > 1 then raise exception 'Lote: parcelas não podem ser convertidas em recorrências fixas em lote.'; end if;
      insert into meudinheiro.recurrence_rules (description, person_id, direction, type_id, category_id, bank, amount, start_date)
      values (coalesce(t.description,'Lançamento fixo'), coalesce((p_patch->>'person_id')::uuid, t.person_id),
        coalesce(p_patch->>'direction',t.direction),
        case when p_patch ? 'type_id' then (p_patch->>'type_id')::uuid else t.type_id end,
        case when p_patch ? 'category_id' then (p_patch->>'category_id')::uuid else t.category_id end,
        case when p_patch ? 'bank' then p_patch->>'bank' else t.bank end,
        t.amount, (new_month || '-01')::date) returning id into new_rule_id;
    end if;
    update meudinheiro.transactions set
      reference_month = new_month,
      person_id = coalesce((p_patch->>'person_id')::uuid, person_id),
      direction = coalesce(p_patch->>'direction',direction),
      fixed_variable = new_fixed,
      type_id = case when p_patch ? 'type_id' then (p_patch->>'type_id')::uuid else type_id end,
      category_id = case when p_patch ? 'category_id' then (p_patch->>'category_id')::uuid else category_id end,
      bank = case when p_patch ? 'bank' then p_patch->>'bank' else bank end,
      recurrence_rule_id = new_rule_id
    where id = t.id;
    affected := affected + 1;
  end loop;
  return affected;
end;
$$;
revoke all on function meudinheiro.bulk_edit_movements(text[], jsonb) from public, anon, authenticated;
grant execute on function meudinheiro.bulk_edit_movements(text[], jsonb) to service_role;

-- Todos os caminhos que materializam/excluem um mês compartilham o lock da regra.
create or replace function meudinheiro.set_recurrence_month_override(p_rule_id uuid, p_month text, p_amount numeric)
returns void language plpgsql security invoker set search_path = pg_catalog, meudinheiro as $$
declare r meudinheiro.recurrence_rules%rowtype; t_id uuid; total integer;
begin
  if p_month is null or p_month !~ '^[0-9]{4}-(0[1-9]|1[0-2])$' or p_amount is null or p_amount <= 0 then
    raise exception 'Lote: mês ou valor inválido.';
  end if;
  select * into r from meudinheiro.recurrence_rules where id=p_rule_id for update;
  if not found then raise exception 'Lote: recorrência não encontrada.'; end if;
  if not r.active or p_month < to_char(r.start_date,'YYYY-MM') or
    (r.end_date is not null and p_month > to_char(r.end_date,'YYYY-MM')) or p_month=any(coalesce(r.skipped_months,'{}'::text[])) then
    raise exception 'Lote: recorrência indisponível neste mês. Atualize a página.';
  end if;
  select count(*), min(id::text)::uuid into total,t_id from meudinheiro.transactions
    where recurrence_rule_id=p_rule_id and reference_month=p_month and deleted_at is null;
  if total > 1 then raise exception 'Lote: há mais de um lançamento vinculado neste mês. Corrija as duplicatas antes de editar.'; end if;
  if total=1 then
    update meudinheiro.transactions set amount=p_amount where id=t_id;
  else
    insert into meudinheiro.transactions(registration_date,reference_month,person_id,direction,fixed_variable,type_id,category_id,bank,amount,description,considered,source,recurrence_rule_id)
      values ((p_month||'-01')::date,p_month,r.person_id,r.direction,'fixed',r.type_id,r.category_id,r.bank,p_amount,r.description,true,'manual',r.id);
  end if;
end $$;
revoke all on function meudinheiro.set_recurrence_month_override(uuid,text,numeric) from public,anon,authenticated;
grant execute on function meudinheiro.set_recurrence_month_override(uuid,text,numeric) to service_role;

create or replace function meudinheiro.delete_recurring_occurrence(p_rule_id uuid, p_month text, p_scope text)
returns void language plpgsql security invoker set search_path = pg_catalog, meudinheiro as $$
declare r meudinheiro.recurrence_rules%rowtype;
begin
  if p_month is null or p_month !~ '^[0-9]{4}-(0[1-9]|1[0-2])$' or p_scope is null or p_scope not in ('month','following') then
    raise exception 'Lote: mês ou escopo inválido.';
  end if;
  select * into r from meudinheiro.recurrence_rules where id=p_rule_id for update;
  if not found then raise exception 'Lote: recorrência não encontrada.'; end if;
  if p_scope='month' then
    update meudinheiro.recurrence_rules set skipped_months=array(
      select distinct v from unnest(coalesce(skipped_months,'{}'::text[])||array[p_month]) v order by v
    ) where id=p_rule_id;
    update meudinheiro.transactions set deleted_at=clock_timestamp()
      where recurrence_rule_id=p_rule_id and reference_month=p_month and deleted_at is null;
  else
    if p_month <= to_char(r.start_date,'YYYY-MM') then
      update meudinheiro.recurrence_rules set active=false where id=p_rule_id;
    else
      update meudinheiro.recurrence_rules set end_date=least(coalesce(end_date,'infinity'::date),(p_month||'-01')::date-1) where id=p_rule_id;
    end if;
    update meudinheiro.transactions set deleted_at=clock_timestamp()
      where recurrence_rule_id=p_rule_id and reference_month>=p_month and deleted_at is null;
  end if;
end $$;
revoke all on function meudinheiro.delete_recurring_occurrence(uuid,text,text) from public,anon,authenticated;
grant execute on function meudinheiro.delete_recurring_occurrence(uuid,text,text) to service_role;
notify pgrst, 'reload schema';
