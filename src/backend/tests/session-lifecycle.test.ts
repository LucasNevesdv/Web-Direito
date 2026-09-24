import { createHash, randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildApp } from '../src/app.js';
import { RefreshSession } from '../src/application/authentication/refresh-session.js';
import { InvalidAccessTokenError } from '../src/application/authentication/authentication-errors.js';
import { Session } from '../src/domain/sessions/session.js';
import { User } from '../src/domain/users/user.js';
import { authenticationFixture, testPassword } from './support/authentication-fixture.js';
import { rateLimiterFixture } from './support/rate-limiter-fixture.js';

const origin = 'https://app.example.test';
const apps: ReturnType<typeof buildApp>[] = [];
afterEach(async () => { await Promise.all(apps.splice(0).map((app) => app.close())); });
async function setup(secureCookie = false, refreshLimit = 30) {
  const fixture = await authenticationFixture();
  const login = await fixture.login.execute({ email: fixture.account.user.email, password: testPassword });
  const session = [...fixture.sessions.values()][0];
  const app = buildApp({ check: async () => {} }, undefined, {
    login: fixture.login, identity: fixture.identity, refresh: fixture.refreshSession, logout: fixture.logout,
    secureCookie, frontendOrigin: origin, refreshTtlSeconds: 604800,
  }, { limiter: rateLimiterFixture({ 'refresh-ip': { limit: refreshLimit, windowSeconds: 60 } }).limiter });
  apps.push(app);
  const post = (route: string, token: string | undefined = login.refreshToken) => app.inject({
    method: 'POST', url: `/api/v1/auth/${route}`, headers: { origin, ...(token ? { cookie: `refresh_token=${token}` } : {}) },
  });
  return { ...fixture, app, result: login, session, post };
}

