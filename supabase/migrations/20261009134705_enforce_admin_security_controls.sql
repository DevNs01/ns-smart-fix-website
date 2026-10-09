begin;

-- Shared, atomic authentication throttling for serverless functions. Only the
-- backend service role can read or mutate these opaque HMAC identifiers.
create table public.admin_auth_rate_limits (
  key_hash text primary key check (key_hash ~ '^[0-9a-f]{64}$'),
  attempt_count integer not null check (attempt_count > 0),
  reset_at timestamptz not null,
  updated_at timestamptz not null default now()
);

alter table public.admin_auth_rate_limits enable row level security;
revoke all on table public.admin_auth_rate_limits from public, anon, authenticated;
grant select, insert, update, delete on table public.admin_auth_rate_limits to service_role;

create or replace function public.consume_admin_auth_rate_limit(
  p_key_hash text,
  p_limit integer,
  p_window_seconds integer
) returns table (
  allowed boolean,
  remaining integer,
  retry_after integer
)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  current_count integer;
  current_reset timestamptz;
  v_now timestamptz := clock_timestamp();
begin
  if p_key_hash !~ '^[0-9a-f]{64}$'
     or p_limit not between 1 and 50
     or p_window_seconds not between 60 and 86400 then
    raise exception 'Invalid rate-limit request';
  end if;

  delete from public.admin_auth_rate_limits
  where reset_at < v_now - interval '1 day';

  insert into public.admin_auth_rate_limits (key_hash, attempt_count, reset_at, updated_at)
  values (p_key_hash, 1, v_now + make_interval(secs => p_window_seconds), v_now)
  on conflict (key_hash) do update
  set attempt_count = case
        when public.admin_auth_rate_limits.reset_at <= v_now then 1
        else public.admin_auth_rate_limits.attempt_count + 1
      end,
      reset_at = case
        when public.admin_auth_rate_limits.reset_at <= v_now
          then v_now + make_interval(secs => p_window_seconds)
        else public.admin_auth_rate_limits.reset_at
      end,
      updated_at = v_now
  returning attempt_count, reset_at into current_count, current_reset;

  return query select
    current_count <= p_limit,
    greatest(0, p_limit - current_count),
    case when current_count <= p_limit then 0
      else greatest(1, ceil(extract(epoch from (current_reset - v_now)))::integer)
    end;
end;
$$;

revoke all on function public.consume_admin_auth_rate_limit(text, integer, integer)
from public, anon, authenticated;
grant execute on function public.consume_admin_auth_rate_limit(text, integer, integer)
to service_role;

-- Invoice creation is exclusively performed by the security-definer conversion
-- RPC, which validates and locks an Accepted quotation before copying it.
revoke insert on table public.invoices, public.invoice_items
from public, anon, authenticated;

-- Every portal mutation writes an audit record inside the same Postgres
-- transaction. If the audit insert fails, the business mutation is rolled
-- back as well. The trigger records only identifiers and operation metadata,
-- avoiding customer, banking, proof-path, and document-content disclosure.
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create or replace function private.audit_business_mutation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  row_data jsonb;
  raw_id text;
  row_id uuid;
  row_number text;
begin
  row_data := case when TG_OP = 'DELETE' then to_jsonb(OLD) else to_jsonb(NEW) end;
  raw_id := nullif(row_data ->> 'id', '');
  row_id := case
    when raw_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then raw_id::uuid
    else null
  end;
  row_number := coalesce(
    row_data ->> 'quotation_number',
    row_data ->> 'invoice_number',
    row_data ->> 'receipt_number',
    row_data ->> 'cost_number',
    row_data ->> 'customer_code',
    row_data ->> 'worker_code',
    row_data ->> 'project_code',
    row_data ->> 'public_reference',
    row_data ->> 'name'
  );

  insert into public.audit_logs (
    actor_id, action, module, record_id, record_number, new_value
  ) values (
    auth.uid(), lower(TG_OP), TG_TABLE_NAME, row_id, row_number,
    jsonb_build_object('source', 'database_trigger')
  );

  return case when TG_OP = 'DELETE' then OLD else NEW end;
end;
$$;

revoke all on function private.audit_business_mutation() from public, anon, authenticated;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'profiles', 'customers', 'quotation_requests', 'company_settings',
    'quotations', 'quotation_items', 'invoices', 'invoice_items', 'payments',
    'receipts', 'cash_accounts', 'suppliers', 'labour_workers', 'projects',
    'business_costs', 'outgoing_payments'
  ] loop
    execute format('drop trigger if exists business_mutation_audit on public.%I', table_name);
    execute format(
      'create trigger business_mutation_audit after insert or update or delete on public.%I for each row execute function private.audit_business_mutation()',
      table_name
    );
  end loop;
end;
$$;

commit;
