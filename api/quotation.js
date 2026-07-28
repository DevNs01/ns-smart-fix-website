const MAX_BODY_BYTES = 24 * 1024;
const RECIPIENT = process.env.QUOTATION_TO_EMAIL || 'admin@nssmartfixsolution.com';
const SENDER = process.env.QUOTATION_FROM_EMAIL || 'NS Smart Fix Website <website@nssmartfixsolution.com>';
const WEBSITE_URL = 'https://nssmartfixsolution.com';
const WHATSAPP_URL = 'https://wa.me/60164110681';
const PRIMARY_PHONE = '016-411 0681';
const SECONDARY_PHONE = '012-885 1681';
const TURNSTILE_VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const RATE_LIMIT_MAX_REQUESTS = 5;
const DUPLICATE_WINDOW_MS = 10 * 60 * 1000;
const rateLimitStore = globalThis.__nsQuotationRateLimits || new Map();
const duplicateStore = globalThis.__nsQuotationDuplicates || new Map();
globalThis.__nsQuotationRateLimits = rateLimitStore;
globalThis.__nsQuotationDuplicates = duplicateStore;
const SERVICE_LABELS = {
  electrical: 'Electrical Wiring', network: 'Network Cabling', server: 'Server Setup',
  product: 'IT Product Supply', tv: 'TV Bracket Installation', renovation: 'Minor Renovation',
  delivery: 'Delivery', troubleshoot: 'Troubleshooting'
};
const SERVICE_LABELS_BM = {
  electrical:'Pendawaian Elektrik', network:'Kabel Rangkaian', server:'Pemasangan Server',
  product:'Pembekalan Produk IT', tv:'Pemasangan Pendakap TV', renovation:'Pengubahsuaian Kecil',
  delivery:'Penghantaran', troubleshoot:'Penyelesaian Masalah'
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

function clientIp(request) {
  const forwarded = String(request.headers?.['x-forwarded-for'] || '').split(',')[0].trim();
  return forwarded || String(request.headers?.['x-real-ip'] || request.socket?.remoteAddress || 'unknown').slice(0, 80);
}

function cleanupProtectionStores(now = Date.now()) {
  for (const [key, value] of rateLimitStore) {
    if (value.resetAt <= now) rateLimitStore.delete(key);
  }
  for (const [key, expiresAt] of duplicateStore) {
    if (expiresAt <= now) duplicateStore.delete(key);
  }
}

export function checkRateLimit(ip, now = Date.now()) {
  cleanupProtectionStores(now);
  const key = clean(ip, 80) || 'unknown';
  const current = rateLimitStore.get(key);
  if (!current || current.resetAt <= now) {
    rateLimitStore.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return { allowed: true, remaining: RATE_LIMIT_MAX_REQUESTS - 1, retryAfter: 0 };
  }
  current.count += 1;
  const retryAfter = Math.max(1, Math.ceil((current.resetAt - now) / 1000));
  return {
    allowed: current.count <= RATE_LIMIT_MAX_REQUESTS,
    remaining: Math.max(0, RATE_LIMIT_MAX_REQUESTS - current.count),
    retryAfter
  };
}

function duplicateFingerprint(input, ip) {
  const normalized = [
    clean(ip, 80).toLowerCase(),
    clean(input.fullName, 100).toLowerCase(),
    clean(input.phone, 24).replace(/\D/g, ''),
    clean(input.email, 254).toLowerCase(),
    [...(input.services || [])].sort().join(','),
    clean(input.description, 2000).toLowerCase().replace(/\s+/g, ' ')
  ].join('|');
  let hash = 2166136261;
  for (let index = 0; index < normalized.length; index += 1) {
    hash ^= normalized.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16);
}

export function checkDuplicate(input, ip, now = Date.now()) {
  cleanupProtectionStores(now);
  const fingerprint = duplicateFingerprint(input, ip);
  if ((duplicateStore.get(fingerprint) || 0) > now) return true;
  duplicateStore.set(fingerprint, now + DUPLICATE_WINDOW_MS);
  return false;
}

function releaseDuplicate(input, ip) {
  duplicateStore.delete(duplicateFingerprint(input, ip));
}

export function resetProtectionStores() {
  rateLimitStore.clear();
  duplicateStore.clear();
}

export async function verifyTurnstile(token, ip, fetchImpl = fetch) {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) return process.env.NODE_ENV !== 'production';
  const body = new URLSearchParams({
    secret,
    response: clean(token, 2048),
    remoteip: clean(ip, 80),
    idempotency_key: crypto.randomUUID()
  });
  try {
    const result = await fetchImpl(TURNSTILE_VERIFY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body
    });
    if (!result.ok) return false;
    const verification = await result.json();
    return verification.success === true;
  } catch {
    return false;
  }
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
  if (input.files?.some(name => clean(name, 120) !== String(name || '').trim() || !/\.(?:jpe?g|png|webp|pdf)$/i.test(name))) return 'An invalid file name was submitted.';
  if (input.language && !['en', 'bm'].includes(input.language)) return 'An invalid language was selected.';
  if (input.visitDate) {
    const visitDate = new Date(`${clean(input.visitDate, 20)}T00:00:00+08:00`);
    const today = new Date(new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kuala_Lumpur' }) + 'T00:00:00+08:00');
    if (Number.isNaN(visitDate.getTime()) || visitDate < today) return 'The preferred visit date is invalid.';
  }
  if (!clean(input.turnstileToken, 2048)) return 'Security verification is required.';
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

function customerRow(label, value, fallback) {
  return `<tr><th style="padding:10px 12px;text-align:left;vertical-align:top;background:#F5F7FA;border:1px solid #DDE5EE;width:190px;color:#0B1F33;">${escapeHtml(label)}</th><td style="padding:10px 12px;border:1px solid #DDE5EE;color:#374151;">${escapeHtml(value || fallback)}</td></tr>`;
}

export function buildCustomerEmail(input, reference) {
  const isBm = input.language === 'bm';
  const serviceLabels = isBm ? SERVICE_LABELS_BM : SERVICE_LABELS;
  const services = (input.services || []).map(key => serviceLabels[key]).join(', ');
  const files = (input.files || []).map(name => clean(name, 120)).join(', ');
  const fallback = isBm ? 'Tidak diberikan' : 'Not provided';
  const details = isBm
    ? [
        ['Nombor Rujukan', reference], ['Nama Penuh', clean(input.fullName, 100)],
        ['Syarikat', clean(input.company, 120)], ['Telefon', clean(input.phone, 24)],
        ['E-mel', clean(input.email, 254)], ['Jenis Pelanggan', clean(input.customerType, 60)],
        ['Perkhidmatan Diperlukan', services], ['Lokasi Projek', clean(input.location, 250)],
        ['Tarikh Lawatan Pilihan', clean(input.visitDate, 20)], ['Kaedah Hubungan Pilihan', clean(input.contactMethod, 40)],
        ['Julat Bajet', clean(input.budget, 80)], ['Tahap Keutamaan', clean(input.urgency, 50)],
        ['Nama Fail Dipilih', files]
      ]
    : [
        ['Reference Number', reference], ['Full Name', clean(input.fullName, 100)],
        ['Company', clean(input.company, 120)], ['Phone', clean(input.phone, 24)],
        ['Email', clean(input.email, 254)], ['Customer Type', clean(input.customerType, 60)],
        ['Services Required', services], ['Project Location', clean(input.location, 250)],
        ['Preferred Site Visit', clean(input.visitDate, 20)], ['Preferred Contact Method', clean(input.contactMethod, 40)],
        ['Budget Range', clean(input.budget, 80)], ['Urgency', clean(input.urgency, 50)],
        ['Selected File Names', files]
      ];
  const copy = isBm
    ? {
        subject:`[${reference}] Pengesahan Permohonan Sebut Harga`,
        eyebrow:'NS SMART FIX SOLUTION',
        title:'Permohonan Anda Telah Diterima',
        greeting:`Salam ${clean(input.fullName, 100)},`,
        intro:'Terima kasih kerana menghubungi NS Smart Fix Solution. Kami telah menerima permohonan anda dan pasukan kami akan menyemak butiran yang diberikan.',
        response:'Jangkaan masa respons: dalam tempoh 1 hari bekerja, pada waktu operasi Isnin hingga Sabtu, 9:00 pagi hingga 6:00 petang.',
        summary:'Ringkasan Permohonan',
        description:'Penerangan Keperluan',
        contactTitle:'Perlu bantuan segera?',
        contact:`Hubungi Nasarudin di ${PRIMARY_PHONE} atau Nazrin Shah di ${SECONDARY_PHONE}.`,
        whatsapp:'Hubungi melalui WhatsApp',
        website:'Layari Laman Web Kami',
        fileNote:'Fail yang dipilih tidak dilampirkan secara automatik. Jika diperlukan, sila hantarkannya melalui WhatsApp.',
        closing:'Sila simpan nombor rujukan ini untuk sebarang komunikasi lanjut.',
        fallback
      }
    : {
        subject:`[${reference}] Quotation Request Confirmation`,
        eyebrow:'NS SMART FIX SOLUTION',
        title:'We Have Received Your Request',
        greeting:`Hello ${clean(input.fullName, 100)},`,
        intro:'Thank you for contacting NS Smart Fix Solution. We have received your request and our team will review the submitted details.',
        response:'Expected response time: within 1 business day during our operating hours, Monday to Saturday, 9:00 AM to 6:00 PM.',
        summary:'Request Summary',
        description:'Description of Requirement',
        contactTitle:'Need urgent assistance?',
        contact:`Call Nasarudin at ${PRIMARY_PHONE} or Nazrin Shah at ${SECONDARY_PHONE}.`,
        whatsapp:'Contact Us on WhatsApp',
        website:'Visit Our Website',
        fileNote:'Selected files are not attached automatically. If required, please send them through WhatsApp.',
        closing:'Please keep this reference number for any follow-up communication.',
        fallback
      };
  const plain = [
    copy.title.toUpperCase(), '', copy.greeting, copy.intro, '', copy.response, '',
    ...details.map(([label, value]) => `${label}: ${value || copy.fallback}`),
    '', `${copy.description}:`, clean(input.description, 2000) || copy.fallback, '',
    copy.fileNote, '', copy.contactTitle, copy.contact,
    `${copy.whatsapp}: ${WHATSAPP_URL}`, `${copy.website}: ${WEBSITE_URL}`, '', copy.closing
  ].join('\n');
  const html = `<!doctype html>
<html lang="${isBm ? 'ms' : 'en'}"><body style="margin:0;background:#F5F7FA;font-family:Arial,sans-serif;color:#1F2937;">
<div style="max-width:720px;margin:0 auto;padding:28px 16px;">
<div style="background:#0B1F33;padding:24px;border-radius:14px 14px 0 0;">
<div style="color:#F59E0B;font-size:13px;font-weight:700;letter-spacing:.08em;">${copy.eyebrow}</div>
<h1 style="margin:8px 0 0;color:#FFFFFF;font-size:24px;">${copy.title}</h1></div>
<div style="background:#FFFFFF;padding:24px;border:1px solid #DDE5EE;border-top:0;border-radius:0 0 14px 14px;">
<p style="font-size:15px;line-height:1.6;margin:0 0 8px;color:#0B1F33;font-weight:700;">${escapeHtml(copy.greeting)}</p>
<p style="font-size:14px;line-height:1.6;margin:0 0 14px;color:#374151;">${copy.intro}</p>
<div style="background:#EAF4FF;border-left:4px solid #146CBE;border-radius:8px;padding:14px;margin:0 0 24px;color:#0B1F33;font-size:14px;line-height:1.6;">${copy.response}</div>
<h2 style="font-size:17px;color:#0B1F33;margin:0 0 10px;">${copy.summary}</h2>
<table style="width:100%;border-collapse:collapse;font-size:14px;">${details.map(([label, value]) => customerRow(label, value, copy.fallback)).join('')}</table>
<h2 style="font-size:16px;color:#0B1F33;margin:24px 0 8px;">${copy.description}</h2>
<div style="white-space:pre-wrap;background:#F8FAFC;border:1px solid #DDE5EE;border-radius:8px;padding:14px;font-size:14px;line-height:1.6;">${escapeHtml(input.description || copy.fallback)}</div>
<p style="margin:16px 0;color:#64748B;font-size:12px;line-height:1.5;">${copy.fileNote}</p>
<div style="background:#F8FAFC;border-radius:10px;padding:16px;margin-top:20px;">
<h2 style="font-size:15px;color:#0B1F33;margin:0 0 6px;">${copy.contactTitle}</h2>
<p style="font-size:13px;color:#374151;line-height:1.6;margin:0 0 12px;">${copy.contact}</p>
<a href="${WHATSAPP_URL}" style="display:inline-block;background:#25D366;color:#FFFFFF;text-decoration:none;border-radius:8px;padding:11px 15px;font-size:13px;font-weight:700;margin:0 8px 8px 0;">${copy.whatsapp}</a>
<a href="${WEBSITE_URL}" style="display:inline-block;background:#146CBE;color:#FFFFFF;text-decoration:none;border-radius:8px;padding:11px 15px;font-size:13px;font-weight:700;margin-bottom:8px;">${copy.website}</a>
</div>
<p style="margin:20px 0 0;color:#64748B;font-size:12px;line-height:1.5;">${copy.closing}</p>
</div></div></body></html>`;
  return { html, plain, subject:copy.subject };
}

export default async function handler(request, response) {
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST');
    return response.status(405).json({ error: 'Method not allowed.' });
  }
  const contentType = String(request.headers?.['content-type'] || '').toLowerCase();
  if (!contentType.includes('application/json')) return response.status(415).json({ error: 'Content type must be application/json.' });
  if (!process.env.RESEND_API_KEY) return response.status(503).json({ error: 'Email service is not configured.' });
  if (Number(request.headers['content-length'] || 0) > MAX_BODY_BYTES) return response.status(413).json({ error: 'Request is too large.' });
  response.setHeader('Cache-Control', 'no-store');
  const ip = clientIp(request);
  const rateLimit = checkRateLimit(ip);
  response.setHeader('X-RateLimit-Limit', String(RATE_LIMIT_MAX_REQUESTS));
  response.setHeader('X-RateLimit-Remaining', String(rateLimit.remaining));
  if (!rateLimit.allowed) {
    response.setHeader('Retry-After', String(rateLimit.retryAfter));
    return response.status(429).json({ error: 'Too many requests. Please wait before trying again.' });
  }
  const payload = request.body;
  const validationError = validatePayload(payload);
  if (validationError) return response.status(400).json({ error: validationError });
  if (!await verifyTurnstile(payload.turnstileToken, ip)) {
    return response.status(403).json({ error: 'Security verification failed. Please try again.' });
  }
  if (checkDuplicate(payload, ip)) {
    return response.status(409).json({ error: 'This request was already submitted. Please wait before sending it again.' });
  }

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
    releaseDuplicate(payload, ip);
    console.error('Quotation email delivery failed', resendResponse.status);
    return response.status(502).json({ error: 'Email delivery failed. Please try again.' });
  }
  let acknowledgementSent = false;
  if (replyTo) {
    const customerEmail = buildCustomerEmail(payload, reference);
    try {
      const acknowledgementResponse = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from:SENDER, to:[replyTo], reply_to:RECIPIENT,
          subject:customerEmail.subject, html:customerEmail.html, text:customerEmail.plain
        })
      });
      acknowledgementSent = acknowledgementResponse.ok;
      if (!acknowledgementResponse.ok) console.error('Customer acknowledgement delivery failed', acknowledgementResponse.status);
    } catch (error) {
      console.error('Customer acknowledgement delivery failed', error instanceof Error ? error.message : 'unknown error');
    }
  }
  return response.status(200).json({ ok:true, reference, acknowledgementSent });
}
