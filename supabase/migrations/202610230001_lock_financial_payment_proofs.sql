begin;

-- Recorded invoice evidence is append-only. Legitimate corrections must bind a
-- newly uploaded object through an explicit, audited workflow instead of
-- replacing the bytes at a path already referenced by a payment.
drop policy if exists staff_payment_proofs_update on storage.objects;

-- Stop instead of silently choosing a winner if historical duplicate evidence
-- exists. Reconcile those records and copy evidence to new immutable paths
-- before applying this migration again.
do $$
begin
  if exists (
    select 1
    from public.payments
    where proof_storage_path is not null
    group by proof_storage_path
    having count(*) > 1
  ) then
    raise exception 'Duplicate invoice payment proof paths must be reconciled before this migration';
  end if;

  if exists (
    select 1
    from public.outgoing_payments
    group by proof_storage_path
    having count(*) > 1
  ) then
    raise exception 'Duplicate outgoing payment proof paths must be reconciled before this migration';
  end if;
end;
$$;

create unique index if not exists payments_proof_storage_path_unique_idx
on public.payments (proof_storage_path)
where proof_storage_path is not null;

create unique index if not exists outgoing_payments_proof_storage_path_unique_idx
on public.outgoing_payments (proof_storage_path);

commit;
