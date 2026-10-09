import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const api = await readFile(new URL('../api/admin-auth.js', import.meta.url), 'utf8');
const migration = await readFile(new URL('../supabase/migrations/20261009134705_enforce_admin_security_controls.sql', import.meta.url), 'utf8');
const runtime = await readFile(new URL('../support.js', import.meta.url), 'utf8');
const index = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const vercel = JSON.parse(await readFile(new URL('../vercel.json', import.meta.url), 'utf8'));

test('standalone invoice creation has no legacy authenticated alias', () => {
  assert.match(api, /route === '\/invoice-create'[\s\S]*Standalone invoices are disabled/);
  assert.doesNotMatch(api, /legacy-invoice-create-disabled/);
  assert.match(api, /route === '\/quotation-convert'/);
  assert.match(migration, /revoke insert on table public\.invoices, public\.invoice_items[\s\S]*from public, anon, authenticated/i);
});

test('business mutations are audited by a fail-together database trigger', () => {
  assert.match(migration, /create or replace function private\.audit_business_mutation\(\)/i);
  assert.match(migration, /security definer[\s\S]*set search_path = ''/i);
  assert.match(migration, /after insert or update or delete[\s\S]*private\.audit_business_mutation\(\)/i);
  assert.match(migration, /insert into public\.audit_logs/i);
  assert.match(migration, /when raw_id ~\*[\s\S]*then raw_id::uuid[\s\S]*else null/i);
  assert.match(api, /await audit\(session, 'view_bank_details'/);
  assert.match(api, /auditSupplemental[\s\S]*audit_write_failed/);
});

test('admin authentication rate limiting is shared and service-role only', () => {
  assert.match(migration, /create table public\.admin_auth_rate_limits/i);
  assert.match(migration, /create or replace function public\.consume_admin_auth_rate_limit/i);
  assert.match(migration, /on conflict \(key_hash\) do update/i);
  assert.match(migration, /revoke all on table public\.admin_auth_rate_limits from public, anon, authenticated/i);
  assert.match(migration, /grant execute on function public\.consume_admin_auth_rate_limit[\s\S]*to service_role/i);
  assert.match(api, /createHmac\('sha256'/);
  assert.match(api, /serviceRoleJson\('\/rest\/v1\/rpc\/consume_admin_auth_rate_limit'/);
});

test('production browser code runs precompiled logic without unsafe eval', () => {
  const csp = vercel.headers.find(rule => rule.source === '/(.*)').headers.find(header => header.key === 'Content-Security-Policy').value;
  assert.doesNotMatch(csp, /'unsafe-eval'/);
  assert.doesNotMatch(runtime, /\bnew Function\s*\(|\beval\s*\(/);
  assert.match(index, /<script type="module" data-dc-script>/);
  assert.match(index, /window\.__dcPrecompiledLogic = Component/);
});
