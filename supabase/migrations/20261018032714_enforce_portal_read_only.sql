begin;

-- Authenticated browser sessions may read the records needed by the portal,
-- but all generic table writes are server-mediated or handled by a narrowly
-- scoped RPC. This prevents a Staff JWT from bypassing route-level role and
-- workflow checks through the public Data API.
revoke all on table
  public.profiles,
  public.customers,
  public.quotation_requests,
  public.company_settings,
  public.quotations,
  public.quotation_items,
  public.invoices,
  public.invoice_items,
  public.payments,
  public.receipts,
  public.audit_logs,
  public.cash_accounts,
  public.suppliers,
  public.labour_workers,
  public.projects,
  public.business_costs,
  public.outgoing_payments
from public, anon, authenticated;

grant select on table
  public.profiles,
  public.customers,
  public.quotation_requests,
  public.company_settings,
  public.quotations,
  public.quotation_items,
  public.invoices,
  public.invoice_items,
  public.payments,
  public.receipts,
  public.audit_logs,
  public.cash_accounts,
  public.suppliers,
  public.projects,
  public.business_costs,
  public.outgoing_payments
to authenticated;

-- Staff directories expose only masked payment information. Administrators
-- obtain encrypted values through the server route after its role check.
grant select (
  id,
  worker_code,
  name,
  phone,
  email,
  worker_type,
  trade_or_role,
  identification_reference,
  start_date,
  bank_name,
  bank_account_holder,
  bank_account_last_four,
  has_duitnow,
  notes,
  is_active,
  created_by,
  created_at,
  updated_at
) on table public.labour_workers to authenticated;

-- The backend uses the service role only after same-origin session and role
-- checks. Its actor header is consumed by the transaction-coupled audit trigger.
grant select, insert, update, delete on table
  public.profiles,
  public.customers,
  public.quotation_requests,
  public.company_settings,
  public.quotations,
  public.quotation_items,
  public.invoices,
  public.invoice_items,
  public.payments,
  public.receipts,
  public.audit_logs,
  public.cash_accounts,
  public.suppliers,
  public.labour_workers,
  public.projects,
  public.business_costs,
  public.outgoing_payments
to service_role;

revoke all on sequence public.labour_worker_code_seq from public, anon, authenticated;
grant usage, select on sequence public.labour_worker_code_seq to service_role;

drop policy if exists profiles_admin_write on public.profiles;
drop policy if exists staff_customers on public.customers;
drop policy if exists staff_requests on public.quotation_requests;
drop policy if exists admin_settings_write on public.company_settings;
drop policy if exists staff_quotations on public.quotations;
drop policy if exists staff_quotation_items on public.quotation_items;
drop policy if exists staff_invoices on public.invoices;
drop policy if exists staff_invoice_items on public.invoice_items;
drop policy if exists staff_payments on public.payments;
drop policy if exists staff_receipts on public.receipts;
drop policy if exists staff_audit_read on public.audit_logs;
drop policy if exists staff_audit_insert on public.audit_logs;
drop policy if exists finance_accounts_admin_write on public.cash_accounts;
drop policy if exists finance_suppliers_staff on public.suppliers;
drop policy if exists finance_workers_staff on public.labour_workers;
drop policy if exists finance_projects_staff on public.projects;
drop policy if exists finance_costs_insert on public.business_costs;
drop policy if exists finance_outgoing_insert on public.outgoing_payments;

create policy staff_customers_read
on public.customers for select to authenticated
using (public.is_authorized_staff());

create policy staff_requests_read
on public.quotation_requests for select to authenticated
using (public.is_authorized_staff());

create policy staff_quotations_read
on public.quotations for select to authenticated
using (public.is_authorized_staff());

create policy staff_quotation_items_read
on public.quotation_items for select to authenticated
using (public.is_authorized_staff());

create policy staff_invoices_read
on public.invoices for select to authenticated
using (public.is_authorized_staff());

create policy staff_invoice_items_read
on public.invoice_items for select to authenticated
using (public.is_authorized_staff());

create policy staff_payments_read
on public.payments for select to authenticated
using (public.is_authorized_staff());

create policy staff_receipts_read
on public.receipts for select to authenticated
using (public.is_authorized_staff());

create policy admin_audit_read
on public.audit_logs for select to authenticated
using (public.is_admin());

create policy finance_suppliers_read
on public.suppliers for select to authenticated
using (public.is_authorized_staff());

create policy finance_workers_read
on public.labour_workers for select to authenticated
using (public.is_authorized_staff());

create policy finance_projects_read
on public.projects for select to authenticated
using (public.is_authorized_staff());

commit;
