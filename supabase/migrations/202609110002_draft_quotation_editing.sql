-- Draft quotation editing replaces line items after server-side validation.
-- RLS continues to restrict this operation to authorized staff.
grant delete on table public.quotation_items to authenticated;
