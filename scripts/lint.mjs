import { readFileSync } from 'node:fs';

const files = ['index.html', 'src/main.js', 'support.js', 'scripts/verify.mjs', 'scripts/security-test.mjs'];
const failures = [];

for (const file of files) {
  const text = readFileSync(file, 'utf8');
  if (/\r(?!\n)/.test(text)) failures.push(`${file}: contains bare carriage returns`);
  if (/[ \t]+$/m.test(text)) failures.push(`${file}: contains trailing whitespace`);
  if (!text.endsWith('\n')) failures.push(`${file}: missing final newline`);
}

if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}

console.log(`Linted ${files.length} source and verification files.`);
