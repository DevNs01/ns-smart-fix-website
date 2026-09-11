-- Public quotation submissions are written by the trusted Vercel function.
-- The service role bypasses RLS, but it still needs an explicit table grant.
grant insert on table public.quotation_requests to service_role;
