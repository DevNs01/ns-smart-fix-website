begin;

-- QuickBooks-style operational finance ledger for suppliers, labour, expenses,
-- cash accounts and project profitability. Customer receipts remain in the
-- existing payments table; business outflows are recorded separately.

create table if not exists public.cash_accounts (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 2 and 120),
  account_type text not null check (account_type in ('bank', 'petty_cash')),
  institution_name text,
  account_last_four text check (account_last_four is null or account_last_four ~ '^[0-9A-Za-z]{2,8}$'),
  opening_balance numeric(14,2) not null default 0,
  is_active boolean not null default true,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.suppliers (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 2 and 160),
  registration_number text,
  contact_person text,
  phone text,
  email text,
  address text,
  notes text,
  is_active boolean not null default true,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.labour_workers (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 2 and 160),
  phone text,
  email text,
  trade_or_role text,
  identification_reference text,
  notes text,
  is_active boolean not null default true,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  project_code text not null unique,
  title text not null check (char_length(trim(title)) between 2 and 200),
  customer_id uuid references public.customers(id),
  source_quotation_id uuid references public.quotations(id),
  source_invoice_id uuid unique references public.invoices(id),
  status text not null default 'open' check (status in ('open', 'completed', 'cancelled')),
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.finance_sequences (
  document_kind text not null check (document_kind = 'cost'),
  year_month text not null check (year_month ~ '^\d{6}$'),
  last_value integer not null default 0 check (last_value >= 0),
  primary key (document_kind, year_month)
);

create table if not exists public.business_costs (
  id uuid primary key default gen_random_uuid(),
  cost_number text not null unique,
  cost_type text not null check (cost_type in ('supplier', 'labour', 'expense')),
  supplier_id uuid references public.suppliers(id),
  worker_id uuid references public.labour_workers(id),
  project_id uuid references public.projects(id),
  category text not null check (char_length(trim(category)) between 2 and 80),
  description text not null check (char_length(trim(description)) between 2 and 1000),
  bill_date date not null default current_date,
  due_date date,
  total_amount numeric(14,2) not null check (total_amount > 0),
  amount_paid numeric(14,2) not null default 0 check (amount_paid >= 0),
  balance numeric(14,2) not null check (balance >= 0),
  status text not null default 'unpaid' check (status in ('unpaid', 'partially_paid', 'paid', 'cancelled')),
  notes text,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (due_date is null or due_date >= bill_date),
  check (amount_paid <= total_amount),
  check (balance = total_amount - amount_paid),
  check (
    (cost_type = 'supplier' and supplier_id is not null and worker_id is null) or
    (cost_type = 'labour' and worker_id is not null and supplier_id is null) or
    (cost_type = 'expense' and supplier_id is null and worker_id is null)
  )
);

create table if not exists public.outgoing_payments (
  id uuid primary key default gen_random_uuid(),
  cost_id uuid not null references public.business_costs(id),
  cash_account_id uuid not null references public.cash_accounts(id),
  payment_date date not null default current_date,
  amount numeric(14,2) not null check (amount > 0),
  payment_method public.payment_method not null,
  transaction_reference text,
  notes text,
  proof_storage_path text not null,
  recorded_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);

insert into public.cash_accounts (name, account_type, institution_name, opening_balance)
select 'Main business bank', 'bank', 'Set account details in Business Finance', 0
where not exists (select 1 from public.cash_accounts);

alter table public.payments add column if not exists cash_account_id uuid references public.cash_accounts(id);
update public.payments
set cash_account_id = (select id from public.cash_accounts where is_active order by created_at asc limit 1)
where cash_account_id is null;
alter table public.payments alter column cash_account_id set not null;

create index if not exists business_costs_status_due_idx on public.business_costs (status, due_date);
create index if not exists business_costs_project_idx on public.business_costs (project_id, bill_date desc);
create index if not exists outgoing_payments_cost_date_idx on public.outgoing_payments (cost_id, payment_date desc);
create index if not exists outgoing_payments_account_date_idx on public.outgoing_payments (cash_account_id, payment_date desc);
create index if not exists payments_cash_account_date_idx on public.payments (cash_account_id, payment_date desc);

create or replace function public.next_finance_number(kind text, issue_date date default current_date)
returns text
language plpgsql security definer
set search_path = public
as $$
declare
  ym text := to_char(issue_date, 'YYYYMM');
  sequence_value integer;
