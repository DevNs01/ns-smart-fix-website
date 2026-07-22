import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const config = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));

test('WhatsApp destinations are fixed business numbers and messages are encoded', () => {
  assert.match(source, /waLink\(phone, msg\)\{ return "https:\/\/wa\.me\/" \+ phone \+ "\?text=" \+ encodeURIComponent\(msg\); \}/);
  assert.match(source, /this\.waLink\('60164110681'/);
  assert.match(source, /this\.waLink\('60128851681'/);
});

test('public forms constrain personal-data fields', () => {
  assert.match(source, /maxlength="100"/);
  assert.match(source, /maxlength="254"/);
  assert.match(source, /maxlength="2000"/);
  assert.match(source, /validPhone\(value\)/);
});

test('Vercel configuration denies framing and object content', () => {
  const values = config.headers.flatMap(rule => rule.headers).map(header => `${header.key}: ${header.value}`).join('\n');
  assert.match(values, /frame-ancestors 'none'/);
  assert.match(values, /object-src 'none'/);
  assert.match(values, /X-Content-Type-Options: nosniff/i);
});
