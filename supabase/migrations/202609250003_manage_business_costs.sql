begin;

-- Payable corrections are kept behind admin-only RPCs. Browser sessions do not
-- receive direct UPDATE or DELETE privileges on the finance ledger tables.
create or replace function public.update_business_cost(
  p_cost_id uuid,
  p_cost_type text,
  p_supplier_id uuid,
  p_worker_id uuid,
  p_project_id uuid,
  p_category text,
  p_description text,
  p_bill_date date,
  p_due_date date,
  p_total_amount numeric,
  p_notes text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  current_cost public.business_costs%rowtype;
  corrected_cost public.business_costs%rowtype;
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'Administrator access is required';
  end if;

  select * into current_cost
  from public.business_costs
  where id = p_cost_id
  for update;

  if not found then raise exception 'Payable record was not found'; end if;
  if current_cost.status = 'cancelled' then raise exception 'Cancelled payables cannot be edited'; end if;
  if p_total_amount <= 0 or p_total_amount < current_cost.amount_paid then
    raise exception 'Total cost cannot be lower than recorded payments';
  end if;
  if p_due_date is not null and p_due_date < p_bill_date then
    raise exception 'Due date cannot be earlier than bill date';
  end if;
  if not (
    (p_cost_type = 'supplier' and p_supplier_id is not null and p_worker_id is null) or
    (p_cost_type = 'labour' and p_worker_id is not null and p_supplier_id is null) or
    (p_cost_type = 'expense' and p_supplier_id is null and p_worker_id is null)
  ) then
    raise exception 'Select the correct payee for this cost type';
  end if;

  update public.business_costs
  set cost_type = p_cost_type,
      supplier_id = p_supplier_id,
      worker_id = p_worker_id,
      project_id = p_project_id,
      category = trim(p_category),
      description = trim(p_description),
      bill_date = p_bill_date,
      due_date = p_due_date,
      total_amount = p_total_amount,
      balance = p_total_amount - current_cost.amount_paid,
      status = case
        when current_cost.amount_paid = p_total_amount then 'paid'
        when current_cost.amount_paid > 0 then 'partially_paid'
        else 'unpaid'
      end,
      notes = nullif(trim(p_notes), '')
  where id = current_cost.id
  returning * into corrected_cost;

  insert into public.audit_logs (
    actor_id, action, module, record_id, record_number, old_value, new_value
  ) values (
    auth.uid(), 'update', 'business_costs', corrected_cost.id,
    corrected_cost.cost_number, to_jsonb(current_cost), to_jsonb(corrected_cost)
  );

  return jsonb_build_object(
    'cost', to_jsonb(corrected_cost),
    'previous', jsonb_build_object(
      'cost_type', current_cost.cost_type,
      'supplier_id', current_cost.supplier_id,
      'worker_id', current_cost.worker_id,
      'project_id', current_cost.project_id,
      'category', current_cost.category,
      'description', current_cost.description,
      'bill_date', current_cost.bill_date,
      'due_date', current_cost.due_date,
      'total_amount', current_cost.total_amount,
      'notes', current_cost.notes
    )
  );
end;
$$;

create or replace function public.delete_unpaid_business_cost(
  p_cost_id uuid,
  p_reason text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  target_cost public.business_costs%rowtype;
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'Administrator access is required';
  end if;
  if char_length(trim(coalesce(p_reason, ''))) < 8 then
    raise exception 'A deletion reason is required';
  end if;

  select * into target_cost
  from public.business_costs
  where id = p_cost_id
  for update;

  if not found then raise exception 'Payable record was not found'; end if;
  if target_cost.amount_paid <> 0 or exists (
    select 1 from public.outgoing_payments where cost_id = target_cost.id
  ) then
    raise exception 'Payment history must be corrected before deleting this payable';
  end if;

  delete from public.business_costs where id = target_cost.id;

  insert into public.audit_logs (
    actor_id, action, module, record_id, record_number, old_value, new_value
  ) values (
    auth.uid(), 'delete', 'business_costs', target_cost.id,
    target_cost.cost_number, to_jsonb(target_cost),
    jsonb_build_object('reason', trim(p_reason))
  );

  return jsonb_build_object(
    'cost', to_jsonb(target_cost),
    'reason', trim(p_reason)
  );
end;
$$;

revoke all on function public.update_business_cost(
  uuid, text, uuid, uuid, uuid, text, text, date, date, numeric, text
) from public, anon;
revoke all on function public.delete_unpaid_business_cost(uuid, text) from public, anon;

grant execute on function public.update_business_cost(
  uuid, text, uuid, uuid, uuid, text, text, date, date, numeric, text
) to authenticated;
grant execute on function public.delete_unpaid_business_cost(uuid, text) to authenticated;

commit;
