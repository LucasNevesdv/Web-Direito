import { randomBytes } from 'node:crypto';
import { appendFileSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parse } from 'dotenv';

try {
  const path = fileURLToPath(new URL('../.env', import.meta.url));
  const source = readFileSync(path, 'utf8');
  if (!parse(source).AUTH_JWT_SECRET) {
    const newline = source.includes('\r\n') ? '\r\n' : '\n';
    appendFileSync(path, `${source.endsWith('\n') ? '' : newline}AUTH_JWT_SECRET=${randomBytes(48).toString('base64url')}${newline}`);
    console.log('Local authentication secret configured. Existing settings preserved.');
  } else {
    console.log('Existing authentication secret preserved.');
  }
} catch {
  console.error('Could not configure local authentication. Check backend/.env permissions.');
  process.exitCode = 1;
}
