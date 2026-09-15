import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const api = readFileSync(new URL('../api/admin-auth.js', import.meta.url), 'utf8');
const modules = readFileSync(new URL('../src/admin-modules.js', import.meta.url), 'utf8');
const admin = readFileSync(new URL('../src/admin.js', import.meta.url), 'utf8');
const migration = readFileSync(new URL('../supabase/migrations/202609150002_archive_business_records.sql', import.meta.url), 'utf8');

test('business records use audited soft deletion', () => {
  assert.match(migration, /archived_at timestamptz/);
  assert.match(migration, /archive_reason text/);
  assert.match(api, /route === '\/record-archive'/);
  assert.match(api, /requireAdmin\(session, response\)/);
  assert.match(api, /await audit\(session, 'archive'/);
  assert.doesNotMatch(api, /record-archive[\s\S]{0,2500}method:'DELETE'/);
});

test('paid records are protected and active views exclude archives', () => {
  assert.match(api, /record\.status === 'paid'/);
  assert.match(api, /payment history cannot be deleted/);
  assert.ok((api.match(/archived_at=is\.null/g) || []).length >= 8);
});

test('requests, quotations and invoices expose deletion actions', () => {
  assert.match(modules, /data-kind="request"/);
  assert.match(modules, /addArchiveActions/);
  assert.match(admin, /addArchiveActions\(api,'quotation'/);
  assert.match(admin, /addArchiveActions\(api,'invoice'/);
  assert.match(modules, /Reason for deleting/);
});
