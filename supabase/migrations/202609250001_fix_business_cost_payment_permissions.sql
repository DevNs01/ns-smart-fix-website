begin;

-- The authenticated role intentionally has no direct UPDATE permission on
-- business_costs. The original security-invoker function used SELECT ... FOR
-- UPDATE, which therefore failed after a proof had already been uploaded.
-- Keep balance changes behind one audited procedure instead of broadening the
-- table permissions available to browser sessions.
create or replace function public.record_business_cost_payment(
  p_cost_id uuid,
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
  target public.business_costs%rowtype;
  result public.outgoing_payments%rowtype;
begin
  if auth.uid() is null or not public.is_authorized_staff() then
    raise exception 'Not authorized';
  end if;

  select * into target
  from public.business_costs
  where id = p_cost_id
  for update;

  if not found or target.status = 'cancelled' then
    raise exception 'Cost record is unavailable';
  end if;

  if p_amount <= 0 or p_amount > target.balance then
    raise exception 'Invalid payment amount';
  end if;

  if not exists (
    select 1
    from public.cash_accounts
    where id = p_cash_account_id and is_active
  ) then
    raise exception 'Select an active cash account';
  end if;

  if p_proof_storage_path is null
     or p_proof_storage_path not like target.id::text || '/%'
     or not exists (
       select 1
       from storage.objects
       where bucket_id = 'finance-proofs'
         and name = p_proof_storage_path
     ) then
    raise exception 'Verified payment proof is required';
  end if;

  insert into public.outgoing_payments (
    cost_id,
    cash_account_id,
    payment_date,
    amount,
    payment_method,
    transaction_reference,
    notes,
    proof_storage_path,
    recorded_by
  ) values (
    target.id,
    p_cash_account_id,
    p_payment_date,
    p_amount,
    p_payment_method,
    nullif(trim(p_transaction_reference), ''),
    nullif(trim(p_notes), ''),
    p_proof_storage_path,
    auth.uid()
  )
  returning * into result;

  return to_jsonb(result);
end;
$$;

revoke all on function public.record_business_cost_payment(
  uuid,
  uuid,
  date,
  numeric,
  public.payment_method,
  text,
  text,
  text
) from public, anon;

grant execute on function public.record_business_cost_payment(
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
