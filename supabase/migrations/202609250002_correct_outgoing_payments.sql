begin;

-- Posted cash movements cannot be updated directly through the REST tables.
-- Administrators correct them through this narrowly scoped, audited RPC. The
-- existing payment is included when calculating the maximum corrected amount,
-- and the existing proof remains attached unless a verified replacement is
-- supplied.
create or replace function public.correct_business_cost_payment(
  p_payment_id uuid,
  p_cash_account_id uuid,
  p_payment_date date,
  p_amount numeric,
  p_payment_method public.payment_method,
  p_transaction_reference text default null,
  p_notes text default null,
  p_proof_storage_path text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  current_payment public.outgoing_payments%rowtype;
  target_cost public.business_costs%rowtype;
  corrected_payment public.outgoing_payments%rowtype;
  final_proof_path text;
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'Administrator access is required';
  end if;

  select * into current_payment
  from public.outgoing_payments
  where id = p_payment_id
  for update;

  if not found then
    raise exception 'Outgoing payment was not found';
  end if;

  select * into target_cost
  from public.business_costs
  where id = current_payment.cost_id
  for update;

  if not found or target_cost.status = 'cancelled' then
    raise exception 'Cost record is unavailable';
  end if;

  if p_amount <= 0 or p_amount > target_cost.balance + current_payment.amount then
    raise exception 'Invalid corrected payment amount';
  end if;

  if not exists (
    select 1
    from public.cash_accounts
    where id = p_cash_account_id and is_active
  ) then
    raise exception 'Select an active cash account';
  end if;

  final_proof_path := coalesce(nullif(trim(p_proof_storage_path), ''), current_payment.proof_storage_path);
  if final_proof_path not like current_payment.cost_id::text || '/%'
     or not exists (
       select 1
       from storage.objects
       where bucket_id = 'finance-proofs'
         and name = final_proof_path
     ) then
    raise exception 'Verified payment proof is required';
  end if;

  update public.outgoing_payments
  set cash_account_id = p_cash_account_id,
      payment_date = p_payment_date,
      amount = p_amount,
      payment_method = p_payment_method,
      transaction_reference = nullif(trim(p_transaction_reference), ''),
      notes = nullif(trim(p_notes), ''),
      proof_storage_path = final_proof_path
  where id = current_payment.id
  returning * into corrected_payment;

  return jsonb_build_object(
    'payment', to_jsonb(corrected_payment),
    'previous', jsonb_build_object(
      'cash_account_id', current_payment.cash_account_id,
      'payment_date', current_payment.payment_date,
      'amount', current_payment.amount,
      'payment_method', current_payment.payment_method,
      'transaction_reference', current_payment.transaction_reference,
      'notes', current_payment.notes,
      'proof_replaced', current_payment.proof_storage_path <> final_proof_path
    )
  );
end;
$$;

revoke all on function public.correct_business_cost_payment(
  uuid,
  uuid,
  date,
  numeric,
  public.payment_method,
  text,
  text,
  text
) from public, anon;

grant execute on function public.correct_business_cost_payment(
  uuid,
  uuid,
  date,
  numeric,
  public.payment_method,
  text,
  text,
  text
) to authenticated;

commit;
