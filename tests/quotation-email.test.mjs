import test from 'node:test';
import assert from 'node:assert/strict';
import { buildEmail, validatePayload } from '../api/quotation.js';

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
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /&lt;script&gt;/);
  assert.match(plain, /Nur Aina/);
  assert.match(plain, /floor-plan\.pdf/);
});
