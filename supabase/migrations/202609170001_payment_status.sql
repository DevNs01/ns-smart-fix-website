begin;

alter table public.payments
  add column if not exists status text;

update public.payments
set status = 'completed'
where status is null;

alter table public.payments
  alter column status set default 'completed',
  alter column status set not null;

alter table public.payments
  drop constraint if exists payments_status_check;

alter table public.payments
  add constraint payments_status_check check (status = 'completed');

comment on column public.payments.status is
  'Completed indicates that verified proof, payment, invoice totals and receipt were committed atomically.';

commit;
