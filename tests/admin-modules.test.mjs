import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const frontend = readFileSync(new URL('../src/admin-modules.js', import.meta.url), 'utf8');
const api = readFileSync(new URL('../api/admin-auth.js', import.meta.url), 'utf8');
const migration = readFileSync(new URL('../supabase/migrations/202609100004_complete_admin_modules.sql', import.meta.url), 'utf8');

for (const module of ['Dashboard','Customers','Requests','Quotations','Payments','Receipts','Settings','Users','Audit']) {
  test(`${module} has a production renderer`, () => assert.match(frontend, new RegExp(`render${module}`)));
}

test('all module data uses the same-origin authenticated API', () => {
  for (const route of ['dashboard','customers','requests','quotations','payments','receipts','settings','users','audit']) {
    assert.match(api, new RegExp(`route === '/${route}'`));
  }
  assert.doesNotMatch(frontend, /localStorage|sessionStorage/);
});

test('financial and audit tables remain authenticated only', () => {
  assert.match(migration, /public\.payments to authenticated/);
  assert.match(migration, /public\.receipts to authenticated/);
  assert.match(migration, /actor_id = auth\.uid\(\)/);
  assert.doesNotMatch(migration, /\bto anon\b/);
});
