import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const root = process.cwd();
const source = readFileSync(join(root, 'index.html'), 'utf8');
const vercel = JSON.parse(readFileSync(join(root, 'vercel.json'), 'utf8'));

const expectedRoutes = [
  '/',
  '/about',
  '/services',
  '/products',
  '/quotation',
  '/contact',
  '/faq',
  '/privacy',
  '/terms',
  '/warranty'
];

test('all public pages have stable route paths', () => {
  for (const route of expectedRoutes) {
    assert.match(source, new RegExp(`['"]${route.replace('/', '\\/')}['"]`), `missing route ${route}`);
  }
});

test('navigation uses history and handles browser back and forward', () => {
  assert.match(source, /window\.history\.pushState/);
  assert.match(source, /window\.addEventListener\('popstate'/);
  assert.match(source, /window\.removeEventListener\('popstate'/);
});

test('navigation links expose real href destinations', () => {
  for (const key of ['home', 'about', 'services', 'products', 'quotation', 'contact', 'faq']) {
    assert.match(source, new RegExp(`href="\\{\\{ navHref\\.${key} \\}\\}"`), `missing semantic href for ${key}`);
  }
  for (const key of ['privacy', 'terms', 'warranty']) {
    assert.match(source, new RegExp(`href="\\{\\{ legalHref\\.${key} \\}\\}"`), `missing legal href for ${key}`);
  }
});

test('Vercel serves the app shell for every direct page URL', () => {
  const rewrites = new Map(vercel.rewrites.map(item => [item.source, item.destination]));
  for (const route of expectedRoutes.filter(route => route !== '/')) {
    assert.equal(rewrites.get(route), '/index.html', `missing Vercel rewrite for ${route}`);
  }
});
