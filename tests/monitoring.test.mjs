import test from 'node:test';
import assert from 'node:assert/strict';
import healthHandler from '../api/health.js';
import monitorHandler from '../api/monitor.js';
import {
  emitMonitoringEvent, resetMonitoringState, safePath, sendMonitoringAlert
} from '../api/monitoring.js';

function responseRecorder() {
  return {
    statusCode: 0, payload: null, headers: {},
    setHeader(name, value) { this.headers[name] = value; },
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.payload = payload; return this; }
  };
}

test('monitoring sanitizes routes and excludes arbitrary customer data', () => {
  const originalInfo = console.info;
  let logged = '';
  console.info = value => { logged = value; };
  try {
    const event = emitMonitoringEvent('quotation_submission_completed', 'info', {
      route: '/quotation?email=customer@example.com#private',
      status: 200,
      durationMs: 412,
      customerName: 'Private Customer',
      phone: '0123456789',
      description: 'Private quotation details'
    });
    assert.equal(event.route, '/quotation');
    assert.equal(event.status, 200);
    assert.equal(event.durationMs, 412);
    assert.doesNotMatch(logged, /customer@example|Private Customer|0123456789|Private quotation/);
    assert.equal(safePath('https://example.com/contact?email=private@example.com'), '/contact');
  } finally {
    console.info = originalInfo;
  }
});

test('email alerts contain operational metadata only', async () => {
  const originalKey = process.env.RESEND_API_KEY;
  const originalError = console.error;
  process.env.RESEND_API_KEY = 'test-key';
  console.error = () => {};
  resetMonitoringState();
  let request;
  try {
    const result = await sendMonitoringAlert({
      category: 'email_delivery_failed',
      severity: 'critical',
      details: {
        route: '/api/quotation?email=private@example.com',
        stage: 'admin_email',
        status: 503,
        customerEmail: 'private@example.com',
        message: 'Sensitive form contents'
      }
    }, async (_url, options) => {
      request = JSON.parse(options.body);
      return { ok: true, status: 200 };
    });
    assert.equal(result.emailed, true);
    assert.deepEqual(request.to, ['admin@nssmartfixsolution.com']);
    assert.match(request.text, /admin_email/);
    assert.match(request.text, /operational metadata only/);
    assert.doesNotMatch(JSON.stringify(request), /private@example|Sensitive form contents/);
  } finally {
    console.error = originalError;
    if (originalKey === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = originalKey;
  }
});

test('health endpoint reports readiness without returning secrets', () => {
  const originalResend = process.env.RESEND_API_KEY;
  const originalTurnstile = process.env.TURNSTILE_SECRET_KEY;
  process.env.RESEND_API_KEY = 'private-resend-key';
  process.env.TURNSTILE_SECRET_KEY = 'private-turnstile-secret';
  try {
    const response = responseRecorder();
    healthHandler({ method: 'GET' }, response);
    assert.equal(response.statusCode, 200);
    assert.equal(response.payload.ok, true);
    assert.equal(response.payload.checks.emailServiceConfigured, true);
    assert.equal(response.payload.checks.turnstileConfigured, true);
    assert.doesNotMatch(JSON.stringify(response.payload), /private-resend-key|private-turnstile-secret/);
  } finally {
    if (originalResend === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = originalResend;
    if (originalTurnstile === undefined) delete process.env.TURNSTILE_SECRET_KEY;
    else process.env.TURNSTILE_SECRET_KEY = originalTurnstile;
  }
});

test('browser error reporter accepts only bounded event categories', async () => {
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.RESEND_API_KEY;
  const originalError = console.error;
  delete process.env.RESEND_API_KEY;
  console.error = () => {};
  globalThis.fetch = async () => ({ ok: true, status: 200 });
  try {
    const accepted = responseRecorder();
    await monitorHandler({
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': '203.0.113.80' },
      body: { type: 'javascript_error', page: '/services?customer=private' }
    }, accepted);
    assert.equal(accepted.statusCode, 202);

    const rejected = responseRecorder();
    await monitorHandler({
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': '203.0.113.81' },
      body: { type: 'customer_message', page: '/', message: 'private' }
    }, rejected);
    assert.equal(rejected.statusCode, 400);
  } finally {
    globalThis.fetch = originalFetch;
    console.error = originalError;
    if (originalKey === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = originalKey;
  }
});

test('scheduled uptime endpoint requires the Vercel cron secret', async () => {
  const originalSecret = process.env.CRON_SECRET;
  process.env.CRON_SECRET = 'test-cron-secret';
  try {
    const response = responseRecorder();
    await monitorHandler({ method: 'GET', headers: { authorization: 'Bearer incorrect' } }, response);
    assert.equal(response.statusCode, 401);
  } finally {
    if (originalSecret === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = originalSecret;
  }
});

