import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { calculateFinanceSummary } from '../api/admin-auth.js';

const ui = readFileSync(new URL('../src/admin-finance.js', import.meta.url), 'utf8');
const shell = readFileSync(new URL('../src/admin.js', import.meta.url), 'utf8');
const api = readFileSync(new URL('../api/admin-auth.js', import.meta.url), 'utf8');
const migration = readFileSync(new URL('../supabase/migrations/202609240001_business_finance_ledger.sql', import.meta.url), 'utf8');

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
});

test('finance API validates master records, costs, accounts and proof-backed payments', () => {
  for (const route of ['finance-overview','finance-account-create','finance-account-save','finance-supplier-save','finance-worker-save','finance-cost-create','finance-cost-proof-upload-url','finance-cost-payment-create','finance-cost-payment-proof']) {
    assert.match(api, new RegExp(`route === '/${route}'`));
  }
  assert.match(api, /record_business_cost_payment/);
  assert.match(api, /finance-proofs/);
  assert.match(api, /cashAccountId/);
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
