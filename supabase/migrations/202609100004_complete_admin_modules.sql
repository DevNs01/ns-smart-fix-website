-- Activate the remaining secured business portal modules.
-- Row-level security policies from the foundation migration remain authoritative.

grant select, insert, update on table public.quotation_requests to authenticated;
grant select, insert, update on table public.quotations to authenticated;
grant select, insert, update on table public.quotation_items to authenticated;
grant select, insert, update on table public.payments to authenticated;
grant select, insert on table public.receipts to authenticated;
grant select on table public.audit_logs to authenticated;
grant insert on table public.audit_logs to authenticated;

grant update on table public.company_settings to authenticated;
grant update on table public.profiles to authenticated;

-- Audit entries may be inserted by authorized staff but remain immutable.
create policy staff_audit_insert on public.audit_logs for insert to authenticated
with check (public.is_authorized_staff() and actor_id = auth.uid());