begin
  if not public.is_authorized_staff() then raise exception 'Not authorized'; end if;
  if kind <> 'cost' then raise exception 'Invalid finance document kind'; end if;
  insert into public.finance_sequences(document_kind, year_month, last_value)
  values (kind, ym, 1)
  on conflict (document_kind, year_month)
  do update set last_value = public.finance_sequences.last_value + 1
  returning last_value into sequence_value;
  return 'NSS-CST-' || ym || '-' || lpad(sequence_value::text, 3, '0');
end;
$$;

create or replace function public.apply_outgoing_payment()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  target_id uuid := coalesce(new.cost_id, old.cost_id);
  cost_total numeric(14,2);
  paid_total numeric(14,2);
  current_status text;
begin
  select total_amount, status into cost_total, current_status
  from public.business_costs where id = target_id for update;
  if not found or current_status = 'cancelled' then raise exception 'Cost record is unavailable'; end if;
  select coalesce(sum(amount), 0) into paid_total from public.outgoing_payments where cost_id = target_id;
  if paid_total > cost_total then raise exception 'Payment total exceeds the cost balance'; end if;
  update public.business_costs set
    amount_paid = paid_total,
    balance = cost_total - paid_total,
    status = case when paid_total = cost_total then 'paid'
                  when paid_total > 0 then 'partially_paid'
                  else 'unpaid' end,
    updated_at = now()
  where id = target_id;
  return coalesce(new, old);
end;
$$;

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
language plpgsql security invoker
set search_path = public
as $$
declare
  target public.business_costs%rowtype;
  result public.outgoing_payments%rowtype;
begin
  select * into target from public.business_costs where id = p_cost_id for update;
  if not found or target.status = 'cancelled' then raise exception 'Cost record is unavailable'; end if;
  if p_amount <= 0 or p_amount > target.balance then raise exception 'Invalid payment amount'; end if;
  if not exists (select 1 from public.cash_accounts where id = p_cash_account_id and is_active) then
    raise exception 'Select an active cash account';
  end if;
  if p_proof_storage_path is null or p_proof_storage_path not like target.id::text || '/%' then
    raise exception 'Verified payment proof is required';
  end if;
  insert into public.outgoing_payments (
    cost_id, cash_account_id, payment_date, amount, payment_method,
    transaction_reference, notes, proof_storage_path, recorded_by
  ) values (
    target.id, p_cash_account_id, p_payment_date, p_amount, p_payment_method,
    nullif(trim(p_transaction_reference), ''), nullif(trim(p_notes), ''),
    p_proof_storage_path, auth.uid()
  ) returning * into result;
  return to_jsonb(result);
end;
$$;

-- New overload records the cash account for every customer receipt.
create or replace function public.record_invoice_payment(
  p_invoice_id uuid,
  p_payment_date date,
  p_amount numeric,
  p_payment_method public.payment_method,
  p_transaction_reference text,
  p_notes text,
  p_proof_storage_path text,
  p_cash_account_id uuid
) returns jsonb
language plpgsql security invoker
set search_path = public
as $$
declare
  target public.invoices%rowtype;
  payment_row public.payments%rowtype;
  receipt_row public.receipts%rowtype;
  receipt_no text;
begin
  select * into target from public.invoices where id = p_invoice_id and archived_at is null for update;
  if not found or target.status not in ('unpaid','partially_paid','overdue') then
    raise exception 'Select an issued invoice with an outstanding balance';
  end if;
  if p_amount <= 0 or p_amount > target.balance then raise exception 'Invalid payment amount'; end if;
  if not exists (select 1 from public.cash_accounts where id = p_cash_account_id and is_active) then
    raise exception 'Select an active cash account';
  end if;
  if p_proof_storage_path is null or p_proof_storage_path not like target.id::text || '/%' then
    raise exception 'Verified payment proof is required';
  end if;
  insert into public.payments (
    invoice_id, customer_id, cash_account_id, payment_date, amount, payment_method,
    transaction_reference, notes, proof_storage_path, recorded_by
  ) values (
    target.id, target.customer_id, p_cash_account_id, p_payment_date, p_amount,
    p_payment_method, nullif(trim(p_transaction_reference), ''), nullif(trim(p_notes), ''),
    p_proof_storage_path, auth.uid()
  ) returning * into payment_row;
  receipt_no := public.next_document_number('receipt', p_payment_date);
  insert into public.receipts (
    receipt_number, payment_id, invoice_id, customer_id, amount_received,
    remaining_balance, prepared_by
  ) values (
    receipt_no, payment_row.id, target.id, target.customer_id, p_amount,
    target.balance - p_amount, auth.uid()
  ) returning * into receipt_row;
  return jsonb_build_object('payment', to_jsonb(payment_row), 'receipt', to_jsonb(receipt_row));
end;
$$;