describe('session renewal and logout', () => {
  it.each([false, true])('rotates the hash, signs claims, preserves expiry and protects cookie (secure=%s)', async (secure) => {
    const f = await setup(secure);
    const response = await f.post('refresh');
    expect(response.statusCode).toBe(200);
    const token = response.cookies[0].value;
    expect(token === f.result.refreshToken).toBe(false);
    const stored = f.sessions.get(f.session.id)!.toPersistence();
    expect(stored.refreshTokenHash === createHash('sha256').update(token).digest('hex')).toBe(true);
    expect(stored.refreshTokenHash === f.session.toPersistence().refreshTokenHash).toBe(false);
    expect(stored.lastUsedAt).toBeInstanceOf(Date);
    expect(stored.updatedAt).toEqual(stored.lastUsedAt);
    expect(stored.expiresAt).toEqual(f.session.expiresAt);
    expect(Object.keys(response.json()).sort()).toEqual(['accessToken', 'expiresIn', 'office', 'user']);
    for (const secret of [token, stored.refreshTokenHash, f.account.user.passwordHash]) expect(response.body.includes(secret)).toBe(false);
    expect(await f.tokens.verify(response.json().accessToken)).toEqual({ userId: stored.userId, sessionId: stored.id, activeOfficeId: stored.activeOfficeId, role: 'OWNER' });
    const cookie = String(response.headers['set-cookie']);
    for (const flag of ['HttpOnly', 'SameSite=Lax', 'Path=/api/v1/auth']) expect(cookie).toContain(flag);
    expect(cookie.includes('Secure')).toBe(secure);
    expect(response.headers['cache-control']).toBe('no-store');
    expect((await f.post('refresh', token)).statusCode).toBe(200);
  });

  it.each(['missing-cookie', 'malformed', 'legacy', 'oversized', 'missing-session', 'expired', 'revoked', 'inactive-user', 'inactive-office', 'missing-membership', 'wrong-office', 'wrong-user', 'wrong-hash'] as const)('rejects %s with the same sanitized 401 and clears cookie', async (scenario) => {
    const f = await setup();
    let token = f.result.refreshToken;
    const state = f.session.toPersistence();
    if (scenario === 'missing-cookie') token = '';
    if (scenario === 'malformed') token = 'internal-secret-invalid';
    if (scenario === 'legacy') token = 'a'.repeat(43);
    if (scenario === 'oversized') token = 'x'.repeat(5000);
    if (scenario === 'missing-session') f.sessions.clear();
    if (scenario === 'expired') f.sessions.set(state.id, Session.restore({ ...state, createdAt: new Date(0), expiresAt: new Date(1) }));
    if (scenario === 'revoked') await f.repository.revokeSession(state.id, new Date());
    if (scenario === 'inactive-user') {
      const user = f.account.user;
      f.account.user = User.restore({ id: user.id, name: user.name, email: user.email, passwordHash: user.passwordHash, status: 'INACTIVE', createdAt: user.createdAt, updatedAt: user.updatedAt });
    }
    if (scenario === 'inactive-office') f.account.memberships[0].office.status = 'INACTIVE';
    if (scenario === 'missing-membership') f.account.memberships = [];
    if (scenario === 'wrong-office') f.sessions.set(state.id, Session.restore({ ...state, activeOfficeId: randomUUID() }));
    if (scenario === 'wrong-user') f.sessions.set(state.id, Session.restore({ ...state, userId: randomUUID() }));
    if (scenario === 'wrong-hash') token = f.refresh.generate(state.id).token;
    const response = await f.post('refresh', token);
    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({ error: 'UNAUTHORIZED', message: 'Entre novamente para continuar.' });
    expect(String(response.headers['set-cookie'])).toContain('refresh_token=;');
    expect(f.repository.rotateSession).not.toHaveBeenCalled();
    if (scenario === 'wrong-hash') expect(f.sessions.get(state.id)!.toPersistence().revokedAt).toBeInstanceOf(Date);
  });

  it('revokes the entire session after reuse and rejects the replacement token and me', async () => {
    const f = await setup();
    const rotated = await f.post('refresh');
    expect((await f.post('refresh')).statusCode).toBe(401);
    expect(f.sessions.get(f.session.id)!.toPersistence().revokedAt).toBeInstanceOf(Date);
    expect((await f.post('refresh', rotated.cookies[0].value)).statusCode).toBe(401);
    await expect(f.identity.execute(rotated.json().accessToken)).rejects.toBeInstanceOf(InvalidAccessTokenError);
  });

  it('allows only one concurrent consumer and revokes the session on duplicate consumption', async () => {
    const f = await setup();
    const responses = await Promise.all([f.post('refresh'), f.post('refresh')]);
    expect(responses.map((r) => r.statusCode).sort()).toEqual([200, 401]);
    expect(f.sessions.get(f.session.id)!.toPersistence().revokedAt).toBeInstanceOf(Date);
  });

  it('never extends the absolute deadline close to expiration', async () => {
    const f = await setup();
    const now = new Date(f.session.expiresAt.getTime() - 1);
    const refresh = new RefreshSession(f.repository, f.refresh, f.tokens, 900, () => now);
    const result = await refresh.execute(f.result.refreshToken);
    expect(result.refreshExpiresAt).toEqual(f.session.expiresAt);
    const expired = new RefreshSession(f.repository, f.refresh, f.tokens, 900, () => f.session.expiresAt);
    await expect(expired.execute(result.refreshToken)).rejects.toBeInstanceOf(InvalidAccessTokenError);
  });

  it.each([false, true])('logout revokes persistently and clears the same cookie options (secure=%s)', async (secure) => {
    const f = await setup(secure);
    const response = await f.post('logout');
    expect(response.statusCode).toBe(204); expect(response.body).toBe('');
    const revokedAt = f.sessions.get(f.session.id)!.toPersistence().revokedAt;
    expect(revokedAt).toBeInstanceOf(Date);
    expect((await f.post('logout')).statusCode).toBe(204);
    expect(f.sessions.get(f.session.id)!.toPersistence().revokedAt).toEqual(revokedAt);
    const cookie = String(response.headers['set-cookie']);
    for (const flag of ['refresh_token=;', 'Expires=Thu, 01 Jan 1970', 'HttpOnly', 'Path=/api/v1/auth', 'SameSite=Lax']) expect(cookie).toContain(flag);
    expect(cookie.includes('Secure')).toBe(secure);
    expect((await f.post('refresh')).statusCode).toBe(401);
  });

  it.each(['', 'malformed', 'x'.repeat(5000), 'expired', 'unknown'])('makes logout idempotent for invalid/absent sessions (case %#)', async (input) => {
    const f = await setup();
    let token = input;
    if (input === 'expired') {
      f.sessions.set(f.session.id, Session.restore({ ...f.session.toPersistence(), createdAt: new Date(0), expiresAt: new Date(1) }));
      token = f.result.refreshToken;
    }
    if (input === 'unknown') token = f.refresh.generate().token;
    const response = await f.post('logout', token);
    expect(response.statusCode).toBe(204);
    expect(String(response.headers['set-cookie'])).toContain('refresh_token=;');
  });

  it.each(['login', 'refresh', 'logout'])('rejects absent/foreign Origin for %s without mutation', async (route) => {
    const f = await setup();
    for (const candidate of [undefined, 'null', 'https://evil.example.test', `${origin}.evil.test`]) {
      const response = await f.app.inject({ method: 'POST', url: `/api/v1/auth/${route}`, headers: { ...(candidate ? { origin: candidate } : {}), cookie: `refresh_token=${f.result.refreshToken}` } });
      expect(response.statusCode).toBe(403);
      expect(response.headers['set-cookie']).toBeUndefined();
      expect(response.headers['access-control-allow-origin']).toBeUndefined();
    }
    expect(f.repository.rotateSession).not.toHaveBeenCalled();
    expect(f.repository.revokeSession).not.toHaveBeenCalled();
  });

  it('accepts refresh only by POST and cookie, never body/query', async () => {
    const f = await setup();
    for (const route of ['refresh', 'logout']) expect((await f.app.inject(`/api/v1/auth/${route}`)).statusCode).toBe(404);
    expect((await f.app.inject({ method: 'POST', url: '/api/v1/auth/refresh', headers: { origin }, payload: { refreshToken: f.result.refreshToken } })).statusCode).toBe(401);
    expect((await f.app.inject({ method: 'POST', url: '/api/v1/auth/refresh?token=invalid', headers: { origin } })).statusCode).toBe(401);
  });

  it('limits refresh per process/IP and sanitizes internal failures', async () => {
    const f = await setup(false, 2);
    vi.mocked(f.repository.findSession).mockRejectedValueOnce(new Error('private-database-and-token-detail'));
    const failure = await f.post('refresh');
    expect(failure.statusCode).toBe(500);
    expect(failure.body).not.toContain('private-database');
    await f.post('refresh', 'malformed');
    expect((await f.post('refresh')).statusCode).toBe(429);
    expect((await f.app.inject('/health')).statusCode).toBe(200);
  });

  it('does not consume a refresh when signing fails', async () => {
    const f = await setup();
    vi.spyOn(f.tokens, 'sign').mockRejectedValueOnce(new Error('private-signing-detail'));
    const response = await f.post('refresh');
    expect(response.statusCode).toBe(500);expect(response.body).not.toContain('private-signing-detail');
    expect(f.repository.rotateSession).not.toHaveBeenCalled();
    expect(f.sessions.get(f.session.id)!.toPersistence().refreshTokenHash).toBe(f.session.toPersistence().refreshTokenHash);
  });

  it('reports a failed persistent logout and still clears the cookie', async () => {
    const f = await setup();
    vi.mocked(f.repository.revokeSession).mockRejectedValueOnce(new Error('private-database-detail'));
    const response = await f.post('logout');
    expect(response.statusCode).toBe(500);expect(response.body).not.toContain('private-database-detail');
    expect(String(response.headers['set-cookie'])).toContain('refresh_token=;');
    expect(f.sessions.get(f.session.id)!.toPersistence().revokedAt).toBeNull();
  });

  it('bounds cookie Max-Age to remaining session lifetime', async () => {
    const f = await setup();
    const expiresAt = new Date(Date.now() + 60000);
    f.sessions.set(f.session.id, Session.restore({ ...f.session.toPersistence(), expiresAt }));
    const response = await f.post('refresh');
    expect(response.statusCode).toBe(200);
    const maxAge = Number(String(response.headers['set-cookie']).match(/Max-Age=(\d+)/)![1]);
    expect(maxAge).toBeGreaterThan(0);expect(maxAge).toBeLessThanOrEqual(60);
    expect(f.sessions.get(f.session.id)!.expiresAt).toEqual(expiresAt);
  });

  it('revokes an identifiable logout session even if unrelated cookies exceed the limit', async () => {
    const f = await setup();
    const response = await f.app.inject({ method: 'POST', url: '/api/v1/auth/logout', headers: { origin, cookie: `refresh_token=${f.result.refreshToken}; unrelated=${'x'.repeat(4100)}` } });
    expect(response.statusCode).toBe(204);
    expect(f.sessions.get(f.session.id)!.toPersistence().revokedAt).toBeInstanceOf(Date);
  });
});
