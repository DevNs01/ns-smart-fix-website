-- NS Smart Fix Solution admin portal foundation.
-- Apply with the Supabase CLI or paste into the Supabase SQL editor.

create extension if not exists pgcrypto;

create type public.app_role as enum ('admin', 'staff');
create type public.customer_type as enum ('individual', 'company');
create type public.quotation_status as enum ('draft', 'sent', 'accepted', 'rejected', 'expired', 'converted_to_invoice', 'cancelled');
create type public.invoice_status as enum ('draft', 'unpaid', 'partially_paid', 'paid', 'overdue', 'cancelled');
create type public.payment_method as enum ('bank_transfer', 'cash', 'duitnow', 'cheque', 'other');
create type public.request_status as enum ('new', 'reviewing', 'converted', 'closed', 'spam');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null check (char_length(full_name) between 2 and 120),
  role public.app_role not null default 'staff',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.customers (
  id uuid primary key default gen_random_uuid(),
  customer_code text unique,
  customer_type public.customer_type not null,
  name text not null check (char_length(name) between 2 and 160),
  company_registration_number text,
  contact_person text,
  phone text not null check (char_length(phone) between 8 and 30),
  email text check (email is null or char_length(email) <= 254),
  billing_address text,
  service_address text,
  notes text,
  is_active boolean not null default true,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.quotation_requests (
  id uuid primary key default gen_random_uuid(),
  public_reference text not null unique,
  status public.request_status not null default 'new',
  customer_name text not null,
  company_name text,
  phone text not null,
  email text,
  customer_type text,
  services text[] not null default '{}',
  project_location text,
  preferred_visit_date date,
  preferred_contact_method text,
  budget_range text,
  urgency text,
  description text,
  selected_file_names text[] not null default '{}',
  consented_at timestamptz not null,
  source text not null default 'website',
  customer_id uuid references public.customers(id),
  reviewed_by uuid references public.profiles(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.company_settings (
  id boolean primary key default true check (id),
  company_name text not null default 'NS Smart Fix Solution',
  registration_number text,
  business_address text,
  phone text,
  email text,
  website text,
  logo_path text,
  bank_name text,
  bank_account_name text,
  bank_account_number text,
  default_quotation_validity_days integer not null default 14 check (default_quotation_validity_days between 1 and 365),
  default_invoice_payment_days integer not null default 30 check (default_invoice_payment_days between 0 and 365),
  default_terms text,
  quotation_prefix text not null default 'NSS-QT' check (quotation_prefix ~ '^[A-Z0-9-]{2,20}$'),
  invoice_prefix text not null default 'NSS-INV' check (invoice_prefix ~ '^[A-Z0-9-]{2,20}$'),
  receipt_prefix text not null default 'NSS-RCP' check (receipt_prefix ~ '^[A-Z0-9-]{2,20}$'),
  tax_enabled boolean not null default false,
  default_tax_percent numeric(5,2) not null default 0 check (default_tax_percent between 0 and 100),
  updated_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.document_sequences (
  document_kind text not null check (document_kind in ('quotation', 'invoice', 'receipt')),
  year_month text not null check (year_month ~ '^\d{6}$'),
  last_value integer not null default 0 check (last_value >= 0),
  primary key (document_kind, year_month)
);

create table public.quotations (
  id uuid primary key default gen_random_uuid(),
  quotation_number text not null unique,
  customer_id uuid not null references public.customers(id),
  source_request_id uuid references public.quotation_requests(id),
  quotation_date date not null default current_date,
  expiry_date date not null,
  project_title text not null,
  project_location text,
  description text,
  customer_snapshot jsonb not null default '{}'::jsonb,
  discount_amount numeric(14,2) not null default 0 check (discount_amount >= 0),
  tax_percent numeric(5,2) not null default 0 check (tax_percent between 0 and 100),
  other_charges numeric(14,2) not null default 0 check (other_charges >= 0),
  subtotal numeric(14,2) not null default 0 check (subtotal >= 0),
  grand_total numeric(14,2) not null default 0 check (grand_total >= 0),
  notes text,
  terms_and_conditions text,
  status public.quotation_status not null default 'draft',
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (expiry_date >= quotation_date),
  check (discount_amount <= subtotal)
);

create table public.quotation_items (
  id uuid primary key default gen_random_uuid(),
  quotation_id uuid not null references public.quotations(id) on delete cascade,
  position integer not null default 1 check (position > 0),
  description text not null,
  quantity numeric(12,3) not null check (quantity > 0),
  unit_price numeric(14,2) not null check (unit_price >= 0),
  line_total numeric(14,2) generated always as (round(quantity * unit_price, 2)) stored,
  created_at timestamptz not null default now(),
  unique (quotation_id, position)
);

create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  invoice_number text not null unique,
  customer_id uuid not null references public.customers(id),
  quotation_id uuid references public.quotations(id),
  invoice_date date not null default current_date,
  due_date date not null,
  po_reference text,
  project_title text not null,
  description text,
  customer_snapshot jsonb not null default '{}'::jsonb,
  discount_amount numeric(14,2) not null default 0 check (discount_amount >= 0),
  tax_percent numeric(5,2) not null default 0 check (tax_percent between 0 and 100),
  other_charges numeric(14,2) not null default 0 check (other_charges >= 0),
  subtotal numeric(14,2) not null default 0 check (subtotal >= 0),
  grand_total numeric(14,2) not null default 0 check (grand_total >= 0),
  amount_paid numeric(14,2) not null default 0 check (amount_paid >= 0),
  balance numeric(14,2) not null default 0 check (balance >= 0),
  notes text,
  payment_terms text,
  status public.invoice_status not null default 'draft',
  allow_duplicate_from_quotation boolean not null default false,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (due_date >= invoice_date),
  check (discount_amount <= subtotal),
  check (amount_paid <= grand_total),
  check (balance = grand_total - amount_paid)
);

create unique index one_invoice_per_quotation
  on public.invoices (quotation_id)
  where quotation_id is not null and allow_duplicate_from_quotation = false and status <> 'cancelled';

create table public.invoice_items (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  position integer not null default 1 check (position > 0),
  description text not null,
  quantity numeric(12,3) not null check (quantity > 0),
  unit_price numeric(14,2) not null check (unit_price >= 0),
  line_total numeric(14,2) generated always as (round(quantity * unit_price, 2)) stored,
  created_at timestamptz not null default now(),
  unique (invoice_id, position)
);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices(id),
  customer_id uuid not null references public.customers(id),
  payment_date date not null default current_date,
  amount numeric(14,2) not null check (amount > 0),
  payment_method public.payment_method not null,
  transaction_reference text,
  notes text,
  proof_storage_path text,
  recorded_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.receipts (
  id uuid primary key default gen_random_uuid(),
  receipt_number text not null unique,
  payment_id uuid not null unique references public.payments(id),
  invoice_id uuid not null references public.invoices(id),
  customer_id uuid not null references public.customers(id),
  amount_received numeric(14,2) not null check (amount_received > 0),
  remaining_balance numeric(14,2) not null check (remaining_balance >= 0),
  prepared_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);

create table public.audit_logs (
  id bigint generated always as identity primary key,
  occurred_at timestamptz not null default now(),
  actor_id uuid references public.profiles(id),
  action text not null,
  module text not null,
  record_id uuid,
  record_number text,
  old_value jsonb,
  new_value jsonb,
  request_ip inet,
  user_agent text
);

create index customers_search_idx on public.customers using gin (to_tsvector('simple', coalesce(name, '') || ' ' || coalesce(contact_person, '') || ' ' || coalesce(phone, '') || ' ' || coalesce(email, '')));
create index quotation_requests_status_created_idx on public.quotation_requests (status, created_at desc);
create index quotations_customer_status_idx on public.quotations (customer_id, status);
create index invoices_customer_status_due_idx on public.invoices (customer_id, status, due_date);
create index payments_invoice_date_idx on public.payments (invoice_id, payment_date desc);
create index audit_logs_module_record_idx on public.audit_logs (module, record_id, occurred_at desc);

create or replace function public.current_app_role()
returns public.app_role
language sql stable security definer
set search_path = public
as $$ select role from public.profiles where id = auth.uid() and is_active = true $$;

create or replace function public.is_authorized_staff()
returns boolean
language sql stable security definer
set search_path = public
as $$ select coalesce(public.current_app_role() in ('admin', 'staff'), false) $$;

create or replace function public.is_admin()
returns boolean
language sql stable security definer
set search_path = public
as $$ select coalesce(public.current_app_role() = 'admin', false) $$;

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

create or replace function public.next_document_number(kind text, issue_date date default current_date)
returns text
language plpgsql security definer
set search_path = public
as $$
declare
  ym text := to_char(issue_date, 'YYYYMM');
  sequence_value integer;
  prefix_value text;
begin
  if not public.is_authorized_staff() then raise exception 'Not authorized'; end if;
  if kind not in ('quotation', 'invoice', 'receipt') then raise exception 'Invalid document kind'; end if;

  insert into public.document_sequences(document_kind, year_month, last_value)
  values (kind, ym, 1)
  on conflict (document_kind, year_month)
  do update set last_value = public.document_sequences.last_value + 1
  returning last_value into sequence_value;

  select case kind
    when 'quotation' then quotation_prefix
    when 'invoice' then invoice_prefix
    else receipt_prefix end
  into prefix_value from public.company_settings where id = true;

  return coalesce(prefix_value, case kind when 'quotation' then 'NSS-QT' when 'invoice' then 'NSS-INV' else 'NSS-RCP' end)
    || '-' || ym || '-' || lpad(sequence_value::text, 3, '0');
end;
$$;

create or replace function public.refresh_quotation_totals()
returns trigger language plpgsql security definer set search_path = public as $$
declare target_id uuid := coalesce(new.quotation_id, old.quotation_id);
begin
  update public.quotations q set
    subtotal = x.subtotal,
    grand_total = greatest(0, round((x.subtotal - q.discount_amount) * (1 + q.tax_percent / 100) + q.other_charges, 2)),
    updated_at = now()
  from (select coalesce(sum(line_total), 0) subtotal from public.quotation_items where quotation_id = target_id) x
  where q.id = target_id;
  return coalesce(new, old);
end;
$$;

create or replace function public.calculate_quotation_header()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  select coalesce(sum(line_total), 0) into new.subtotal
  from public.quotation_items where quotation_id = new.id;
  new.grand_total = greatest(0, round((new.subtotal - new.discount_amount) * (1 + new.tax_percent / 100) + new.other_charges, 2));
  return new;
end;
$$;

create or replace function public.refresh_invoice_totals()
returns trigger language plpgsql security definer set search_path = public as $$
declare target_id uuid := coalesce(new.invoice_id, old.invoice_id);
begin
  update public.invoices i set
    subtotal = x.subtotal,
    grand_total = greatest(0, round((x.subtotal - i.discount_amount) * (1 + i.tax_percent / 100) + i.other_charges, 2)),
    balance = greatest(0, round((x.subtotal - i.discount_amount) * (1 + i.tax_percent / 100) + i.other_charges, 2) - i.amount_paid),
    updated_at = now()
  from (select coalesce(sum(line_total), 0) subtotal from public.invoice_items where invoice_id = target_id) x
  where i.id = target_id;
  return coalesce(new, old);
end;
$$;

create or replace function public.calculate_invoice_header()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  select coalesce(sum(line_total), 0) into new.subtotal
  from public.invoice_items where invoice_id = new.id;
  new.grand_total = greatest(0, round((new.subtotal - new.discount_amount) * (1 + new.tax_percent / 100) + new.other_charges, 2));
  new.balance = new.grand_total - new.amount_paid;
  return new;
end;
$$;

create or replace function public.validate_payment_customer()
returns trigger language plpgsql security definer set search_path = public as $$
declare invoice_customer uuid;
begin
  select customer_id into invoice_customer from public.invoices where id = new.invoice_id;
  if invoice_customer is null then raise exception 'Invoice not found'; end if;
  if new.customer_id <> invoice_customer then raise exception 'Payment customer does not match invoice customer'; end if;
  return new;
end;
$$;

create or replace function public.apply_payment_to_invoice()
returns trigger language plpgsql security definer set search_path = public as $$
declare total_paid numeric(14,2); invoice_total numeric(14,2); invoice_due date; invoice_state public.invoice_status;
begin
  select grand_total, due_date, status into invoice_total, invoice_due, invoice_state
  from public.invoices where id = coalesce(new.invoice_id, old.invoice_id) for update;
  if invoice_state = 'cancelled' then raise exception 'Payments cannot be applied to a cancelled invoice'; end if;
  select coalesce(sum(amount), 0) into total_paid from public.payments where invoice_id = coalesce(new.invoice_id, old.invoice_id);
  if total_paid > invoice_total then raise exception 'Payment total exceeds invoice total'; end if;
  update public.invoices set amount_paid = total_paid, balance = invoice_total - total_paid,
    status = case when total_paid = invoice_total and invoice_total > 0 then 'paid'::public.invoice_status
                  when total_paid > 0 then 'partially_paid'::public.invoice_status
                  when invoice_due < current_date then 'overdue'::public.invoice_status
                  else 'unpaid'::public.invoice_status end,
    updated_at = now()
  where id = coalesce(new.invoice_id, old.invoice_id);
  return coalesce(new, old);
end;
$$;

create or replace function public.protect_audit_logs()
returns trigger language plpgsql as $$
begin raise exception 'Audit logs cannot be changed or deleted'; end;
$$;

create trigger profiles_updated before update on public.profiles for each row execute function public.set_updated_at();
create trigger customers_updated before update on public.customers for each row execute function public.set_updated_at();
create trigger requests_updated before update on public.quotation_requests for each row execute function public.set_updated_at();
create trigger settings_updated before update on public.company_settings for each row execute function public.set_updated_at();
create trigger quotations_updated before update on public.quotations for each row execute function public.set_updated_at();
create trigger invoices_updated before update on public.invoices for each row execute function public.set_updated_at();
create trigger payments_updated before update on public.payments for each row execute function public.set_updated_at();
create trigger quotation_header_totals before insert or update of discount_amount, tax_percent, other_charges on public.quotations for each row execute function public.calculate_quotation_header();
create trigger invoice_header_totals before insert or update of discount_amount, tax_percent, other_charges on public.invoices for each row execute function public.calculate_invoice_header();
create trigger quotation_item_totals after insert or update or delete on public.quotation_items for each row execute function public.refresh_quotation_totals();
create trigger invoice_item_totals after insert or update or delete on public.invoice_items for each row execute function public.refresh_invoice_totals();
create trigger payment_customer_matches before insert or update of invoice_id, customer_id on public.payments for each row execute function public.validate_payment_customer();
create trigger payment_invoice_totals after insert or update or delete on public.payments for each row execute function public.apply_payment_to_invoice();
create trigger audit_logs_immutable before update or delete on public.audit_logs for each row execute function public.protect_audit_logs();

alter table public.profiles enable row level security;
alter table public.customers enable row level security;
alter table public.quotation_requests enable row level security;
alter table public.company_settings enable row level security;
alter table public.document_sequences enable row level security;
alter table public.quotations enable row level security;
alter table public.quotation_items enable row level security;
alter table public.invoices enable row level security;
alter table public.invoice_items enable row level security;
alter table public.payments enable row level security;
alter table public.receipts enable row level security;
alter table public.audit_logs enable row level security;

create policy profiles_self_read on public.profiles for select to authenticated using (id = auth.uid() or public.is_admin());
create policy profiles_admin_write on public.profiles for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy staff_customers on public.customers for all to authenticated using (public.is_authorized_staff()) with check (public.is_authorized_staff());
create policy staff_requests on public.quotation_requests for all to authenticated using (public.is_authorized_staff()) with check (public.is_authorized_staff());
create policy staff_settings_read on public.company_settings for select to authenticated using (public.is_authorized_staff());
create policy admin_settings_write on public.company_settings for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy staff_quotations on public.quotations for all to authenticated using (public.is_authorized_staff()) with check (public.is_authorized_staff());
create policy staff_quotation_items on public.quotation_items for all to authenticated using (public.is_authorized_staff()) with check (public.is_authorized_staff());
create policy staff_invoices on public.invoices for all to authenticated using (public.is_authorized_staff()) with check (public.is_authorized_staff());
create policy staff_invoice_items on public.invoice_items for all to authenticated using (public.is_authorized_staff()) with check (public.is_authorized_staff());
create policy staff_payments on public.payments for all to authenticated using (public.is_authorized_staff()) with check (public.is_authorized_staff());
create policy staff_receipts on public.receipts for all to authenticated using (public.is_authorized_staff()) with check (public.is_authorized_staff());
create policy staff_audit_read on public.audit_logs for select to authenticated using (public.is_authorized_staff());

revoke all on public.document_sequences from anon, authenticated;
revoke insert, update, delete on public.audit_logs from anon, authenticated;
revoke execute on function public.current_app_role() from public;
revoke execute on function public.is_authorized_staff() from public;
revoke execute on function public.is_admin() from public;
revoke execute on function public.next_document_number(text, date) from public;
grant execute on function public.current_app_role() to authenticated;
grant execute on function public.is_authorized_staff() to authenticated;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.next_document_number(text, date) to authenticated;
grant select on table public.profiles to authenticated;
grant select, insert, update on table public.customers, public.invoices, public.invoice_items to authenticated;
grant select on table public.company_settings to authenticated;

insert into public.company_settings (
  id, company_name, email, website, default_quotation_validity_days,
  default_invoice_payment_days, quotation_prefix, invoice_prefix, receipt_prefix,
  tax_enabled, default_tax_percent
) values (
  true, 'NS Smart Fix Solution', 'admin@nssmartfixsolution.com',
  'https://nssmartfixsolution.com', 14, 30, 'NSS-QT', 'NSS-INV', 'NSS-RCP', false, 0
) on conflict (id) do nothing;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('payment-proofs', 'payment-proofs', false, 5242880, array['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create policy staff_payment_proofs_read on storage.objects for select to authenticated
using (bucket_id = 'payment-proofs' and public.is_authorized_staff());
create policy staff_payment_proofs_insert on storage.objects for insert to authenticated
with check (bucket_id = 'payment-proofs' and public.is_authorized_staff());
create policy staff_payment_proofs_update on storage.objects for update to authenticated
using (bucket_id = 'payment-proofs' and public.is_authorized_staff())
with check (bucket_id = 'payment-proofs' and public.is_authorized_staff());
