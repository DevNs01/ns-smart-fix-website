export default function handler(request, response) {
  if (request.method !== 'GET') {
    response.setHeader('Allow', 'GET');
    return response.status(405).json({ error: 'Method not allowed.' });
  }
  response.setHeader('Cache-Control', 'public, max-age=300, s-maxage=300');
  const siteKey = process.env.TURNSTILE_SITE_KEY || '';
  if (!siteKey) return response.status(503).json({ error: 'Security verification is not configured.' });
  return response.status(200).json({ siteKey });
}
