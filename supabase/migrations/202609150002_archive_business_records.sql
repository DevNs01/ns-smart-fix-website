-- Soft deletion preserves financial history while removing records from active views.
alter table public.quotation_requests add column if not exists archived_at timestamptz;
alter table public.quotation_requests add column if not exists archived_by uuid references public.profiles(id);
alter table public.quotation_requests add column if not exists archive_reason text;

alter table public.quotations add column if not exists archived_at timestamptz;
alter table public.quotations add column if not exists archived_by uuid references public.profiles(id);
alter table public.quotations add column if not exists archive_reason text;

alter table public.invoices add column if not exists archived_at timestamptz;
alter table public.invoices add column if not exists archived_by uuid references public.profiles(id);
alter table public.invoices add column if not exists archive_reason text;

create index if not exists quotation_requests_active_idx on public.quotation_requests (created_at desc) where archived_at is null;
create index if not exists quotations_active_idx on public.quotations (created_at desc) where archived_at is null;
create index if not exists invoices_active_idx on public.invoices (created_at desc) where archived_at is null;
