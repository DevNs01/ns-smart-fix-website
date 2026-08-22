import test from 'node:test';
import assert from 'node:assert/strict';
import quotationHandler, {
  buildCustomerEmail, buildEmail, checkDuplicate, checkRateLimit, resetProtectionStores,
  validatePayload, verifyTurnstile
} from '../api/quotation.js';

const validPayload = {
  fullName: 'Nur Aina', company: 'Aina Trading', phone: '012-345 6789',
  email: 'aina@example.com', customerType: 'Office', services: ['network', 'server'],
  location: 'Kuala Lumpur', visitDate: '2099-08-01', contactMethod: 'WhatsApp',
  description: 'Install network cabling and a server rack.', budget: 'RM5,000 – RM20,000',
  urgency: 'Standard', files: ['floor-plan.pdf'], agree: true, language:'en',
  turnstileToken:'test-turnstile-token'
};

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

test('request throttling blocks excessive submissions per IP', () => {
  resetProtectionStores();
  const now = Date.now();
  for (let index = 0; index < 5; index += 1) {
    assert.equal(checkRateLimit('203.0.113.20',now + index).allowed,true);
  }
  const blocked = checkRateLimit('203.0.113.20',now + 6);
  assert.equal(blocked.allowed,false);
  assert.ok(blocked.retryAfter > 0);
  assert.equal(checkRateLimit('203.0.113.21',now + 6).allowed,true);
});

test('duplicate detection normalizes repeated form submissions', () => {
  resetProtectionStores();
  const now = Date.now();
  assert.equal(checkDuplicate(validPayload,'203.0.113.30',now),false);
  assert.equal(checkDuplicate({...validPayload,fullName:'  NUR AINA  '},'203.0.113.30',now + 1000),true);
  assert.equal(checkDuplicate({...validPayload,phone:'0199999999'},'203.0.113.30',now + 1000),false);
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
  assert.match(html, /012-885 1681/);
  assert.equal((html.match(/012-885 1681/g) || []).length, 1);
  assert.match(html, /https:\/\/wa\.me\/60128851681/);
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
  const requests = [];
  process.env.RESEND_API_KEY = 'test-key';
  resetProtectionStores();
  globalThis.fetch = async (_url, options) => {
    requests.push(JSON.parse(options.body));
    return { ok:true, status:200 };
  };
  try {
    const response = responseRecorder();
    await quotationHandler({ method:'POST', headers:{'x-forwarded-for':'203.0.113.40','content-type':'application/json'}, body:validPayload }, response);
    assert.equal(response.statusCode, 200);
    assert.equal(response.payload.acknowledgementSent, true);
    assert.equal(requests.length, 2);
    assert.deepEqual(requests[0].to, ['admin@nssmartfixsolution.com']);
    assert.deepEqual(requests[1].to, ['aina@example.com']);
    assert.equal(requests[1].reply_to, 'admin@nssmartfixsolution.com');
    assert.match(requests[1].subject, /Quotation Request Confirmation/);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = originalKey;
  }
});

test('customer acknowledgement failure does not lose the successful admin enquiry', async () => {
  const originalFetch = globalThis.fetch;
  const originalError = console.error;
  const originalKey = process.env.RESEND_API_KEY;
  let delivery = 0;
  process.env.RESEND_API_KEY = 'test-key';
  resetProtectionStores();
  console.error = () => {};
  globalThis.fetch = async () => {
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
    console.error = originalError;
    if (originalKey === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = originalKey;
  }
});
