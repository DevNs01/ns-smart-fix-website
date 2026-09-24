import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { calculateFinanceSummary, decryptWorkerBankDetail, encryptWorkerBankDetail } from '../api/admin-auth.js';

const ui = readFileSync(new URL('../src/admin-finance.js', import.meta.url), 'utf8');
const shell = readFileSync(new URL('../src/admin.js', import.meta.url), 'utf8');
const api = readFileSync(new URL('../api/admin-auth.js', import.meta.url), 'utf8');
const migration = readFileSync(new URL('../supabase/migrations/202609240001_business_finance_ledger.sql', import.meta.url), 'utf8');
const workerMigration = readFileSync(new URL('../supabase/migrations/202609240002_worker_payment_profiles.sql', import.meta.url), 'utf8');
const paymentPermissionMigration = readFileSync(new URL('../supabase/migrations/202609250001_fix_business_cost_payment_permissions.sql', import.meta.url), 'utf8');
const paymentCorrectionMigration = readFileSync(new URL('../supabase/migrations/202609250002_correct_outgoing_payments.sql', import.meta.url), 'utf8');
const costManagementMigration = readFileSync(new URL('../supabase/migrations/202609250003_manage_business_costs.sql', import.meta.url), 'utf8');

test('finance summary keeps cash, receivables, payables and profit separate', () => {
  const result = calculateFinanceSummary({
    accounts: [{ id:'bank', opening_balance:1000 }],
    customerPayments: [{ cash_account_id:'bank', amount:500, status:'completed' }],
    outgoingPayments: [{ cash_account_id:'bank', cost_id:'cost', amount:200 }],
    costs: [{ id:'cost', project_id:'project', total_amount:300, balance:100, status:'partially_paid' }],
    invoices: [{ id:'invoice', status:'partially_paid', grand_total:800, amount_paid:500, balance:300 }],
    projects: [{ id:'project', source_invoice_id:'invoice' }]
  });
  assert.equal(result.cashBalance, 1300);
  assert.equal(result.accountsReceivable, 300);
  assert.equal(result.accountsPayable, 100);
  assert.equal(result.operatingProfit, 500);
  assert.equal(result.projectPerformance[0].gross_profit, 500);
  assert.equal(result.projectPerformance[0].cash_margin, 300);
});

test('finance module includes the approved QuickBooks-style workflows', () => {
  assert.match(shell, /Business Finance/);
  assert.match(ui, /Company cash/);
  assert.match(ui, /Money to collect/);
  assert.match(ui, /Still to pay/);
  assert.match(ui, /Operating profit/);
  assert.match(ui, /Supplier purchase/);
  assert.match(ui, /Labour charge/);
  assert.match(ui, /Company expense/);
  assert.match(ui, /Project profitability/);
  assert.match(ui, /Cash is not profit/);
  assert.match(ui, /Worker directory/);
  assert.match(ui, /Protected banking/);
  assert.match(ui, /Payment history/);
  assert.match(ui, /Protected details will hide automatically after 30 seconds/);
  assert.match(ui, /finance-edit-payment/);
  assert.match(ui, /Edit outgoing payment/);
  assert.match(ui, /Save payment correction/);
  assert.match(ui, /finance-edit-cost/);
  assert.match(ui, /finance-delete-cost/);
  assert.match(ui, /Delete unpaid payable/);
  assert.match(ui, /Payment history must be corrected before this payable can be deleted/);
});

test('finance API validates master records, costs, accounts and proof-backed payments', () => {
  for (const route of ['finance-overview','finance-account-create','finance-account-save','finance-supplier-save','finance-worker-save','finance-worker-bank-detail','finance-cost-create','finance-cost-update','finance-cost-delete','finance-cost-proof-upload-url','finance-cost-payment-create','finance-cost-payment-update','finance-cost-payment-proof']) {
    assert.match(api, new RegExp(`route === '/${route}'`));
  }
  assert.match(api, /record_business_cost_payment/);
  assert.match(api, /finance-proofs/);
  assert.match(api, /cashAccountId/);
  assert.match(api, /WORKER_BANK_ENCRYPTION_KEY/);
  assert.match(api, /view_bank_details/);
  assert.match(api, /route === '\/finance-worker-save'[\s\S]{0,250}requireAdmin/);
});

