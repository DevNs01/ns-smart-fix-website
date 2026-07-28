const ALERT_RECIPIENT = process.env.MONITORING_ALERT_EMAIL
  || process.env.QUOTATION_TO_EMAIL
  || 'admin@nssmartfixsolution.com';
const ALERT_SENDER = process.env.QUOTATION_FROM_EMAIL
  || 'NS Smart Fix Website <website@nssmartfixsolution.com>';
const DEFAULT_COOLDOWN_MS = 15 * 60 * 1000;
const alertStore = globalThis.__nsMonitoringAlerts || new Map();
globalThis.__nsMonitoringAlerts = alertStore;

function safeText(value, max = 160) {
  return String(value || '')
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/[<>&"'`]/g, '')
    .trim()
    .slice(0, max);
}

export function safePath(value) {
  const raw = String(value || '/').split(/[?#]/, 1)[0];
  const path = raw.startsWith('http') ? (() => {
    try { return new URL(raw).pathname; } catch { return '/'; }
  })() : raw;
  return safeText(path.startsWith('/') ? path : `/${path}`, 160) || '/';
}

function safeDetails(details = {}) {
  const allowed = {};
  if (details.route) allowed.route = safePath(details.route);
  if (details.stage) allowed.stage = safeText(details.stage, 64);
  if (details.code) allowed.code = safeText(details.code, 64);
  if (Number.isFinite(Number(details.status))) allowed.status = Number(details.status);
  if (Number.isFinite(Number(details.durationMs))) allowed.durationMs = Math.max(0, Math.round(Number(details.durationMs)));
  if (details.state) allowed.state = safeText(details.state, 32);
  if (details.deployment) allowed.deployment = safeText(details.deployment, 80);
  return allowed;
}

export function emitMonitoringEvent(category, severity, details = {}) {
  const event = {
    monitoring: true,
    category: safeText(category, 64),
    severity: ['info', 'warning', 'critical'].includes(severity) ? severity : 'warning',
    timestamp: new Date().toISOString(),
    ...safeDetails(details)
  };
  const logger = event.severity === 'info' ? console.info : console.error;
  logger(JSON.stringify(event));
  return event;
}

function shouldSend(key, now = Date.now()) {
  const cooldown = Math.max(60_000, Number(process.env.MONITORING_ALERT_COOLDOWN_MS) || DEFAULT_COOLDOWN_MS);
  const previous = alertStore.get(key) || 0;
  if (previous > now - cooldown) return false;
  alertStore.set(key, now);
  return true;
}

export function resetMonitoringState() {
  alertStore.clear();
}

export async function sendMonitoringAlert(input, fetchImpl = fetch) {
  const category = safeText(input?.category, 64) || 'operational_event';
  const severity = ['info', 'warning', 'critical'].includes(input?.severity) ? input.severity : 'warning';
  const details = safeDetails(input?.details);
  const event = emitMonitoringEvent(category, severity, details);
  const dedupeKey = safeText(input?.dedupeKey, 120) || `${category}:${details.route || ''}:${details.stage || ''}:${details.code || ''}`;

  if (!process.env.RESEND_API_KEY || !shouldSend(dedupeKey)) {
    return { logged: true, emailed: false };
  }

  const rows = Object.entries(details)
    .map(([key, value]) => `${key}: ${value}`)
    .join('\n');
  const deployment = safeText(process.env.VERCEL_GIT_COMMIT_SHA || process.env.VERCEL_DEPLOYMENT_ID, 80);
  const text = [
    `NS Smart Fix production monitoring alert`,
    `Severity: ${severity.toUpperCase()}`,
    `Category: ${category}`,
    `Time: ${event.timestamp}`,
    deployment ? `Deployment: ${deployment}` : '',
    rows,
    '',
    'Privacy notice: This alert contains operational metadata only. No customer information is included.'
  ].filter(Boolean).join('\n');

  try {
    const result = await fetchImpl('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: ALERT_SENDER,
        to: [ALERT_RECIPIENT],
        subject: `[${severity.toUpperCase()}] NS Smart Fix — ${category.replaceAll('_', ' ')}`,
        text
      })
    });
    if (!result.ok) {
      emitMonitoringEvent('monitoring_email_failed', 'critical', {
        route: '/api/monitoring',
        stage: 'alert_delivery',
        status: result.status,
        code: category
      });
      return { logged: true, emailed: false };
    }
    return { logged: true, emailed: true };
  } catch {
    emitMonitoringEvent('monitoring_email_failed', 'critical', {
      route: '/api/monitoring',
      stage: 'alert_delivery',
      code: category
    });
    return { logged: true, emailed: false };
  }
}

