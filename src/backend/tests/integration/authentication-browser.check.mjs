// Explicit Chrome + PostgreSQL verification. Requires pnpm build; never runs in Vitest.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { createServer } from '../../../frontend/node_modules/vite/dist/node/index.js';
import { loadEnvironment } from '../../dist/environment.js';
import { createPrismaClient } from '../../dist/database.js';
import { SignJWT } from 'jose';
import { PrismaAuthenticationRepository } from '../../dist/infrastructure/prisma/prisma-authentication-repository.js';
import { Session } from '../../dist/domain/sessions/session.js';
import { HmacRateLimitKeys } from '../../dist/infrastructure/security/hmac-rate-limit-keys.js';

const backendDirectory = fileURLToPath(new URL('../../', import.meta.url));
const workspace = dirname(backendDirectory.replace(/[\\/]$/, ''));
const runId = randomUUID();
const officeName = `RF004-006 browser ${runId}`;
const adminName = 'Browser Login Verification';
const email = `rf004-006-browser-${runId}@example.invalid`;
const password = randomUUID() + randomUUID();
const processLogs = [];
let prisma, backend, frontend, chrome, browser, secondBrowser, profile, ownsRecords = false;
const rateSecret = randomBytes(48).toString('base64url');
const keys = new HmacRateLimitKeys(rateSecret);
const rateHashes = ['onboarding-ip', 'login-ip', 'login-identity', 'refresh-ip'].map((scope) => keys.digest(scope, '127.0.0.1', email));
let phase = 'setup';
let accessToken, refreshToken;
const intercepted = new Map();

