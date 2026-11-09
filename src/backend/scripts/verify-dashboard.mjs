// Executa as verificações apenas em um banco descartável criado por este comando.
import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { PrismaClient } from '@prisma/client';

const require = createRequire(import.meta.url);
if (!process.env.DATABASE_URL) throw new Error('Configure DATABASE_URL no backend/.env.');
const nome = `webdireito_dashboard_test_${randomUUID().replaceAll('-', '')}`;
const destino = new URL(process.env.DATABASE_URL);
const administracao = new URL(destino); administracao.pathname = '/postgres';
const admin = new PrismaClient({ datasources: { db: { url: administracao.toString() } } });
let criado = false;
try {
  await admin.$executeRawUnsafe(`CREATE DATABASE "${nome}"`); criado = true;
  destino.pathname = `/${nome}`;
  const env = { ...process.env, DATABASE_URL: destino.toString(), VERIFICACAO_BANCO_DESCARTAVEL: 'true' };
  for (const args of [[require.resolve('prisma/build/index.js'), 'migrate', 'deploy'], ['--import', 'tsx', 'tests/integration/dashboard.check.ts']]) {
    const resultado = spawnSync(process.execPath, args, { env, stdio: 'inherit' });
    if (resultado.error) throw resultado.error;
    if (resultado.status !== 0) throw new Error('A verificação do painel falhou.');
  }
} finally {
  if (criado) await admin.$executeRawUnsafe(`DROP DATABASE "${nome}"`);
  await admin.$disconnect();
}
