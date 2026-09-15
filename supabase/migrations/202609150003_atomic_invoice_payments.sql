begin;

create or replace function public.record_invoice_payment(
  p_invoice_id uuid,
  p_payment_date date,
  p_amount numeric,
  p_payment_method public.payment_method,
  p_transaction_reference text default null,
  p_notes text default null,
  p_proof_storage_path text default null
) returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  target public.invoices%rowtype;
  payment_row public.payments%rowtype;
  receipt_row public.receipts%rowtype;
  receipt_no text;
begin
  select * into target from public.invoices
  where id = p_invoice_id and archived_at is null for update;
  if not found or target.status not in ('unpaid','partially_paid','overdue') then
    raise exception 'Select an issued invoice with an outstanding balance';
  end if;
  if p_amount <= 0 or p_amount > target.balance then raise exception 'Invalid payment amount'; end if;
  if p_proof_storage_path is null or p_proof_storage_path not like target.id::text || '/%' then
    raise exception 'Verified payment proof is required';
  end if;

  insert into public.payments (invoice_id, customer_id, payment_date, amount, payment_method, transaction_reference, notes, proof_storage_path, recorded_by)
  values (target.id, target.customer_id, p_payment_date, p_amount, p_payment_method, nullif(trim(p_transaction_reference),''), nullif(trim(p_notes),''), p_proof_storage_path, auth.uid())
  returning * into payment_row;

  receipt_no := public.next_document_number('receipt', p_payment_date);
  insert into public.receipts (receipt_number, payment_id, invoice_id, customer_id, amount_received, remaining_balance, prepared_by)
  values (receipt_no, payment_row.id, target.id, target.customer_id, p_amount, target.balance - p_amount, auth.uid())
  returning * into receipt_row;

  return jsonb_build_object('payment', to_jsonb(payment_row), 'receipt', to_jsonb(receipt_row));
end;
$$;

revoke execute on function public.record_invoice_payment(uuid,date,numeric,public.payment_method,text,text,text) from public, anon;
grant execute on function public.record_invoice_payment(uuid,date,numeric,public.payment_method,text,text,text) to authenticated;

commit;
