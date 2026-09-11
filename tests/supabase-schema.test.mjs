import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migrationUrl = new URL('../supabase/migrations/202609100001_admin_portal_foundation.sql', import.meta.url);
const migration = await readFile(migrationUrl, 'utf8');
const requestStorageGrant = await readFile(
  new URL('../supabase/migrations/202609110001_grant_request_storage_to_service_role.sql', import.meta.url),
  'utf8'
);

test('admin portal schema contains every required business table', () => {
  for (const table of [
    'profiles', 'customers', 'quotation_requests', 'quotations', 'quotation_items',
    'invoices', 'invoice_items', 'payments', 'receipts', 'company_settings', 'audit_logs'
  ]) {
    assert.match(migration, new RegExp(`create table public\\.${table} \\(`));
  }
});

test('all business tables have row level security enabled', () => {
  for (const table of [
    'profiles', 'customers', 'quotation_requests', 'quotations', 'quotation_items',
    'invoices', 'invoice_items', 'payments', 'receipts', 'company_settings', 'audit_logs'
  ]) {
    assert.match(migration, new RegExp(`alter table public\\.${table} enable row level security;`));
  }
});

test('authenticated staff can read their own profile through RLS', () => {
  assert.match(migration, /grant select on table public\.profiles to authenticated;/);
  assert.match(migration, /create policy profiles_self_read/);
});

test('financial protections are implemented in the database', () => {
  assert.match(migration, /next_document_number/);
  assert.match(migration, /Payment total exceeds invoice total/);
  assert.match(migration, /one_invoice_per_quotation/);
  assert.match(migration, /Audit logs cannot be changed or deleted/);
  assert.match(migration, /amount_paid <= grand_total/);
  assert.match(migration, /balance = grand_total - amount_paid/);
  assert.match(migration, /Payment customer does not match invoice customer/);
  assert.match(migration, /quotation_header_totals/);
  assert.match(migration, /invoice_header_totals/);
});

test('payment proofs are private and file restricted', () => {
  assert.match(migration, /'payment-proofs', 'payment-proofs', false, 5242880/);
  assert.match(migration, /'image\/jpeg'/);
  assert.match(migration, /'application\/pdf'/);
});

test('website request storage grants insert access to the service role', () => {
  assert.match(requestStorageGrant, /grant insert on table public\.quotation_requests to service_role;/i);
});
