import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const source = readFileSync(join(root, 'index.html'), 'utf8');
const failures = [];

const bmTerms = /const BM_TERMS_FULL = `([\s\S]*?)`;/.exec(source)?.[1];
if (!bmTerms) failures.push('Missing full Bahasa Malaysia Terms and Conditions');
else {
  const numberedSections = bmTerms.match(/^\d+\.\s/gm) || [];
  if (numberedSections.length !== 28) failures.push(`Expected 28 BM terms sections, found ${numberedSections.length}`);
  if (!bmTerms.includes('PENERIMAAN PELANGGAN')) failures.push('Missing BM customer acceptance section');
}

const assetPaths = [...source.matchAll(/(?:src=|resolveAsset\([^,]+,)['"]?\{?\{?\s*['"]?(assets\/[A-Za-z0-9._-]+)/g)]
  .map(match => match[1]);

for (const asset of new Set(assetPaths)) {
  if (!existsSync(join(root, 'public', asset))) failures.push(`Missing source asset: ${asset}`);
  if (!existsSync(join(root, 'dist', asset))) failures.push(`Missing built asset: ${asset}`);
}

for (const match of source.matchAll(/<a\b[^>]*target="_blank"[^>]*>/g)) {
  if (!/rel="[^"]*noopener[^"]*"/.test(match[0])) failures.push(`Unsafe external link: ${match[0]}`);
}

const requiredPatterns = [
  ['Vite entry point', /<script type="module" src="\/src\/main\.js"><\/script>/],
  ['English navigation handlers', /const nav = \{ home:this\.go\('home'\).*faq:this\.go\('faq'\)/],
  ['WhatsApp contact 1', /this\.waLink\('60164110681'/],
  ['WhatsApp contact 2', /this\.waLink\('60128851681'/],
  ['Phone contact 1', /href="tel:\+60164110681"/],
  ['Phone contact 2', /href="tel:\+60128851681"/],
  ['Quick enquiry validation', /if \(!f\.name\.trim\(\) \|\| !f\.phone\.trim\(\)\)/],
  ['BM form validation', /Sila isi nama dan nombor telefon anda\./],
  ['Quotation privacy validation', /if \(!f\.agree\)/],
  ['Quick WhatsApp handoff', /quickWaLink/],
  ['Quotation WhatsApp handoff', /quoteWaLink/],
  ['BM WhatsApp labels', /isEn \? "Name: " : "Nama: "/],
  ['BM legal metadata', /Tarikh Berkuat Kuasa\|Tarikh Kemas Kini/],
  ['BM quick enquiry confirmation', /Pertanyaan anda sedia untuk dihantar\./],
  ['Mobile overflow protection', /html,body\{max-width:100%;overflow-x:hidden;\}/],
  ['Mobile stacked form fields', /\.ns-grid-2\{display:flex !important;flex-direction:column !important;/],
  ['Responsive quick enquiry card', /class="ns-quick-card"/],
];

for (const [name, pattern] of requiredPatterns) {
  if (!pattern.test(source)) failures.push(`Missing ${name}`);
}

if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}

console.log(`Verified ${new Set(assetPaths).size} referenced assets, navigation handlers, contact links, and form handoffs.`);
