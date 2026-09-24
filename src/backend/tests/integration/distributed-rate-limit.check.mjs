// Opt-in verification: two real Node processes and the configured PostgreSQL.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { loadEnvironment } from '../../dist/environment.js';
import { createPrismaClient } from '../../dist/database.js';
import { HmacRateLimitKeys } from '../../dist/infrastructure/security/hmac-rate-limit-keys.js';
import { PrismaRateLimitStore } from '../../dist/infrastructure/prisma/prisma-rate-limit-store.js';

const children = [], logs = [], hashes = new Set();
const secret = randomBytes(48).toString('base64url'), keys = new HmacRateLimitKeys(secret);
const email = `rate-verification-${randomUUID()}@example.invalid`;
let prisma, secondPrisma, phase = 'startup';
function report(values = {}) { console.log(JSON.stringify({ phase, ok: true, ...values })); }
function fail() { console.error(JSON.stringify({ phase, ok: false })); process.exitCode = 1; }
function digest(scope, address = '127.0.0.1', value = email) { const hash = keys.digest(scope, address, value); hashes.add(hash); return hash; }
async function freePort() {
  const server = createServer();
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const port = server.address().port; await new Promise((resolve) => server.close(resolve)); return port;
}
async function start(port) {
  const bootstrap = "process.on('message',message=>{if(message==='stop'){process.emit('SIGTERM');process.disconnect();}});await import('./dist/server.js');process.send(process.exitCode===1?'failed':'ready');";
  const child = spawn(process.execPath, ['--input-type=module', '-e', bootstrap], {
    cwd: fileURLToPath(new URL('../../', import.meta.url)), windowsHide: true, stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
    env: { ...process.env, HOST: '127.0.0.1', PORT: String(port), TRUST_PROXY: '', RATE_LIMIT_HMAC_SECRET: secret,
      AUTH_FRONTEND_ORIGIN: 'http://localhost:5173', RATE_LIMIT_ONBOARDING_MAX: '3', RATE_LIMIT_ONBOARDING_WINDOW_SECONDS: '86400',
      RATE_LIMIT_LOGIN_IP_MAX: '4', RATE_LIMIT_LOGIN_IDENTITY_MAX: '2', RATE_LIMIT_LOGIN_WINDOW_SECONDS: '86400',
      RATE_LIMIT_REFRESH_MAX: '3', RATE_LIMIT_REFRESH_WINDOW_SECONDS: '86400', RATE_LIMIT_CLEANUP_INTERVAL_MS: '3600000' },
  });
  children.push(child);
  child.stdout.on('data', (chunk) => logs.push(String(chunk))); child.stderr.on('data', (chunk) => logs.push(String(chunk)));
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Startup deadline')), 15000);
    child.once('message', (message) => { clearTimeout(timer); message === 'ready' ? resolve() : reject(new Error('Startup failed')); });
    child.once('exit', () => { clearTimeout(timer); reject(new Error('Backend exited')); });
  });
  const base = `http://127.0.0.1:${port}`;
  assert.equal((await fetch(`${base}/health`)).status, 200); assert.equal((await fetch(`${base}/ready`)).status, 200);
  return base;
}
async function request(base, path, payload) {
  const response = await fetch(`${base}/api/v1/${path}`, { method: 'POST', signal: AbortSignal.timeout(15000),
    headers: { origin: 'http://localhost:5173', 'content-type': 'application/json', 'x-forwarded-for': `192.0.2.${Math.floor(Math.random() * 200 + 1)}` },
    body: JSON.stringify(payload ?? {}) });
  if (response.status === 429) { assert.ok(Number(response.headers.get('retry-after')) >= 1); assert.ok(Number(response.headers.get('retry-after')) <= 86400); }
  const body = await response.text(); assert.equal(body.includes(email), false);
  return response.status;
}

