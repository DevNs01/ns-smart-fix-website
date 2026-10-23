import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const api = await readFile(new URL('../api/admin-auth.js', import.meta.url), 'utf8');
const migration = await readFile(new URL('../supabase/migrations/20261009134705_enforce_admin_security_controls.sql', import.meta.url), 'utf8');
const boundaryMigration = await readFile(new URL('../supabase/migrations/20261018032632_prepare_security_boundaries.sql', import.meta.url), 'utf8');
const enforcementMigration = await readFile(new URL('../supabase/migrations/20261018032714_enforce_portal_read_only.sql', import.meta.url), 'utf8');
const proofIntegrityMigration = await readFile(new URL('../supabase/migrations/202610230001_lock_financial_payment_proofs.sql', import.meta.url), 'utf8');
const monitoring = await readFile(new URL('../api/monitoring.js', import.meta.url), 'utf8');
const monitorApi = await readFile(new URL('../api/monitor.js', import.meta.url), 'utf8');
const quotationApi = await readFile(new URL('../api/quotation.js', import.meta.url), 'utf8');
const runtime = await readFile(new URL('../support.js', import.meta.url), 'utf8');
const index = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const vercel = JSON.parse(await readFile(new URL('../vercel.json', import.meta.url), 'utf8'));
const packageManifest = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
const packageLock = JSON.parse(await readFile(new URL('../package-lock.json', import.meta.url), 'utf8'));

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
  assert.match(boundaryMigration, /request_headers[\s\S]*x-ns-actor-id/i);
  assert.match(api, /'X-NS-Actor-Id': actorId/);
});

test('authenticated Data API access is read-only outside scoped RPCs', () => {
  assert.match(enforcementMigration, /revoke all on table[\s\S]*from public, anon, authenticated/i);
  assert.match(enforcementMigration, /grant select on table[\s\S]*to authenticated/i);
  assert.match(enforcementMigration, /drop policy if exists staff_quotations/i);
  assert.match(enforcementMigration, /create policy staff_quotations_read[\s\S]*for select/i);
  assert.match(enforcementMigration, /create policy admin_audit_read[\s\S]*public\.is_admin\(\)/i);
  assert.match(enforcementMigration, /grant select \([\s\S]*bank_account_last_four[\s\S]*\) on table public\.labour_workers to authenticated/i);
  assert.doesNotMatch(enforcementMigration, /bank_account_number_encrypted[\s\S]*to authenticated/i);
  assert.match(api, /portalServiceJson[\s\S]*X-NS-Actor-Id/i);
});

test('monitoring limits and email dedupe use shared service-role state', () => {
  assert.match(boundaryMigration, /create table public\.service_rate_limits/i);
  assert.match(boundaryMigration, /create or replace function public\.consume_service_rate_limit/i);
  assert.match(boundaryMigration, /grant execute on function public\.consume_service_rate_limit[\s\S]*to service_role/i);
  assert.match(monitoring, /rpc\/consume_service_rate_limit/);
  assert.match(monitorApi, /consumeSharedBudget\('monitor-client'/);
  assert.doesNotMatch(monitoring, /__nsMonitoringAlerts|new Map\(\)/);
  assert.doesNotMatch(monitorApi, /__nsClientMonitorLimits|new Map\(\)/);
});

test('quotation abuse controls use shared state and trusted Vercel client identity', () => {
  assert.match(quotationApi, /consumeSharedBudget\(\s*'quotation-client'/);
  assert.match(quotationApi, /consumeSharedBudget\(\s*'quotation-duplicate'/);
  assert.match(quotationApi, /headers\?\.\['x-vercel-forwarded-for'\]/);
  assert.doesNotMatch(quotationApi, /__nsQuotationRateLimits|__nsQuotationDuplicates|new Map\(\)/);
});

test('financial proof objects are immutable and single-use', () => {
  assert.match(proofIntegrityMigration, /drop policy if exists staff_payment_proofs_update on storage\.objects/i);
  assert.match(proofIntegrityMigration, /unique index if not exists payments_proof_storage_path_unique_idx[\s\S]*where proof_storage_path is not null/i);
  assert.match(proofIntegrityMigration, /unique index if not exists outgoing_payments_proof_storage_path_unique_idx/i);
  assert.match(proofIntegrityMigration, /having count\(\*\) > 1/i);
  assert.doesNotMatch(enforcementMigration, /create policy staff_payment_proofs_update/i);
});

test('admin authentication rate limiting is shared and service-role only', () => {
  assert.match(migration, /create table public\.admin_auth_rate_limits/i);
  assert.match(migration, /create or replace function public\.consume_admin_auth_rate_limit/i);
  assert.match(migration, /on conflict \(key_hash\) do update/i);
  assert.match(migration, /v_now timestamptz := clock_timestamp\(\)/i);
  assert.doesNotMatch(migration, /current_time timestamptz/i);
  assert.match(migration, /revoke all on table public\.admin_auth_rate_limits from public, anon, authenticated/i);
  assert.match(migration, /grant execute on function public\.consume_admin_auth_rate_limit[\s\S]*to service_role/i);
  assert.match(api, /createHmac\('sha256'/);
  assert.match(api, /serviceRoleJson\('\/rest\/v1\/rpc\/consume_admin_auth_rate_limit'/);
  assert.match(api, /headers\?\.\['x-vercel-forwarded-for'\]/);
});

test('production browser code runs precompiled logic without unsafe eval', () => {
  const csp = vercel.headers.find(rule => rule.source === '/(.*)').headers.find(header => header.key === 'Content-Security-Policy').value;
  assert.doesNotMatch(csp, /'unsafe-eval'/);
  assert.doesNotMatch(runtime, /\bnew Function\s*\(|\beval\s*\(/);
  assert.match(index, /<script type="module" data-dc-script>/);
  assert.match(index, /window\.__dcPrecompiledLogic = Component/);
});

test('Vite resolves to the patched release', () => {
  assert.equal(packageManifest.devDependencies.vite, '^8.3.5');
  assert.equal(packageLock.packages['node_modules/vite'].version, '8.3.5');
});
