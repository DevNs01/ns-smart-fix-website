const root = document.getElementById('admin-app');

const modules = [
  ['dashboard', 'Dashboard', '▦'], ['customers', 'Customers', '♙'],
  ['requests', 'Requests', '✉'], ['quotations', 'Quotations', '▤'],
  ['invoices', 'Invoices', '▧'], ['payments', 'Payments', 'RM'],
  ['receipts', 'Receipts', '✓'], ['settings', 'Company Settings', '⚙'],
  ['users', 'User Management', '♟'], ['audit', 'Audit Log', '◷']
];

function escapeHtml(value) {
  return String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;');
}

async function api(action, options = {}) {
  const response = await fetch(`/api/admin-auth?action=${encodeURIComponent(action)}`, {
    ...options,
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) }
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || 'The secure service is unavailable.');
  return result;
}

function renderLogin(message = '') {
  root.innerHTML = `
    <main class="login-page">
      <section class="login-brand" aria-label="NS Smart Fix Solution staff portal">
        <a href="/" class="brand-link" aria-label="Return to NS Smart Fix Solution website">
          <img src="/assets/ns-smart-fix-logo-transparent.png" alt="NS Smart Fix Solution">
        </a>
        <div>
          <span class="eyebrow">SECURE BUSINESS PORTAL</span>
          <h1>Manage work with clarity.</h1>
          <p>A private workspace for customers, quotations, invoices, payments and business records.</p>
        </div>
        <ul class="login-points">
          <li><span>✓</span> Authorized staff access only</li>
          <li><span>✓</span> Protected by database permissions</li>
          <li><span>✓</span> Activity recorded for accountability</li>
        </ul>
      </section>
      <section class="login-panel">
        <div class="login-card">
          <span class="eyebrow">STAFF SIGN IN</span>
          <h2>Welcome back</h2>
          <p>Enter your authorized NS Smart Fix account.</p>
          <form id="login-form" novalidate>
            <div class="field">
              <label for="email">Email address</label>
              <input id="email" name="email" type="email" autocomplete="username" maxlength="254" required>
            </div>
            <div class="field">
              <label for="password">Password</label>
              <input id="password" name="password" type="password" autocomplete="current-password" minlength="8" maxlength="200" required>
            </div>
            <div id="login-error" class="form-error" role="alert" ${message ? '' : 'hidden'}>${escapeHtml(message)}</div>
            <button class="primary-button" type="submit">Sign in securely</button>
          </form>
          <p class="login-help">Access is limited to active Admin and Staff accounts. Contact the administrator if you cannot sign in.</p>
          <a class="back-link" href="/">← Return to public website</a>
        </div>
      </section>
    </main>`;

  const form = document.getElementById('login-form');
  form.addEventListener('submit', async event => {
    event.preventDefault();
    const button = form.querySelector('button');
    const error = document.getElementById('login-error');
    if (!form.reportValidity()) return;
    button.disabled = true;
    button.textContent = 'Signing in…';
    error.hidden = true;
    try {
      const fields = new FormData(form);
      const session = await api('login', {
        method: 'POST',
        body: JSON.stringify({ email: fields.get('email'), password: fields.get('password') })
      });
      renderPortal(session.profile);
    } catch (loginError) {
      error.textContent = loginError.message;
      error.hidden = false;
      button.disabled = false;
      button.textContent = 'Sign in securely';
    }
  });
}

function allowedModules(role) {
  return modules.filter(([key]) => role === 'admin' || !['settings', 'users', 'audit'].includes(key));
}

