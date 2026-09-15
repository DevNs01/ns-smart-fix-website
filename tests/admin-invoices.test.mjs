import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const admin = readFileSync(new URL('../src/admin.js', import.meta.url), 'utf8');
const invoices = readFileSync(new URL('../src/admin-invoices.js', import.meta.url), 'utf8');
const api = readFileSync(new URL('../api/admin-auth.js', import.meta.url), 'utf8');
const migration = readFileSync(new URL('../supabase/migrations/202609100003_invoice_module_permissions.sql', import.meta.url), 'utf8');
const workflowMigration = readFileSync(new URL('../supabase/migrations/202609150001_controlled_quote_to_cash.sql', import.meta.url), 'utf8');
const paymentMigration = readFileSync(new URL('../supabase/migrations/202609150003_atomic_invoice_payments.sql', import.meta.url), 'utf8');

test('invoice navigation opens the implemented module', () => {
  assert.match(admin, /renderInvoices\(api\)/);
  assert.match(admin, /invoices: async \(\) => \{ await renderInvoices\(api\)/);
});

test('invoice records use the secure API and never browser storage', () => {
  assert.match(invoices, /api\('quotation-convert'/);
  assert.doesNotMatch(invoices, /localStorage|sessionStorage/);
  assert.match(api, /route === '\/invoice-create'/);
  assert.match(api, /next_document_number/);
});

test('accepted quotations are converted to one invoice transactionally', () => {
  assert.match(invoices, /READY TO INVOICE/);
  assert.match(invoices, /Mark Accepted/);
  assert.match(api, /route === '\/quotation-convert'/);
  assert.match(api, /convert_accepted_quotation_to_invoice/);
  assert.match(api, /Standalone invoices are disabled/);
  assert.match(workflowMigration, /quote\.status <> 'accepted'/);
  assert.match(workflowMigration, /quotation_id = quote\.id/);
  assert.match(workflowMigration, /insert into public\.invoice_items/);
  assert.match(workflowMigration, /status = 'converted_to_invoice'/);
  assert.match(workflowMigration, /for update/);
});

test('financial statuses follow controlled transitions', () => {
  assert.match(api, /current\.status==='sent'/);
  assert.match(api, /\['accepted','rejected','expired','cancelled'\]/);
  assert.match(api, /nextStatus==='cancelled'/);
  assert.doesNotMatch(invoices, /<select class="document-status status-select"/);
  assert.match(api, /status=in\.\(unpaid,partially_paid,overdue\)/);
  assert.match(api, /\['unpaid','partially_paid','overdue'\]\.includes\(invoice\.status\)/);
});

test('invoice UI supports line items, calculated totals and printing', () => {
  assert.match(invoices, /add-invoice-item/);
  assert.match(invoices, /invoice-total/);
  assert.match(invoices, /window\.print\(\)/);
});

test('invoices reuse the verified customer master record and standard snapshot fields', () => {
  assert.match(invoices, /name="customerId"/);
  assert.match(invoices, /invoice-customer-summary/);
  assert.match(api, /customers\?id=eq\.\$\{encodeURIComponent\(customerId\)\}/);
  assert.match(api, /customer_snapshot: customer/);
  assert.doesNotMatch(api, /customer_snapshot: \{ name: customerName, contactPerson:/);
});

test('saved invoices can be viewed and downloaded as PDFs', () => {
  assert.match(invoices, /View PDF/);
  assert.match(invoices, /Download PDF/);
  assert.match(invoices, /action=invoice-pdf/);
  assert.match(api, /route === '\/invoice-pdf'/);
  assert.match(api, /buildInvoicePdf/);
});

test('invoice detail and controlled payment proof workflow are available', () => {
  assert.match(invoices, /invoice-detail/);
  assert.match(invoices, /Record Payment/);
  assert.match(invoices, /payment-proof-upload-url/);
  assert.match(invoices, /Payment proof \*/);
  assert.match(api, /route === '\/invoice-detail'/);
  assert.match(api, /route === '\/payment-proof'/);
  assert.match(api, /proofCheck\.ok/);
});

test('payment and receipt are committed atomically and status remains database-derived', () => {
  assert.match(api, /rpc\/record_invoice_payment/);
  assert.match(paymentMigration, /for update/);
  assert.match(paymentMigration, /insert into public\.payments/);
  assert.match(paymentMigration, /insert into public\.receipts/);
  assert.match(paymentMigration, /p_proof_storage_path is null/);
  assert.doesNotMatch(invoices, /value="paid"/);
});

test('invoice tables are granted only to authenticated users', () => {
  assert.match(migration, /grant select, insert, update on table public\.invoices to authenticated/);
  assert.doesNotMatch(migration, /\bto anon\b/);
});
