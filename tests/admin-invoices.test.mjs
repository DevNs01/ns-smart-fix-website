import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const admin = readFileSync(new URL('../src/admin.js', import.meta.url), 'utf8');
const invoices = readFileSync(new URL('../src/admin-invoices.js', import.meta.url), 'utf8');
const api = readFileSync(new URL('../api/admin-auth.js', import.meta.url), 'utf8');
const migration = readFileSync(new URL('../supabase/migrations/202609100003_invoice_module_permissions.sql', import.meta.url), 'utf8');

test('invoice navigation opens the implemented module', () => {
  assert.match(admin, /renderInvoices\(api\)/);
  assert.match(admin, /invoices: \(\) => renderInvoices\(api\)/);
});

test('invoice records use the secure API and never browser storage', () => {
  assert.match(invoices, /api\('invoice-create'/);
  assert.doesNotMatch(invoices, /localStorage|sessionStorage/);
  assert.match(api, /route === '\/invoice-create'/);
  assert.match(api, /next_document_number/);
});

test('invoice UI supports line items, calculated totals and printing', () => {
  assert.match(invoices, /add-invoice-item/);
  assert.match(invoices, /invoice-total/);
  assert.match(invoices, /window\.print\(\)/);
});

test('invoice tables are granted only to authenticated users', () => {
  assert.match(migration, /grant select, insert, update on table public\.invoices to authenticated/);
  assert.doesNotMatch(migration, /\bto anon\b/);
});
