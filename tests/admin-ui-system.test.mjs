import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const shell = readFileSync(new URL('../src/admin.js', import.meta.url), 'utf8');
const ui = readFileSync(new URL('../src/admin-ui.js', import.meta.url), 'utf8');
const icons = readFileSync(new URL('../src/admin-icons.js', import.meta.url), 'utf8');
const css = readFileSync(new URL('../src/admin.css', import.meta.url), 'utf8');
const invoices = readFileSync(new URL('../src/admin-invoices.js', import.meta.url), 'utf8');
const modules = readFileSync(new URL('../src/admin-modules.js', import.meta.url), 'utf8');

const moduleKeys = ['dashboard','customers','requests','quotations','invoices','payments','receipts','settings','users','audit'];

test('every admin module uses the shared portal metadata and enhancement layer', () => {
  for (const key of moduleKeys) {
    assert.match(icons, new RegExp(`${key}: \\{ label:`));
  }
  assert.match(shell, /enhanceAdminModule\(button\.dataset\.module\)/);
  assert.match(shell, /observeAdminModules\(\)/);
  assert.match(ui, /scope\.dataset\.module/);
});

test('portal icons are local accessible SVGs from one consistent family', () => {
  assert.match(icons, /Lucide-style SVG primitives selected through IconBuddy/);
  assert.match(icons, /aria-hidden="true" focusable="false"/);
  assert.doesNotMatch(icons, /https?:\/\//);
  assert.match(shell, /icon\(iconName\)/);
  assert.match(invoices, /import \{ icon \} from '\.\/admin-icons\.js'/);
  assert.match(modules, /import \{ icon \} from '\.\/admin-icons\.js'/);
});

test('all record modules receive accessible search and responsive table labels', () => {
  for (const key of ['customers','requests','quotations','payments','receipts','users','audit']) {
    assert.match(ui, new RegExp(`'${key}'`));
  }
  assert.match(ui, /Search \$\{meta\.label\}/);
  assert.match(ui, /cell\.dataset\.label = headings\[index\]/);
  assert.match(ui, /aria-live="polite"/);
  assert.match(css, /content:attr\(data-label\)/);
});

test('portal-wide states and actions meet the shared interaction standard', () => {
  assert.match(modules, /aria-busy/);
  assert.match(modules, /module-loading/);
  assert.match(modules, /module-error/);
  assert.match(ui, /\.dialog-close/);
  assert.match(css, /min-height:42px/);
  assert.match(css, /prefers-reduced-motion:reduce/);
  assert.match(css, /module-toolbar-enhanced/);
  assert.match(css, /module-list-tools/);
  assert.match(css, /settings-guide/);
});
