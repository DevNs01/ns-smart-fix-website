begin;

create sequence if not exists public.labour_worker_code_seq;

alter table public.labour_workers
  add column if not exists worker_code text,
  add column if not exists worker_type text not null default 'subcontractor',
  add column if not exists start_date date,
  add column if not exists bank_name text,
  add column if not exists bank_account_holder text,
  add column if not exists bank_account_number_encrypted text,
  add column if not exists bank_account_last_four text,
  add column if not exists duitnow_id_encrypted text,
  add column if not exists has_duitnow boolean not null default false;

with ordered_workers as (
  select id, row_number() over (order by created_at, id) as sequence_value
  from public.labour_workers
  where worker_code is null
)
update public.labour_workers as worker
set worker_code = 'WRK-' || lpad(ordered_workers.sequence_value::text, 6, '0')
from ordered_workers
where worker.id = ordered_workers.id;

select setval(
  'public.labour_worker_code_seq',
  greatest(coalesce((select max(substring(worker_code from '[0-9]+$')::bigint) from public.labour_workers), 0), 1),
  exists(select 1 from public.labour_workers)
);

alter table public.labour_workers
  alter column worker_code set default ('WRK-' || lpad(nextval('public.labour_worker_code_seq')::text, 6, '0')),
  alter column worker_code set not null;

create unique index if not exists labour_workers_worker_code_key on public.labour_workers (worker_code);

grant usage, select on sequence public.labour_worker_code_seq to authenticated;

alter table public.labour_workers drop constraint if exists labour_workers_worker_type_check;
alter table public.labour_workers add constraint labour_workers_worker_type_check
  check (worker_type in ('employee', 'subcontractor', 'part_time'));

alter table public.labour_workers drop constraint if exists labour_workers_bank_last_four_check;
alter table public.labour_workers add constraint labour_workers_bank_last_four_check
  check (bank_account_last_four is null or bank_account_last_four ~ '^[0-9A-Za-z]{4}$');

alter table public.labour_workers drop constraint if exists labour_workers_bank_fields_check;
alter table public.labour_workers add constraint labour_workers_bank_fields_check
  check (
    (bank_account_number_encrypted is null and bank_account_last_four is null)
    or
    (bank_account_number_encrypted is not null and bank_account_last_four is not null and bank_name is not null and bank_account_holder is not null)
  );

comment on column public.labour_workers.bank_account_number_encrypted is
  'AES-256-GCM ciphertext produced by the server. Never return this column through list endpoints.';
comment on column public.labour_workers.duitnow_id_encrypted is
  'AES-256-GCM ciphertext produced by the server. Never return this column through list endpoints.';
comment on column public.labour_workers.bank_account_last_four is
  'Non-sensitive masked display suffix for the staff worker directory.';

commit;