test('worker bank details use authenticated encryption and do not retain plaintext', () => {
  const secret = 'worker-bank-test-secret-that-is-long-enough';
  const account = '562021767758';
  const ciphertext = encryptWorkerBankDetail(account, secret);
  assert.match(ciphertext, /^v1:/);
  assert.equal(ciphertext.includes(account), false);
  assert.equal(decryptWorkerBankDetail(ciphertext, secret), account);
  assert.notEqual(encryptWorkerBankDetail(account, secret), ciphertext);
});

test('ledger migration enforces controlled balances, account attribution and private proof storage', () => {
  assert.match(migration, /create table if not exists public\.cash_accounts/);
  assert.match(migration, /create table if not exists public\.business_costs/);
  assert.match(migration, /create table if not exists public\.outgoing_payments/);
  assert.match(migration, /balance = total_amount - amount_paid/);
  assert.match(migration, /Payment total exceeds the cost balance/);
  assert.match(migration, /p_cash_account_id uuid/);
  assert.match(migration, /finance-proofs/);
  assert.match(migration, /amount_paid = 0/);
  assert.match(migration, /proof_storage_path like cost_id::text/);
  assert.match(migration, /public\.is_authorized_staff\(\)/);
});

test('worker profile migration adds stable codes and protected banking fields', () => {
  assert.match(workerMigration, /create sequence if not exists public\.labour_worker_code_seq/);
  assert.match(workerMigration, /worker_code text/);
  assert.match(workerMigration, /bank_account_number_encrypted text/);
  assert.match(workerMigration, /duitnow_id_encrypted text/);
  assert.match(workerMigration, /labour_workers_bank_fields_check/);
  assert.match(workerMigration, /Never return this column through list endpoints/);
});

test('business cost payment procedure uses controlled privileges without granting direct balance updates', () => {
  assert.match(paymentPermissionMigration, /record_business_cost_payment/);
  assert.match(paymentPermissionMigration, /security definer/);
  assert.match(paymentPermissionMigration, /auth\.uid\(\) is null or not public\.is_authorized_staff\(\)/);
  assert.match(paymentPermissionMigration, /from storage\.objects/);
  assert.match(paymentPermissionMigration, /bucket_id = 'finance-proofs'/);
  assert.match(paymentPermissionMigration, /grant execute on function public\.record_business_cost_payment/);
  assert.doesNotMatch(paymentPermissionMigration, /grant update on public\.business_costs/);
});

test('outgoing payment corrections are admin-only, proof-backed and balance controlled', () => {
  assert.match(paymentCorrectionMigration, /correct_business_cost_payment/);
  assert.match(paymentCorrectionMigration, /security definer/);
  assert.match(paymentCorrectionMigration, /not public\.is_admin\(\)/);
  assert.match(paymentCorrectionMigration, /for update/);
  assert.match(paymentCorrectionMigration, /target_cost\.balance \+ current_payment\.amount/);
  assert.match(paymentCorrectionMigration, /from storage\.objects/);
  assert.match(paymentCorrectionMigration, /update public\.outgoing_payments/);
  assert.doesNotMatch(paymentCorrectionMigration, /grant update on public\.outgoing_payments/);
  assert.match(api, /correct_business_cost_payment/);
  assert.match(api, /previous:result\.previous/);
});

test('payable edits and deletions remain admin-only, balanced and audited', () => {
  assert.match(costManagementMigration, /create or replace function public\.update_business_cost/);
  assert.match(costManagementMigration, /create or replace function public\.delete_unpaid_business_cost/);
  assert.match(costManagementMigration, /not public\.is_admin\(\)/);
  assert.match(costManagementMigration, /p_total_amount < current_cost\.amount_paid/);
  assert.match(costManagementMigration, /balance = p_total_amount - current_cost\.amount_paid/);
  assert.match(costManagementMigration, /exists \(\s*select 1 from public\.outgoing_payments/);
  assert.match(costManagementMigration, /insert into public\.audit_logs/);
  assert.match(costManagementMigration, /auth\.uid\(\), 'delete', 'business_costs'/);
  assert.doesNotMatch(costManagementMigration, /grant (update|delete) on public\.business_costs/);
  assert.match(api, /route === '\/finance-cost-update'[\s\S]{0,180}requireAdmin/);
  assert.match(api, /route === '\/finance-cost-delete'[\s\S]{0,180}requireAdmin/);
});
