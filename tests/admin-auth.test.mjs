import assert from 'node:assert/strict';
import test from 'node:test';
import { allowLogin, parseCookies, sessionCookies, trustedOrigin } from '../api/admin-auth.js';
import { readFile } from 'node:fs/promises';

const adminSource = await readFile(new URL('../src/admin.js', import.meta.url), 'utf8');

test('admin authentication cookies are HttpOnly and same-site restricted', () => {
  const original = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  const cookies = sessionCookies({ access_token: 'access', refresh_token: 'refresh', expires_in: 3600 });
  assert.equal(cookies.length, 2);
  for (const cookie of cookies) {
    assert.match(cookie, /HttpOnly/);
    assert.match(cookie, /Secure/);
    assert.match(cookie, /SameSite=Strict/);
    assert.match(cookie, /Path=\/api\/admin-auth/);
  }
  process.env.NODE_ENV = original;
});

test('cookie parser ignores malformed values and decodes valid values', () => {
  assert.deepEqual(parseCookies('ns_admin_access=abc%20123; invalid; theme=light'), {
    ns_admin_access: 'abc 123', theme: 'light'
  });
});

test('state-changing authentication calls require the same origin', () => {
  assert.equal(trustedOrigin({ method: 'POST', headers: { origin: 'https://nssmartfixsolution.com', host: 'nssmartfixsolution.com' } }), true);
  assert.equal(trustedOrigin({ method: 'POST', headers: { origin: 'https://evil.example', host: 'nssmartfixsolution.com' } }), false);
  assert.equal(trustedOrigin({ method: 'GET', headers: {} }), true);
});

test('login attempts are rate limited', () => {
  const ip = `test-${Date.now()}`;
  for (let index = 0; index < 8; index += 1) assert.equal(allowLogin(ip), true);
  assert.equal(allowLogin(ip), false);
});

test('admin frontend uses the same-origin authentication function without browser token storage', () => {
  assert.match(adminSource, /\/api\/admin-auth\?action=/);
  assert.doesNotMatch(adminSource, /localStorage|sessionStorage/);
  assert.doesNotMatch(adminSource, /SUPABASE_SERVICE_ROLE_KEY/);
});

test('admin password recovery removes URL fragments and does not persist recovery tokens', () => {
  assert.match(adminSource, /history\.replaceState/);
  assert.match(adminSource, /update-password/);
  assert.match(adminSource, /recover/);
  assert.doesNotMatch(adminSource, /localStorage|sessionStorage/);
});
