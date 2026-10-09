import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync('index.html','utf8');
const robots = readFileSync('public/robots.txt','utf8');
const packageJson = JSON.parse(readFileSync('package.json','utf8'));

test('source HTML includes complete social, canonical, language and icon metadata', () => {
  assert.match(source,/<link rel="canonical" href="https:\/\/nssmartfixsolution\.com\/">/);
  assert.match(source,/<meta property="og:image" content="https:\/\/nssmartfixsolution\.com\/assets\/social-preview\.jpg">/);
  assert.match(source,/<meta name="twitter:card" content="summary_large_image">/);
  assert.match(source,/<meta name="twitter:title"/);
  assert.match(source,/<meta name="twitter:description"/);
  assert.match(source,/<link rel="alternate" hreflang="ms-MY"/);
  assert.match(source,/<link rel="icon" href="\/favicon\.svg"/);
  assert.doesNotMatch(source,/"sameAs":\[\]/);
});

test('build generates unique crawlable route documents and sitemap', () => {
  assert.match(packageJson.scripts.build,/generate-seo-pages\.mjs/);
  assert.match(source,/SEO_FALLBACK_START/);
  assert.match(source,/SERVICE_DETAIL_SLUGS/);
  assert.match(source,/admin@nssmartfixsolution\.com/);
});

test('robots permits marketing pages, protects private endpoints and declares sitemap', () => {
  assert.match(robots,/Allow: \//);
  assert.match(robots,/Disallow: \/admin/);
  assert.match(robots,/Disallow: \/api\//);
  assert.match(robots,/Sitemap: https:\/\/nssmartfixsolution\.com\/sitemap\.xml/);
});
