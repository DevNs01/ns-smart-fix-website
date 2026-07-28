import React from 'react';
import * as ReactDOM from 'react-dom/client';

const reportedBrowserErrors = new Set();

function reportBrowserError(type) {
  const key = `${type}:${window.location.pathname}`;
  if (reportedBrowserErrors.has(key) || reportedBrowserErrors.size >= 5) return;
  reportedBrowserErrors.add(key);
  const body = JSON.stringify({ type, page: window.location.pathname });
  fetch('/api/monitor', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
    keepalive: true,
    credentials: 'same-origin'
  }).catch(() => {});
}

window.addEventListener('error', () => reportBrowserError('javascript_error'));
window.addEventListener('unhandledrejection', () => reportBrowserError('unhandled_rejection'));

// The exported Design Canvas runtime expects React's UMD-style globals.
window.React = React;
window.ReactDOM = ReactDOM;

await import('../support.js');

const loader = document.getElementById('ns-boot-loader');
const root = document.getElementById('dc-root');

function revealWebsite() {
  if (!root?.firstElementChild) return false;
  document.documentElement.classList.add('ns-app-ready');
  loader?.setAttribute('hidden', '');
  return true;
}

if (!revealWebsite() && root) {
  const renderObserver = new MutationObserver(() => {
    if (revealWebsite()) renderObserver.disconnect();
  });
  renderObserver.observe(root, { childList: true });

  window.setTimeout(() => {
    if (revealWebsite()) return;
    renderObserver.disconnect();
    const message = loader?.querySelector('.ns-boot-message');
    if (message) {
      message.textContent = 'The website is taking longer than expected. Please refresh. / Laman web mengambil masa lebih lama. Sila muat semula.';
    }
    reportBrowserError('app_load_timeout');
  }, 12000);
}
