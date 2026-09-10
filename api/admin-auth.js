const ACCESS_COOKIE = 'ns_admin_access';
const REFRESH_COOKIE = 'ns_admin_refresh';
const MAX_BODY_BYTES = 32 * 1024;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_LIMIT = 8;
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
      const [requests, quotations, invoices, customers] = await Promise.all([
        restJson('/rest/v1/quotation_requests?select=id,status,created_at&order=created_at.desc&limit=1000', {}, session.accessToken),
        restJson('/rest/v1/quotations?select=id,status,grand_total,created_at&order=created_at.desc&limit=1000', {}, session.accessToken),
        restJson('/rest/v1/invoices?select=id,status,grand_total,balance,created_at&order=created_at.desc&limit=1000', {}, session.accessToken),
        restJson('/rest/v1/customers?select=id,is_active,created_at&order=created_at.desc&limit=1000', {}, session.accessToken)
      ]);
      return json(response, 200, { summary: {
        customers: customers.filter(item => item.is_active).length,
        requests: requests.length, newRequests: requests.filter(item => item.status === 'new').length,
        quotations: quotations.length, pendingQuotations: quotations.filter(item => ['draft', 'sent'].includes(item.status)).length,
        invoices: invoices.length, outstandingBalance: invoices.reduce((sum, item) => sum + Number(item.balance || 0), 0)
      }, recentRequests: requests.slice(0, 5) });
    }

    if (route === '/customers' && request.method === 'GET') {
      const session = await requireSession(request, response); if (!session) return;
      const customers = await restJson('/rest/v1/customers?select=*&order=created_at.desc&limit=500', {}, session.accessToken);
      return json(response, 200, { customers });
    }

    if (route === '/customer-create' && request.method === 'POST') {
      const session = await requireSession(request, response); if (!session) return;
      const body = await readBody(request); const name = bounded(body.name, 160); const phone = bounded(body.phone, 30);
      const email = bounded(body.email, 254).toLowerCase();
      if (name.length < 2 || phone.length < 8 || (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) return json(response, 400, { error: 'Enter a valid customer name, phone number and email address.' });
      const rows = await restJson('/rest/v1/customers', { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify({
        customer_type: body.customerType === 'individual' ? 'individual' : 'company', name, phone, email: email || null,
        contact_person: bounded(body.contactPerson, 120) || null, billing_address: bounded(body.billingAddress, 1000) || null,
        service_address: bounded(body.serviceAddress, 1000) || null, notes: bounded(body.notes, 2000) || null, created_by: session.user.id
      }) }, session.accessToken);
      await audit(session, 'create', 'customers', rows[0]?.id, rows[0]?.customer_code, { name });
      return json(response, 201, { customer: rows[0] });
    }

    if (route === '/requests' && request.method === 'GET') {
      const session = await requireSession(request, response); if (!session) return;
      const requests = await restJson('/rest/v1/quotation_requests?select=*&order=created_at.desc&limit=500', {}, session.accessToken);
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
      const quotations = await restJson('/rest/v1/quotations?select=id,quotation_number,quotation_date,expiry_date,status,project_title,grand_total,customer_snapshot,created_at&order=created_at.desc&limit=500', {}, session.accessToken);
      const customers = await restJson('/rest/v1/customers?select=id,name,phone,email,contact_person&is_active=eq.true&order=name.asc&limit=500', {}, session.accessToken);
      return json(response, 200, { quotations, customers });
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

    if (route === '/document-status' && request.method === 'POST') {
      const session=await requireSession(request,response); if(!session)return;
      const body=await readBody(request); const id=bounded(body.id,80); const kind=bounded(body.kind,20); const nextStatus=bounded(body.status,30);
      const allowed={quotation:['draft','sent','accepted','rejected','expired','converted_to_invoice','cancelled'],invoice:['draft','unpaid','partially_paid','paid','overdue','cancelled']};
      if(!/^[0-9a-f-]{36}$/i.test(id)||!allowed[kind]?.includes(nextStatus)) return json(response,400,{error:'Invalid document status update.'});
      const table=kind==='quotation'?'quotations':'invoices';
      const rows=await restJson(`/rest/v1/${table}?id=eq.${encodeURIComponent(id)}`,{method:'PATCH',headers:{Prefer:'return=representation'},body:JSON.stringify({status:nextStatus})},session.accessToken);
      await audit(session,'status_change',table,id,kind==='quotation'?rows[0]?.quotation_number:rows[0]?.invoice_number,{status:nextStatus});
      return json(response,200,{document:rows[0]});
    }

    if (route === '/payments' && request.method === 'GET') {
      const session = await requireSession(request, response); if (!session) return;
      const payments = await restJson('/rest/v1/payments?select=id,payment_date,amount,payment_method,transaction_reference,notes,created_at,invoices(invoice_number,customer_snapshot)&order=created_at.desc&limit=500', {}, session.accessToken);
      const invoices = await restJson('/rest/v1/invoices?select=id,invoice_number,customer_id,balance,customer_snapshot&balance=gt.0&status=neq.cancelled&order=created_at.desc&limit=500', {}, session.accessToken);
      return json(response,200,{payments,invoices});
    }

    if (route === '/payment-create' && request.method === 'POST') {
      const session = await requireSession(request, response); if (!session) return;
      const body=await readBody(request); const invoiceId=bounded(body.invoiceId,80); const amount=Number(body.amount); const date=bounded(body.paymentDate,10); const method=bounded(body.paymentMethod,30);
      if(!/^[0-9a-f-]{36}$/i.test(invoiceId)||!validDate(date)||!(amount>0)||!['bank_transfer','cash','duitnow','cheque','other'].includes(method)) return json(response,400,{error:'Enter valid payment details.'});
      const invoices=await restJson(`/rest/v1/invoices?id=eq.${encodeURIComponent(invoiceId)}&select=id,invoice_number,customer_id,balance&limit=1`,{},session.accessToken); const invoice=invoices[0];
      if(!invoice||amount>Number(invoice.balance)) return json(response,400,{error:'Payment exceeds the invoice balance or the invoice was not found.'});
      const paymentRows=await restJson('/rest/v1/payments',{method:'POST',headers:{Prefer:'return=representation'},body:JSON.stringify({invoice_id:invoice.id,customer_id:invoice.customer_id,payment_date:date,amount,payment_method:method,transaction_reference:bounded(body.reference,120)||null,notes:bounded(body.notes,1000)||null,recorded_by:session.user.id})},session.accessToken); const payment=paymentRows[0];
      const receiptNumber=await restJson('/rest/v1/rpc/next_document_number',{method:'POST',body:JSON.stringify({kind:'receipt',issue_date:date})},session.accessToken); const remaining=Math.max(0,Number(invoice.balance)-amount);
      const receiptRows=await restJson('/rest/v1/receipts',{method:'POST',headers:{Prefer:'return=representation'},body:JSON.stringify({receipt_number:String(receiptNumber),payment_id:payment.id,invoice_id:invoice.id,customer_id:invoice.customer_id,amount_received:amount,remaining_balance:remaining,prepared_by:session.user.id})},session.accessToken);
      await audit(session,'create','payments',payment.id,invoice.invoice_number,{amount,method});
      return json(response,201,{payment,receipt:receiptRows[0]});
    }

    if (route === '/receipts' && request.method === 'GET') {
      const session = await requireSession(request, response); if (!session) return;
      const receipts=await restJson('/rest/v1/receipts?select=id,receipt_number,amount_received,remaining_balance,created_at,invoices(invoice_number,customer_snapshot),payments(payment_method,transaction_reference,payment_date)&order=created_at.desc&limit=500',{},session.accessToken);
      return json(response,200,{receipts});
    }

    if (route === '/settings' && request.method === 'GET') { const session=await requireSession(request,response); if(!session)return; const rows=await restJson('/rest/v1/company_settings?select=*&limit=1',{},session.accessToken); return json(response,200,{settings:rows[0]||{}}); }
    if (route === '/settings-update' && request.method === 'POST') { const session=await requireSession(request,response); if(!session||!requireAdmin(session,response))return; const b=await readBody(request); const payload={company_name:bounded(b.companyName,160),registration_number:bounded(b.registrationNumber,80)||null,business_address:bounded(b.businessAddress,1000)||null,phone:bounded(b.phone,30)||null,email:bounded(b.email,254)||null,website:bounded(b.website,300)||null,bank_name:bounded(b.bankName,120)||null,bank_account_name:bounded(b.bankAccountName,160)||null,bank_account_number:bounded(b.bankAccountNumber,80)||null,default_quotation_validity_days:Math.max(1,Math.min(365,Number(b.quotationDays)||14)),default_invoice_payment_days:Math.max(0,Math.min(365,Number(b.invoiceDays)||30)),default_terms:bounded(b.defaultTerms,5000)||null,tax_enabled:Boolean(b.taxEnabled),default_tax_percent:Math.max(0,Math.min(100,Number(b.taxPercent)||0)),updated_by:session.user.id}; if(payload.company_name.length<2)return json(response,400,{error:'Company name is required.'}); const rows=await restJson('/rest/v1/company_settings?id=eq.true',{method:'PATCH',headers:{Prefer:'return=representation'},body:JSON.stringify(payload)},session.accessToken); await audit(session,'update','settings',null,null,{companyName:payload.company_name}); return json(response,200,{settings:rows[0]}); }

    if (route === '/users' && request.method === 'GET') { const session=await requireSession(request,response); if(!session||!requireAdmin(session,response))return; const users=await restJson('/rest/v1/profiles?select=id,full_name,role,is_active,created_at,updated_at&order=created_at.asc&limit=100',{},session.accessToken); return json(response,200,{users}); }
    if (route === '/user-update' && request.method === 'POST') { const session=await requireSession(request,response); if(!session||!requireAdmin(session,response))return; const b=await readBody(request); const id=bounded(b.id,80); const roleValue=bounded(b.role,10); if(!/^[0-9a-f-]{36}$/i.test(id)||!['admin','staff'].includes(roleValue))return json(response,400,{error:'Invalid staff update.'}); if(id===session.user.id&&!b.isActive)return json(response,400,{error:'You cannot deactivate your own account.'}); const rows=await restJson(`/rest/v1/profiles?id=eq.${encodeURIComponent(id)}`,{method:'PATCH',headers:{Prefer:'return=representation'},body:JSON.stringify({role:roleValue,is_active:Boolean(b.isActive)})},session.accessToken); await audit(session,'update','users',id,null,{role:roleValue,isActive:Boolean(b.isActive)}); return json(response,200,{user:rows[0]}); }
    if (route === '/audit' && request.method === 'GET') { const session=await requireSession(request,response); if(!session||!requireAdmin(session,response))return; const logs=await restJson('/rest/v1/audit_logs?select=id,occurred_at,action,module,record_id,record_number,new_value,profiles(full_name)&order=occurred_at.desc&limit=500',{},session.accessToken); return json(response,200,{logs}); }

    if (route === '/invoices' && request.method === 'GET') {
      const session = await authenticatedSession(parseCookies(request.headers?.cookie));
      if (!session) return json(response, 401, { error: 'Authentication is required.' }, { 'Set-Cookie': clearCookies() });
      const invoices = await restJson('/rest/v1/invoices?select=id,invoice_number,invoice_date,due_date,status,project_title,grand_total,amount_paid,balance,customer_snapshot,created_at&order=created_at.desc&limit=100', {}, session.accessToken);
      const settings = await restJson('/rest/v1/company_settings?select=*&limit=1', {}, session.accessToken);
      return json(response, 200, { invoices, settings: settings[0] || null });
    }

    if (route === '/invoice-create' && request.method === 'POST') {
      const session = await authenticatedSession(parseCookies(request.headers?.cookie));
      if (!session) return json(response, 401, { error: 'Authentication is required.' }, { 'Set-Cookie': clearCookies() });
      const body = await readBody(request);
      const customerName = bounded(body.customerName, 160);
      const phone = bounded(body.customerPhone, 30);
      const email = bounded(body.customerEmail, 254).toLowerCase();
      const invoiceDate = bounded(body.invoiceDate, 10);
      const dueDate = bounded(body.dueDate, 10);
      const projectTitle = bounded(body.projectTitle, 200);
      const items = Array.isArray(body.items) ? body.items.slice(0, 50).map((item, index) => ({
        position: index + 1,
        description: bounded(item.description, 500),
        quantity: Number(item.quantity),
        unit_price: Number(item.unitPrice)
      })) : [];
      if (customerName.length < 2 || phone.length < 8 || !validDate(invoiceDate) || !validDate(dueDate) || dueDate < invoiceDate || projectTitle.length < 2 || !items.length || items.some(item => !item.description || !(item.quantity > 0) || !(item.unit_price >= 0))) {
        return json(response, 400, { error: 'Complete the required customer, date, project and invoice-item fields.' });
      }
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json(response, 400, { error: 'Enter a valid customer email address.' });
      const subtotal = Math.round(items.reduce((sum, item) => sum + item.quantity * item.unit_price, 0) * 100) / 100;
      const discountAmount = Math.max(0, Math.min(subtotal, Number(body.discountAmount) || 0));
      const taxPercent = Math.max(0, Math.min(100, Number(body.taxPercent) || 0));
      const otherCharges = Math.max(0, Number(body.otherCharges) || 0);
      const grandTotal = Math.round(((subtotal - discountAmount) * (1 + taxPercent / 100) + otherCharges) * 100) / 100;

      const customerRows = await restJson('/rest/v1/customers', {
        method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify({
          customer_type: body.customerType === 'individual' ? 'individual' : 'company', name: customerName,
          contact_person: bounded(body.contactPerson, 120) || null, phone, email: email || null,
          billing_address: bounded(body.customerAddress, 1000) || null, service_address: bounded(body.customerAddress, 1000) || null,
          created_by: session.user.id
        })
      }, session.accessToken);
      const customer = customerRows[0];
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
            customer_snapshot: { name: customerName, contactPerson: bounded(body.contactPerson, 120), phone, email, address: bounded(body.customerAddress, 1000) },
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
        return json(response, 201, { invoice: { ...invoice, customer_snapshot: { name: customerName }, invoice_number: invoiceNumber } });
      } catch (error) {
        if (customer?.id) await supabaseFetch(`/rest/v1/customers?id=eq.${encodeURIComponent(customer.id)}`, { method: 'DELETE' }, session.accessToken).catch(() => {});
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
