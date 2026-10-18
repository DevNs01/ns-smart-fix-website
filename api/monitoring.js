import { createHmac } from 'node:crypto';

const ALERT_RECIPIENT = process.env.MONITORING_ALERT_EMAIL
  || process.env.QUOTATION_TO_EMAIL
  || 'admin@nssmartfixsolution.com';
const ALERT_SENDER = process.env.QUOTATION_FROM_EMAIL
  || 'NS Smart Fix Website <website@nssmartfixsolution.com>';
const DEFAULT_COOLDOWN_MS = 15 * 60 * 1000;

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
  if (details.source) allowed.source = safeText(details.source, 160);
  if (Number.isFinite(Number(details.line))) allowed.line = Math.max(0, Math.round(Number(details.line)));
  if (Number.isFinite(Number(details.column))) allowed.column = Math.max(0, Math.round(Number(details.column)));
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

export function sharedBudgetKey(namespace, value, secret = process.env.SUPABASE_SERVICE_ROLE_KEY || '') {
  if (String(secret).length < 20) throw new Error('configuration');
  return createHmac('sha256', String(secret))
    .update(`${String(namespace).slice(0, 80)}:${String(value).slice(0, 500)}`)
    .digest('hex');
}

export function resetMonitoringState() {
  // Shared production state is intentionally not process-local. Tests use
  // isolated fake RPC stores instead of resetting a module-level Map.
}

export async function consumeSharedBudget(namespace, value, limit, windowMs, fetchImpl = fetch) {
  const url = String(process.env.SUPABASE_URL || '').replace(/\/$/, '');
  const key = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '');
  if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(url) || key.length < 20) {
    throw new Error('configuration');
  }
  const result = await fetchImpl(`${url}/rest/v1/rpc/consume_service_rate_limit`, {
    method: 'POST',
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      p_key_hash: sharedBudgetKey(namespace, value, key),
      p_limit: limit,
      p_window_seconds: Math.max(60, Math.ceil(windowMs / 1000))
    })
  });
  const rows = await result.json().catch(() => null);
  if (!result.ok) throw new Error('database');
  const budget = Array.isArray(rows) ? rows[0] : rows;
  if (!budget || typeof budget.allowed !== 'boolean') throw new Error('database');
  return {
    allowed: budget.allowed,
    remaining: Math.max(0, Number(budget.remaining) || 0),
    retryAfter: Math.max(0, Number(budget.retry_after) || 0)
  };
}

export async function sendMonitoringAlert(input, fetchImpl = fetch) {
  const category = safeText(input?.category, 64) || 'operational_event';
  const severity = ['info', 'warning', 'critical'].includes(input?.severity) ? input.severity : 'warning';
  const details = safeDetails(input?.details);
  const event = emitMonitoringEvent(category, severity, details);
  const dedupeKey = safeText(input?.dedupeKey, 120) || `${category}:${details.route || ''}:${details.stage || ''}:${details.code || ''}`;

  if (!process.env.RESEND_API_KEY) {
    return { logged: true, emailed: false };
  }

  const cooldown = Math.max(60_000, Number(process.env.MONITORING_ALERT_COOLDOWN_MS) || DEFAULT_COOLDOWN_MS);
  let emailBudget;
  try {
    emailBudget = await consumeSharedBudget('monitor-alert', dedupeKey, 1, cooldown, fetchImpl);
  } catch {
    emitMonitoringEvent('monitoring_rate_limit_failed', 'critical', {
      route: '/api/monitoring', stage: 'shared_dedupe', code: category
    });
    return { logged: true, emailed: false };
  }
  if (!emailBudget.allowed) return { logged: true, emailed: false };

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
