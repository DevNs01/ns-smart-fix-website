import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const source = readFileSync(join(root, 'index.html'), 'utf8');
const vercel = JSON.parse(readFileSync(join(root, 'vercel.json'), 'utf8'));
const failures = [];

const headers = new Map(vercel.headers?.find(rule => rule.source === '/(.*)')?.headers?.map(item => [item.key.toLowerCase(), item.value]) || []);
const requiredHeaders = ['content-security-policy', 'strict-transport-security', 'x-content-type-options', 'referrer-policy', 'permissions-policy', 'cross-origin-opener-policy'];
for (const name of requiredHeaders) if (!headers.has(name)) failures.push(`Missing security header: ${name}`);

const csp = headers.get('content-security-policy') || '';
for (const directive of ["default-src 'self'", "object-src 'none'", "base-uri 'self'", "frame-ancestors 'none'", "form-action 'none'"]) {
  if (!csp.includes(directive)) failures.push(`CSP missing: ${directive}`);
}
if (csp.includes("default-src *")) failures.push('CSP uses a wildcard default source');

if (!/accept="\.jpg,\.jpeg,\.png,\.webp,\.pdf/.test(source)) failures.push('File chooser allowlist missing');
if (!/files\.length > 5/.test(source) || !/5 \* 1024 \* 1024/.test(source)) failures.push('File count or size limit missing');
if (!/validPhone\(value\)/.test(source) || !/validName\(value\)/.test(source)) failures.push('Form validation helpers missing');
if ([...source.matchAll(/<a\b[^>]*target="_blank"[^>]*>/g)].some(match => !/rel="[^"]*noopener[^"]*noreferrer[^"]*"/.test(match[0]))) failures.push('External blank-target link lacks noopener noreferrer');

const forbiddenEnv = ['.env', '.env.local', '.env.production', '.env.preview'];
for (const file of forbiddenEnv) if (existsSync(join(root, file))) failures.push(`Forbidden environment file present: ${file}`);

const distFiles = existsSync(join(root, 'dist')) ? readdirSync(join(root, 'dist'), { recursive: true }).map(String) : [];
if (distFiles.some(file => file.endsWith('.map'))) failures.push('Production source map found');

const secretPatterns = [
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /(?:ghp|github_pat|gho)_[A-Za-z0-9_]{20,}/,
  /AKIA[0-9A-Z]{16}/,
  /(?:api[_-]?key|client[_-]?secret|password)\s*[:=]\s*['"][^'"]{8,}['"]/i
];
for (const pattern of secretPatterns) if (pattern.test(source)) failures.push(`Potential client-side secret matched pattern ${pattern}`);

if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}

console.log('Security checks passed: headers, CSP baseline, form constraints, file-selection limits, links, environment files, source maps, and common secret patterns.');
