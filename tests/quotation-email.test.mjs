import test from 'node:test';
import assert from 'node:assert/strict';
import quotationHandler, {
  buildCustomerEmail, buildEmail, checkDuplicate, checkRateLimit, resetProtectionStores,
  validatePayload, verifyTurnstile
} from '../api/quotation.js';
import { sharedBudgetKey } from '../api/monitoring.js';

const validPayload = {
  fullName: 'Nur Aina', company: 'Aina Trading', phone: '012-345 6789',
  email: 'aina@example.com', customerType: 'Office', services: ['network', 'server'],
  location: 'Kuala Lumpur', visitDate: '2099-08-01', contactMethod: 'WhatsApp',
  description: 'Install network cabling and a server rack.', budget: 'RM5,000 – RM20,000',
  urgency: 'Standard', files: ['floor-plan.pdf'], agree: true, language:'en',
  turnstileToken:'test-turnstile-token'
};

function sharedBudgetFetch(store = new Map()) {
  return async (url, options = {}) => {
    if (String(url).includes('/consume_service_rate_limit')) {
      const body = JSON.parse(options.body);
      const count = (store.get(body.p_key_hash) || 0) + 1;
      store.set(body.p_key_hash, count);
      return {
        ok:true,
        json:async () => [{
          allowed:count <= body.p_limit,
          remaining:Math.max(0, body.p_limit - count),
          retry_after:count <= body.p_limit ? 0 : body.p_window_seconds
        }]
      };
    }
    if (String(url).includes('/service_rate_limits?')) {
      const keyHash = decodeURIComponent(String(url).split('key_hash=eq.')[1] || '');
      store.delete(keyHash);
      return { ok:true, status:204 };
    }
    throw new Error(`Unexpected shared-budget request: ${url}`);
  };
}

