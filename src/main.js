import React from 'react';
import * as ReactDOM from 'react-dom/client';

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
  }, 12000);
}
