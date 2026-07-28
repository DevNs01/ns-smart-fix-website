import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

test('clickable navigation and service cards expose semantic destinations', () => {
  assert.doesNotMatch(source, /<(?:div|span)[^>]+onClick=/);
  assert.match(source, /class="ns-card-link" href="\{\{ svc\.href \}\}" aria-label="\{\{ svc\.linkLabel \}\}"/);
  assert.match(source, /href="\{\{ navHref\.quotation \}\}"[^>]+onClick="\{\{ nav\.quotation \}\}"/);
  assert.match(source, /href="\{\{ legalHref\.terms \}\}"[^>]+aria-current=/);
});

test('keyboard focus and skip navigation are visible', () => {
  assert.match(source, /:focus-visible\{outline:3px solid #F59E0B!important/);
  assert.match(source, /class="ns-skip-link" href="#main-content"/);
  assert.match(source, /<main id="main-content"/);
});

test('forms expose labels, groups, validation relationships and live errors', () => {
  for (const id of ['quick-name', 'quick-phone', 'quick-service', 'quick-message', 'quote-full-name', 'quote-phone', 'quote-email', 'quote-location', 'quote-visit-date', 'quote-description', 'quote-budget', 'quote-files']) {
    assert.match(source, new RegExp(`(?:for|id)="${id}"`), `missing accessible association for ${id}`);
  }
  assert.match(source, /<fieldset[\s\S]*?<legend[^>]*>\{\{ t\.quotation\.serviceRequired \}\}<\/legend>/);
  assert.match(source, /aria-pressed="\{\{ ct\.selected \}\}"/);
  assert.match(source, /id="quick-form-error"[^>]+role="alert" aria-live="assertive"/);
  assert.match(source, /id="quote-form-error"[^>]+role="alert" aria-live="assertive"/);
  assert.match(source, /aria-describedby="\{\{ quoteErrorId \}\}"/);
});

test('form consent provides real privacy and terms destinations', () => {
  assert.match(source, /id="quick-consent"[\s\S]*?href="\{\{ legalHref\.privacy \}\}"[\s\S]*?href="\{\{ legalHref\.terms \}\}"/);
  assert.match(source, /id="quote-consent"[\s\S]*?href="\{\{ legalHref\.privacy \}\}"[\s\S]*?href="\{\{ legalHref\.terms \}\}"/);
});

test('FAQ disclosure buttons expose state and controlled regions', () => {
  assert.match(source, /<button type="button" aria-expanded="\{\{ item\.open \}\}" aria-controls="\{\{ item\.panelId \}\}"/);
  assert.match(source, /role="region" aria-labelledby="\{\{ item\.buttonId \}\}"/);
});

test('local SEO includes Malaysian business metadata and structured data', () => {
  assert.match(source, /"@type":"LocalBusiness"/);
  assert.match(source, /"addressLocality":"Bangsar"/);
  assert.match(source, /"addressCountry":"MY"/);
  assert.match(source, /meta name="geo\.region" content="MY-14"/);
  assert.match(source, /meta property="og:locale" content="en_MY"/);
  assert.match(source, /setMeta\('meta\[property="og:url"\]','content',canonical\.href\)/);
});

test('raw crawler metadata never exposes template expressions', () => {
  const metadata = [...source.matchAll(/<meta\b[^>]*(?:name|property)="[^"]+"[^>]*>/g)].map(match => match[0]).join('\n');
  assert.doesNotMatch(metadata, /\{\{/);
  assert.match(source, /<meta name="description" content="Electrical wiring, networking, server infrastructure, IT product supply and installation services across Peninsular Malaysia\.">/);
});
