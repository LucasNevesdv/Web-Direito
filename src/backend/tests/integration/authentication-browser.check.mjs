// Explicit Chrome + PostgreSQL verification. Requires pnpm build; never runs in Vitest.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { createServer } from '../../../frontend/node_modules/vite/dist/node/index.js';
import { loadEnvironment } from '../../dist/environment.js';
import { createPrismaClient } from '../../dist/database.js';

const backendDirectory = fileURLToPath(new URL('../../', import.meta.url));
const workspace = dirname(backendDirectory.replace(/[\\/]$/, ''));
const runId = randomUUID();
const officeName = `RF003 browser ${runId}`;
const adminName = 'Browser Login Verification';
const email = `rf003-browser-${runId}@example.invalid`;
const password = randomUUID() + randomUUID();
const processLogs = [];
let prisma, backend, frontend, chrome, browser, profile, ownsRecords = false;
let phase = 'setup';
let accessToken, refreshToken;

function report(phase, values = {}) { console.log(JSON.stringify({ phase, ok: true, ...values })); }
function fail(phase) { console.error(JSON.stringify({ phase, ok: false })); process.exitCode = 1; }
async function until(check, milliseconds = 20000) {
  const deadline = Date.now() + milliseconds;
  while (Date.now() < deadline) { const value = await check(); if (value) return value; await delay(100); }
  throw new Error('Verification deadline exceeded');
}
async function connect(url) {
  const socket = new WebSocket(url);
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', () => reject(new Error('Browser unavailable')), { once: true });
  });
  let next = 0;
  const pending = new Map(), events = [];
  socket.addEventListener('message', (event) => {
    const message = JSON.parse(String(event.data));
    if (!message.id) { events.push(message); return; }
    const task = pending.get(message.id);
    if (task) {
      clearTimeout(task.timer); pending.delete(message.id);
      if (message.error) task.reject(new Error('Browser command failed')); else task.resolve(message.result);
    }
  });
  return { socket, events, send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = ++next;
      const timer = setTimeout(() => { pending.delete(id); reject(new Error('Browser command timeout')); }, 10000);
      pending.set(id, { resolve, reject, timer }); socket.send(JSON.stringify({ id, method, params }));
    });
  } };
}
async function evaluate(expression) {
  const result = await browser.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails) throw new Error('Browser evaluation failed');
  return result.result.value;
}
async function click(selector) {
  const point = await evaluate(`(() => { const element = document.querySelector(${JSON.stringify(selector)}); if (!element) return null; element.scrollIntoView({block:'center'}); const r = element.getBoundingClientRect(); return {x:r.x+r.width/2,y:r.y+r.height/2}; })()`);
  assert.ok(point);
  await browser.send('Input.dispatchMouseEvent', { type: 'mousePressed', button: 'left', clickCount: 1, ...point });
  await browser.send('Input.dispatchMouseEvent', { type: 'mouseReleased', button: 'left', clickCount: 1, ...point });
}
async function fill(values) {
  for (const [selector, text] of Object.entries(values)) {
    await click(selector);
    // Reload can restore form values. Replace the field through native keyboard input.
    await browser.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'a', code: 'KeyA', windowsVirtualKeyCode: 65, modifiers: 2 });
    await browser.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'a', code: 'KeyA', windowsVirtualKeyCode: 65, modifiers: 2 });
    await browser.send('Input.insertText', { text });
  }
}
async function networkResponse(path, since = 0) {
  const request = await until(() => browser.events.slice(since).find((event) =>
    event.method === 'Network.requestWillBeSent' && new URL(event.params.request.url).pathname === path));
  if (path === '/api/v1/auth/login') {
    // Read the real response at the network boundary, including bodies the UI
    // deliberately does not consume for generic error messages.
    const paused = await until(() => browser.events.slice(since).find((event) =>
      event.method === 'Fetch.requestPaused' && event.params.networkId === request.params.requestId));
    const raw = await browser.send('Fetch.getResponseBody', { requestId: paused.params.requestId });
    await browser.send('Fetch.continueResponse', { requestId: paused.params.requestId });
    return {
      status: paused.params.responseStatusCode,
      body: JSON.parse(raw.base64Encoded ? Buffer.from(raw.body, 'base64').toString() : raw.body),
      request: request.params.request,
    };
  }
  const response = await until(() => browser.events.find((event) =>
    event.method === 'Network.responseReceived' && event.params.requestId === request.params.requestId));
  await until(() => browser.events.some((event) => event.method === 'Network.loadingFinished' && event.params.requestId === request.params.requestId));
  const raw = await browser.send('Network.getResponseBody', { requestId: request.params.requestId });
  const body = JSON.parse(raw.base64Encoded ? Buffer.from(raw.body, 'base64').toString() : raw.body);
  return { status: response.params.response.status, body, request: request.params.request };
}
function containsSensitiveField(value) {
  return !!value && typeof value === 'object' && Object.entries(value).some(([key, item]) =>
    /password|hash|refreshToken/i.test(key) || containsSensitiveField(item));
}

