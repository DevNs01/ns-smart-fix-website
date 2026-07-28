const MAX_BODY_BYTES = 24 * 1024;
const RECIPIENT = process.env.QUOTATION_TO_EMAIL || 'admin@nssmartfixsolution.com';
const SENDER = process.env.QUOTATION_FROM_EMAIL || 'NS Smart Fix Website <website@nssmartfixsolution.com>';
const SERVICE_LABELS = {
  electrical: 'Electrical Wiring', network: 'Network Cabling', server: 'Server Setup',
  product: 'IT Product Supply', tv: 'TV Bracket Installation', renovation: 'Minor Renovation',
  delivery: 'Delivery', troubleshoot: 'Troubleshooting'
};

function clean(value, max = 500) {
  return String(value || '').trim().replace(/[\u0000-\u001F\u007F]/g, ' ').slice(0, max);
}

function escapeHtml(value) {
  return clean(value, 3000).replaceAll('&', '&amp;').replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;');
}

function isEmail(value) {
  return !value || (value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value));
}

function isPhone(value) {
  const digits = String(value || '').replace(/\D/g, '');
  return digits.length >= 8 && digits.length <= 15;
}

function makeReference() {
  const stamp = new Date().toISOString().slice(0, 10).replaceAll('-', '');
  return `NSQ-${stamp}-${crypto.randomUUID().slice(0, 6).toUpperCase()}`;
}

export function validatePayload(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return 'Invalid request.';
  const fullName = clean(input.fullName, 100);
  const email = clean(input.email, 254);
  if (fullName.length < 2 || !/^[\p{L}\p{M} .'-]+$/u.test(fullName)) return 'A valid full name is required.';
  if (!isPhone(input.phone)) return 'A valid phone number is required.';
  if (!isEmail(email)) return 'The email address is invalid.';
  if (String(input.company || '').length > 120 || String(input.location || '').length > 250 || String(input.description || '').length > 2000) {
    return 'One or more fields exceed the allowed length.';
  }
  if (input.agree !== true) return 'Privacy consent is required.';
  if (input.services && (!Array.isArray(input.services) || input.services.some(key => !SERVICE_LABELS[key]))) return 'An invalid service was selected.';
  if (input.files && (!Array.isArray(input.files) || input.files.length > 5)) return 'An invalid file list was submitted.';
  return '';
}

function row(label, value) {
  return `<tr><th style="padding:10px 12px;text-align:left;vertical-align:top;background:#F5F7FA;border:1px solid #DDE5EE;width:190px;color:#0B1F33;">${escapeHtml(label)}</th><td style="padding:10px 12px;border:1px solid #DDE5EE;color:#374151;">${escapeHtml(value || 'Not provided')}</td></tr>`;
}

export function buildEmail(input, reference) {
  const services = (input.services || []).map(key => SERVICE_LABELS[key]).join(', ');
  const files = (input.files || []).map(name => clean(name, 120)).join(', ');
  const received = new Intl.DateTimeFormat('en-MY', {
    dateStyle: 'full', timeStyle: 'medium', timeZone: 'Asia/Kuala_Lumpur'
  }).format(new Date());
  const details = [
    ['Reference', reference], ['Received', received], ['Full Name', clean(input.fullName, 100)],
    ['Company', clean(input.company, 120)], ['Phone', clean(input.phone, 24)],
    ['Email', clean(input.email, 254)], ['Customer Type', clean(input.customerType, 60)],
    ['Services Required', services], ['Project Location', clean(input.location, 250)],
    ['Preferred Site Visit', clean(input.visitDate, 20)], ['Preferred Contact Method', clean(input.contactMethod, 40)],
    ['Budget Range', clean(input.budget, 80)], ['Urgency', clean(input.urgency, 50)],
    ['Selected File Names', files]
  ];
  const plain = [
    'NEW QUOTATION REQUEST', '', ...details.map(([label, value]) => `${label}: ${value || 'Not provided'}`),
    '', 'Description:', clean(input.description, 2000) || 'Not provided', '',
    'Note: Selected files are not attached to this email. Ask the customer to send them through WhatsApp if required.'
  ].join('\n');
  const html = `<!doctype html>
<html><body style="margin:0;background:#F5F7FA;font-family:Arial,sans-serif;color:#1F2937;">
<div style="max-width:720px;margin:0 auto;padding:28px 16px;">
<div style="background:#0B1F33;padding:24px;border-radius:14px 14px 0 0;">
<div style="color:#F59E0B;font-size:13px;font-weight:700;letter-spacing:.08em;">NS SMART FIX SOLUTION</div>
<h1 style="margin:8px 0 0;color:#FFFFFF;font-size:24px;">New Quotation Request</h1></div>
<div style="background:#FFFFFF;padding:24px;border:1px solid #DDE5EE;border-top:0;border-radius:0 0 14px 14px;">
<table style="width:100%;border-collapse:collapse;font-size:14px;">${details.map(([label, value]) => row(label, value)).join('')}</table>
<h2 style="font-size:16px;color:#0B1F33;margin:24px 0 8px;">Description of Requirement</h2>
<div style="white-space:pre-wrap;background:#F8FAFC;border:1px solid #DDE5EE;border-radius:8px;padding:14px;font-size:14px;line-height:1.6;">${escapeHtml(input.description || 'Not provided')}</div>
<p style="margin:20px 0 0;color:#64748B;font-size:12px;line-height:1.5;">Selected files are not attached automatically. If required, ask the customer to send them through WhatsApp.</p>
</div></div></body></html>`;
  return { html, plain };
}

export default async function handler(request, response) {
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST');
    return response.status(405).json({ error: 'Method not allowed.' });
  }
  if (!process.env.RESEND_API_KEY) return response.status(503).json({ error: 'Email service is not configured.' });
  if (Number(request.headers['content-length'] || 0) > MAX_BODY_BYTES) return response.status(413).json({ error: 'Request is too large.' });
  const payload = request.body;
  const validationError = validatePayload(payload);
  if (validationError) return response.status(400).json({ error: validationError });

  const reference = makeReference();
  const email = buildEmail(payload, reference);
  const replyTo = clean(payload.email, 254);
  const resendResponse = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: SENDER, to: [RECIPIENT],
      subject: `[${reference}] Quotation Request — ${clean(payload.fullName, 100)}`,
      html: email.html, text: email.plain, ...(replyTo ? { reply_to: replyTo } : {})
    })
  });
  if (!resendResponse.ok) {
    console.error('Quotation email delivery failed', resendResponse.status);
    return response.status(502).json({ error: 'Email delivery failed. Please try again.' });
  }
  return response.status(200).json({ ok: true, reference });
}
