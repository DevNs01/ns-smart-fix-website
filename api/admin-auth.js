import { buildInvoicePdf, buildQuotationPdf, quotationEmail } from './quotation-pdf.js';
import { sendMonitoringAlert } from './monitoring.js';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

const ACCESS_COOKIE = 'ns_admin_access';
const REFRESH_COOKIE = 'ns_admin_refresh';
const MAX_BODY_BYTES = 32 * 1024;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_LIMIT = 8;
export const QUOTATION_RESEND_COOLDOWN_MS = 2 * 60 * 1000;
const ADMIN_REDIRECT_URL = 'https://nssmartfixsolution.com/admin';
const attempts = globalThis.__nsAdminLoginAttempts || new Map();
globalThis.__nsAdminLoginAttempts = attempts;

function json(response, status, body, headers = {}) {
  response.statusCode = status;
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.setHeader('Cache-Control', 'no-store, max-age=0');
  response.setHeader('Pragma', 'no-cache');
  for (const [name, value] of Object.entries(headers)) response.setHeader(name, value);
  response.end(JSON.stringify(body));
}

export function parseCookies(header = '') {
  return String(header).split(';').reduce((cookies, part) => {
    const separator = part.indexOf('=');
    if (separator < 1) return cookies;
    const key = part.slice(0, separator).trim();
    try { cookies[key] = decodeURIComponent(part.slice(separator + 1).trim()); } catch {}
    return cookies;
  }, {});
}

export function sessionCookies(session) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  const accessAge = Math.max(60, Math.min(Number(session.expires_in) || 3600, 86400));
  return [
    `${ACCESS_COOKIE}=${encodeURIComponent(session.access_token)}; Path=/api/admin-auth; HttpOnly${secure}; SameSite=Strict; Max-Age=${accessAge}`,
    `${REFRESH_COOKIE}=${encodeURIComponent(session.refresh_token)}; Path=/api/admin-auth; HttpOnly${secure}; SameSite=Strict; Max-Age=2592000`
  ];
}

function clearCookies() {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  return [
    `${ACCESS_COOKIE}=; Path=/api/admin-auth; HttpOnly${secure}; SameSite=Strict; Max-Age=0`,
    `${REFRESH_COOKIE}=; Path=/api/admin-auth; HttpOnly${secure}; SameSite=Strict; Max-Age=0`
  ];
}

export function trustedOrigin(request) {
  const origin = String(request.headers?.origin || '');
  const host = String(request.headers?.host || '');
  if (!origin) return request.method === 'GET';
  try {
    const parsed = new URL(origin);
    return parsed.host === host && ['https:', 'http:'].includes(parsed.protocol);
  } catch { return false; }
}

function clientIp(request) {
  return String(request.headers?.['x-forwarded-for'] || request.socket?.remoteAddress || 'unknown').split(',')[0].trim().slice(0, 80);
}

export function allowLogin(ip, now = Date.now()) {
  for (const [key, value] of attempts) if (value.resetAt <= now) attempts.delete(key);
  const current = attempts.get(ip);
  if (!current) { attempts.set(ip, { count: 1, resetAt: now + LOGIN_WINDOW_MS }); return true; }
  current.count += 1;
  return current.count <= LOGIN_LIMIT;
}

export function quotationResendWaitSeconds(sentAt, now = Date.now()) {
  const sentTime = Date.parse(String(sentAt || ''));
  if (!Number.isFinite(sentTime)) return 0;
  return Math.max(0, Math.ceil((sentTime + QUOTATION_RESEND_COOLDOWN_MS - now) / 1000));
}

function config() {
  const url = String(process.env.SUPABASE_URL || '').replace(/\/$/, '');
  const key = String(process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY || '');
  return { url, key, ready: /^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(url) && key.length >= 20 };
}

async function supabaseFetch(path, options = {}, accessToken = '') {
  const settings = config();
  if (!settings.ready) throw new Error('configuration');
  return fetch(`${settings.url}${path}`, {
    ...options,
    headers: {
      apikey: settings.key,
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });
}

async function readBody(request) {
  if (Buffer.byteLength(JSON.stringify(request.body || {})) > MAX_BODY_BYTES) throw new Error('body');
  return typeof request.body === 'string' ? JSON.parse(request.body) : (request.body || {});
}

async function profileFor(accessToken, userId) {
  const result = await supabaseFetch(`/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}&select=id,full_name,role,is_active&limit=1`, {}, accessToken);
  if (!result.ok) return null;
  const rows = await result.json();
  const profile = rows[0];
  return profile?.is_active === true && ['admin', 'staff'].includes(profile.role) ? profile : null;
}

async function authenticatedSession(cookies) {
  let accessToken = cookies[ACCESS_COOKIE];
  let renewed = null;
  let userResponse = accessToken ? await supabaseFetch('/auth/v1/user', {}, accessToken) : null;
  if ((!userResponse || !userResponse.ok) && cookies[REFRESH_COOKIE]) {
    const refreshResponse = await supabaseFetch('/auth/v1/token?grant_type=refresh_token', {
      method: 'POST', body: JSON.stringify({ refresh_token: cookies[REFRESH_COOKIE] })
    });
    if (refreshResponse.ok) {
      renewed = await refreshResponse.json();
      accessToken = renewed.access_token;
      userResponse = await supabaseFetch('/auth/v1/user', {}, accessToken);
    }
  }
  if (!userResponse?.ok) return null;
  const user = await userResponse.json();
  const profile = await profileFor(accessToken, user.id);
  return profile ? { profile, renewed, accessToken, user } : null;
}

function bounded(value, maximum = 500) {
  return String(value ?? '').trim().slice(0, maximum);
}

function validDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || ''));
}

function workerBankKey(secret = process.env.WORKER_BANK_ENCRYPTION_KEY) {
  const value = String(secret || '');
  if (value.length < 32) return null;
  return createHash('sha256').update(value, 'utf8').digest();
}

export function encryptWorkerBankDetail(value, secret) {
  const plaintext = String(value || '').trim();
  if (!plaintext) return null;
  const key = workerBankKey(secret);
  if (!key) throw new Error('worker-bank-configuration');
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return `v1:${iv.toString('base64url')}:${encrypted.toString('base64url')}:${cipher.getAuthTag().toString('base64url')}`;
}

export function decryptWorkerBankDetail(value, secret) {
  if (!value) return null;
  const key = workerBankKey(secret);
  if (!key) throw new Error('worker-bank-configuration');
  const [version, ivValue, encryptedValue, tagValue] = String(value).split(':');
  if (version !== 'v1' || !ivValue || !encryptedValue || !tagValue) throw new Error('worker-bank-data');
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivValue, 'base64url'));
  decipher.setAuthTag(Buffer.from(tagValue, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(encryptedValue, 'base64url')), decipher.final()]).toString('utf8');
}