try {
  const environment = loadEnvironment();
  prisma = createPrismaClient(environment.DATABASE_URL); secondPrisma = createPrismaClient(environment.DATABASE_URL);
  await prisma.$queryRaw`SELECT 1`;
  for (const scope of ['onboarding-ip', 'login-ip', 'login-identity', 'refresh-ip']) digest(scope);
  digest('login-identity', '127.0.0.1', `other-${email}`);
  digest('login-identity', '127.0.0.1', `third-${email}`);
  assert.equal(await prisma.rateLimitBucket.count({ where: { keyHash: { in: [...hashes] } } }), 0);
  const bases = [await start(await freePort()), await start(await freePort())];
  assert.notEqual(children[0].pid, children[1].pid);
  phase = 'two_process_onboarding_refresh';
  for (const [path, allowedStatus] of [['onboarding', 400], ['auth/refresh', 401]]) {
    const statuses = [];
    for (let index = 0; index < 5; ++index) statuses.push(await request(bases[index % 2], path));
    assert.deepEqual(statuses, [allowedStatus, allowedStatus, allowedStatus, 429, 429]);
  }
  report({ processes: 2, sharedLimit: 3, onboarding: [400, 400, 400, 429, 429], refresh: [401, 401, 401, 429, 429], retryAfter: true, spoofedForwardingIgnored: true });

  phase = 'two_process_login';
  const attempts = [email, ` ${email.toUpperCase()} `, email, `other-${email}`, `third-${email}`];
  const statuses = [];
  for (const [index, value] of attempts.entries()) statuses.push(await request(bases[index % 2], 'auth/login', { email: value, password: 'temporary-wrong-password' }));
  assert.deepEqual(statuses, [401, 401, 429, 401, 429]);
  report({ statuses, normalizedIdentityLimit: 2, ipLimit: 4, retryAfter: true });

  phase = 'real_atomic_concurrency';
  const stores = [new PrismaRateLimitStore(prisma), new PrismaRateLimitStore(secondPrisma)];
  const key = digest('refresh-ip', '192.0.2.200');
  const results = await Promise.all(Array.from({ length: 40 }, (_, index) => stores[index % 2].consume('refresh-ip', key, { limit: 7, windowSeconds: 86400 })));
  assert.equal(results.filter((result) => result.allowed).length, 7);
  assert.equal((await prisma.rateLimitBucket.findFirstOrThrow({ where: { keyHash: key } })).count, 8);
  report({ independentClients: 2, concurrentAttempts: 40, accepted: 7, blocked: 33, counterCapped: true });

  phase = 'real_next_window';
  const windowKey = digest('refresh-ip', '192.0.2.201');
  // Start near the beginning of a database-clock second to avoid crossing the boundary between the first two calls.
  let fraction;
  do { [{ fraction }] = await prisma.$queryRaw`SELECT (extract(epoch FROM clock_timestamp()) % 1)::float AS fraction`; if (fraction > 0.25) await delay(20); } while (fraction > 0.25);
  assert.equal((await stores[0].consume('refresh-ip', windowKey, { limit: 1, windowSeconds: 1 })).allowed, true);
  assert.equal((await stores[1].consume('refresh-ip', windowKey, { limit: 1, windowSeconds: 1 })).allowed, false);
  await delay(1100);
  assert.equal((await stores[1].consume('refresh-ip', windowKey, { limit: 1, windowSeconds: 1 })).allowed, true);
  report({ nextWindowAllowed: true });

  phase = 'real_cleanup_sql';
  // A session-local table exercises the exact cleanup SQL without deleting any existing application's buckets.
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`CREATE TEMP TABLE rate_limit_buckets (LIKE public.rate_limit_buckets INCLUDING ALL) ON COMMIT DROP`;
    await tx.$executeRaw`INSERT INTO rate_limit_buckets(scope,key_hash,window_start,count,expires_at) VALUES
      ('refresh-ip', ${windowKey}, now() - interval '2 minutes', 1, now() - interval '1 minute'),
      ('refresh-ip', ${windowKey}, now(), 1, now() + interval '1 minute')`;
    assert.equal(await new PrismaRateLimitStore(tx).deleteExpired(), 1);
    const [{ remaining }] = await tx.$queryRaw`SELECT count(*)::int AS remaining FROM rate_limit_buckets`;
    assert.equal(remaining, 1);
  });
  report({ expiredDeleted: 1, livePreserved: 1, existingApplicationBucketsUntouched: true });

  phase = 'database_key_privacy';
  const rows = await prisma.rateLimitBucket.findMany({ where: { keyHash: { in: [...hashes] } } });
  assert.ok(rows.length >= 5);
  assert.ok(rows.every((row) => /^[a-f0-9]{64}$/.test(row.keyHash)));
  assert.equal(JSON.stringify(rows).includes(email), false); assert.equal(JSON.stringify(rows).includes('127.0.0.1'), false);
  assert.equal(logs.join('').includes(email), false); assert.equal(logs.join('').includes(secret), false);
  const columns = await prisma.$queryRaw`SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='rate_limit_buckets' ORDER BY column_name`;
  assert.deepEqual(columns.map((row) => row.column_name), ['count', 'expires_at', 'key_hash', 'scope', 'window_start']);
  report({ persistedFields: 5, onlyHmacKeys: true, readablePersonalData: false });
} catch { fail(); }
finally {
  // Stop only children started by this verification, before deleting their isolated buckets.
  phase = 'process_cleanup';
  for (const child of children) if (child.exitCode === null) {
    try {
      child.send('stop');
      const deadline = Date.now() + 10000;
      while (child.exitCode === null && Date.now() < deadline) await delay(50);
      assert.equal(child.exitCode, 0);
    } catch { child.kill(); fail(); }
  }
  report({ startedProcesses: children.length, stopped: children.every((child) => child.exitCode !== null) });
  phase = 'temporary_bucket_cleanup';
  if (prisma) {
    try {
      const deleted = await prisma.rateLimitBucket.deleteMany({ where: { keyHash: { in: [...hashes] } } });
      const remaining = await prisma.rateLimitBucket.count({ where: { keyHash: { in: [...hashes] } } });
      assert.equal(remaining, 0); report({ deleted: deleted.count, remaining });
    } catch { fail(); }
  }
  await Promise.all([prisma, secondPrisma].filter(Boolean).map(async (client) => { try { await client.$disconnect(); } catch { fail(); } }));
}
