import test from 'node:test';
import assert from 'node:assert/strict';
import { createBrowserErrorReport, installBrowserMonitoring } from '../src/browser-monitor.js';

const location = {
  origin: 'https://nssmartfixsolution.com',
  pathname: '/services'
};

test('browser error reports contain bounded operational metadata only', () => {
  const report = createBrowserErrorReport('javascript_error', {
    error: { name: 'TypeError', message: 'customer@example.com' },
    filename: 'https://nssmartfixsolution.com/assets/website.js?private=customer@example.com',
    lineno: 42,
    colno: 17
  }, location);

  assert.deepEqual(report, {
    type: 'javascript_error',
    page: '/services',
    code: 'TypeError',
    source: '/assets/website.js',
    line: 42,
    column: 17
  });
  assert.doesNotMatch(JSON.stringify(report), /customer@example/);
});

test('browser error reports classify third-party scripts without exposing their URL', () => {
  const report = createBrowserErrorReport('javascript_error', {
    error: { name: 'Error' },
    filename: 'https://challenges.cloudflare.com/private/path.js?token=secret'
  }, location);

  assert.equal(report.source, 'third_party');
  assert.doesNotMatch(JSON.stringify(report), /cloudflare|secret/);
});

test('browser monitoring deduplicates identical errors and preserves distinct failures', async () => {
  const listeners = new Map();
  const target = {
    addEventListener(type, listener) { listeners.set(type, listener); },
    removeEventListener(type) { listeners.delete(type); }
  };
  const requests = [];
  const uninstall = installBrowserMonitoring({
    target,
    location,
    fetchImpl: async (_url, options) => { requests.push(JSON.parse(options.body)); }
  });

  const first = { error: { name: 'TypeError' }, filename: '/assets/website.js', lineno: 10, colno: 2 };
  listeners.get('error')(first);
  listeners.get('error')(first);
  listeners.get('error')({ ...first, lineno: 11 });
  await Promise.resolve();

  assert.equal(requests.length, 2);
  assert.deepEqual(requests.map(request => request.line), [10, 11]);
  uninstall();
  assert.equal(listeners.size, 0);
});
