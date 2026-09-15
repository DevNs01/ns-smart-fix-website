-- Convert an accepted quotation to exactly one draft invoice in a single transaction.
create or replace function public.convert_accepted_quotation_to_invoice(p_quotation_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  actor uuid := auth.uid();
  quote public.quotations%rowtype;
  created_invoice public.invoices%rowtype;
  settings public.company_settings%rowtype;
  generated_number text;
  issue_date date := current_date;
begin
  if actor is null or not exists (
    select 1 from public.profiles where id = actor and is_active = true
  ) then
    raise exception 'Active staff access is required';
  end if;

  select * into quote from public.quotations where id = p_quotation_id for update;
  if quote.id is null then raise exception 'Quotation was not found'; end if;
  if quote.status <> 'accepted' then raise exception 'Only an accepted quotation can be invoiced'; end if;
  if exists (
    select 1 from public.invoices
    where quotation_id = quote.id and status <> 'cancelled' and allow_duplicate_from_quotation = false
  ) then
    raise exception 'An active invoice already exists for this quotation';
  end if;

  select * into settings from public.company_settings limit 1;
  generated_number := public.next_document_number('invoice', issue_date);

  insert into public.invoices (
    invoice_number, customer_id, quotation_id, invoice_date, due_date,
    project_title, description, customer_snapshot, discount_amount, tax_percent,
    other_charges, subtotal, grand_total, amount_paid, balance, notes,
    payment_terms, status, created_by
  ) values (
    generated_number, quote.customer_id, quote.id, issue_date,
    issue_date + coalesce(settings.default_invoice_payment_days, 30),
    quote.project_title, quote.description, quote.customer_snapshot,
    quote.discount_amount, quote.tax_percent, quote.other_charges,
    quote.subtotal, quote.grand_total, 0, quote.grand_total, quote.notes,
    coalesce(quote.terms_and_conditions, settings.default_terms), 'draft', actor
  ) returning * into created_invoice;

  insert into public.invoice_items (invoice_id, position, description, quantity, unit_price)
  select created_invoice.id, position, description, quantity, unit_price
  from public.quotation_items where quotation_id = quote.id order by position;

  update public.quotations set status = 'converted_to_invoice', updated_at = now()
  where id = quote.id;

  insert into public.audit_logs (actor_id, action, module, record_id, record_number, new_value)
  values
    (actor, 'convert_to_invoice', 'quotations', quote.id, quote.quotation_number,
      jsonb_build_object('invoiceId', created_invoice.id, 'invoiceNumber', created_invoice.invoice_number)),
    (actor, 'create_from_quotation', 'invoices', created_invoice.id, created_invoice.invoice_number,
      jsonb_build_object('quotationId', quote.id, 'quotationNumber', quote.quotation_number, 'total', created_invoice.grand_total));

  return jsonb_build_object('invoice', to_jsonb(created_invoice), 'quotationNumber', quote.quotation_number);
end;
$$;

revoke all on function public.convert_accepted_quotation_to_invoice(uuid) from public, anon;
grant execute on function public.convert_accepted_quotation_to_invoice(uuid) to authenticated;
