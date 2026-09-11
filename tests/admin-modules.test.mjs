import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const frontend = readFileSync(new URL('../src/admin-modules.js', import.meta.url), 'utf8');
const api = readFileSync(new URL('../api/admin-auth.js', import.meta.url), 'utf8');
const adminShell = readFileSync(new URL('../src/admin.js', import.meta.url), 'utf8');
const migration = readFileSync(new URL('../supabase/migrations/202609100004_complete_admin_modules.sql', import.meta.url), 'utf8');
const draftEditingMigration = readFileSync(new URL('../supabase/migrations/202609110002_draft_quotation_editing.sql', import.meta.url), 'utf8');

for (const module of ['Dashboard','Customers','Requests','Quotations','Payments','Receipts','Settings','Users','Audit']) {
  test(`${module} has a production renderer`, () => assert.match(frontend, new RegExp(`render${module}`)));
}

test('all module data uses the same-origin authenticated API', () => {
  for (const route of ['dashboard','customers','requests','quotations','payments','receipts','settings','users','audit']) {
    assert.match(api, new RegExp(`route === '/${route}'`));
  }
  assert.doesNotMatch(frontend, /localStorage|sessionStorage/);
});

test('quotation delivery requires confirmation and exposes a PDF preview', () => {
  assert.match(frontend, /Approve & Send PDF/);
  assert.match(frontend, /Confirmed customer email/);
  assert.match(frontend, /quotation-pdf/);
  assert.match(api, /route === '\/quotation-send'/);
  assert.match(api, /body\.confirmed/);
  assert.match(api, /attachments/);
});

test('only unsent draft quotations expose audited editing', () => {
  assert.match(frontend, /q\.status==='draft'&&!q\.sent_at/);
  assert.match(frontend, /Edit Draft/);
  assert.match(frontend, /quotation-detail/);
  assert.match(frontend, /quotation-update/);
  assert.match(adminShell, /String\(action\)\.split\('&'\)/);
  assert.match(api, /route === '\/quotation-detail'/);
  assert.match(api, /route === '\/quotation-update'/);
  assert.match(api, /existing\[0\]\.status !== 'draft' \|\| existing\[0\]\.sent_at/);
  assert.match(api, /status=eq\.draft&sent_at=is\.null/);
  assert.match(api, /audit\(session,'update','quotations'/);
  assert.match(draftEditingMigration, /grant delete on table public\.quotation_items to authenticated/);
});

test('customer master records support audited profile editing', () => {
  assert.match(frontend, /Edit profile/);
  assert.match(frontend, /customer-update/);
  assert.match(frontend, /Registration number/);
  assert.match(frontend, /Active customer/);
  assert.match(api, /route === '\/customer-update'/);
  assert.match(api, /audit\(session, 'update', 'customers'/);
  assert.match(api, /status=eq\.draft&sent_at=is\.null/);
  assert.match(api, /status=in\.\(draft,unpaid\)/);
  assert.match(frontend, /Save and synchronize/);
});

test('financial and audit tables remain authenticated only', () => {
  assert.match(migration, /public\.payments to authenticated/);
  assert.match(migration, /public\.receipts to authenticated/);
  assert.match(migration, /actor_id = auth\.uid\(\)/);
  assert.doesNotMatch(migration, /\bto anon\b/);
});
