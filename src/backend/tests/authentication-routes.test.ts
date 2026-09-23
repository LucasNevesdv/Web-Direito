import { randomUUID } from 'node:crypto';
import { SignJWT } from 'jose';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildApp } from '../src/app.js';
import { InactiveOfficeError, InactiveUserError, InvalidCredentialsError, MultipleActiveOfficesError } from '../src/application/authentication/authentication-errors.js';
import { authenticationFixture, testPassword, testSecret } from './support/authentication-fixture.js';

const apps: ReturnType<typeof buildApp>[] = [];
afterEach(async () => { await Promise.all(apps.splice(0).map((app) => app.close())); });
async function setup(secureCookie = false, loginLimit = 30) {
  const fixture = await authenticationFixture();
  const app = buildApp({ check: async () => {} }, undefined, {
    login: fixture.login, identity: fixture.identity, secureCookie,
    refreshTtlSeconds: 604800, loginLimit, loginWindowMs: 900000,
  });
  apps.push(app);
  const login = (payload: Record<string, unknown> = { email: fixture.account.user.email, password: testPassword }) =>
    app.inject({ method: 'POST', url: '/api/v1/auth/login', payload });
  return { ...fixture, app, postLogin: login };
}

describe('authentication HTTP contract', () => {
  it.each([false, true])('sets protected cookies (production=%s) and returns identity through Bearer authentication', async (secure) => {
    const fixture = await setup(secure);
    const login = await fixture.postLogin();
    expect(login.statusCode).toBe(200);
    const cookie = String(login.headers['set-cookie']);
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Lax');
    expect(cookie).toContain('Path=/api/v1/auth');
    expect(cookie).toContain('Max-Age=604800');
    expect(cookie.includes('Secure')).toBe(secure);
    const rawRefresh = login.cookies.find(({ name }) => name === 'refresh_token')!.value;
    expect(login.body.includes(rawRefresh)).toBe(false);
    expect(login.body.includes('password')).toBe(false);
    expect(login.body.includes('Hash')).toBe(false);
    expect(login.headers['cache-control']).toBe('no-store');
    const result = login.json();
    const identity = await fixture.app.inject({ url: '/api/v1/auth/me', headers: { authorization: `Bearer ${result.accessToken}` } });
    expect(identity.statusCode).toBe(200);
    expect(Object.keys(identity.json()).sort()).toEqual(['office', 'user']);
    expect(identity.json().office.role).toBe('OWNER');
    expect(identity.body.includes(result.accessToken)).toBe(false);
    expect(identity.body.includes(rawRefresh)).toBe(false);
    expect(identity.headers['cache-control']).toBe('no-store');
  });

  it('uses exactly the same external response for wrong password, unknown email and inactive accounts', async () => {
    const fixture = await setup();
    const wrong = await fixture.postLogin({ email: fixture.account.user.email, password: 'wrong' });
    const unknown = await fixture.postLogin({ email: 'unknown@example.test', password: 'wrong' });
    expect(wrong.statusCode).toBe(401);
    expect(unknown.statusCode).toBe(401);
    expect(unknown.body).toBe(wrong.body);
    for (const error of [new InactiveUserError(), new InactiveOfficeError(), new InvalidCredentialsError()]) {
      vi.spyOn(fixture.login, 'execute').mockRejectedValueOnce(error);
      const inactive = await fixture.postLogin();
      expect(inactive.statusCode).toBe(401);
      expect(inactive.body).toBe(wrong.body);
      expect(inactive.headers['set-cookie']).toBeUndefined();
    }
  });

  it('returns 409 when office selection is required', async () => {
    const fixture = await setup();
    vi.spyOn(fixture.login, 'execute').mockRejectedValueOnce(new MultipleActiveOfficesError());
    const response = await fixture.postLogin();
    expect(response.statusCode).toBe(409);
    expect(response.json().error).toBe('OFFICE_SELECTION_REQUIRED');
    expect(response.headers['set-cookie']).toBeUndefined();
  });

  it.each([{}, { email: 'invalid', password: 'x' }, { email: 'test@example.test' },
    { email: 'test@example.test', password: 'x', role: 'OWNER' },
    { email: 'test@example.test', password: 'x'.repeat(129) },
  ])('rejects invalid input without invoking authentication', async (payload) => {
    const fixture = await setup();
    const execute = vi.spyOn(fixture.login, 'execute');
    const response = await fixture.postLogin(payload);
    expect(response.statusCode).toBe(400);
    expect(execute).not.toHaveBeenCalled();
  });

  it('sanitizes malformed JSON and unexpected errors', async () => {
    const fixture = await setup();
    const malformed = await fixture.app.inject({ method: 'POST', url: '/api/v1/auth/login', headers: { 'content-type': 'application/json' }, payload: '{"password":"private-fixture"' });
    expect(malformed.statusCode).toBe(400);
    expect(malformed.body).not.toContain('private-fixture');
    vi.spyOn(fixture.login, 'execute').mockRejectedValueOnce(new Error('database-internal-detail'));
    const response = await fixture.postLogin();
    expect(response.statusCode).toBe(500);
    expect(response.body).not.toContain('database-internal-detail');
    expect(response.body).not.toContain('stack');
  });

  it.each([undefined, 'Basic invalid', 'Bearer invalid', 'Bearer eyJhbGciOiJub25lIn0.e30.'])('denies missing or invalid bearer tokens', async (authorization) => {
    const fixture = await setup();
    const response = await fixture.app.inject({ url: '/api/v1/auth/me', headers: authorization ? { authorization } : {} });
    expect(response.statusCode).toBe(401);
  });

  it('denies a correctly signed expired token', async () => {
    const fixture = await setup();
    const now = Math.floor(Date.now() / 1000);
    const token = await new SignJWT({ sessionId: randomUUID(), activeOfficeId: randomUUID(), role: 'OWNER' })
      .setProtectedHeader({ alg: 'HS256', typ: 'JWT' }).setSubject(fixture.account.user.id)
      .setIssuer('test-issuer').setAudience('test-audience').setIssuedAt(now - 901).setExpirationTime(now - 1)
      .sign(Buffer.from(testSecret, 'base64url'));
    const response = await fixture.app.inject({ url: '/api/v1/auth/me', headers: { authorization: `Bearer ${token}` } });
    expect(response.statusCode).toBe(401);
    expect(fixture.repository.findSession).not.toHaveBeenCalled();
  });

  it('limits repeated attempts per IP before expensive password work and preserves health routes', async () => {
    const fixture = await setup(false, 2);
    await fixture.postLogin({ email: 'unknown@example.test', password: 'incorrect' });
    await fixture.postLogin({ email: 'unknown@example.test', password: 'incorrect' });
    const blocked = await fixture.postLogin();
    expect(blocked.statusCode).toBe(429);
    expect(blocked.headers['retry-after']).toBeDefined();
    expect(fixture.passwords.verify).toHaveBeenCalledTimes(2);
    expect((await fixture.app.inject('/health')).statusCode).toBe(200);
    expect((await fixture.app.inject('/ready')).statusCode).toBe(200);
    const spoof = await fixture.app.inject({ method: 'POST', url: '/api/v1/auth/login', headers: { 'x-forwarded-for': '203.0.113.42' }, payload: { email: 'unknown@example.test', password: 'wrong' } });
    expect(spoof.statusCode).toBe(429);
  });
});
