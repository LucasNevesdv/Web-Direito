import { randomBytes } from 'node:crypto';
import { appendFileSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parse } from 'dotenv';

try {
  const caminho = fileURLToPath(new URL('../.env', import.meta.url));
  const conteudoArquivo = readFileSync(caminho, 'utf8');
  if (!parse(conteudoArquivo).AUTH_JWT_SECRET) {
    const quebraLinha = conteudoArquivo.includes('\r\n') ? '\r\n' : '\n';
    appendFileSync(caminho, `${conteudoArquivo.endsWith('\n') ? '' : quebraLinha}AUTH_JWT_SECRET=${randomBytes(48).toString('base64url')}${quebraLinha}`);
    console.log('Local authentication secret configured. Existing settings preserved.');
  } else {
    console.log('Existing authentication secret preserved.');
  }
} catch {
  console.error('Could not configure local authentication. Check backend/.env permissions.');
  process.exitCode = 1;
}
