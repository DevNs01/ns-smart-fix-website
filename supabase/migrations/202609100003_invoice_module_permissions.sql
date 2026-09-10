-- Phase 3 invoice module permissions. RLS policies remain the source of access control.
grant select, insert, update on table public.customers to authenticated;
grant select, insert, update on table public.invoices to authenticated;
grant select, insert, update on table public.invoice_items to authenticated;
grant select on table public.company_settings to authenticated;
