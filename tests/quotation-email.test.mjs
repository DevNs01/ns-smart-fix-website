import test from 'node:test';
import assert from 'node:assert/strict';
import quotationHandler, { buildCustomerEmail, buildEmail, validatePayload } from '../api/quotation.js';

const validPayload = {
  fullName: 'Nur Aina', company: 'Aina Trading', phone: '012-345 6789',
  email: 'aina@example.com', customerType: 'Office', services: ['network', 'server'],
  location: 'Kuala Lumpur', visitDate: '2026-08-01', contactMethod: 'WhatsApp',
  description: 'Install network cabling and a server rack.', budget: 'RM5,000 – RM20,000',
  urgency: 'Standard', files: ['floor-plan.pdf'], agree: true
};

test('quotation payload validation rejects invalid or unconsented requests', () => {
  assert.equal(validatePayload(validPayload), '');
  assert.match(validatePayload({ ...validPayload, phone: '12' }), /phone/i);
  assert.match(validatePayload({ ...validPayload, agree: false }), /consent/i);
  assert.match(validatePayload({ ...validPayload, services: ['invalid'] }), /service/i);
});

test('formatted quotation email includes details and escapes customer HTML', () => {
  const { html, plain } = buildEmail({ ...validPayload, description: '<script>alert(1)</script>' }, 'NSQ-TEST-123');
  assert.match(html, /NSQ-TEST-123/);
  assert.match(html, /Network Cabling, Server Setup/);
  assert.doesNotMatch(html, /<script>/i);
  assert.match(html, /&lt;script&gt;/);
  assert.match(plain, /Nur Aina/);
  assert.match(plain, /floor-plan\.pdf/);
});

test('customer acknowledgement includes reference, submitted details, response time, contacts and website', () => {
  const { html, plain, subject } = buildCustomerEmail(validPayload, 'NSQ-TEST-456');
  assert.match(subject, /NSQ-TEST-456/);
  assert.match(html, /We Have Received Your Request/);
  assert.match(html, /within 1 business day/);
  assert.match(html, /Network Cabling, Server Setup/);
  assert.match(html, /016-411 0681/);
  assert.match(html, /012-885 1681/);
  assert.match(html, /https:\/\/wa\.me\/60164110681/);
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
  globalThis.fetch = async (_url, options) => {
    requests.push(JSON.parse(options.body));
    return { ok:true, status:200 };
  };
  try {
    const response = responseRecorder();
    await quotationHandler({ method:'POST', headers:{}, body:validPayload }, response);
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
  console.error = () => {};
  globalThis.fetch = async () => {
    delivery += 1;
    return delivery === 1 ? { ok:true, status:200 } : { ok:false, status:503 };
  };
  try {
    const response = responseRecorder();
    await quotationHandler({ method:'POST', headers:{}, body:validPayload }, response);
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