function setSharedSecurityEnv() {
  const original = {
    url:process.env.SUPABASE_URL,
    key:process.env.SUPABASE_SERVICE_ROLE_KEY
  };
  process.env.SUPABASE_URL = 'https://example-project.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-secret-key';
  return () => {
    if (original.url === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = original.url;
    if (original.key === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = original.key;
  };
}

test('quotation payload validation rejects invalid or unconsented requests', () => {
  assert.equal(validatePayload(validPayload), '');
  assert.match(validatePayload({ ...validPayload, phone: '12' }), /phone/i);
  assert.match(validatePayload({ ...validPayload, agree: false }), /consent/i);
  assert.match(validatePayload({ ...validPayload, services: ['invalid'] }), /service/i);
  assert.match(validatePayload({ ...validPayload, turnstileToken: '' }), /security/i);
  assert.match(validatePayload({ ...validPayload, visitDate: '2020-01-01' }), /visit date/i);
  assert.match(validatePayload({ ...validPayload, files:['malware.exe'] }), /file/i);
});

test('Turnstile verification is performed server-side and fails closed', async () => {
  const originalSecret = process.env.TURNSTILE_SECRET_KEY;
  process.env.TURNSTILE_SECRET_KEY = 'test-secret';
  const requests = [];
  try {
    const accepted = await verifyTurnstile('valid-token','203.0.113.10',async (url,options) => {
      requests.push({url,options});
      return {ok:true,json:async () => ({success:true})};
    });
    const rejected = await verifyTurnstile('bad-token','203.0.113.10',async () => ({
      ok:true,json:async () => ({success:false,'error-codes':['invalid-input-response']})
    }));
    const unavailable = await verifyTurnstile('valid-token','203.0.113.10',async () => { throw new Error('offline'); });
    assert.equal(accepted,true);
    assert.equal(rejected,false);
    assert.equal(unavailable,false);
    assert.match(requests[0].url,/turnstile\/v0\/siteverify/);
    assert.match(String(requests[0].options.body),/secret=test-secret/);
    assert.match(String(requests[0].options.body),/response=valid-token/);
    assert.doesNotMatch(JSON.stringify(requests),/Authorization/);
  } finally {
    if (originalSecret === undefined) delete process.env.TURNSTILE_SECRET_KEY;
    else process.env.TURNSTILE_SECRET_KEY = originalSecret;
  }
});

test('request throttling blocks excessive submissions across shared state', async () => {
  const restoreEnv = setSharedSecurityEnv();
  const fetchImpl = sharedBudgetFetch();
  try {
    for (let index = 0; index < 5; index += 1) {
      assert.equal((await checkRateLimit('203.0.113.20', fetchImpl)).allowed,true);
    }
    const blocked = await checkRateLimit('203.0.113.20', fetchImpl);
    assert.equal(blocked.allowed,false);
    assert.ok(blocked.retryAfter > 0);
    assert.equal((await checkRateLimit('203.0.113.21', fetchImpl)).allowed,true);
  } finally {
    restoreEnv();
  }
});

test('duplicate detection normalizes repeated form submissions in shared state', async () => {
  const restoreEnv = setSharedSecurityEnv();
  const fetchImpl = sharedBudgetFetch();
  try {
    assert.equal(await checkDuplicate(validPayload,'203.0.113.30',fetchImpl),false);
    assert.equal(await checkDuplicate({...validPayload,fullName:'  NUR AINA  '},'203.0.113.30',fetchImpl),true);
    assert.equal(await checkDuplicate({...validPayload,phone:'0199999999'},'203.0.113.30',fetchImpl),false);
  } finally {
    restoreEnv();
  }
});

test('formatted quotation email includes details and escapes customer HTML', () => {
  const { html, plain } = buildEmail({ ...validPayload, description: '<script>alert(1)</script>' }, 'NSQ-TEST-123');
  assert.match(html, /NSQ-TEST-123/);
  assert.match(html, /Network Cabling, Server Setup/);
  assert.match(html, /ns-smart-fix-logo-transparent\.png/);
  assert.match(html, /alt="NS Smart Fix Solution"/);
  assert.doesNotMatch(html, /<script>/i);
  assert.match(html, /&lt;script&gt;/);
  assert.match(plain, /Nur Aina/);
  assert.match(plain, /floor-plan\.pdf/);
});

test('web design is accepted and formatted as a quotation service', () => {
  const payload = { ...validPayload, services: ['webdesign'] };
  assert.equal(validatePayload(payload), '');
  assert.match(buildEmail(payload, 'NSQ-WEB-001').html, /Web Design &amp; Development/);
  assert.match(buildCustomerEmail({ ...payload, language:'bm' }, 'NSQ-WEB-002').html, /Reka Bentuk &amp; Pembangunan Laman Web/);
});

test('customer acknowledgement includes reference, submitted details, response time, contacts and website', () => {
  const { html, plain, subject } = buildCustomerEmail(validPayload, 'NSQ-TEST-456');
  assert.match(subject, /NSQ-TEST-456/);
  assert.match(html, /We Have Received Your Request/);
  assert.match(html, /within 1 business day/);
  assert.match(html, /Network Cabling, Server Setup/);
  assert.match(html, /ns-smart-fix-logo-transparent\.png/);
  assert.match(html, /alt="NS Smart Fix Solution"/);
  assert.match(html, /016-211 9969/);
  assert.equal((html.match(/016-211 9969/g) || []).length, 1);
  assert.match(html, /https:\/\/wa\.me\/60162119969/);
  assert.doesNotMatch(html, /Nasarudin|016-411 0681/);
  assert.match(html, /https:\/\/nssmartfixsolution\.com/);
  assert.match(plain, /Install network cabling and a server rack\./);
});

test('Bahasa Melayu acknowledgement uses translated customer-facing content', () => {
  const { html, plain, subject } = buildCustomerEmail({ ...validPayload, language:'bm' }, 'NSQ-TEST-789');
  assert.match(subject, /Pengesahan Permohonan Sebut Harga/);
  assert.match(html, /Permohonan Anda Telah Diterima/);
  assert.match(html, /dalam tempoh 1 hari bekerja/);
  assert.match(html, /Kabel Rangkaian, Pemasangan Server/);
  assert.match(plain, /Nombor Rujukan: NSQ-TEST-789/);
  assert.match(plain, /Layari Laman Web Kami/);
});

function responseRecorder() {
  return {
    statusCode:0, payload:null, headers:{},
    setHeader(name, value) { this.headers[name] = value; },
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.payload = payload; return this; }
  };
}

test('successful quotation sends the admin email before the customer acknowledgement', async () => {
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.RESEND_API_KEY;
  const restoreEnv = setSharedSecurityEnv();
  const budgetFetch = sharedBudgetFetch();
  const requests = [];
  const budgetBodies = [];
  process.env.RESEND_API_KEY = 'test-key';
  resetProtectionStores();
  globalThis.fetch = async (url, options) => {
    if (String(url).includes('/consume_service_rate_limit') || String(url).includes('/service_rate_limits?')) {
      if (String(url).includes('/consume_service_rate_limit')) budgetBodies.push(JSON.parse(options.body));
      return budgetFetch(url, options);
    }
    if (String(url).includes('/rest/v1/quotation_requests')) return { ok:true, status:201 };
    requests.push(JSON.parse(options.body));
    return { ok:true, status:200 };
  };
  try {
    const response = responseRecorder();
    await quotationHandler({ method:'POST', headers:{'x-vercel-forwarded-for':'203.0.113.40','x-forwarded-for':'198.51.100.99','content-type':'application/json'}, body:validPayload }, response);
    assert.equal(response.statusCode, 200);
    assert.equal(response.payload.acknowledgementSent, true);
    assert.equal(requests.length, 2);
    assert.equal(budgetBodies[0].p_key_hash, sharedBudgetKey('quotation-client', '203.0.113.40'));
    assert.notEqual(budgetBodies[0].p_key_hash, sharedBudgetKey('quotation-client', '198.51.100.99'));
    assert.match(budgetBodies[0].p_key_hash, /^[0-9a-f]{64}$/);
    assert.doesNotMatch(JSON.stringify(budgetBodies), /203\.0\.113\.40|Nur Aina|aina@example/);
    assert.deepEqual(requests[0].to, ['admin@nssmartfixsolution.com']);
    assert.deepEqual(requests[1].to, ['aina@example.com']);
    assert.equal(requests[1].reply_to, 'admin@nssmartfixsolution.com');
    assert.match(requests[1].subject, /Quotation Request Confirmation/);
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnv();
    if (originalKey === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = originalKey;
  }
});

test('customer acknowledgement failure does not lose the successful admin enquiry', async () => {
  const originalFetch = globalThis.fetch;
  const originalError = console.error;
  const originalKey = process.env.RESEND_API_KEY;
  const restoreEnv = setSharedSecurityEnv();
  const budgetFetch = sharedBudgetFetch();
  let delivery = 0;
  process.env.RESEND_API_KEY = 'test-key';
  resetProtectionStores();
  console.error = () => {};
  globalThis.fetch = async (url, options) => {
    if (String(url).includes('/consume_service_rate_limit') || String(url).includes('/service_rate_limits?')) {
      return budgetFetch(url, options);
    }
    if (String(url).includes('/rest/v1/quotation_requests')) return { ok:true, status:201 };
    delivery += 1;
    return delivery === 1 ? { ok:true, status:200 } : { ok:false, status:503 };
  };
  try {
    const response = responseRecorder();
    await quotationHandler({ method:'POST', headers:{'x-forwarded-for':'203.0.113.41','content-type':'application/json'}, body:validPayload }, response);
    assert.equal(response.statusCode, 200);
    assert.equal(response.payload.ok, true);
    assert.equal(response.payload.acknowledgementSent, false);
    assert.match(response.payload.reference, /^NSQ-/);
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnv();
    console.error = originalError;
    if (originalKey === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = originalKey;
  }
});

test('quotation submission fails closed before email when the shared limiter is unavailable', async () => {
  const originalFetch = globalThis.fetch;
  const originalError = console.error;
  const originalKey = process.env.RESEND_API_KEY;
  const restoreEnv = setSharedSecurityEnv();
  let emailRequests = 0;
  process.env.RESEND_API_KEY = 'test-key';
  console.error = () => {};
  globalThis.fetch = async url => {
    if (String(url).includes('/consume_service_rate_limit')) throw new Error('database unavailable');
    emailRequests += 1;
    return { ok:true, status:200 };
  };
  try {
    const response = responseRecorder();
    await quotationHandler({ method:'POST', headers:{'x-vercel-forwarded-for':'203.0.113.50','content-type':'application/json'}, body:validPayload }, response);
    assert.equal(response.statusCode, 503);
    assert.equal(emailRequests, 0);
  } finally {
    globalThis.fetch = originalFetch;
    console.error = originalError;
    restoreEnv();
    if (originalKey === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = originalKey;
  }
});

test('failed admin email retains the shared duplicate reservation to prevent ambiguous retries', async () => {
  const originalFetch = globalThis.fetch;
  const originalError = console.error;
  const originalKey = process.env.RESEND_API_KEY;
  const restoreEnv = setSharedSecurityEnv();
  const budgetFetch = sharedBudgetFetch();
  let adminAttempts = 0;
  process.env.RESEND_API_KEY = 'test-key';
  console.error = () => {};
  globalThis.fetch = async (url, options = {}) => {
    if (String(url).includes('/consume_service_rate_limit')) return budgetFetch(url, options);
    if (String(url).includes('/rest/v1/quotation_requests')) return { ok:true, status:201 };
    if (String(url).includes('api.resend.com/emails')) {
      const body = JSON.parse(options.body);
      if (String(body.subject).startsWith('[NSQ-') && body.to?.includes('admin@nssmartfixsolution.com')) {
        adminAttempts += 1;
        return { ok:adminAttempts > 1, status:adminAttempts > 1 ? 200 : 503 };
      }
      return { ok:true, status:200 };
    }
    throw new Error(`Unexpected request: ${url}`);
  };
  try {
    const request = { method:'POST', headers:{'x-vercel-forwarded-for':'203.0.113.51','content-type':'application/json'}, body:validPayload };
    const first = responseRecorder();
    await quotationHandler(request, first);
    assert.equal(first.statusCode, 502);

    const second = responseRecorder();
    await quotationHandler(request, second);
    assert.equal(second.statusCode, 409);
    assert.equal(adminAttempts, 1);
  } finally {
    globalThis.fetch = originalFetch;
    console.error = originalError;
    restoreEnv();
    if (originalKey === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = originalKey;
  }
});