create or replace function public.ensure_invoice_project()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  insert into public.projects (
    project_code, title, customer_id, source_quotation_id, source_invoice_id, created_by
  ) values (
    'PRJ-' || regexp_replace(new.invoice_number, '^NSS-INV-', ''),
    new.project_title, new.customer_id, new.quotation_id, new.id, new.created_by
  ) on conflict (source_invoice_id) do nothing;
  return new;
end;
$$;

drop trigger if exists invoice_project_created on public.invoices;
create trigger invoice_project_created after insert on public.invoices
for each row execute function public.ensure_invoice_project();

insert into public.projects (
  project_code, title, customer_id, source_quotation_id, source_invoice_id, created_by, created_at
)
select
  'PRJ-' || regexp_replace(i.invoice_number, '^NSS-INV-', ''),
  i.project_title, i.customer_id, i.quotation_id, i.id, i.created_by, i.created_at
from public.invoices i
where not exists (select 1 from public.projects p where p.source_invoice_id = i.id)
on conflict do nothing;

create trigger cash_accounts_updated before update on public.cash_accounts for each row execute function public.set_updated_at();
create trigger suppliers_updated before update on public.suppliers for each row execute function public.set_updated_at();
create trigger labour_workers_updated before update on public.labour_workers for each row execute function public.set_updated_at();
create trigger projects_updated before update on public.projects for each row execute function public.set_updated_at();
create trigger business_costs_updated before update on public.business_costs for each row execute function public.set_updated_at();
create trigger outgoing_payment_totals after insert or update or delete on public.outgoing_payments
for each row execute function public.apply_outgoing_payment();

alter table public.cash_accounts enable row level security;
alter table public.suppliers enable row level security;
alter table public.labour_workers enable row level security;
alter table public.projects enable row level security;
alter table public.finance_sequences enable row level security;
alter table public.business_costs enable row level security;
alter table public.outgoing_payments enable row level security;

create policy finance_accounts_read on public.cash_accounts for select to authenticated using (public.is_authorized_staff());
create policy finance_accounts_admin_write on public.cash_accounts for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy finance_suppliers_staff on public.suppliers for all to authenticated using (public.is_authorized_staff()) with check (public.is_authorized_staff());
create policy finance_workers_staff on public.labour_workers for all to authenticated using (public.is_authorized_staff()) with check (public.is_authorized_staff());
create policy finance_projects_staff on public.projects for all to authenticated using (public.is_authorized_staff()) with check (public.is_authorized_staff());
create policy finance_costs_read on public.business_costs for select to authenticated using (public.is_authorized_staff());
create policy finance_costs_insert on public.business_costs for insert to authenticated with check (
  public.is_authorized_staff()
  and created_by = auth.uid()
  and amount_paid = 0
  and balance = total_amount
  and status = 'unpaid'
);
create policy finance_outgoing_read on public.outgoing_payments for select to authenticated using (public.is_authorized_staff());
create policy finance_outgoing_insert on public.outgoing_payments for insert to authenticated with check (
  public.is_authorized_staff()
  and recorded_by = auth.uid()
  and proof_storage_path like cost_id::text || '/%'
  and exists (select 1 from public.cash_accounts account where account.id = cash_account_id and account.is_active)
);

revoke all on public.finance_sequences from anon, authenticated;
grant select on public.cash_accounts, public.suppliers, public.labour_workers, public.projects, public.business_costs, public.outgoing_payments to authenticated;
grant insert, update on public.cash_accounts, public.suppliers, public.labour_workers, public.projects to authenticated;
grant insert on public.business_costs, public.outgoing_payments to authenticated;
revoke execute on function public.next_finance_number(text,date) from public, anon;
revoke execute on function public.record_business_cost_payment(uuid,uuid,date,numeric,public.payment_method,text,text,text) from public, anon;
revoke execute on function public.record_invoice_payment(uuid,date,numeric,public.payment_method,text,text,text,uuid) from public, anon;
grant execute on function public.next_finance_number(text,date) to authenticated;
grant execute on function public.record_business_cost_payment(uuid,uuid,date,numeric,public.payment_method,text,text,text) to authenticated;
grant execute on function public.record_invoice_payment(uuid,date,numeric,public.payment_method,text,text,text,uuid) to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('finance-proofs', 'finance-proofs', false, 5242880, array['image/jpeg','image/png','image/webp','application/pdf'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create policy finance_proofs_read on storage.objects for select to authenticated
using (bucket_id = 'finance-proofs' and public.is_authorized_staff());
create policy finance_proofs_insert on storage.objects for insert to authenticated
with check (bucket_id = 'finance-proofs' and public.is_authorized_staff());

commit;
