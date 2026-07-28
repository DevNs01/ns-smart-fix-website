import { safePath, sendMonitoringAlert } from './monitoring.js';

const MAX_BODY_BYTES = 4 * 1024;
const CLIENT_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const CLIENT_LIMIT_MAX = 10;
const clientStore = globalThis.__nsClientMonitorLimits || new Map();
globalThis.__nsClientMonitorLimits = clientStore;

function authorizedCron(request) {
  const secret = process.env.CRON_SECRET;
  return Boolean(secret) && request.headers?.authorization === `Bearer ${secret}`;
}

function clientAllowed(request, now = Date.now()) {
  const key = String(request.headers?.['x-vercel-forwarded-for']
    || request.headers?.['x-forwarded-for']
    || request.socket?.remoteAddress
    || 'unknown').split(',')[0].trim().slice(0, 80);
  const current = clientStore.get(key);
  if (!current || current.resetAt <= now) {
    clientStore.set(key, { count: 1, resetAt: now + CLIENT_LIMIT_WINDOW_MS });
    return true;
  }
  current.count += 1;
  return current.count <= CLIENT_LIMIT_MAX;
}

async function checkProduction(fetchImpl = fetch) {
  const started = Date.now();
  try {
    const result = await fetchImpl('https://nssmartfixsolution.com/api/health', {
      headers: { 'User-Agent': 'NS-Smart-Fix-Uptime-Monitor/1.0' },
      signal: AbortSignal.timeout(8000)
    });
    const durationMs = Date.now() - started;
    if (!result.ok) {
      await sendMonitoringAlert({
        category: 'website_uptime_failed',
        severity: 'critical',
        details: { route: '/api/health', status: result.status, durationMs, state: 'down' },
        dedupeKey: 'website-uptime-down'
      }, fetchImpl);
      return { ok: false, status: result.status, durationMs };
    }
    const slowThreshold = Math.max(500, Number(process.env.MONITORING_SLOW_API_MS) || 3000);
    if (durationMs >= slowThreshold) {
      await sendMonitoringAlert({
        category: 'slow_api_response',
        severity: 'warning',
        details: { route: '/api/health', status: result.status, durationMs, state: 'slow' },
        dedupeKey: 'health-slow'
      }, fetchImpl);
    }
    return { ok: true, status: result.status, durationMs };
  } catch {
    const durationMs = Date.now() - started;
    await sendMonitoringAlert({
      category: 'website_uptime_failed',
      severity: 'critical',
      details: { route: '/api/health', durationMs, code: 'network_or_timeout', state: 'down' },
      dedupeKey: 'website-uptime-down'
    }, fetchImpl);
    return { ok: false, status: 0, durationMs };
  }
}

export default async function handler(request, response) {
  response.setHeader('Cache-Control', 'no-store');
  if (request.method === 'GET') {
    if (!authorizedCron(request)) return response.status(401).json({ error: 'Unauthorized.' });
    const result = await checkProduction();
    return response.status(result.ok ? 200 : 503).json(result);
  }
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'GET, POST');
    return response.status(405).json({ error: 'Method not allowed.' });
  }
  if (!String(request.headers?.['content-type'] || '').toLowerCase().includes('application/json')) {
    return response.status(415).json({ error: 'Content type must be application/json.' });
  }
  if (Number(request.headers?.['content-length'] || 0) > MAX_BODY_BYTES) {
    return response.status(413).json({ error: 'Request is too large.' });
  }
  if (!clientAllowed(request)) return response.status(429).json({ error: 'Too many reports.' });

  const body = request.body;
  const allowedTypes = new Set(['javascript_error', 'unhandled_rejection', 'app_load_timeout']);
  if (!body || !allowedTypes.has(body.type)) return response.status(400).json({ error: 'Invalid report.' });
  await sendMonitoringAlert({
    category: body.type,
    severity: body.type === 'app_load_timeout' ? 'critical' : 'warning',
    details: {
      route: safePath(body.page),
      stage: 'browser',
      code: body.type,
      status: 0
    },
    dedupeKey: `${body.type}:${safePath(body.page)}`
  });
  return response.status(202).json({ ok: true });
}

