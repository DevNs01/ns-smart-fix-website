import { icon, moduleMeta } from './admin-icons.js';

const searchableModules = new Set(['customers', 'requests', 'quotations', 'payments', 'receipts', 'users', 'audit']);

const actionIcon = label => {
  const value = label.trim().toLowerCase();
  if (value.startsWith('new ') || value.startsWith('+ new') || value.startsWith('create ') || value.startsWith('+ create') || value.startsWith('add ') || value.startsWith('+ add')) return 'plus';
  if (value.includes('delete')) return 'trash';
  if (value.includes('download')) return 'download';
  if (value.includes('edit')) return 'edit';
  if (value.includes('preview') || value.includes('view ') || value === 'view') return 'eye';
  if (value.includes('approve') || value.includes('send') || value.includes('issue')) return 'send';
  if (value.includes('save') || value.includes('mark accepted')) return 'save';
  if (value.includes('record payment') || value.includes('payment records')) return 'payments';
  if (value.includes('return') || value.includes('open')) return 'arrowRight';
  if (value.includes('filter')) return 'filter';
  if (value.includes('close') || value.includes('reject') || value === 'cancel') return 'close';
  return '';
};

function decorateButton(button) {
  if (button.querySelector('.ui-icon') || button.classList.contains('status-select') || button.matches('[type="checkbox"]')) return;
  const name = actionIcon(button.textContent || button.getAttribute('aria-label') || '');
  if (!name) return;
  for (const node of button.childNodes) {
    if (node.nodeType === Node.TEXT_NODE && /^\s*\+\s*/.test(node.textContent || '')) node.textContent = node.textContent.replace(/^\s*\+\s*/, '');
  }
  button.insertAdjacentHTML('afterbegin', icon(name));
}

function decorateActions(scope) {
  scope.querySelectorAll('button, a.primary-button, a.secondary-button, a.danger-button, a.action-link').forEach(decorateButton);
  scope.querySelectorAll('.dialog-close').forEach(button => {
    if (!button.querySelector('.ui-icon')) button.innerHTML = icon('close');
    button.title ||= button.getAttribute('aria-label') || 'Close';
  });
}

function addModuleHeading(scope, key) {
  const meta = moduleMeta[key];
  const toolbar = scope.querySelector('.module-toolbar');
  if (!meta || !toolbar) return;
  toolbar.classList.add('module-toolbar-enhanced');
  if (!scope.querySelector('.page-breadcrumb')) {
    toolbar.insertAdjacentHTML('beforebegin', `<nav class="page-breadcrumb" aria-label="Breadcrumb"><span>${meta.group}</span><b aria-hidden="true">›</b><span aria-current="page">${meta.label}</span></nav>`);
  }
  const heading = toolbar.querySelector('h1');
  if (heading && !heading.closest('.module-title-row')) {
    const row = document.createElement('div');
    row.className = 'module-title-row';
    row.innerHTML = `<span class="module-title-icon" aria-hidden="true">${icon(meta.icon)}</span>`;
    heading.before(row);
    row.append(heading);
  }
}

function enhanceTable(table) {
  const headings = [...table.querySelectorAll('thead th')].map(th => th.textContent.trim());
  table.querySelectorAll('thead th').forEach(th => th.setAttribute('scope', 'col'));
  table.querySelectorAll('tbody tr').forEach(row => {
    [...row.children].forEach((cell, index) => {
      if (headings[index] && !cell.hasAttribute('colspan')) cell.dataset.label = headings[index];
    });
  });
}

function addListTools(scope, key) {
  if (!searchableModules.has(key) || scope.querySelector('.module-list-tools')) return;
  const tableWrap = scope.querySelector('.data-card > .table-wrap');
  const table = tableWrap?.querySelector('table');
  if (!tableWrap || !table) return;
  const meta = moduleMeta[key];
  const rows = [...table.querySelectorAll('tbody tr')].filter(row => !row.querySelector('.table-empty'));
  const tools = document.createElement('div');
  tools.className = 'module-list-tools';
  tools.innerHTML = `<label class="module-search">${icon('search')}<span class="visually-hidden">Search ${meta.label}</span><input type="search" placeholder="Search ${meta.label.toLowerCase()}…" autocomplete="off"></label><span class="module-result-count" aria-live="polite">${rows.length} record${rows.length === 1 ? '' : 's'}</span>`;
  tableWrap.before(tools);
  const input = tools.querySelector('input');
  const output = tools.querySelector('.module-result-count');
  input.addEventListener('input', () => {
    const query = input.value.trim().toLowerCase();
    let visible = 0;
    rows.forEach(row => {
      const match = !query || row.textContent.toLowerCase().includes(query);
      row.hidden = !match;
      if (match) visible += 1;
    });
    output.textContent = `${visible} record${visible === 1 ? '' : 's'}`;
  });
}

function enhanceDashboard(scope) {
  const metricIcons = ['money', 'warning', 'payments', 'requests'];
  scope.querySelectorAll('.metric-card').forEach((card, index) => {
    if (!card.querySelector('.metric-icon')) card.insertAdjacentHTML('afterbegin', `<span class="metric-icon" aria-hidden="true">${icon(metricIcons[index] || 'dashboard')}</span>`);
  });
  scope.querySelectorAll('.queue-row').forEach(row => {
    if (!row.querySelector('.queue-open-icon')) row.insertAdjacentHTML('beforeend', `<span class="queue-open-icon" aria-hidden="true">${icon('arrowRight')}</span>`);
  });
}

function enhanceSettings(scope) {
  const formCard = scope.querySelector('.form-card');
  if (!formCard || formCard.querySelector('.settings-guide')) return;
  formCard.classList.add('settings-card');
  formCard.insertAdjacentHTML('afterbegin', `<div class="settings-guide" aria-label="Settings categories"><span>${icon('building')}Business identity</span><span>${icon('payments')}Payment details</span><span>${icon('quotations')}Document defaults</span><span>${icon('shield')}Protected settings</span></div>`);
}

export function enhanceAdminModule(key) {
  const scope = document.getElementById('portal-content');
  if (!scope) return;
  scope.dataset.module = key;
  scope.setAttribute('aria-busy', 'false');
  addModuleHeading(scope, key);
  scope.querySelectorAll('table').forEach(enhanceTable);
  addListTools(scope, key);
  decorateActions(scope);
  if (key === 'dashboard') enhanceDashboard(scope);
  if (key === 'settings') enhanceSettings(scope);
}

export function enhanceAdminShell() {
  const menu = document.getElementById('menu-button');
  if (menu) menu.innerHTML = icon('menu');
  const searchMark = document.querySelector('.global-search > span[aria-hidden="true"]');
  if (searchMark) searchMark.innerHTML = icon('search');
  const notification = document.querySelector('.notification-button');
  if (notification) notification.innerHTML = icon('bell');
  const signOut = document.getElementById('sign-out');
  if (signOut) signOut.insertAdjacentHTML('afterbegin', icon('logout'));
  const website = document.querySelector('.website-link');
  if (website) {
    const trailing = website.querySelector('span');
    if (trailing) trailing.innerHTML = icon('external');
  }
}

const observedContents = new WeakSet();
export function observeAdminModules() {
  const scope = document.getElementById('portal-content');
  if (!scope || observedContents.has(scope)) return;
  observedContents.add(scope);
  let scheduled = false;
  const observer = new MutationObserver(() => {
    if (scheduled) return;
    scheduled = true;
    queueMicrotask(() => {
      scheduled = false;
      if (scope.dataset.module) enhanceAdminModule(scope.dataset.module);
    });
  });
  observer.observe(scope, { childList: true, subtree: true });
}
