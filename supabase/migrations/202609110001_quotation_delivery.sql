-- Preserve the exact business identity used for an approved quotation and
-- record its outbound delivery without storing email content or credentials.

alter table public.quotations
  add column if not exists company_snapshot jsonb,
  add column if not exists approved_by uuid references public.profiles(id),
  add column if not exists approved_at timestamptz,
  add column if not exists sent_at timestamptz,
  add column if not exists sent_to text,
  add column if not exists email_provider_id text;

alter table public.quotations
  add constraint quotations_delivery_consistency
  check (
    (sent_at is null and sent_to is null)
    or
    (sent_at is not null and sent_to is not null and status <> 'draft')
  ) not valid;

alter table public.quotations validate constraint quotations_delivery_consistency;

create index if not exists quotations_sent_at_idx
  on public.quotations (sent_at desc)
  where sent_at is not null;

