begin;

alter table public.invoice_items
  add column if not exists serial_numbers text[] not null default '{}';

alter table public.invoice_items
  drop constraint if exists invoice_items_serial_numbers_valid;

alter table public.invoice_items
  add constraint invoice_items_serial_numbers_valid check (
    cardinality(serial_numbers) <= floor(quantity)
    and array_position(serial_numbers, '') is null
  );

comment on column public.invoice_items.serial_numbers is
  'Individual product serial numbers. The array length cannot exceed the whole-unit quantity.';

commit;