function customerPayload(body) {
  const name = bounded(body.name, 160);
  const phone = bounded(body.phone, 30);
  const email = bounded(body.email, 254).toLowerCase();
  if (name.length < 2 || phone.length < 8 || (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) return null;
  return {
    customer_type: body.customerType === 'individual' ? 'individual' : 'company',
    name,
    company_registration_number: bounded(body.registrationNumber, 100) || null,
    phone,
    email: email || null,
    contact_person: bounded(body.contactPerson, 120) || null,
    billing_address: bounded(body.billingAddress, 1000) || null,
    service_address: bounded(body.serviceAddress, 1000) || null,
    notes: bounded(body.notes, 2000) || null,
    is_active: body.isActive !== false && body.isActive !== 'false'
  };
}

export function calculateFinanceSummary({ accounts = [], customerPayments = [], outgoingPayments = [], costs = [], invoices = [], projects = [] } = {}) {
  const validInvoices = invoices.filter(item => !['draft', 'cancelled'].includes(item.status));
  const validCosts = costs.filter(item => item.status !== 'cancelled');
  const completedReceipts = customerPayments.filter(item => !item.status || item.status === 'completed');
  const received = completedReceipts.reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const paidOut = outgoingPayments.reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const accountBalances = accounts.map(account => {
    const inflow = completedReceipts.filter(item => item.cash_account_id === account.id).reduce((sum, item) => sum + Number(item.amount || 0), 0);
    const outflow = outgoingPayments.filter(item => item.cash_account_id === account.id).reduce((sum, item) => sum + Number(item.amount || 0), 0);
    return { ...account, inflow, outflow, current_balance: Number(account.opening_balance || 0) + inflow - outflow };
  });
  const projectPerformance = projects.map(project => {
    const invoice = invoices.find(item => item.id === project.source_invoice_id);
    const projectCosts = validCosts.filter(item => item.project_id === project.id);
    const committedCost = projectCosts.reduce((sum, item) => sum + Number(item.total_amount || 0), 0);
    const projectPaidOut = outgoingPayments.filter(payment => projectCosts.some(cost => cost.id === payment.cost_id)).reduce((sum, item) => sum + Number(item.amount || 0), 0);
    const invoiced = Number(invoice?.grand_total || 0);
    const collected = Number(invoice?.amount_paid || 0);
    return { ...project, invoice, invoiced, collected, committed_cost: committedCost, paid_out: projectPaidOut, gross_profit: invoiced - committedCost, cash_margin: collected - projectPaidOut };
  });
  return {
    cashBalance: accountBalances.reduce((sum, item) => sum + item.current_balance, 0),
    accountsReceivable: validInvoices.reduce((sum, item) => sum + Number(item.balance || 0), 0),
    accountsPayable: validCosts.reduce((sum, item) => sum + Number(item.balance || 0), 0),
    operatingProfit: validInvoices.reduce((sum, item) => sum + Number(item.grand_total || 0), 0) - validCosts.reduce((sum, item) => sum + Number(item.total_amount || 0), 0),
    received,
    paidOut,
    accountBalances,
    projectPerformance
  };
}

function financePartyPayload(body, kind) {
  const name = bounded(body.name, 160);
  const phone = bounded(body.phone, 30);
  const email = bounded(body.email, 254).toLowerCase();
  const tradeOrRole = bounded(body.tradeOrRole, 120);
  if (name.length < 2 || (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) return null;
  if (kind === 'worker' && (phone.length < 8 || tradeOrRole.length < 2)) return null;
  const common = { name, phone: phone || null, email: email || null, notes: bounded(body.notes, 2000) || null, is_active: body.isActive !== false && body.isActive !== 'false' };
  return kind === 'supplier'
    ? { ...common, registration_number: bounded(body.registrationNumber, 100) || null, contact_person: bounded(body.contactPerson, 120) || null, address: bounded(body.address, 1000) || null }
    : { ...common, worker_type: ['employee','subcontractor','part_time'].includes(body.workerType) ? body.workerType : 'subcontractor', trade_or_role: tradeOrRole, identification_reference: bounded(body.identificationReference, 120) || null, start_date: validDate(body.startDate) ? body.startDate : null };
}

async function restJson(path, options, accessToken) {
  const result = await supabaseFetch(path, options, accessToken);
  const body = await result.json().catch(() => null);
  if (!result.ok) throw new Error('database');
  return body;
}

async function requireSession(request, response) {
  const session = await authenticatedSession(parseCookies(request.headers?.cookie));
  if (!session) json(response, 401, { error: 'Authentication is required.' }, { 'Set-Cookie': clearCookies() });
  return session;
}

function requireAdmin(session, response) {
  if (session.profile.role !== 'admin') {
    json(response, 403, { error: 'Administrator access is required.' });
    return false;
  }
  return true;
}

async function audit(session, action, module, recordId = null, recordNumber = null, newValue = null) {
  await supabaseFetch('/rest/v1/audit_logs', {
    method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({
      actor_id: session.user.id, action, module, record_id: recordId,
      record_number: recordNumber, new_value: newValue
    })
  }, session.accessToken).catch(() => {});
}

async function quotationBundle(id, session) {
  const quotations = await restJson(`/rest/v1/quotations?id=eq.${encodeURIComponent(id)}&select=*&limit=1`, {}, session.accessToken);
  const quotation = quotations[0];
  if (!quotation) return null;
  const [items, settingRows] = await Promise.all([
    restJson(`/rest/v1/quotation_items?quotation_id=eq.${encodeURIComponent(id)}&select=*&order=position.asc`, {}, session.accessToken),
    restJson('/rest/v1/company_settings?select=*&limit=1', {}, session.accessToken)
  ]);
  const currentSettings = settingRows[0] || {};
  const settings = quotation.sent_at && quotation.company_snapshot ? quotation.company_snapshot : currentSettings;
  return { quotation, items, settings };
}

function pdfResponse(response, buffer, filename) {
  response.statusCode = 200;
  response.setHeader('Content-Type', 'application/pdf');
  response.setHeader('Content-Disposition', `inline; filename="${filename}"`);
  response.setHeader('Cache-Control', 'private, no-store, max-age=0');
  response.setHeader('Content-Length', String(buffer.length));
  response.end(buffer);
}

export default async function handler(request, response) {
  const requestUrl = new URL(String(request.url || '/api/admin-auth'), 'http://localhost');
  const action = requestUrl.searchParams.get('action') || 'session';
  const route = `/${action}`;
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('Referrer-Policy', 'no-referrer');
  if (!trustedOrigin(request)) return json(response, 403, { error: 'Request origin was rejected.' });
  if (!config().ready) return json(response, 503, { error: 'The staff portal is not configured yet.' });

  try {
    if (route === '/login' && request.method === 'POST') {
      if (!allowLogin(clientIp(request))) return json(response, 429, { error: 'Too many sign-in attempts. Please try again later.' });
      const body = await readBody(request);
      const email = String(body.email || '').trim().toLowerCase();
      const password = String(body.password || '');
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || password.length < 8 || password.length > 200) {
        return json(response, 400, { error: 'Enter a valid email address and password.' });
      }
      const authResponse = await supabaseFetch('/auth/v1/token?grant_type=password', {
        method: 'POST', body: JSON.stringify({ email, password })
      });
      if (!authResponse.ok) return json(response, 401, { error: 'The email or password is incorrect.' });
      const session = await authResponse.json();
      const profile = await profileFor(session.access_token, session.user.id);
      if (!profile) return json(response, 403, { error: 'This account is not authorized for staff access.' }, { 'Set-Cookie': clearCookies() });
      return json(response, 200, { profile }, { 'Set-Cookie': sessionCookies(session) });
    }

    if (route === '/recover' && request.method === 'POST') {
      if (!allowLogin(clientIp(request))) return json(response, 429, { error: 'Too many requests. Please try again later.' });
      const body = await readBody(request);
      const email = String(body.email || '').trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return json(response, 400, { error: 'Enter a valid email address.' });
      }
      const redirectTo = encodeURIComponent(process.env.ADMIN_REDIRECT_URL || ADMIN_REDIRECT_URL);
      await supabaseFetch(`/auth/v1/recover?redirect_to=${redirectTo}`, {
        method: 'POST', body: JSON.stringify({ email })
      });
      return json(response, 200, { ok: true });
    }

    if (route === '/update-password' && request.method === 'POST') {
      const body = await readBody(request);
      const accessToken = String(body.accessToken || '');
      const password = String(body.password || '');
      if (accessToken.length < 20 || accessToken.length > 4096 || password.length < 12 || password.length > 200) {
        return json(response, 400, { error: 'Use a password of at least 12 characters.' });
      }
      const updateResponse = await supabaseFetch('/auth/v1/user', {
        method: 'PUT', body: JSON.stringify({ password })
      }, accessToken);
      if (!updateResponse.ok) return json(response, 401, { error: 'This recovery link is invalid or has expired. Request a new one.' });
      await supabaseFetch('/auth/v1/logout?scope=global', { method: 'POST' }, accessToken).catch(() => {});
      return json(response, 200, { ok: true }, { 'Set-Cookie': clearCookies() });
    }

    if (route === '/session' && request.method === 'GET') {
      const session = await authenticatedSession(parseCookies(request.headers?.cookie));
      if (!session) return json(response, 401, { error: 'Authentication is required.' }, { 'Set-Cookie': clearCookies() });
      const headers = session.renewed ? { 'Set-Cookie': sessionCookies(session.renewed) } : {};
      return json(response, 200, { profile: session.profile }, headers);
    }

    if (route === '/dashboard' && request.method === 'GET') {
      const session = await requireSession(request, response); if (!session) return;
      const [requests, quotations, invoices, customers, payments, accounts, costs, outgoingPayments] = await Promise.all([
        restJson('/rest/v1/quotation_requests?archived_at=is.null&select=id,public_reference,customer_name,services,status,created_at&order=created_at.desc&limit=1000', {}, session.accessToken),
        restJson('/rest/v1/quotations?archived_at=is.null&select=id,quotation_number,status,grand_total,customer_snapshot,created_at&order=created_at.desc&limit=1000', {}, session.accessToken),
        restJson('/rest/v1/invoices?archived_at=is.null&select=id,invoice_number,status,grand_total,balance,due_date,customer_snapshot,created_at&order=created_at.desc&limit=1000', {}, session.accessToken),
        restJson('/rest/v1/customers?select=id,is_active,created_at&order=created_at.desc&limit=1000', {}, session.accessToken),
        restJson('/rest/v1/payments?select=id,cash_account_id,amount,payment_date,status,created_at&order=created_at.desc&limit=1000', {}, session.accessToken),
        restJson('/rest/v1/cash_accounts?select=id,opening_balance&order=created_at.asc&limit=100', {}, session.accessToken),
        restJson('/rest/v1/business_costs?select=id,status,total_amount,balance&order=created_at.desc&limit=1000', {}, session.accessToken),
        restJson('/rest/v1/outgoing_payments?select=id,cost_id,cash_account_id,amount,payment_date,created_at&order=created_at.desc&limit=1000', {}, session.accessToken)
      ]);
      const today = new Intl.DateTimeFormat('en-CA', { timeZone:'Asia/Kuala_Lumpur' }).format(new Date());
      const month = today.slice(0, 7);
      const overdue = invoices.filter(item => Number(item.balance) > 0 && item.due_date < today && !['paid','cancelled','void'].includes(item.status));
      const draftInvoices = invoices.filter(item => item.status === 'draft');
      const awaitingDecision = quotations.filter(item => item.status === 'sent');
      const finance = calculateFinanceSummary({ accounts, customerPayments:payments, outgoingPayments, costs, invoices });
      return json(response, 200, { summary: {
        customers: customers.filter(item => item.is_active).length,
        requests: requests.length, newRequests: requests.filter(item => item.status === 'new').length,
        quotations: quotations.length, pendingQuotations: quotations.filter(item => ['draft', 'sent'].includes(item.status)).length,
        invoices: invoices.length, outstandingBalance: invoices.reduce((sum, item) => sum + Number(item.balance || 0), 0),
        overdueInvoices: overdue.length, overdueBalance: overdue.reduce((sum,item)=>sum+Number(item.balance||0),0),
        paidThisMonth: payments.filter(item=>String(item.payment_date).startsWith(month)).reduce((sum,item)=>sum+Number(item.amount||0),0),
        paymentsThisMonth: payments.filter(item=>String(item.payment_date).startsWith(month)).length,
        draftInvoices: draftInvoices.length, awaitingDecision: awaitingDecision.length,
        cashBalance: finance.cashBalance, accountsPayable: finance.accountsPayable, operatingProfit: finance.operatingProfit
      }, workQueue: {
        requests: requests.filter(item=>item.status==='new').slice(0,3),
        quotations: awaitingDecision.slice(0,3),
        invoices: [...overdue, ...draftInvoices.filter(draft=>!overdue.some(item=>item.id===draft.id))].slice(0,4)
      } });
    }

    if (route === '/finance-overview' && request.method === 'GET') {
      const session = await requireSession(request, response); if (!session) return;
      const [accounts, suppliers, workers, projects, costs, outgoingPayments, invoices, customerPayments] = await Promise.all([
        restJson('/rest/v1/cash_accounts?select=*&order=is_active.desc,name.asc&limit=100', {}, session.accessToken),
        restJson('/rest/v1/suppliers?select=*&order=is_active.desc,name.asc&limit=500', {}, session.accessToken),
        restJson('/rest/v1/labour_workers?select=id,worker_code,name,phone,email,worker_type,trade_or_role,identification_reference,start_date,bank_name,bank_account_holder,bank_account_last_four,has_duitnow,notes,is_active,created_at,updated_at&order=is_active.desc,name.asc&limit=500', {}, session.accessToken),
        restJson('/rest/v1/projects?select=*&order=created_at.desc&limit=500', {}, session.accessToken),
        restJson('/rest/v1/business_costs?select=*&order=bill_date.desc,created_at.desc&limit=1000', {}, session.accessToken),
        restJson('/rest/v1/outgoing_payments?select=id,cost_id,cash_account_id,payment_date,amount,payment_method,transaction_reference,notes,created_at&order=payment_date.desc,created_at.desc&limit=1000', {}, session.accessToken),
        restJson('/rest/v1/invoices?archived_at=is.null&select=id,invoice_number,project_title,status,grand_total,amount_paid,balance,customer_snapshot,invoice_date&order=invoice_date.desc&limit=1000', {}, session.accessToken),
        restJson('/rest/v1/payments?select=id,invoice_id,cash_account_id,payment_date,amount,payment_method,status,transaction_reference,created_at&order=payment_date.desc,created_at.desc&limit=1000', {}, session.accessToken)
      ]);
      const summary = calculateFinanceSummary({ accounts, customerPayments, outgoingPayments, costs, invoices, projects });
      return json(response, 200, { accounts:summary.accountBalances, suppliers, workers, projects:summary.projectPerformance, costs, outgoingPayments, invoices, customerPayments, summary:{ cashBalance:summary.cashBalance, accountsReceivable:summary.accountsReceivable, accountsPayable:summary.accountsPayable, operatingProfit:summary.operatingProfit, received:summary.received, paidOut:summary.paidOut }, role:session.profile.role });
    }

    if ((route === '/finance-account-create' || route === '/finance-account-save') && request.method === 'POST') {
      const session = await requireSession(request, response); if (!session || !requireAdmin(session, response)) return;
      const body = await readBody(request); const id = bounded(body.id, 80); const name = bounded(body.name, 120); const type = bounded(body.accountType, 20); const openingBalance = Number(body.openingBalance || 0); const isActive = body.isActive !== false && body.isActive !== 'false';
      if ((id && !/^[0-9a-f-]{36}$/i.test(id)) || name.length < 2 || !['bank','petty_cash'].includes(type) || !Number.isFinite(openingBalance)) return json(response, 400, { error:'Enter a valid account name, type and opening balance.' });
      const payload = { name, account_type:type, institution_name:bounded(body.institutionName,120)||null, account_last_four:bounded(body.accountLastFour,8)||null, opening_balance:Math.round(openingBalance*100)/100, is_active:isActive };
      const path = id ? `/rest/v1/cash_accounts?id=eq.${encodeURIComponent(id)}` : '/rest/v1/cash_accounts';
      const rows = await restJson(path, { method:id?'PATCH':'POST', headers:{Prefer:'return=representation'}, body:JSON.stringify(id?payload:{...payload,created_by:session.user.id}) }, session.accessToken);
      if (!rows[0]) return json(response, 404, { error:'Cash account was not found.' });
      await audit(session, id?'update':'create', 'cash_accounts', rows[0].id, name, { accountType:type, openingBalance, isActive });
      return json(response, id?200:201, { account:rows[0] });
    }

    if (route === '/finance-supplier-save' && request.method === 'POST') {
      const session = await requireSession(request, response); if (!session) return;
      const body = await readBody(request); const payload = financePartyPayload(body, 'supplier'); const id = bounded(body.id, 80);
      if (!payload || (id && !/^[0-9a-f-]{36}$/i.test(id))) return json(response, 400, { error:'Enter valid supplier details.' });
      const path = id ? `/rest/v1/suppliers?id=eq.${encodeURIComponent(id)}` : '/rest/v1/suppliers';
      const rows = await restJson(path, { method:id?'PATCH':'POST', headers:{Prefer:'return=representation'}, body:JSON.stringify(id?payload:{...payload,created_by:session.user.id}) }, session.accessToken);
      if (!rows[0]) return json(response, 404, { error:'Supplier was not found.' });
      await audit(session, id?'update':'create', 'suppliers', rows[0].id, rows[0].name, { active:rows[0].is_active });
      return json(response, id?200:201, { supplier:rows[0] });
    }

    if (route === '/finance-worker-save' && request.method === 'POST') {
      const session = await requireSession(request, response); if (!session || !requireAdmin(session, response)) return;
      const body = await readBody(request); const payload = financePartyPayload(body, 'worker'); const id = bounded(body.id, 80);
      if (!payload || (id && !/^[0-9a-f-]{36}$/i.test(id))) return json(response, 400, { error:'Enter valid labour worker details.' });
      const bankName = bounded(body.bankName, 120); const accountHolder = bounded(body.bankAccountHolder, 160); const accountNumber = bounded(body.bankAccountNumber, 80).replace(/[\s-]+/g, ''); const duitNowId = bounded(body.duitNowId, 120);
      if (!id && (!bankName || !accountHolder || !accountNumber)) return json(response, 400, { error:'Complete the bank name, account-holder name and account number.' });
      if (id && ((bankName || accountHolder || accountNumber) && (!bankName || !accountHolder))) return json(response, 400, { error:'Complete the bank name and account-holder name.' });
      if (accountNumber && !/^[0-9A-Za-z]{6,34}$/.test(accountNumber)) return json(response, 400, { error:'Enter a valid bank account number using 6 to 34 letters or numbers.' });
      let encryptedAccount = null; let encryptedDuitNow = null;
      if (accountNumber || duitNowId) {
        try {
          encryptedAccount = accountNumber ? encryptWorkerBankDetail(accountNumber) : null;
          encryptedDuitNow = duitNowId ? encryptWorkerBankDetail(duitNowId) : null;
        } catch (error) {
          if (error.message === 'worker-bank-configuration') return json(response, 503, { error:'Protected worker banking storage is not configured yet.' });
          throw error;
        }
      }
      Object.assign(payload, { bank_name:bankName||null, bank_account_holder:accountHolder||null });
      if (!id || duitNowId) payload.has_duitnow = Boolean(duitNowId);
      if (encryptedAccount) Object.assign(payload, { bank_account_number_encrypted:encryptedAccount, bank_account_last_four:accountNumber.slice(-4) });
      if (encryptedDuitNow) payload.duitnow_id_encrypted = encryptedDuitNow;
      const path = id ? `/rest/v1/labour_workers?id=eq.${encodeURIComponent(id)}` : '/rest/v1/labour_workers';
      const rows = await restJson(path, { method:id?'PATCH':'POST', headers:{Prefer:'return=representation'}, body:JSON.stringify(id?payload:{...payload,created_by:session.user.id}) }, session.accessToken);
      if (!rows[0]) return json(response, 404, { error:'Labour worker was not found.' });
      await audit(session, id?'update':'create', 'labour_workers', rows[0].id, rows[0].worker_code || rows[0].name, { active:rows[0].is_active, workerType:rows[0].worker_type, bankDetailsUpdated:Boolean(encryptedAccount || encryptedDuitNow) });
      const { bank_account_number_encrypted, duitnow_id_encrypted, ...safeWorker } = rows[0];
      return json(response, id?200:201, { worker:safeWorker });
    }

    if (route === '/finance-worker-bank-detail' && request.method === 'POST') {
      const session = await requireSession(request, response); if (!session || !requireAdmin(session, response)) return;
      const body = await readBody(request); const id = bounded(body.id, 80); if (!/^[0-9a-f-]{36}$/i.test(id)) return json(response, 400, { error:'Invalid worker record.' });
      const rows = await restJson(`/rest/v1/labour_workers?id=eq.${encodeURIComponent(id)}&select=id,worker_code,name,bank_name,bank_account_holder,bank_account_number_encrypted,duitnow_id_encrypted&limit=1`, {}, session.accessToken);
      const worker = rows[0]; if (!worker) return json(response, 404, { error:'Worker was not found.' });
      try {
        const accountNumber = decryptWorkerBankDetail(worker.bank_account_number_encrypted);
        const duitNowId = decryptWorkerBankDetail(worker.duitnow_id_encrypted);
        await audit(session, 'view_bank_details', 'labour_workers', worker.id, worker.worker_code || worker.name, { protectedFieldsViewed:true });
        return json(response, 200, { bank:{ bankName:worker.bank_name, accountHolder:worker.bank_account_holder, accountNumber, duitNowId } });
      } catch (error) {
        if (error.message === 'worker-bank-configuration') return json(response, 503, { error:'Protected worker banking storage is not configured yet.' });
        return json(response, 422, { error:'The protected bank details could not be opened.' });
      }
    }

    if (route === '/finance-cost-create' && request.method === 'POST') {
      const session = await requireSession(request, response); if (!session) return;
      const body = await readBody(request); const type = bounded(body.costType, 20); const billDate = bounded(body.billDate, 10); const dueDate = bounded(body.dueDate, 10); const total = Number(body.totalAmount); const supplierId = bounded(body.supplierId, 80); const workerId = bounded(body.workerId, 80); const projectId = bounded(body.projectId, 80); const category = bounded(body.category, 80); const description = bounded(body.description, 1000);
      const validParty = (type === 'supplier' && /^[0-9a-f-]{36}$/i.test(supplierId)) || (type === 'labour' && /^[0-9a-f-]{36}$/i.test(workerId)) || type === 'expense';
      if (!['supplier','labour','expense'].includes(type) || !validParty || !validDate(billDate) || (dueDate && (!validDate(dueDate) || dueDate < billDate)) || !(total > 0) || category.length < 2 || description.length < 2 || (projectId && !/^[0-9a-f-]{36}$/i.test(projectId))) return json(response, 400, { error:'Complete the cost type, payee, description, date and amount.' });
      const costNumber = await restJson('/rest/v1/rpc/next_finance_number', { method:'POST', body:JSON.stringify({kind:'cost',issue_date:billDate}) }, session.accessToken);
      const rows = await restJson('/rest/v1/business_costs', { method:'POST', headers:{Prefer:'return=representation'}, body:JSON.stringify({ cost_number:String(costNumber), cost_type:type, supplier_id:type==='supplier'?supplierId:null, worker_id:type==='labour'?workerId:null, project_id:projectId||null, category, description, bill_date:billDate, due_date:dueDate||null, total_amount:Math.round(total*100)/100, amount_paid:0, balance:Math.round(total*100)/100, status:'unpaid', notes:bounded(body.notes,2000)||null, created_by:session.user.id }) }, session.accessToken);
      await audit(session, 'create', 'business_costs', rows[0]?.id, String(costNumber), { costType:type, totalAmount:total, projectId:projectId||null });
      return json(response, 201, { cost:rows[0] });
    }

    if (route === '/finance-cost-proof-upload-url' && request.method === 'POST') {
      const session = await requireSession(request, response); if (!session) return;
      const body = await readBody(request); const costId = bounded(body.costId, 80); const paymentId = bounded(body.paymentId, 80); const fileName = bounded(body.fileName, 180).replace(/[^a-z0-9._-]+/gi, '-'); const mimeType = bounded(body.mimeType, 80); const size = Number(body.size); const allowed = ['image/jpeg','image/png','image/webp','application/pdf'];
      if (!/^[0-9a-f-]{36}$/i.test(costId) || (paymentId && !/^[0-9a-f-]{36}$/i.test(paymentId)) || !fileName || !allowed.includes(mimeType) || !(size > 0 && size <= 5242880)) return json(response, 400, { error:'Upload a JPG, PNG, WebP or PDF payment proof up to 5 MB.' });
      if (paymentId) {
        if (!requireAdmin(session, response)) return;
        const payments = await restJson(`/rest/v1/outgoing_payments?id=eq.${encodeURIComponent(paymentId)}&select=id,cost_id&limit=1`, {}, session.accessToken);
        if (!payments[0] || payments[0].cost_id !== costId) return json(response, 404, { error:'Outgoing payment was not found.' });
      } else {
        const costs = await restJson(`/rest/v1/business_costs?id=eq.${encodeURIComponent(costId)}&select=id,status,balance&limit=1`, {}, session.accessToken);
        if (!costs[0] || !['unpaid','partially_paid'].includes(costs[0].status) || Number(costs[0].balance) <= 0) return json(response, 409, { error:'Payment proof can only be added to an outstanding cost.' });
      }
      const path = `${costId}/${Date.now()}-${fileName}`;
      const signed = await restJson(`/storage/v1/object/upload/sign/finance-proofs/${encodeURIComponent(path).replaceAll('%2F','/')}`, { method:'POST', body:JSON.stringify({}) }, session.accessToken);
      const signedPath = signed.url || signed.signedURL || signed.signedUrl;
      if (!signedPath) return json(response, 502, { error:'A secure proof upload could not be prepared.' });
      const storage = config(); return json(response, 200, { path, uploadUrl:`${storage.url}/storage/v1${signedPath}`, uploadKey:storage.key, mimeType });
    }

    if (route === '/finance-cost-payment-create' && request.method === 'POST') {
      const session = await requireSession(request, response); if (!session) return;
      const body = await readBody(request); const costId = bounded(body.costId, 80); const accountId = bounded(body.cashAccountId, 80); const paymentDate = bounded(body.paymentDate, 10); const amount = Number(body.amount); const method = bounded(body.paymentMethod, 30); const proofPath = bounded(body.proofPath, 500);
      if (!/^[0-9a-f-]{36}$/i.test(costId) || !/^[0-9a-f-]{36}$/i.test(accountId) || !validDate(paymentDate) || !(amount > 0) || !['bank_transfer','cash','duitnow','cheque','other'].includes(method) || !proofPath.startsWith(`${costId}/`)) return json(response, 400, { error:'Enter a valid account, amount, date, method and payment proof.' });
      const proofCheck = await supabaseFetch(`/storage/v1/object/authenticated/finance-proofs/${encodeURIComponent(proofPath).replaceAll('%2F','/')}`, { method:'HEAD' }, session.accessToken);
      if (!proofCheck.ok) return json(response, 400, { error:'The uploaded payment proof could not be verified. Upload it again.' });
      const result = await restJson('/rest/v1/rpc/record_business_cost_payment', { method:'POST', body:JSON.stringify({ p_cost_id:costId, p_cash_account_id:accountId, p_payment_date:paymentDate, p_amount:amount, p_payment_method:method, p_transaction_reference:bounded(body.reference,120)||null, p_notes:bounded(body.notes,1000)||null, p_proof_storage_path:proofPath }) }, session.accessToken);
      await audit(session, 'create', 'outgoing_payments', result.id, null, { costId, cashAccountId:accountId, amount, method, paymentDate, proofAttached:true });
      return json(response, 201, { payment:result });
    }

    if (route === '/finance-cost-payment-update' && request.method === 'POST') {
      const session = await requireSession(request, response); if (!session || !requireAdmin(session, response)) return;
      const body = await readBody(request); const paymentId = bounded(body.paymentId, 80); const costId = bounded(body.costId, 80); const accountId = bounded(body.cashAccountId, 80); const paymentDate = bounded(body.paymentDate, 10); const amount = Number(body.amount); const method = bounded(body.paymentMethod, 30); const proofPath = bounded(body.proofPath, 500);
      if (!/^[0-9a-f-]{36}$/i.test(paymentId) || !/^[0-9a-f-]{36}$/i.test(costId) || !/^[0-9a-f-]{36}$/i.test(accountId) || !validDate(paymentDate) || !(amount > 0) || !['bank_transfer','cash','duitnow','cheque','other'].includes(method) || (proofPath && !proofPath.startsWith(`${costId}/`))) return json(response, 400, { error:'Enter a valid account, amount, date, method and payment record.' });
      const existingPayments = await restJson(`/rest/v1/outgoing_payments?id=eq.${encodeURIComponent(paymentId)}&select=id,cost_id&limit=1`, {}, session.accessToken);
      if (!existingPayments[0] || existingPayments[0].cost_id !== costId) return json(response, 404, { error:'Outgoing payment was not found.' });
      if (proofPath) {
        const proofCheck = await supabaseFetch(`/storage/v1/object/authenticated/finance-proofs/${encodeURIComponent(proofPath).replaceAll('%2F','/')}`, { method:'HEAD' }, session.accessToken);
        if (!proofCheck.ok) return json(response, 400, { error:'The replacement payment proof could not be verified. Upload it again.' });
      }
      const result = await restJson('/rest/v1/rpc/correct_business_cost_payment', { method:'POST', body:JSON.stringify({ p_payment_id:paymentId, p_cash_account_id:accountId, p_payment_date:paymentDate, p_amount:amount, p_payment_method:method, p_transaction_reference:bounded(body.reference,120)||null, p_notes:bounded(body.notes,1000)||null, p_proof_storage_path:proofPath||null }) }, session.accessToken);
      const payment = result.payment;
      if (!payment) return json(response, 409, { error:'The payment correction could not be verified.' });
      await audit(session, 'update', 'outgoing_payments', payment.id, null, { costId, previous:result.previous, corrected:{ cashAccountId:accountId, paymentDate, amount, method, reference:bounded(body.reference,120)||null, notes:bounded(body.notes,1000)||null, proofReplaced:Boolean(proofPath) } });
      return json(response, 200, { payment });
    }

    if (route === '/finance-cost-payment-proof' && request.method === 'GET') {
      const session = await requireSession(request, response); if (!session) return;
      const id = bounded(requestUrl.searchParams.get('id'), 80); if (!/^[0-9a-f-]{36}$/i.test(id)) return json(response, 400, { error:'Invalid payment proof.' });
      const rows = await restJson(`/rest/v1/outgoing_payments?id=eq.${encodeURIComponent(id)}&select=proof_storage_path&limit=1`, {}, session.accessToken); const path = rows[0]?.proof_storage_path;
      if (!path) return json(response, 404, { error:'Payment proof was not found.' });
      const signed = await restJson(`/storage/v1/object/sign/finance-proofs/${encodeURIComponent(path).replaceAll('%2F','/')}`, { method:'POST', body:JSON.stringify({expiresIn:300}) }, session.accessToken); const location = signed.signedURL || signed.signedUrl;
      if (!location) return json(response, 502, { error:'The protected proof could not be opened.' });
      response.statusCode=302; response.setHeader('Location',`${config().url}/storage/v1${location}`); response.setHeader('Cache-Control','private, no-store'); return response.end();
    }

    if (route === '/customers' && request.method === 'GET') {
      const session = await requireSession(request, response); if (!session) return;
      const customers = await restJson('/rest/v1/customers?select=*&order=created_at.desc&limit=500', {}, session.accessToken);
      return json(response, 200, { customers });
    }

    if (route === '/customer-create' && request.method === 'POST') {
      const session = await requireSession(request, response); if (!session) return;
      const body = await readBody(request); const payload = customerPayload(body);
      if (!payload) return json(response, 400, { error: 'Enter a valid customer name, phone number and email address.' });
      const rows = await restJson('/rest/v1/customers', { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ ...payload, created_by: session.user.id }) }, session.accessToken);
      await audit(session, 'create', 'customers', rows[0]?.id, rows[0]?.customer_code, { name: payload.name });
      return json(response, 201, { customer: rows[0] });
    }

    if (route === '/customer-update' && request.method === 'POST') {
      const session = await requireSession(request, response); if (!session) return;
      const body = await readBody(request); const id = bounded(body.id, 80); const payload = customerPayload(body);
      if (!/^[0-9a-f-]{36}$/i.test(id) || !payload) return json(response, 400, { error: 'Enter a valid customer profile.' });
      const existing = await restJson(`/rest/v1/customers?id=eq.${encodeURIComponent(id)}&select=id,customer_code,name&limit=1`, {}, session.accessToken);
      if (!existing[0]) return json(response, 404, { error: 'Customer was not found.' });
      const rows = await restJson(`/rest/v1/customers?id=eq.${encodeURIComponent(id)}`, { method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify(payload) }, session.accessToken);
      const customer = rows[0];
      const snapshot = {
        id: customer.id, customer_code: customer.customer_code, customer_type: customer.customer_type,
        name: customer.name, company_registration_number: customer.company_registration_number,
        contact_person: customer.contact_person, phone: customer.phone, email: customer.email,
        billing_address: customer.billing_address, service_address: customer.service_address
      };
      const [draftQuotations, openInvoices] = await Promise.all([
        restJson(`/rest/v1/quotations?customer_id=eq.${encodeURIComponent(id)}&status=eq.draft&sent_at=is.null`, { method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ customer_snapshot: snapshot }) }, session.accessToken),
        restJson(`/rest/v1/invoices?customer_id=eq.${encodeURIComponent(id)}&status=in.(draft,unpaid)`, { method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ customer_snapshot: snapshot }) }, session.accessToken)
      ]);
      await audit(session, 'update', 'customers', id, existing[0].customer_code, { name: payload.name, active: payload.is_active, draftQuotationsUpdated: draftQuotations.length, openInvoicesUpdated: openInvoices.length });
      return json(response, 200, { customer, synchronized: { draftQuotations: draftQuotations.length, openInvoices: openInvoices.length } });
    }

    if (route === '/requests' && request.method === 'GET') {
      const session = await requireSession(request, response); if (!session) return;
      const requests = await restJson('/rest/v1/quotation_requests?archived_at=is.null&select=*&order=created_at.desc&limit=500', {}, session.accessToken);
      return json(response, 200, { requests });
    }

    if (route === '/request-status' && request.method === 'POST') {
      const session = await requireSession(request, response); if (!session) return;
      const body = await readBody(request); const id = bounded(body.id, 80); const status = bounded(body.status, 20);
      if (!/^[0-9a-f-]{36}$/i.test(id) || !['new','reviewing','converted','closed','spam'].includes(status)) return json(response, 400, { error: 'Invalid request update.' });
      const rows = await restJson(`/rest/v1/quotation_requests?id=eq.${encodeURIComponent(id)}`, { method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ status, reviewed_by: session.user.id, reviewed_at: new Date().toISOString() }) }, session.accessToken);
      await audit(session, 'status_change', 'requests', id, rows[0]?.public_reference, { status });
      return json(response, 200, { request: rows[0] });
    }

    if (route === '/quotations' && request.method === 'GET') {
      const session = await requireSession(request, response); if (!session) return;
      const quotations = await restJson('/rest/v1/quotations?archived_at=is.null&select=id,quotation_number,quotation_date,expiry_date,status,project_title,grand_total,customer_snapshot,sent_at,sent_to,created_at&order=created_at.desc&limit=500', {}, session.accessToken);
      const customers = await restJson('/rest/v1/customers?select=id,name,phone,email,contact_person&is_active=eq.true&order=name.asc&limit=500', {}, session.accessToken);
      return json(response, 200, { quotations, customers });
    }

    if (route === '/quotation-detail' && request.method === 'GET') {
      const session = await requireSession(request, response); if (!session) return;
      const id = bounded(requestUrl.searchParams.get('id'), 80);
      if (!/^[0-9a-f-]{36}$/i.test(id)) return json(response, 400, { error: 'Invalid quotation.' });
      const quotations = await restJson(`/rest/v1/quotations?id=eq.${encodeURIComponent(id)}&select=*&limit=1`, {}, session.accessToken);
      if (!quotations[0]) return json(response, 404, { error: 'Quotation was not found.' });
      const items = await restJson(`/rest/v1/quotation_items?quotation_id=eq.${encodeURIComponent(id)}&select=*&order=position.asc`, {}, session.accessToken);
      return json(response, 200, { quotation: quotations[0], items });
    }

    if (route === '/quotation-create' && request.method === 'POST') {
      const session = await requireSession(request, response); if (!session) return;
      const body = await readBody(request); const customerId = bounded(body.customerId, 80); const quotationDate = bounded(body.quotationDate, 10); const expiryDate = bounded(body.expiryDate, 10); const projectTitle = bounded(body.projectTitle, 200);
      const items = Array.isArray(body.items) ? body.items.slice(0, 50).map((item, index) => ({ position:index+1, description:bounded(item.description,500), quantity:Number(item.quantity), unit_price:Number(item.unitPrice) })) : [];
      if (!/^[0-9a-f-]{36}$/i.test(customerId) || !validDate(quotationDate) || !validDate(expiryDate) || expiryDate < quotationDate || projectTitle.length < 2 || !items.length || items.some(item => !item.description || !(item.quantity > 0) || !(item.unit_price >= 0))) return json(response, 400, { error: 'Complete the required quotation fields and items.' });
      const customers = await restJson(`/rest/v1/customers?id=eq.${encodeURIComponent(customerId)}&select=id,name,phone,email,contact_person,billing_address&limit=1`, {}, session.accessToken); const customer = customers[0];
      if (!customer) return json(response, 404, { error: 'Customer was not found.' });
      const subtotal = Math.round(items.reduce((sum,item)=>sum+item.quantity*item.unit_price,0)*100)/100; const discount = Math.max(0,Math.min(subtotal,Number(body.discountAmount)||0)); const tax = Math.max(0,Math.min(100,Number(body.taxPercent)||0)); const other = Math.max(0,Number(body.otherCharges)||0); const total = Math.round(((subtotal-discount)*(1+tax/100)+other)*100)/100;
      const quotationNumber = await restJson('/rest/v1/rpc/next_document_number', { method:'POST', body:JSON.stringify({kind:'quotation',issue_date:quotationDate}) }, session.accessToken);
      const rows = await restJson('/rest/v1/quotations', { method:'POST', headers:{Prefer:'return=representation'}, body:JSON.stringify({ quotation_number:String(quotationNumber), customer_id:customerId, quotation_date:quotationDate, expiry_date:expiryDate, project_title:projectTitle, project_location:bounded(body.projectLocation,500)||null, description:bounded(body.description,2000)||null, customer_snapshot:customer, discount_amount:discount, tax_percent:tax, other_charges:other, subtotal, grand_total:total, notes:bounded(body.notes,2000)||null, terms_and_conditions:bounded(body.terms,5000)||null, status:'draft', created_by:session.user.id }) }, session.accessToken);
      await restJson('/rest/v1/quotation_items', { method:'POST', headers:{Prefer:'return=minimal'}, body:JSON.stringify(items.map(item=>({...item,quotation_id:rows[0].id}))) }, session.accessToken);
      await audit(session,'create','quotations',rows[0].id,rows[0].quotation_number,{projectTitle,total});
      return json(response,201,{quotation:rows[0]});
    }

    if (route === '/quotation-update' && request.method === 'POST') {
      const session = await requireSession(request, response); if (!session) return;
      const body = await readBody(request); const id = bounded(body.id, 80); const customerId = bounded(body.customerId, 80); const quotationDate = bounded(body.quotationDate, 10); const expiryDate = bounded(body.expiryDate, 10); const projectTitle = bounded(body.projectTitle, 200);
      const items = Array.isArray(body.items) ? body.items.slice(0, 50).map((item, index) => ({ position:index+1, description:bounded(item.description,500), quantity:Number(item.quantity), unit_price:Number(item.unitPrice) })) : [];
      if (!/^[0-9a-f-]{36}$/i.test(id) || !/^[0-9a-f-]{36}$/i.test(customerId) || !validDate(quotationDate) || !validDate(expiryDate) || expiryDate < quotationDate || projectTitle.length < 2 || !items.length || items.some(item => !item.description || !(item.quantity > 0) || !(item.unit_price >= 0))) return json(response, 400, { error: 'Complete the required quotation fields and items.' });
      const existing = await restJson(`/rest/v1/quotations?id=eq.${encodeURIComponent(id)}&select=id,quotation_number,status,sent_at&limit=1`, {}, session.accessToken);
      if (!existing[0]) return json(response, 404, { error: 'Quotation was not found.' });
      if (existing[0].status !== 'draft' || existing[0].sent_at) return json(response, 409, { error: 'Only an unsent draft quotation can be edited.' });
      const customers = await restJson(`/rest/v1/customers?id=eq.${encodeURIComponent(customerId)}&select=id,customer_code,customer_type,name,company_registration_number,phone,email,contact_person,billing_address,service_address&limit=1`, {}, session.accessToken); const customer = customers[0];
      if (!customer) return json(response, 404, { error: 'Customer was not found.' });
      const subtotal = Math.round(items.reduce((sum,item)=>sum+item.quantity*item.unit_price,0)*100)/100; const discount = Math.max(0,Math.min(subtotal,Number(body.discountAmount)||0)); const tax = Math.max(0,Math.min(100,Number(body.taxPercent)||0)); const other = Math.max(0,Number(body.otherCharges)||0); const total = Math.round(((subtotal-discount)*(1+tax/100)+other)*100)/100;
      const rows = await restJson(`/rest/v1/quotations?id=eq.${encodeURIComponent(id)}&status=eq.draft&sent_at=is.null`, { method:'PATCH', headers:{Prefer:'return=representation'}, body:JSON.stringify({ customer_id:customerId, quotation_date:quotationDate, expiry_date:expiryDate, project_title:projectTitle, project_location:bounded(body.projectLocation,500)||null, description:bounded(body.description,2000)||null, customer_snapshot:customer, discount_amount:discount, tax_percent:tax, other_charges:other, subtotal, grand_total:total, notes:bounded(body.notes,2000)||null, terms_and_conditions:bounded(body.terms,5000)||null }) }, session.accessToken);
      if (!rows[0]) return json(response, 409, { error: 'The quotation changed in another session. Reload before editing.' });
      await restJson(`/rest/v1/quotation_items?quotation_id=eq.${encodeURIComponent(id)}`, { method:'DELETE', headers:{Prefer:'return=minimal'} }, session.accessToken);
      await restJson('/rest/v1/quotation_items', { method:'POST', headers:{Prefer:'return=minimal'}, body:JSON.stringify(items.map(item=>({...item,quotation_id:id}))) }, session.accessToken);
      await audit(session,'update','quotations',id,existing[0].quotation_number,{projectTitle,total,itemCount:items.length});
      return json(response,200,{quotation:rows[0]});
    }

    if (route === '/quotation-pdf' && request.method === 'GET') {
      const session = await requireSession(request, response); if (!session) return;
      const id = bounded(requestUrl.searchParams.get('id'), 80);
      if (!/^[0-9a-f-]{36}$/i.test(id)) return json(response, 400, { error: 'Invalid quotation.' });
      const bundle = await quotationBundle(id, session);
      if (!bundle) return json(response, 404, { error: 'Quotation was not found.' });
      const pdf = buildQuotationPdf(bundle);
      return pdfResponse(response, pdf, `${bundle.quotation.quotation_number}.pdf`);
    }

    if (route === '/quotation-send' && request.method === 'POST') {
      const session = await requireSession(request, response); if (!session) return;
      const body = await readBody(request);
      const id = bounded(body.id, 80);
      const recipientEmail = bounded(body.recipientEmail, 254).toLowerCase();
      if (!body.confirmed || !/^[0-9a-f-]{36}$/i.test(id) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipientEmail)) {
        return json(response, 400, { error: 'Confirm a valid customer email address before sending.' });
      }
      if (!process.env.RESEND_API_KEY) return json(response, 503, { error: 'Email delivery is not configured.' });
      const bundle = await quotationBundle(id, session);
      if (!bundle) return json(response, 404, { error: 'Quotation was not found.' });
      const previousSentAt = bundle.quotation.sent_at || null;
      const isResend = Boolean(previousSentAt);
      if (isResend) {
        if (bundle.quotation.status !== 'sent') return json(response, 409, { error: 'Only a sent quotation can be resent.' });
        const retryAfterSeconds = quotationResendWaitSeconds(previousSentAt);
        if (retryAfterSeconds > 0) {
          return json(response, 429, {
            error: `Please wait ${retryAfterSeconds} second${retryAfterSeconds === 1 ? '' : 's'} before resending this quotation.`,
            retryAfterSeconds
          }, { 'Retry-After': String(retryAfterSeconds) });
        }
      } else if (bundle.quotation.status !== 'draft') {
        return json(response, 409, { error: 'Only a draft quotation can be approved and sent.' });
      }

      const deliveryReservationAt = new Date().toISOString();
      let previousDelivery = null;
      if (isResend) {
        previousDelivery = {
          sentAt: previousSentAt,
          sentTo: bundle.quotation.sent_to,
          providerId: bundle.quotation.email_provider_id
        };
        const locked = await restJson(`/rest/v1/quotations?id=eq.${encodeURIComponent(id)}&status=eq.sent&sent_at=eq.${encodeURIComponent(previousSentAt)}`, {
          method: 'PATCH', headers: { Prefer: 'return=representation' },
          body: JSON.stringify({ sent_at: deliveryReservationAt })
        }, session.accessToken);
        if (!locked[0]) return json(response, 409, { error: 'This quotation is already being resent. Refresh before trying again.' });
        bundle.quotation.sent_at = deliveryReservationAt;
      } else {
        const companySnapshot = {
          company_name: bundle.settings.company_name, registration_number: bundle.settings.registration_number,
          business_address: bundle.settings.business_address, phone: bundle.settings.phone, email: bundle.settings.email,
          website: bundle.settings.website, logo_path: bundle.settings.logo_path, bank_name: bundle.settings.bank_name,
          bank_account_name: bundle.settings.bank_account_name, bank_account_number: bundle.settings.bank_account_number,
          default_terms: bundle.settings.default_terms, tax_enabled: bundle.settings.tax_enabled
        };
        const locked = await restJson(`/rest/v1/quotations?id=eq.${encodeURIComponent(id)}&status=eq.draft&sent_at=is.null&approved_at=is.null`, {
          method: 'PATCH', headers: { Prefer: 'return=representation' },
          body: JSON.stringify({ company_snapshot: companySnapshot, approved_by:session.user.id, approved_at:deliveryReservationAt })
        }, session.accessToken);
        if (!locked[0]) return json(response, 409, { error: 'This quotation is already being processed. Refresh before trying again.' });
        bundle.quotation.company_snapshot = companySnapshot;
      }
      bundle.quotation.status = 'sent';
      const pdf = buildQuotationPdf(bundle);
      const email = quotationEmail(bundle);
      const rollbackDelivery = async () => {
        if (isResend) {
          await restJson(`/rest/v1/quotations?id=eq.${encodeURIComponent(id)}&sent_at=eq.${encodeURIComponent(deliveryReservationAt)}`, {
            method:'PATCH', headers:{Prefer:'return=minimal'},
            body:JSON.stringify({ sent_at:previousDelivery.sentAt, sent_to:previousDelivery.sentTo, email_provider_id:previousDelivery.providerId })
          }, session.accessToken).catch(()=>{});
          return;
        }
        await restJson(`/rest/v1/quotations?id=eq.${encodeURIComponent(id)}&sent_at=is.null`, {
          method:'PATCH', headers:{Prefer:'return=minimal'}, body:JSON.stringify({approved_by:null,approved_at:null})
        }, session.accessToken).catch(()=>{});
      };
      let delivery;
      try {
        delivery = await fetch('https://api.resend.com/emails', {
          method: 'POST', headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            from: process.env.QUOTATION_FROM_EMAIL || 'NS Smart Fix Solution <website@nssmartfixsolution.com>',
            to: [recipientEmail], reply_to: bundle.settings.email || process.env.QUOTATION_TO_EMAIL,
            subject: email.subject, html: email.html, text: email.text,
            attachments: [{ filename: `${bundle.quotation.quotation_number}.pdf`, content: pdf.toString('base64') }]
          })
        });
      } catch {
        await rollbackDelivery();
        await sendMonitoringAlert({ category:'email_delivery_failed', severity:'critical', details:{route:'/api/admin-auth',stage:'quotation_send',code:'network_error'}, dedupeKey:'admin-quotation-send-network' });
        return json(response, 502, { error: `The quotation could not be delivered. Its status remains ${isResend ? 'Sent' : 'Draft'}.` });
      }
      if (!delivery.ok) {
        await rollbackDelivery();
        await sendMonitoringAlert({ category:'email_delivery_failed', severity:'critical', details:{route:'/api/admin-auth',stage:'quotation_send',status:delivery.status}, dedupeKey:`admin-quotation-send:${delivery.status}` });
        return json(response, 502, { error: `The quotation could not be delivered. Its status remains ${isResend ? 'Sent' : 'Draft'}.` });
      }
      const deliveryBody = await delivery.json().catch(() => ({}));
      const sentAt = new Date().toISOString();
      const deliveryFilter = isResend ? `sent_at=eq.${encodeURIComponent(deliveryReservationAt)}` : 'sent_at=is.null';
      const updated = await restJson(`/rest/v1/quotations?id=eq.${encodeURIComponent(id)}&${deliveryFilter}`, {
        method: 'PATCH', headers: { Prefer: 'return=representation' },
        body: JSON.stringify({ status:'sent', sent_at:sentAt, sent_to:recipientEmail, email_provider_id:bounded(deliveryBody.id, 120) || null })
      }, session.accessToken);
      if (!updated[0]) return json(response, 409, { error: 'The email was delivered, but another session updated this quotation. Check its audit history before retrying.' });
      await audit(session, isResend ? 'resend' : 'approve_and_send', 'quotations', id, bundle.quotation.quotation_number, {
        sentTo:recipientEmail, sentAt, previousSentAt, total:bundle.quotation.grand_total
      });
      return json(response, 200, {
        quotation:updated[0], delivered:true, resent:isResend,
        cooldownSeconds:Math.ceil(QUOTATION_RESEND_COOLDOWN_MS / 1000)
      });
    }

    if (route === '/quotation-convert' && request.method === 'POST') {
      const session = await requireSession(request, response); if (!session) return;
      const body = await readBody(request); const id = bounded(body.id, 80);
      if (!body.confirmed || !/^[0-9a-f-]{36}$/i.test(id)) return json(response, 400, { error: 'Confirm a valid accepted quotation before creating an invoice.' });
      const result = await restJson('/rest/v1/rpc/convert_accepted_quotation_to_invoice', {
        method:'POST', body:JSON.stringify({ p_quotation_id:id })
      }, session.accessToken);
      return json(response, 201, result);
    }

    if (route === '/record-archive' && request.method === 'POST') {
      const session = await requireSession(request, response); if (!session || !requireAdmin(session, response)) return;
      const body = await readBody(request); const id = bounded(body.id, 80); const kind = bounded(body.kind, 20); const reason = bounded(body.reason, 500);
      const definitions = { request:{table:'quotation_requests',number:'public_reference'}, quotation:{table:'quotations',number:'quotation_number'}, invoice:{table:'invoices',number:'invoice_number'} };
      const definition = definitions[kind];
      if (!definition || !/^[0-9a-f-]{36}$/i.test(id) || reason.length < 3) return json(response, 400, { error:'Select a valid record and provide a deletion reason.' });
      const existing = await restJson(`/rest/v1/${definition.table}?id=eq.${encodeURIComponent(id)}&archived_at=is.null&select=*&limit=1`, {}, session.accessToken); const record = existing[0];
      if (!record) return json(response, 404, { error:'The record was not found or is already deleted.' });
      if (kind === 'invoice') {
        if (record.status === 'paid' || Number(record.amount_paid || 0) > 0) return json(response, 409, { error:'Paid or partially paid invoices cannot be deleted. Retain them for accounting and audit purposes.' });
        const payments = await restJson(`/rest/v1/payments?invoice_id=eq.${encodeURIComponent(id)}&select=id&limit=1`, {}, session.accessToken);
        if (payments.length) return json(response, 409, { error:'An invoice with payment history cannot be deleted.' });
      }
      const archivedAt = new Date().toISOString();
      const payload = { archived_at:archivedAt, archived_by:session.user.id, archive_reason:reason };
      if (kind === 'invoice' && record.status !== 'cancelled') payload.status = 'cancelled';
      if (kind === 'quotation' && !['cancelled','converted_to_invoice'].includes(record.status)) payload.status = 'cancelled';
      const rows = await restJson(`/rest/v1/${definition.table}?id=eq.${encodeURIComponent(id)}&archived_at=is.null`, { method:'PATCH', headers:{Prefer:'return=representation'}, body:JSON.stringify(payload) }, session.accessToken);
      if (!rows[0]) return json(response, 409, { error:'The record changed in another session. Reload before trying again.' });
      await audit(session, 'archive', definition.table, id, record[definition.number], { reason, previousStatus:record.status || null, archivedAt });
      return json(response, 200, { archived:true });
    }

    if (route === '/document-status' && request.method === 'POST') {
      const session=await requireSession(request,response); if(!session)return;
      const body=await readBody(request); const id=bounded(body.id,80); const kind=bounded(body.kind,20); const nextStatus=bounded(body.status,30);
      if(!/^[0-9a-f-]{36}$/i.test(id)||!['quotation','invoice'].includes(kind)) return json(response,400,{error:'Invalid document status update.'});
      const table=kind==='quotation'?'quotations':'invoices';
      const existing=await restJson(`/rest/v1/${table}?id=eq.${encodeURIComponent(id)}&select=*&limit=1`,{},session.accessToken); const current=existing[0];
      if(!current) return json(response,404,{error:'Document was not found.'});
      const permitted = kind==='quotation'
        ? current.status==='sent' && ['accepted','rejected','expired','cancelled'].includes(nextStatus)
        : (current.status==='draft' && ['unpaid','cancelled'].includes(nextStatus)) || (current.status==='unpaid' && nextStatus==='cancelled' && Number(current.amount_paid||0)===0);
      if(!permitted) return json(response,409,{error:'This status change is not permitted by the accounting workflow.'});
      const rows=await restJson(`/rest/v1/${table}?id=eq.${encodeURIComponent(id)}&status=eq.${encodeURIComponent(current.status)}`,{method:'PATCH',headers:{Prefer:'return=representation'},body:JSON.stringify({status:nextStatus})},session.accessToken);
      if(!rows[0]) return json(response,409,{error:'The document changed in another session. Reload before trying again.'});
      await audit(session,'status_change',table,id,kind==='quotation'?rows[0].quotation_number:rows[0].invoice_number,{from:current.status,to:nextStatus});
      return json(response,200,{document:rows[0]});
    }

    if (route === '/payments' && request.method === 'GET') {
      const session = await requireSession(request, response); if (!session) return;
      const payments = await restJson('/rest/v1/payments?select=id,payment_date,amount,payment_method,status,transaction_reference,notes,created_at,invoices(invoice_number,customer_snapshot)&order=created_at.desc&limit=500', {}, session.accessToken);
      const invoices = await restJson('/rest/v1/invoices?select=id,invoice_number,customer_id,balance,customer_snapshot&balance=gt.0&status=in.(unpaid,partially_paid,overdue)&order=created_at.desc&limit=500', {}, session.accessToken);
      return json(response,200,{payments,invoices});
    }

    if (route === '/invoice-detail' && request.method === 'GET') {
      const session = await requireSession(request, response); if (!session) return;
      const id = bounded(requestUrl.searchParams.get('id'), 80);
      if (!/^[0-9a-f-]{36}$/i.test(id)) return json(response, 400, { error:'Invalid invoice.' });
      const [invoiceRows, items, payments] = await Promise.all([
        restJson(`/rest/v1/invoices?id=eq.${encodeURIComponent(id)}&archived_at=is.null&select=*&limit=1`, {}, session.accessToken),
        restJson(`/rest/v1/invoice_items?invoice_id=eq.${encodeURIComponent(id)}&select=*&order=position.asc`, {}, session.accessToken),
        restJson(`/rest/v1/payments?invoice_id=eq.${encodeURIComponent(id)}&select=id,payment_date,amount,payment_method,status,transaction_reference,notes,proof_storage_path,created_at&order=payment_date.desc,created_at.desc`, {}, session.accessToken)
      ]);
      if (!invoiceRows[0]) return json(response, 404, { error:'Invoice was not found.' });
      return json(response, 200, { invoice:invoiceRows[0], items, payments });
    }

    if (route === '/invoice-serials-update' && request.method === 'POST') {
      const session = await requireSession(request, response); if (!session) return;
      const body = await readBody(request); const invoiceId = bounded(body.invoiceId, 80);
      if (!/^[0-9a-f-]{36}$/i.test(invoiceId) || !Array.isArray(body.items) || body.items.length > 50) return json(response, 400, { error:'Enter valid invoice serial numbers.' });
      const invoiceRows = await restJson(`/rest/v1/invoices?id=eq.${encodeURIComponent(invoiceId)}&archived_at=is.null&select=id,invoice_number,status&limit=1`, {}, session.accessToken);
      const invoice = invoiceRows[0];
      if (!invoice) return json(response, 404, { error:'Invoice was not found.' });
      if (!['draft','unpaid','partially_paid','overdue'].includes(invoice.status)) return json(response, 409, { error:'Serial numbers are locked after an invoice is paid, cancelled or voided.' });
      const storedItems = await restJson(`/rest/v1/invoice_items?invoice_id=eq.${encodeURIComponent(invoiceId)}&select=id,quantity`, {}, session.accessToken);
      const storedById = new Map(storedItems.map(item => [item.id, item]));
      const updates = []; const seen = new Set();
      for (const input of body.items) {
        const id = bounded(input.id, 80); const stored = storedById.get(id);
        const serialNumbers = Array.isArray(input.serialNumbers) ? input.serialNumbers.map(serial => bounded(serial, 120)).filter(Boolean) : [];
        if (!stored || serialNumbers.length > Math.floor(Number(stored.quantity))) return json(response, 400, { error:'Serial numbers cannot exceed the related whole-item quantity.' });
        for (const serial of serialNumbers) { const key=serial.toLowerCase(); if (seen.has(key)) return json(response, 400, { error:`Serial number ${serial} is entered more than once.` }); seen.add(key); }
        updates.push({ id, serialNumbers });
      }
      if (updates.length !== storedItems.length) return json(response, 400, { error:'Serial numbers must be submitted for every invoice item.' });
      await Promise.all(updates.map(update => restJson(`/rest/v1/invoice_items?id=eq.${encodeURIComponent(update.id)}&invoice_id=eq.${encodeURIComponent(invoiceId)}`, { method:'PATCH', headers:{Prefer:'return=minimal'}, body:JSON.stringify({serial_numbers:update.serialNumbers}) }, session.accessToken)));
      await audit(session,'update','invoice_items',invoiceId,invoice.invoice_number,{serialNumbersUpdated:true,itemCount:updates.length});
      return json(response, 200, { updated:true });
    }

    if (route === '/payment-proof-upload-url' && request.method === 'POST') {
      const session = await requireSession(request, response); if (!session) return;
      const body = await readBody(request); const invoiceId = bounded(body.invoiceId, 80);
      const fileName = bounded(body.fileName, 180).replace(/[^a-z0-9._-]+/gi, '-');
      const mimeType = bounded(body.mimeType, 80); const size = Number(body.size);
      const allowed = ['image/jpeg','image/png','image/webp','application/pdf'];
      if (!/^[0-9a-f-]{36}$/i.test(invoiceId) || !fileName || !allowed.includes(mimeType) || !(size > 0 && size <= 5242880)) return json(response, 400, { error:'Upload a JPG, PNG, WebP or PDF payment proof up to 5 MB.' });
      const invoiceRows = await restJson(`/rest/v1/invoices?id=eq.${encodeURIComponent(invoiceId)}&archived_at=is.null&select=id,status,balance&limit=1`, {}, session.accessToken);
      if (!invoiceRows[0] || !['unpaid','partially_paid','overdue'].includes(invoiceRows[0].status)) return json(response, 409, { error:'Payment proof can only be added to an issued invoice with an outstanding balance.' });
      const path = `${invoiceId}/${Date.now()}-${fileName}`;
      const signed = await restJson(`/storage/v1/object/upload/sign/payment-proofs/${encodeURIComponent(path).replaceAll('%2F','/')}`, { method:'POST', body:JSON.stringify({}) }, session.accessToken);
      const signedPath = signed.url || signed.signedURL || signed.signedUrl;
      if (!signedPath) return json(response, 502, { error:'A secure proof upload could not be prepared.' });
      const storage = config();
      return json(response, 200, { path, uploadUrl:`${storage.url}/storage/v1${signedPath}`, uploadKey:storage.key, mimeType });
    }

    if (route === '/payment-proof' && request.method === 'GET') {
      const session = await requireSession(request, response); if (!session) return;
      const id = bounded(requestUrl.searchParams.get('id'), 80);
      if (!/^[0-9a-f-]{36}$/i.test(id)) return json(response, 400, { error:'Invalid payment proof.' });
      const rows = await restJson(`/rest/v1/payments?id=eq.${encodeURIComponent(id)}&select=proof_storage_path&limit=1`, {}, session.accessToken);
      const path = rows[0]?.proof_storage_path;
      if (!path) return json(response, 404, { error:'Payment proof was not found.' });
      const signed = await restJson(`/storage/v1/object/sign/payment-proofs/${encodeURIComponent(path).replaceAll('%2F','/')}`, { method:'POST', body:JSON.stringify({ expiresIn:300 }) }, session.accessToken);
      const location = signed.signedURL || signed.signedUrl;
      if (!location) return json(response, 502, { error:'The protected proof could not be opened.' });
      response.statusCode = 302; response.setHeader('Location', `${config().url}/storage/v1${location}`); response.setHeader('Cache-Control','private, no-store'); return response.end();
    }

    if (route === '/payment-create' && request.method === 'POST') {
      const session = await requireSession(request, response); if (!session) return;
      const body=await readBody(request); const invoiceId=bounded(body.invoiceId,80); const cashAccountId=bounded(body.cashAccountId,80); const amount=Number(body.amount); const date=bounded(body.paymentDate,10); const method=bounded(body.paymentMethod,30); const proofPath=bounded(body.proofPath,500);
      if(!/^[0-9a-f-]{36}$/i.test(invoiceId)||!/^[0-9a-f-]{36}$/i.test(cashAccountId)||!validDate(date)||!(amount>0)||!['bank_transfer','cash','duitnow','cheque','other'].includes(method)) return json(response,400,{error:'Enter valid payment details and select the receiving account.'});
      const invoices=await restJson(`/rest/v1/invoices?id=eq.${encodeURIComponent(invoiceId)}&select=id,invoice_number,customer_id,balance,status&limit=1`,{},session.accessToken); const invoice=invoices[0];
      if(!invoice||!['unpaid','partially_paid','overdue'].includes(invoice.status)||amount>Number(invoice.balance)) return json(response,400,{error:'Select an issued invoice with enough outstanding balance.'});
      if (!proofPath.startsWith(`${invoiceId}/`)) return json(response,400,{error:'Payment proof is required before recording payment.'});
      const proofCheck = await supabaseFetch(`/storage/v1/object/authenticated/payment-proofs/${encodeURIComponent(proofPath).replaceAll('%2F','/')}`, { method:'HEAD' }, session.accessToken);
      if (!proofCheck.ok) return json(response,400,{error:'The uploaded payment proof could not be verified. Upload it again.'});
      const result=await restJson('/rest/v1/rpc/record_invoice_payment',{method:'POST',body:JSON.stringify({p_invoice_id:invoice.id,p_payment_date:date,p_amount:amount,p_payment_method:method,p_transaction_reference:bounded(body.reference,120)||null,p_notes:bounded(body.notes,1000)||null,p_proof_storage_path:proofPath,p_cash_account_id:cashAccountId})},session.accessToken);
      await audit(session,'create','payments',result.payment.id,invoice.invoice_number,{amount,method,paymentDate:date,cashAccountId,proofAttached:true});
      return json(response,201,result);
    }

    if (route === '/receipts' && request.method === 'GET') {
      const session = await requireSession(request, response); if (!session) return;
      const receipts=await restJson('/rest/v1/receipts?select=id,receipt_number,amount_received,remaining_balance,created_at,invoices(invoice_number,customer_snapshot),payments(payment_method,status,transaction_reference,payment_date)&order=created_at.desc&limit=500',{},session.accessToken);
      return json(response,200,{receipts});
    }

    if (route === '/settings' && request.method === 'GET') { const session=await requireSession(request,response); if(!session)return; const rows=await restJson('/rest/v1/company_settings?select=*&limit=1',{},session.accessToken); return json(response,200,{settings:rows[0]||{}}); }
    if (route === '/settings-update' && request.method === 'POST') { const session=await requireSession(request,response); if(!session||!requireAdmin(session,response))return; const b=await readBody(request); const logoPath=bounded(b.logoPath,200)||'/assets/ns-smart-fix-logo.png'; if(!/^\/assets\/[a-z0-9._-]+\.png$/i.test(logoPath))return json(response,400,{error:'Select a valid website logo.'}); const payload={company_name:bounded(b.companyName,160),registration_number:bounded(b.registrationNumber,80)||null,business_address:bounded(b.businessAddress,1000)||null,phone:bounded(b.phone,30)||null,email:bounded(b.email,254)||null,website:bounded(b.website,300)||null,logo_path:logoPath,bank_name:bounded(b.bankName,120)||null,bank_account_name:bounded(b.bankAccountName,160)||null,bank_account_number:bounded(b.bankAccountNumber,80)||null,default_quotation_validity_days:Math.max(1,Math.min(365,Number(b.quotationDays)||14)),default_invoice_payment_days:Math.max(0,Math.min(365,Number(b.invoiceDays)||30)),default_terms:bounded(b.defaultTerms,5000)||null,tax_enabled:Boolean(b.taxEnabled),default_tax_percent:Math.max(0,Math.min(100,Number(b.defaultTaxPercent)||0)),updated_by:session.user.id}; if(payload.company_name.length<2)return json(response,400,{error:'Company name is required.'}); const rows=await restJson('/rest/v1/company_settings?id=eq.true',{method:'PATCH',headers:{Prefer:'return=representation'},body:JSON.stringify(payload)},session.accessToken); await audit(session,'update','settings',null,null,{companyName:payload.company_name}); return json(response,200,{settings:rows[0]}); }

    if (route === '/users' && request.method === 'GET') { const session=await requireSession(request,response); if(!session||!requireAdmin(session,response))return; const users=await restJson('/rest/v1/profiles?select=id,full_name,role,is_active,created_at,updated_at&order=created_at.asc&limit=100',{},session.accessToken); return json(response,200,{users}); }
    if (route === '/user-update' && request.method === 'POST') { const session=await requireSession(request,response); if(!session||!requireAdmin(session,response))return; const b=await readBody(request); const id=bounded(b.id,80); const roleValue=bounded(b.role,10); if(!/^[0-9a-f-]{36}$/i.test(id)||!['admin','staff'].includes(roleValue))return json(response,400,{error:'Invalid staff update.'}); if(id===session.user.id&&!b.isActive)return json(response,400,{error:'You cannot deactivate your own account.'}); const rows=await restJson(`/rest/v1/profiles?id=eq.${encodeURIComponent(id)}`,{method:'PATCH',headers:{Prefer:'return=representation'},body:JSON.stringify({role:roleValue,is_active:Boolean(b.isActive)})},session.accessToken); await audit(session,'update','users',id,null,{role:roleValue,isActive:Boolean(b.isActive)}); return json(response,200,{user:rows[0]}); }
    if (route === '/audit' && request.method === 'GET') { const session=await requireSession(request,response); if(!session||!requireAdmin(session,response))return; const logs=await restJson('/rest/v1/audit_logs?select=id,occurred_at,action,module,record_id,record_number,new_value,profiles(full_name)&order=occurred_at.desc&limit=500',{},session.accessToken); return json(response,200,{logs}); }

    if (route === '/invoices' && request.method === 'GET') {
      const session = await authenticatedSession(parseCookies(request.headers?.cookie));
      if (!session) return json(response, 401, { error: 'Authentication is required.' }, { 'Set-Cookie': clearCookies() });
      const [invoices, settings, customers, acceptedQuotations, sentQuotations, cashAccounts] = await Promise.all([
        restJson('/rest/v1/invoices?archived_at=is.null&select=id,invoice_number,invoice_date,due_date,status,project_title,grand_total,amount_paid,balance,customer_snapshot,created_at&order=created_at.desc&limit=100', {}, session.accessToken),
        restJson('/rest/v1/company_settings?select=*&limit=1', {}, session.accessToken),
        restJson('/rest/v1/customers?is_active=eq.true&select=id,customer_code,customer_type,name,company_registration_number,phone,email,contact_person,billing_address,service_address&order=name.asc&limit=500', {}, session.accessToken),
        restJson('/rest/v1/quotations?archived_at=is.null&status=eq.accepted&select=id,quotation_number,customer_id,customer_snapshot,project_title,grand_total,accepted_at:updated_at&order=updated_at.asc&limit=100', {}, session.accessToken),
        restJson('/rest/v1/quotations?archived_at=is.null&status=eq.sent&select=id,quotation_number,customer_snapshot,project_title,grand_total,sent_at&order=sent_at.asc&limit=100', {}, session.accessToken),
        restJson('/rest/v1/cash_accounts?is_active=eq.true&select=id,name,account_type,institution_name,account_last_four&order=name.asc&limit=100', {}, session.accessToken)
      ]);
      return json(response, 200, { invoices, settings: settings[0] || null, customers, acceptedQuotations, sentQuotations, cashAccounts });
    }

    if (route === '/invoice-pdf' && request.method === 'GET') {
      const session = await requireSession(request, response); if (!session) return;
      const id = bounded(requestUrl.searchParams.get('id'), 80);
      if (!/^[0-9a-f-]{36}$/i.test(id)) return json(response, 400, { error: 'Invalid invoice.' });
      const [invoiceRows, items, settingRows, payments] = await Promise.all([
        restJson(`/rest/v1/invoices?id=eq.${encodeURIComponent(id)}&select=*&limit=1`, {}, session.accessToken),
        restJson(`/rest/v1/invoice_items?invoice_id=eq.${encodeURIComponent(id)}&select=*&order=position.asc`, {}, session.accessToken),
        restJson('/rest/v1/company_settings?select=*&limit=1', {}, session.accessToken),
        restJson(`/rest/v1/payments?invoice_id=eq.${encodeURIComponent(id)}&select=payment_date,amount,payment_method,status,transaction_reference&order=payment_date.asc`, {}, session.accessToken)
      ]);
      const invoice = invoiceRows[0];
      if (!invoice) return json(response, 404, { error: 'Invoice was not found.' });
      const pdf = buildInvoicePdf({ invoice, items, settings:settingRows[0] || {}, payments });
      const download = requestUrl.searchParams.get('download') === '1';
      response.statusCode = 200;
      response.setHeader('Content-Type', 'application/pdf');
      response.setHeader('Content-Disposition', `${download ? 'attachment' : 'inline'}; filename="${invoice.invoice_number}.pdf"`);
      response.setHeader('Cache-Control', 'private, no-store, max-age=0');
      response.setHeader('Content-Length', String(pdf.length));
      return response.end(pdf);
    }

    if (route === '/invoice-create' && request.method === 'POST') {
      return json(response, 409, { error: 'Standalone invoices are disabled. Mark the quotation Accepted, then create its invoice from the Invoices page.' });
    }

    if (route === '/legacy-invoice-create-disabled' && request.method === 'POST') {
      const session = await authenticatedSession(parseCookies(request.headers?.cookie));
      if (!session) return json(response, 401, { error: 'Authentication is required.' }, { 'Set-Cookie': clearCookies() });
      const body = await readBody(request);
      const customerId = bounded(body.customerId, 80);
      const invoiceDate = bounded(body.invoiceDate, 10);
      const dueDate = bounded(body.dueDate, 10);
      const projectTitle = bounded(body.projectTitle, 200);
      const items = Array.isArray(body.items) ? body.items.slice(0, 50).map((item, index) => ({
        position: index + 1,
        description: bounded(item.description, 500),
        quantity: Number(item.quantity),
        unit_price: Number(item.unitPrice)
      })) : [];
      if (!/^[0-9a-f-]{36}$/i.test(customerId) || !validDate(invoiceDate) || !validDate(dueDate) || dueDate < invoiceDate || projectTitle.length < 2 || !items.length || items.some(item => !item.description || !(item.quantity > 0) || !(item.unit_price >= 0))) {
        return json(response, 400, { error: 'Complete the required customer, date, project and invoice-item fields.' });
      }
      const subtotal = Math.round(items.reduce((sum, item) => sum + item.quantity * item.unit_price, 0) * 100) / 100;
      const discountAmount = Math.max(0, Math.min(subtotal, Number(body.discountAmount) || 0));
      const taxPercent = Math.max(0, Math.min(100, Number(body.taxPercent) || 0));
      const otherCharges = Math.max(0, Number(body.otherCharges) || 0);
      const grandTotal = Math.round(((subtotal - discountAmount) * (1 + taxPercent / 100) + otherCharges) * 100) / 100;

      const customerRows = await restJson(`/rest/v1/customers?id=eq.${encodeURIComponent(customerId)}&is_active=eq.true&select=id,customer_code,customer_type,name,company_registration_number,phone,email,contact_person,billing_address,service_address&limit=1`, {}, session.accessToken);
      const customer = customerRows[0];
      if (!customer) return json(response, 404, { error: 'Select an active customer before creating the invoice.' });
      const numberResult = await restJson('/rest/v1/rpc/next_document_number', {
        method: 'POST', body: JSON.stringify({ kind: 'invoice', issue_date: invoiceDate })
      }, session.accessToken);
      const invoiceNumber = typeof numberResult === 'string' ? numberResult : String(numberResult || '');
      try {
        const invoiceRows = await restJson('/rest/v1/invoices', {
          method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify({
            invoice_number: invoiceNumber, customer_id: customer.id, invoice_date: invoiceDate, due_date: dueDate,
            po_reference: bounded(body.poReference, 120) || null, project_title: projectTitle,
            description: bounded(body.description, 2000) || null,
            customer_snapshot: customer,
            discount_amount: discountAmount, tax_percent: taxPercent, other_charges: otherCharges,
            subtotal, grand_total: grandTotal, amount_paid: 0, balance: grandTotal,
            notes: bounded(body.notes, 2000) || null, payment_terms: bounded(body.paymentTerms, 2000) || null,
            status: 'draft', created_by: session.user.id
          })
        }, session.accessToken);
        const invoice = invoiceRows[0];
        await restJson('/rest/v1/invoice_items', {
          method: 'POST', headers: { Prefer: 'return=minimal' },
          body: JSON.stringify(items.map(item => ({ ...item, invoice_id: invoice.id })))
        }, session.accessToken);
        await audit(session, 'create', 'invoices', invoice.id, invoiceNumber, { customerId: customer.id, projectTitle, total: grandTotal });
        return json(response, 201, { invoice: { ...invoice, customer_snapshot: customer, invoice_number: invoiceNumber } });
      } catch (error) {
        throw error;
      }
    }

    if (route === '/logout' && request.method === 'POST') {
      const cookies = parseCookies(request.headers?.cookie);
      if (cookies[ACCESS_COOKIE]) await supabaseFetch('/auth/v1/logout', { method: 'POST' }, cookies[ACCESS_COOKIE]).catch(() => {});
      return json(response, 200, { ok: true }, { 'Set-Cookie': clearCookies() });
    }

    return json(response, 405, { error: 'Method not allowed.' }, { Allow: 'GET, POST' });
  } catch {
    return json(response, 500, { error: 'The secure service is temporarily unavailable.' });
  }
}
