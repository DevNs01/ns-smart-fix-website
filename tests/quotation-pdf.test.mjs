import assert from 'node:assert/strict';
import test from 'node:test';
import { buildQuotationPdf, quotationEmail } from '../api/quotation-pdf.js';

const bundle = {
  settings: {
    company_name: 'NS Smart Fix Solution', registration_number: 'REG-123',
    business_address: 'Kuala Lumpur', phone: '0162119969', email: 'admin@nssmartfixsolution.com',
    website: 'https://nssmartfixsolution.com', bank_name: 'Example Bank',
    bank_account_name: 'NS Smart Fix Solution', bank_account_number: '1234567890',
    default_terms: 'Payment is due as agreed.'
  },
  quotation: {
    quotation_number: 'NSS-QT-202609-001', quotation_date: '2026-09-11', expiry_date: '2026-09-25',
    project_title: 'Network installation', project_location: 'Kuala Lumpur', description: 'Office installation',
    customer_snapshot: { name: 'Example Customer', contact_person: 'Ahmad', phone: '0123456789', email: 'customer@example.com' },
    subtotal: 1000, discount_amount: 0, tax_percent: 0, other_charges: 0, grand_total: 1000
  },
  items: [{ description: 'CAT6 cabling and installation', quantity: 2, unit_price: 500, line_total: 1000 }]
};

test('quotation PDF is a valid non-empty PDF document', () => {
  const pdf = buildQuotationPdf(bundle);
  assert.equal(Buffer.isBuffer(pdf), true);
  assert.equal(pdf.subarray(0, 5).toString(), '%PDF-');
  assert.ok(pdf.length > 1000);
  assert.match(pdf.toString('latin1'), /%%EOF$/);
});

test('customer email contains the confirmed financial summary without scripts', () => {
  const email = quotationEmail({ ...bundle, quotation: { ...bundle.quotation, project_title: '<script>alert(1)</script>' } });
  assert.match(email.subject, /NSS-QT-202609-001/);
  assert.match(email.text, /RM 1,000\.00/);
  assert.doesNotMatch(email.html, /<script>/);
  assert.match(email.html, /&lt;script&gt;/);
});