try {
  const environment = loadEnvironment();
  const hostname = environment.HOST === '0.0.0.0' ? '127.0.0.1' : environment.HOST === '::' ? '[::1]' : environment.HOST.includes(':') ? `[${environment.HOST}]` : environment.HOST;
  const backendUrl = `http://${hostname}:${environment.PORT}`;
  prisma = createPrismaClient(environment.DATABASE_URL);
  assert.equal(await prisma.user.count({ where: { email } }), 0);
  assert.equal(await prisma.office.count({ where: { name: officeName } }), 0);
  ownsRecords = true;
  const bootstrap = "process.on('message',message=>{if(message==='stop'){process.emit('SIGTERM');process.disconnect();}});await import('./src/server.ts');";
  backend = spawn(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', bootstrap], {
    cwd: backendDirectory, env: { ...process.env }, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
  });
  backend.stdout.on('data', (chunk) => processLogs.push(String(chunk)));
  backend.stderr.on('data', (chunk) => processLogs.push(String(chunk)));
  await until(async () => {
    if (backend.exitCode !== null) throw new Error('Backend exited');
    try { return (await fetch(`${backendUrl}/health`, { signal: AbortSignal.timeout(1000) })).status === 200; } catch { return false; }
  });
  assert.equal((await fetch(`${backendUrl}/ready`)).status, 200);
  process.env.BACKEND_PROXY_TARGET = backendUrl;
  process.chdir(join(workspace, 'frontend'));
  frontend = await createServer({
    server: { host: '127.0.0.1', port: 5173, strictPort: true }, logLevel: 'silent',
  });
  await frontend.listen();
  const frontendUrl = `http://127.0.0.1:${frontend.httpServer.address().port}`;
  phase = 'browser_start';
  const executable = process.env.CHROME_PATH ?? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  assert.ok(existsSync(executable));
  profile = mkdtempSync(join(tmpdir(), 'neodireito-rf003-browser-'));
  mkdirSync(join(profile, 'Default'));
  writeFileSync(join(profile, 'Default', 'Preferences'), JSON.stringify({ credentials_enable_service: false, profile: { password_manager_enabled: false } }));
  chrome = spawn(executable, ['--headless=new', '--remote-debugging-address=127.0.0.1', '--remote-debugging-port=0', `--user-data-dir=${profile}`,
    '--no-first-run', '--no-default-browser-check', '--disable-background-networking', '--disable-sync', '--disable-extensions', '--window-size=1280,1000', 'about:blank'],
  { windowsHide: true, stdio: 'ignore' });
  await until(() => existsSync(join(profile, 'DevToolsActivePort')));
  const port = Number(readFileSync(join(profile, 'DevToolsActivePort'), 'utf8').split('\n')[0]);
  const targets = await fetch(`http://127.0.0.1:${port}/json/list`).then((response) => response.json());
  browser = await connect(targets.find((target) => target.type === 'page').webSocketDebuggerUrl);
  for (const method of ['Page.enable', 'Network.enable', 'Runtime.enable', 'Log.enable']) await browser.send(method);
  await browser.send('Fetch.enable', { patterns: [{ urlPattern: '*/api/v1/auth/login', requestStage: 'Response' }] });

  phase = 'register_through_browser';
  await browser.send('Page.navigate', { url: `${frontendUrl}/register` });
  await until(() => evaluate("!!document.querySelector('#register-officeName')"));
  await fill({ '#register-officeName': officeName, '#register-adminName': adminName, '#register-email': email.toUpperCase(), '#register-password': password, '#register-passwordConfirmation': password });
  await click('button[type=submit]');
  const registration = await networkResponse('/api/v1/onboarding');
  assert.equal(registration.status, 201);
  await until(() => evaluate("!!document.querySelector('a[href=\"/login\"]')"));
  report(phase, { status: 201 });

  phase = 'login_through_browser';
  await click('a[href="/login"]');
  await until(() => evaluate("!!document.querySelector('#login-email')"));
  await fill({ '#login-email': email.toUpperCase(), '#login-password': password });
  const beforeLogin = browser.events.length;
  await click('button[type=submit]');
  const login = await networkResponse('/api/v1/auth/login', beforeLogin);
  assert.equal(login.status, 200);
  assert.deepEqual(Object.keys(JSON.parse(login.request.postData)).sort(), ['email', 'password']);
  assert.equal(containsSensitiveField(login.body), false);
  accessToken = login.body.accessToken;
  assert.equal(typeof accessToken, 'string');
  const me = await networkResponse('/api/v1/auth/me', beforeLogin);
  assert.equal(me.status, 200); assert.equal(me.body.office.role, 'OWNER');
  assert.equal(me.body.user.id, registration.body.user.id); assert.equal(me.body.office.id, registration.body.office.id);
  assert.equal(containsSensitiveField(me.body), false);
  assert.equal(JSON.stringify(me.body).includes(accessToken), false);
  await until(() => evaluate("!!document.querySelector('[role=status]')&&document.querySelector('#login-title').textContent==='Sessão autenticada'"));
  const text = await evaluate('document.body.innerText');
  assert.ok(text.includes(adminName) && text.includes(officeName) && text.includes('OWNER'));
  assert.equal(text.includes(accessToken), false);
  assert.equal(await evaluate('localStorage.length===0&&sessionStorage.length===0'), true);
  const cookies = await browser.send('Network.getCookies', { urls: [`${frontendUrl}/api/v1/auth/me`] });
  const cookie = cookies.cookies.find((item) => item.name === 'refresh_token');
  assert.ok(cookie); refreshToken = cookie.value;
  assert.equal(cookie.httpOnly, true); assert.equal(cookie.sameSite, 'Lax'); assert.equal(cookie.path, '/api/v1/auth');
  assert.equal(cookie.secure, environment.NODE_ENV === 'production');
  assert.equal(Buffer.from(refreshToken, 'base64url').length, 32);
  assert.equal(JSON.stringify(login.body).includes(refreshToken), false);
  assert.equal(JSON.stringify(me.body).includes(refreshToken), false);
  assert.equal((await evaluate('document.cookie')).includes(refreshToken), false);
  report(phase, { login: 200, me: 200, owner: true, authenticatedArea: true, httpOnly: true, sameSite: 'Lax', secure: cookie.secure, browserStorageEmpty: true });

  phase = 'real_session_persistence';
  const records = await prisma.session.findMany({ where: { userId: registration.body.user.id } });
  assert.equal(records.length, 1);
  const session = records[0];
  assert.equal(session.activeOfficeId, registration.body.office.id);
  assert.equal(session.refreshTokenHash, createHash('sha256').update(refreshToken).digest('hex'));
  assert.equal(session.expiresAt.getTime() - session.createdAt.getTime(), environment.AUTH_REFRESH_TTL_SECONDS * 1000);
  assert.equal(session.revokedAt, null);
  const user = await prisma.user.findUniqueOrThrow({ where: { email } });
  const office = await prisma.office.findUniqueOrThrow({ where: { id: registration.body.office.id } });
  const membership = await prisma.membership.findUniqueOrThrow({ where: { officeId_userId: { officeId: office.id, userId: user.id } } });
  const stored = JSON.stringify({ session, user, office, membership });
  for (const secret of [password, refreshToken, accessToken]) assert.equal(stored.includes(secret), false);
  const secretColumns = await prisma.$queryRaw`SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='sessions' AND column_name LIKE '%token%'`;
  assert.deepEqual(secretColumns, [{ column_name: 'refresh_token_hash' }]);
  report(phase, { sessions: 1, onlyRefreshHash: true, refreshLifetimeSeconds: environment.AUTH_REFRESH_TTL_SECONDS });

  phase = 'reload_and_invalid_password';
  await browser.send('Page.reload');
  await until(async () => {
    try { return await evaluate("document.readyState==='complete'&&!!document.querySelector('#login-email')"); }
    catch { return false; } // Navigation can destroy the previous execution context.
  });
  assert.equal(await evaluate("!!document.querySelector('[role=status]')"), false);
  await fill({ '#login-email': email, '#login-password': randomUUID() });
  const beforeFailure = browser.events.length;
  phase = 'invalid_password_submit';
  await click('button[type=submit]');
  const denied = await networkResponse('/api/v1/auth/login', beforeFailure);
  report('invalid_password_http', { status: denied.status });
  assert.equal(denied.status, 401); assert.equal(denied.body.error, 'INVALID_CREDENTIALS');
  await until(() => evaluate("!!document.querySelector('[role=alert]')"));
  phase = 'invalid_password_session_count';
  assert.equal(await prisma.session.count({ where: { userId: user.id } }), 1);
  assert.equal(await evaluate('localStorage.length===0&&sessionStorage.length===0'), true);
  phase = 'secret_redaction';
  const logs = processLogs.join('\n') + JSON.stringify(browser.events.filter((event) => ['Runtime.consoleAPICalled', 'Runtime.exceptionThrown', 'Log.entryAdded'].includes(event.method)));
  for (const secret of [password, refreshToken, accessToken]) assert.equal(logs.includes(secret), false);
  assert.equal(browser.events.some((event) => event.method === 'Runtime.exceptionThrown'), false);
  const favicon404 = browser.events.some((event) => event.method === 'Network.responseReceived' && event.params.response.status === 404 && new URL(event.params.response.url).pathname === '/favicon.ico');
  report(phase, { status: 401, genericResponse: true, reloadRequiresLogin: true, secretsInLogs: false, favicon404 });
} catch {
  fail(phase);
  if (browser && phase === 'invalid_password_submit') {
    try {
      report('form_diagnostic', await evaluate(`({emailMatches:document.querySelector('#login-email')?.value===${JSON.stringify(email)}, passwordLength:document.querySelector('#login-password')?.value.length, alerts:document.querySelectorAll('[role=alert]').length})`));
      const responses = browser.events.filter((event) => event.method === 'Network.responseReceived' && new URL(event.params.response.url).pathname.startsWith('/api/'));
      report('network_diagnostic', { responses: responses.map((event) => ({ path: new URL(event.params.response.url).pathname, status: event.params.response.status })) });
    } catch { /* Report only sanitized diagnostics. */ }
  }
}
finally {
  if (prisma) {
    try {
      if (ownsRecords) {
        const users = await prisma.user.findMany({ where: { email }, select: { id: true } });
        const offices = await prisma.office.findMany({ where: { name: officeName }, select: { id: true } });
        const userIds = users.map((row) => row.id), officeIds = offices.map((row) => row.id);
        const removed = await prisma.$transaction(async (tx) => {
          const sessions = await tx.session.deleteMany({ where: { userId: { in: userIds }, activeOfficeId: { in: officeIds } } });
          const memberships = await tx.membership.deleteMany({ where: { userId: { in: userIds }, officeId: { in: officeIds } } });
          const users = await tx.user.deleteMany({ where: { id: { in: userIds }, email } });
          const offices = await tx.office.deleteMany({ where: { id: { in: officeIds }, name: officeName } });
          return { sessions: sessions.count, memberships: memberships.count, users: users.count, offices: offices.count };
        });
        const remaining = await prisma.session.count({ where: { userId: { in: userIds } } })
          + await prisma.membership.count({ where: { userId: { in: userIds } } })
          + await prisma.user.count({ where: { email } }) + await prisma.office.count({ where: { name: officeName } });
        assert.equal(remaining, 0); report('temporary_records_cleanup', { removed, remaining });
      }
    } catch { fail('temporary_records_cleanup'); }
    finally { try { await prisma.$disconnect(); } catch { fail('disconnect'); } }
  }
  if (browser) { try { await browser.send('Browser.close'); } catch { /* Chrome can close the socket before replying. */ } browser.socket.close(); }
  if (chrome) { try { await until(() => chrome.exitCode !== null, 10000); } catch { chrome.kill(); fail('browser_close'); } }
  if (frontend) { try { await frontend.close(); } catch { fail('frontend_close'); } }
  if (backend && backend.exitCode === null) {
    try { backend.send('stop'); await until(() => backend.exitCode !== null, 10000); assert.equal(backend.exitCode, 0); }
    catch { backend.kill(); fail('backend_close'); }
  }
  if (profile) {
    try {
      const resolved = realpathSync(profile), parent = realpathSync(tmpdir());
      assert.ok(resolved.toLowerCase().startsWith((parent + sep).toLowerCase()));
      assert.ok(resolved.split(sep).at(-1).startsWith('neodireito-rf003-browser-'));
      rmSync(resolved, { recursive: true, force: true, maxRetries: 5, retryDelay: 250 });
    } catch { fail('profile_cleanup'); }
  }
  report('verification_resources_closed');
}