async function handlePaused(connection, params) {
  try {
    if (!params.responseStatusCode) {
      const headers = Object.entries(params.request.headers).filter(([name]) => name.toLowerCase() !== 'authorization').map(([name, value]) => ({ name, value }));
      if (connection.expiredAccessToken) {
        headers.push({ name: 'Authorization', value: `Bearer ${connection.expiredAccessToken}` });
        connection.expiredAccessToken = undefined;
        await connection.send('Fetch.continueRequest', { requestId: params.requestId, headers });
      } else await connection.send('Fetch.continueRequest', { requestId: params.requestId });
      return;
    }
    let body = null;
    if (params.responseStatusCode !== 204) {
      const raw = await connection.send('Fetch.getResponseBody', { requestId: params.requestId });
      body = JSON.parse(raw.base64Encoded ? Buffer.from(raw.body, 'base64').toString() : raw.body);
    }
    await connection.send('Fetch.continueResponse', { requestId: params.requestId });
    intercepted.set(params.networkId, { status: params.responseStatusCode, body });
  } catch { fail('browser_response_interception'); }
}

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
    if (!message.id) {
      events.push(message);
      if (message.method === 'Fetch.requestPaused') void handlePaused(connection, message.params);
      return;
    }
    const task = pending.get(message.id);
    if (task) {
      clearTimeout(task.timer); pending.delete(message.id);
      if (message.error) task.reject(new Error('Browser command failed')); else task.resolve(message.result);
    }
  });
  const connection = { socket, events, send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = ++next;
      const timer = setTimeout(() => { pending.delete(id); reject(new Error('Browser command timeout')); }, 10000);
      pending.set(id, { resolve, reject, timer }); socket.send(JSON.stringify({ id, method, params }));
    });
  } };
  return connection;
}
async function evaluate(expression) {
  return evaluateOn(browser, expression);
}
async function evaluateOn(connection, expression) {
  const result = await connection.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
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
  if (path.startsWith('/api/v1/auth/')) {
    return { ...await until(() => intercepted.get(request.params.requestId)), request: request.params.request };
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
  await prisma.$queryRaw`SELECT 1`;
  assert.equal(await prisma.rateLimitBucket.count({ where: { keyHash: { in: rateHashes } } }), 0);
  assert.equal(await prisma.user.count({ where: { email } }), 0);
  assert.equal(await prisma.office.count({ where: { name: officeName } }), 0);
  ownsRecords = true;
  const bootstrap = "process.on('message',message=>{if(message==='stop'){process.emit('SIGTERM');process.disconnect();}});await import('./dist/server.js');process.send(process.exitCode===1?'failed':'ready');";
  backend = spawn(process.execPath, ['--input-type=module', '-e', bootstrap], {
    cwd: backendDirectory, env: { ...process.env, HOST: '127.0.0.1', TRUST_PROXY: '', RATE_LIMIT_HMAC_SECRET: rateSecret, RATE_LIMIT_CLEANUP_INTERVAL_MS: '3600000', AUTH_FRONTEND_ORIGIN: 'http://127.0.0.1:5173' }, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
  });
  backend.stdout.on('data', (chunk) => processLogs.push(String(chunk)));
  backend.stderr.on('data', (chunk) => processLogs.push(String(chunk)));
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Backend startup deadline')), 15000);
    backend.once('message', (message) => { clearTimeout(timer); message === 'ready' ? resolve() : reject(new Error('Backend startup failed')); });
    backend.once('exit', () => { clearTimeout(timer); reject(new Error('Backend exited')); });
  });
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
  assert.equal((await fetch(`${frontendUrl}/favicon.svg`)).status, 200);
  assert.ok(existsSync(join(workspace, 'frontend', 'dist', 'favicon.svg')));
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
  await browser.send('Fetch.enable', { patterns: [{ urlPattern: '*/api/v1/auth/*', requestStage: 'Response' }, { urlPattern: '*/api/v1/auth/me', requestStage: 'Request' }] });

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
  assert.equal(Buffer.from(refreshToken.split('.')[1], 'base64url').length, 32);
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

  phase = 'reload_restores_and_rotates';
  const beforeReload = browser.events.length;
  await browser.send('Page.reload');
  await until(async () => {
    try { return await evaluate("document.querySelector('#login-title')?.textContent==='Sessão autenticada'"); }
    catch { return false; } // Navigation can destroy the previous execution context.
  });
  const renewed = await networkResponse('/api/v1/auth/refresh', beforeReload);
  assert.equal(renewed.status, 200); assert.equal(containsSensitiveField(renewed.body), false);
  const rotated = await prisma.session.findUniqueOrThrow({ where: { id: session.id } });
  assert.equal(rotated.refreshTokenHash === session.refreshTokenHash, false);
  assert.equal(rotated.expiresAt.getTime(), session.expiresAt.getTime());
  assert.ok(rotated.lastUsedAt);assert.equal(rotated.updatedAt.getTime(), rotated.lastUsedAt.getTime());
  assert.equal(await evaluate('(async()=>localStorage.length===0&&sessionStorage.length===0&&(await indexedDB.databases()).length===0)()'), true);
  report(phase, { refresh: 200, authenticated: true, hashRotated: true, absoluteExpiryPreserved: true, allBrowserStorageEmpty: true });

  phase = 'expired_access_refresh_and_retry';
  const timestamp = Math.floor(Date.now() / 1000);
  // Substitute only one outgoing Bearer with a genuinely signed expired JWT.
  // The frontend's production HTTP client must handle the real API 401 itself.
  const expiredAccessToken = await new SignJWT({ sessionId: session.id, activeOfficeId: session.activeOfficeId, role: 'OWNER' })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' }).setSubject(user.id)
    .setIssuer(environment.AUTH_JWT_ISSUER).setAudience(environment.AUTH_JWT_AUDIENCE)
    .setIssuedAt(timestamp - 901).setExpirationTime(timestamp - 1).sign(Buffer.from(environment.AUTH_JWT_SECRET, 'base64url'));
  const beforeExpiration = browser.events.length;
  browser.expiredAccessToken = expiredAccessToken;
  const finalStatus = await evaluate("import('/src/authentication.ts').then(({authClient})=>authClient.request('/api/v1/auth/me')).then(response=>response.status)");
  assert.equal(finalStatus, 200);
  const calls = browser.events.slice(beforeExpiration).filter((event) => event.method === 'Network.requestWillBeSent' && new URL(event.params.request.url).pathname.startsWith('/api/v1/auth/'));
  assert.deepEqual(calls.map((event) => new URL(event.params.request.url).pathname), ['/api/v1/auth/me', '/api/v1/auth/refresh', '/api/v1/auth/me']);
  assert.deepEqual(calls.map((event) => intercepted.get(event.params.requestId)?.status), [401, 200, 200]);
  report(phase, { expiredAccess: 401, refresh: 200, replay: 200, refreshRequests: 1, replays: 1 });

  phase = 'two_real_tabs';
  const target = await browser.send('Target.createTarget', { url: 'about:blank' });
  const allTargets = await fetch(`http://127.0.0.1:${port}/json/list`).then((response) => response.json());
  secondBrowser = await connect(allTargets.find((item) => item.id === target.targetId).webSocketDebuggerUrl);
  for (const method of ['Page.enable', 'Network.enable', 'Runtime.enable', 'Log.enable']) await secondBrowser.send(method);
  await secondBrowser.send('Fetch.enable', { patterns: [{ urlPattern: '*/api/v1/auth/*', requestStage: 'Response' }, { urlPattern: '*/api/v1/auth/me', requestStage: 'Request' }] });
  await secondBrowser.send('Page.navigate', { url: `${frontendUrl}/app` });
  const authenticated = "document.querySelector('#login-title')?.textContent==='Sessão autenticada'";
  await until(() => evaluateOn(secondBrowser, authenticated));
  const requests = (connection, from = 0) => connection.events.slice(from).filter((event) => event.method === 'Network.requestWillBeSent');
  assert.equal(requests(secondBrowser).filter((event) => new URL(event.params.request.url).pathname === '/api/v1/auth/refresh').length, 0);
  assert.equal(await evaluateOn(secondBrowser, "import('/src/authentication.ts').then(({authClient})=>authClient.getSnapshot().identity.user.id)"), user.id);
  const beforeTabs = [browser.events.length, secondBrowser.events.length];
  const priorRotation = await prisma.session.findUniqueOrThrow({ where: { id: session.id } });
  browser.expiredAccessToken = expiredAccessToken; secondBrowser.expiredAccessToken = expiredAccessToken;
  const statuses = await Promise.all([browser, secondBrowser].map((connection) => evaluateOn(connection,
    "import('/src/authentication.ts').then(({authClient})=>authClient.request('/api/v1/auth/me')).then(response=>response.status)")));
  assert.deepEqual(statuses, [200, 200]);
  const tabRequests = [browser, secondBrowser].flatMap((connection, index) => requests(connection, beforeTabs[index]));
  const refreshRequests = tabRequests.filter((event) => new URL(event.params.request.url).pathname === '/api/v1/auth/refresh');
  assert.equal(refreshRequests.length, 1); assert.equal(intercepted.get(refreshRequests[0].params.requestId)?.status, 200);
  const afterRotation = await prisma.session.findUniqueOrThrow({ where: { id: session.id } });
  assert.notEqual(afterRotation.refreshTokenHash, priorRotation.refreshTokenHash); assert.equal(afterRotation.revokedAt, null);
  assert.equal(await prisma.session.count({ where: { userId: user.id } }), 1);
  for (const connection of [browser, secondBrowser]) assert.equal(await evaluateOn(connection,
    '(async()=>localStorage.length===0&&sessionStorage.length===0&&(await indexedDB.databases()).length===0)()'), true);
  report(phase, { tabs: 2, secondTabRefreshes: 0, simultaneous401: 2, refreshRequests: 1, databaseHashRotated: true, sessionActive: true, browserStorageEmpty: true });

  // Both tabs observe definitive refresh failure; do not let a peer's current access token hide the test.
  phase = 'reuse_revokes_session';
  await browser.send('Network.setCookie', { name: 'refresh_token', value: refreshToken, url: frontendUrl, path: '/api/v1/auth', httpOnly: true, sameSite: 'Lax', secure: cookie.secure });
  const invalidated = await evaluate("import('/src/authentication.ts').then(({authClient})=>authClient.refresh())");
  assert.equal(invalidated, false);
  await until(() => evaluateOn(secondBrowser, "location.pathname==='/login'&&!!document.querySelector('#login-email')"));
  assert.ok((await prisma.session.findUniqueOrThrow({ where: { id: session.id } })).revokedAt);
  report(phase, { status: 401, persistedRevocation: true, bothTabsUnauthenticated: true });

  await until(() => evaluate("!!document.querySelector('#login-email')&&location.pathname==='/login'"));

  phase = 'second_login_and_logout';
  await fill({ '#login-email': email, '#login-password': password });
  const beforeSecondLogin = browser.events.length;
  await click('button[type=submit]');
  assert.equal((await networkResponse('/api/v1/auth/login', beforeSecondLogin)).status, 200);
  await until(() => evaluate("document.querySelector('#login-title')?.textContent==='Sessão autenticada'"));
  await until(() => evaluateOn(secondBrowser, authenticated));
  // Leave an authenticated document in browser history to exercise actual Back.
  await click('a[href="/"]');
  await until(() => evaluate("location.pathname==='/'&&!!document.querySelector('a[href=\"/login\"]')"));
  await click('a[href="/login"]');
  await until(() => evaluate("document.querySelector('#login-title')?.textContent==='Sessão autenticada'"));
  const beforeLogout = browser.events.length;
  await click('button[type=button]');
  assert.equal((await networkResponse('/api/v1/auth/logout', beforeLogout)).status, 204);
  await until(() => evaluateOn(secondBrowser, "location.pathname==='/login'&&!!document.querySelector('#login-email')"));
  assert.equal((await browser.send('Network.getCookies', { urls: [`${frontendUrl}/api/v1/auth/me`] })).cookies.some((item) => item.name === 'refresh_token'), false);
  const sessions = await prisma.session.findMany({ where: { userId: user.id } });
  assert.equal(sessions.length, 2);assert.equal(sessions.every((row) => row.revokedAt !== null), true);
  await browser.send('Page.reload');
  await until(() => evaluate("document.readyState==='complete'&&!!document.querySelector('#login-email')&&location.pathname==='/login'"));
  assert.equal(await evaluate("import('/src/authentication.ts').then(({authClient})=>authClient.getSnapshot().status==='unauthenticated'&&authClient.getSnapshot().identity===null)"), true);
  const history = await browser.send('Page.getNavigationHistory');
  const previousProtected = history.entries.slice(0, history.currentIndex).reverse().find((entry) => new URL(entry.url).pathname === '/app');
  assert.ok(previousProtected);
  await browser.send('Page.navigateToHistoryEntry', { entryId: previousProtected.id });
  await until(async () => {
    try { return await evaluate("location.pathname==='/login'&&!!document.querySelector('#login-email')&&!document.body.innerText.includes('Sessão autenticada')"); }
    catch { return false; }
  });
  report(phase, { logout: 204, bothTabsShowLogin: true, loginPropagated: true, cookieRemoved: true, persistedRevocation: true, reloadShowsLogin: true, backShowsLogin: true, memoryCleared: true });

  phase = 'real_atomic_rotation';
  const repository = new PrismaAuthenticationRepository(prisma);
  const digest = () => createHash('sha256').update(randomUUID()).digest('hex');
  const currentHash = digest(), nextHashes = [digest(), digest()];
  const concurrent = Session.create({ userId: user.id, activeOfficeId: office.id, refreshTokenHash: currentHash, expiresAt: new Date(Date.now() + 60000) });
  await repository.createSession(concurrent);
  const rotations = await Promise.all(nextHashes.map((nextHash) => repository.rotateSession({ id: concurrent.id, currentHash, nextHash, now: new Date() })));
  assert.equal(rotations.filter(Boolean).length, 1);
  const storedRotation = await prisma.session.findUniqueOrThrow({ where: { id: concurrent.id } });
  assert.equal(storedRotation.refreshTokenHash === nextHashes[rotations.indexOf(true)], true);
  await repository.revokeSession(concurrent.id, new Date());
  assert.ok((await prisma.session.findUniqueOrThrow({ where: { id: concurrent.id } })).revokedAt);
  report(phase, { competingUpdates: 2, acceptedUpdates: 1, persistedRevocation: true });
  phase = 'secret_redaction';
  const allEvents = [...browser.events, ...secondBrowser.events];
  const logs = processLogs.join('\n') + JSON.stringify(allEvents.filter((event) => ['Runtime.consoleAPICalled', 'Runtime.exceptionThrown', 'Log.entryAdded'].includes(event.method)));
  const issuedAccessTokens = [...intercepted.values()].map((response) => response.body?.accessToken).filter(Boolean);
  for (const secret of [password, refreshToken, accessToken, user.passwordHash, session.refreshTokenHash, rotated.refreshTokenHash, ...issuedAccessTokens]) assert.equal(logs.includes(secret), false);
  assert.equal(allEvents.some((event) => event.method === 'Runtime.exceptionThrown'), false);
  const faviconResponses = allEvents.filter((event) => event.method === 'Network.responseReceived' && new URL(event.params.response.url).pathname.startsWith('/favicon.'));
  assert.ok(faviconResponses.some((event) => event.params.response.status === 200));
  assert.equal(faviconResponses.some((event) => event.params.response.status === 404), false);
  report(phase, { secretsInLogs: false, favicon: 200, faviconInBuild: true, favicon404: false });
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
          const buckets = await tx.rateLimitBucket.deleteMany({ where: { keyHash: { in: rateHashes } } });
          const sessions = await tx.session.deleteMany({ where: { userId: { in: userIds }, activeOfficeId: { in: officeIds } } });
          const memberships = await tx.membership.deleteMany({ where: { userId: { in: userIds }, officeId: { in: officeIds } } });
          const users = await tx.user.deleteMany({ where: { id: { in: userIds }, email } });
          const offices = await tx.office.deleteMany({ where: { id: { in: officeIds }, name: officeName } });
          return { buckets: buckets.count, sessions: sessions.count, memberships: memberships.count, users: users.count, offices: offices.count };
        });
        const remaining = await prisma.session.count({ where: { userId: { in: userIds } } })
          + await prisma.membership.count({ where: { userId: { in: userIds } } })
          + await prisma.user.count({ where: { email } }) + await prisma.office.count({ where: { name: officeName } })
          + await prisma.rateLimitBucket.count({ where: { keyHash: { in: rateHashes } } });
        assert.equal(remaining, 0); report('temporary_records_cleanup', { removed, remaining });
      }
    } catch { fail('temporary_records_cleanup'); }
    finally { try { await prisma.$disconnect(); } catch { fail('disconnect'); } }
  }
  if (browser) { try { await browser.send('Browser.close'); } catch { /* Chrome can close the socket before replying. */ } browser.socket.close(); }
  secondBrowser?.socket.close();
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
