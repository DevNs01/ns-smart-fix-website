export default function handler(request, response) {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.setHeader('Allow', 'GET, HEAD');
    return response.status(405).json({ error: 'Method not allowed.' });
  }

  response.setHeader('Cache-Control', 'no-store');
  const checks = {
    runtime: true,
    emailServiceConfigured: Boolean(process.env.RESEND_API_KEY),
    turnstileConfigured: Boolean(process.env.TURNSTILE_SECRET_KEY)
  };
  const ok = Object.values(checks).every(Boolean);
  return response.status(ok ? 200 : 503).json({
    ok,
    service: 'ns-smart-fix-website',
    timestamp: new Date().toISOString(),
    checks
  });
}

