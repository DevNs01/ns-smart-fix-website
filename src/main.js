import React from 'react';
import * as ReactDOM from 'react-dom/client';
import { installBrowserMonitoring } from './browser-monitor.js';

installBrowserMonitoring();

// The exported Design Canvas runtime expects React's UMD-style globals.
window.React = React;
window.ReactDOM = ReactDOM;

window.__dcReady = (async () => {
  await import('../support.js');
  await window.__dcRuntimeReady;
})();
await window.__dcReady;

const loader = document.getElementById('ns-boot-loader');

function revealWebsite() {
  const root = document.getElementById('dc-root');
  if (!root?.firstElementChild) return false;
  document.documentElement.classList.add('ns-app-ready');
  loader?.setAttribute('hidden', '');
  document.getElementById('seo-fallback')?.remove();
  return true;
}

window.__nsRevealWebsite = revealWebsite;

if (!revealWebsite()) {
  const renderObserver = new MutationObserver(() => {
    if (revealWebsite()) renderObserver.disconnect();
  });
  renderObserver.observe(document.body, { childList: true, subtree: true });

  window.setTimeout(() => {
    if (revealWebsite()) return;
    renderObserver.disconnect();
    const message = loader?.querySelector('.ns-boot-message');
    if (message) {
      message.textContent = 'The website is taking longer than expected. Please refresh. / Laman web mengambil masa lebih lama. Sila muat semula.';
    }
    fetch('/api/monitor', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'app_load_timeout', page: window.location.pathname }),
      keepalive: true,
      credentials: 'same-origin'
    }).catch(() => {});
  }, 12000);
}
