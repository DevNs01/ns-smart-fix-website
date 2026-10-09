begin;

-- Avoid the SQL-standard CURRENT_TIME keyword taking precedence over a PL/pgSQL
-- variable inside embedded statements. The limiter requires a timestamptz value.
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

commit;