function renderPortal(profile) {
  const roleLabel = profile.role === 'admin' ? 'Admin' : 'Staff';
  root.innerHTML = `
    <div class="portal-shell">
      <aside class="sidebar" id="portal-sidebar">
        <a class="portal-logo" href="/admin" aria-label="NS Smart Fix portal dashboard">
          <img src="/assets/ns-smart-fix-logo-transparent.png" alt="NS Smart Fix Solution">
          <div><strong>NS Smart Fix</strong><span>Business Portal</span></div>
        </a>
        <nav aria-label="Portal navigation">
          ${allowedModules(profile.role).map(([key, label, icon], index) => `
            <button type="button" class="nav-item${index === 0 ? ' active' : ''}" data-module="${key}">
              <span class="nav-icon" aria-hidden="true">${icon}</span><span>${label}</span>
            </button>`).join('')}
        </nav>
        <a class="website-link" href="/">↗ View public website</a>
      </aside>
      <div class="portal-main">
        <header class="portal-header">
          <button id="menu-button" class="menu-button" type="button" aria-controls="portal-sidebar" aria-expanded="false" aria-label="Open navigation">☰</button>
          <div><span class="header-kicker">NS SMART FIX SOLUTION</span><strong id="page-title">Dashboard</strong></div>
          <div class="profile-menu">
            <div class="profile-copy"><strong>${escapeHtml(profile.full_name)}</strong><span>${roleLabel}</span></div>
            <span class="avatar" aria-hidden="true">${escapeHtml(profile.full_name.charAt(0).toUpperCase())}</span>
            <button id="sign-out" class="sign-out" type="button">Sign out</button>
          </div>
        </header>
        <main class="portal-content" id="portal-content">
          ${dashboardMarkup(profile)}
        </main>
      </div>
      <button type="button" class="sidebar-overlay" id="sidebar-overlay" aria-label="Close navigation"></button>
    </div>`;

  const sidebar = document.getElementById('portal-sidebar');
  const menu = document.getElementById('menu-button');
  const overlay = document.getElementById('sidebar-overlay');
  const closeMenu = () => { sidebar.classList.remove('open'); menu.setAttribute('aria-expanded', 'false'); };
  menu.addEventListener('click', () => {
    const open = sidebar.classList.toggle('open');
    menu.setAttribute('aria-expanded', String(open));
  });
  overlay.addEventListener('click', closeMenu);

  document.querySelectorAll('.nav-item').forEach(button => button.addEventListener('click', () => {
    document.querySelectorAll('.nav-item').forEach(item => item.classList.remove('active'));
    button.classList.add('active');
    const label = button.querySelector('span:last-child').textContent;
    document.getElementById('page-title').textContent = label;
    document.getElementById('portal-content').innerHTML = button.dataset.module === 'dashboard'
      ? dashboardMarkup(profile) : emptyModuleMarkup(label);
    closeMenu();
  }));

  document.getElementById('sign-out').addEventListener('click', async () => {
    const button = document.getElementById('sign-out');
    button.disabled = true;
    try { await api('logout', { method: 'POST', body: '{}' }); } catch {}
    renderLogin();
  });
}

function dashboardMarkup(profile) {
  return `
    <section class="welcome-row">
      <div><span class="eyebrow">OVERVIEW</span><h1>Good day, ${escapeHtml(profile.full_name.split(' ')[0])}</h1><p>Your secure business workspace is ready.</p></div>
      <span class="phase-badge">Phase 2 · Authentication active</span>
    </section>
    <section class="metric-grid" aria-label="Dashboard summary placeholders">
      ${[['Total quotations','—','blue'],['Pending quotations','—','orange'],['Total invoices','—','navy'],['Outstanding balance','—','green']]
        .map(([label, value, colour]) => `<article class="metric-card ${colour}"><span>${label}</span><strong>${value}</strong><small>Available after business modules are connected</small></article>`).join('')}
    </section>
    <section class="dashboard-grid">
      <article class="content-card"><div class="card-heading"><div><span class="eyebrow">IMPLEMENTATION STATUS</span><h2>Portal foundation</h2></div><span class="status success">Protected</span></div>
        <div class="readiness-list"><div><span>✓</span><p><strong>Secure authentication</strong>Server-managed session with active profile verification.</p></div><div><span>✓</span><p><strong>Role enforcement</strong>Admin and Staff permissions are backed by Supabase RLS.</p></div><div><span>→</span><p><strong>Next: Customer management</strong>Phase 3 will activate customer and enquiry workflows.</p></div></div>
      </article>
      <article class="content-card"><div class="card-heading"><div><span class="eyebrow">YOUR ACCESS</span><h2>${profile.role === 'admin' ? 'Administrator' : 'Staff member'}</h2></div></div>
        <p class="muted">Signed in as <strong>${escapeHtml(profile.full_name)}</strong>. ${profile.role === 'admin' ? 'You have access to portal configuration and staff management.' : 'Sensitive configuration and user management remain restricted.'}</p>
      </article>
    </section>`;
}

function emptyModuleMarkup(label) {
  return `<section class="empty-state"><span class="empty-icon">◇</span><h1>${escapeHtml(label)}</h1><p>This module is secured and reserved for its scheduled implementation phase.</p><button type="button" class="secondary-button" onclick="document.querySelector('[data-module=dashboard]').click()">Return to dashboard</button></section>`;
}

async function start() {
  try {
    const session = await api('session');
    renderPortal(session.profile);
  } catch {
    renderLogin();
  }
}

start();
