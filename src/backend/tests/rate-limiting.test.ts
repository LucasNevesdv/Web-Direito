import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildApp } from '../src/app.js';
import { SharedRateLimiter } from '../src/application/security/rate-limiter.js';
import { HmacRateLimitKeys } from '../src/infrastructure/security/hmac-rate-limit-keys.js';
import { startRateLimitCleanup } from '../src/infrastructure/security/rate-limit-cleanup.js';
import { parseEnvironment } from '../src/environment.js';
import { createShutdown } from '../src/shutdown.js';
import { authenticationFixture } from './support/authentication-fixture.js';
import { rateLimiterFixture } from './support/rate-limiter-fixture.js';

const apps: ReturnType<typeof buildApp>[] = [];
afterEach(async () => { await Promise.all(apps.splice(0).map((app) => app.close())); vi.useRealTimers(); vi.restoreAllMocks(); });

describe('shared rate limiting', () => {
  it('consumes a fixed window, blocks with remaining seconds, then releases the next window', async () => {
    let now = 1100;
    const f = rateLimiterFixture({ 'onboarding-ip': { limit: 2, windowSeconds: 10 } }, () => now);
    expect(await f.limiter.check('onboarding-ip', '127.0.0.1')).toEqual({ allowed: true, retryAfterSeconds: 9 });
    expect((await f.limiter.check('onboarding-ip', '127.0.0.1')).allowed).toBe(true);
    expect((await f.limiter.check('onboarding-ip', '127.0.0.1')).allowed).toBe(false);
    now = 10000;
    expect(await f.limiter.check('onboarding-ip', '127.0.0.1')).toEqual({ allowed: true, retryAfterSeconds: 10 });
    expect(await f.store.deleteExpired()).toBe(1);
  });

  it('shares the same contract store across concurrent limiter instances', async () => {
    const f = rateLimiterFixture({ 'refresh-ip': { limit: 7 } });
    const other = new SharedRateLimiter(f.store, f.keys, f.policies);
    const results = await Promise.all(Array.from({ length: 30 }, (_, index) => (index % 2 ? f.limiter : other).check('refresh-ip', '127.0.0.1')));
    expect(results.filter((result) => result.allowed)).toHaveLength(7);
  });

  it('normalizes email and equivalent IPs, separates scopes, and stores only keyed digests', () => {
    const f = rateLimiterFixture(), different = new HmacRateLimitKeys(Buffer.alloc(48, 9).toString('base64url'));
    const key = f.keys.digest('login-identity', '127.0.0.1', 'Owner@Example.Test');
    expect(key).toMatch(/^[a-f0-9]{64}$/);
    expect(f.keys.digest('login-identity', '::ffff:127.0.0.1', ' owner@example.test ')).toBe(key);
    expect(f.keys.digest('login-identity', '2001:0db8::1', 'owner@example.test')).toBe(f.keys.digest('login-identity', '2001:db8:0:0:0:0:0:1', 'owner@example.test'));
    expect(f.keys.digest('login-ip', '127.0.0.1', 'owner@example.test')).not.toBe(key);
    expect(different.digest('login-identity', '127.0.0.1', 'owner@example.test')).not.toBe(key);
    expect(() => f.keys.digest('login-ip', 'spoofed')).toThrow();
  });

  it('enforces onboarding 429 and ignores untrusted forwarded IPs, keeping health independent', async () => {
    const execute = vi.fn();
    const app = buildApp({ check: async () => {} }, { execute }, undefined,
      { limiter: rateLimiterFixture({ 'onboarding-ip': { limit: 1, windowSeconds: 60 } }).limiter });
    apps.push(app);
    expect((await app.inject({ method: 'POST', url: '/api/v1/onboarding', payload: {} })).statusCode).toBe(400);
    const blocked = await app.inject({ method: 'POST', url: '/api/v1/onboarding', headers: { 'x-forwarded-for': '192.0.2.1' }, payload: {} });
    expect(blocked.statusCode).toBe(429); expect(Number(blocked.headers['retry-after'])).toBeGreaterThan(0);
    expect(Number(blocked.headers['retry-after'])).toBeLessThanOrEqual(60);
    expect(execute).not.toHaveBeenCalled();
    expect((await app.inject('/health')).statusCode).toBe(200);
    expect((await app.inject('/ready')).statusCode).toBe(200);
  });

  it('enforces login IP and normalized identity budgets independently and refresh IP budget', async () => {
    const fixture = await authenticationFixture();
    const app = buildApp({ check: async () => {} }, undefined, {
      login: fixture.login, identity: fixture.identity, refresh: fixture.refreshSession, logout: fixture.logout,
      secureCookie: false, frontendOrigin: 'http://localhost:5173', refreshTtlSeconds: 604800,
    }, { limiter: rateLimiterFixture({ 'login-ip': { limit: 3 }, 'login-identity': { limit: 1 }, 'refresh-ip': { limit: 1 } }).limiter });
    apps.push(app);
    const login = (email: string) => app.inject({ method: 'POST', url: '/api/v1/auth/login',
      headers: { origin: 'http://localhost:5173' }, payload: { email, password: 'incorrect-test-password' } });
    expect((await login('unknown@example.test')).statusCode).toBe(401);
    expect((await login(' UNKNOWN@example.test ')).statusCode).toBe(429);
    expect((await login('another@example.test')).statusCode).toBe(401);
    expect((await login('third@example.test')).statusCode).toBe(429);
    const refresh = () => app.inject({ method: 'POST', url: '/api/v1/auth/refresh', headers: { origin: 'http://localhost:5173' } });
    expect((await refresh()).statusCode).toBe(401); expect((await refresh()).statusCode).toBe(429);
  });

  it('fails closed with sanitized 503 and Retry-After when storage is unavailable or not composed', async () => {
    for (const security of [undefined, { limiter: { check: vi.fn().mockRejectedValue(new Error('private database details')) } }]) {
      const execute = vi.fn();
      const app = buildApp({ check: async () => {} }, { execute }, undefined, security); apps.push(app);
      const result = await app.inject({ method: 'POST', url: '/api/v1/onboarding', payload: {} });
      expect(result.statusCode).toBe(503); expect(result.headers['retry-after']).toBe('5');
      expect(result.body).not.toContain('private'); expect(execute).not.toHaveBeenCalled();
    }
  });

  it('does not overlap cleanup, handles failure and waits for the current run on shutdown', async () => {
    vi.useFakeTimers();
    let complete!: (count: number) => void;
    const deleteExpired = vi.fn<() => Promise<number>>().mockReturnValueOnce(new Promise((resolve) => { complete = resolve; })).mockRejectedValue(new Error('private'));
    const report = vi.fn(), worker = startRateLimitCleanup({ deleteExpired }, 1000, report);
    await vi.advanceTimersByTimeAsync(3000); expect(deleteExpired).toHaveBeenCalledOnce();
    complete(1); await vi.advanceTimersByTimeAsync(1000); expect(report).toHaveBeenCalledOnce();
    await worker.stop(); await vi.advanceTimersByTimeAsync(5000); expect(deleteExpired).toHaveBeenCalledTimes(2);
  });

  it('stops background cleanup before resources, even when stopping fails, once per shutdown', async () => {
    const calls: string[] = [];
    const shutdown = createShutdown({ close: async () => { calls.push('close'); } },
      { $disconnect: async () => { calls.push('disconnect'); } },
      { stop: async () => { calls.push('stop'); throw new Error('Stop failed'); } });
    const first = shutdown(); expect(shutdown()).toBe(first);
    await expect(first).rejects.toThrow('Stop failed'); expect(calls).toEqual(['stop', 'close', 'disconnect']);
  });
});

describe('rate limit configuration', () => {
  const environment = { DATABASE_URL: 'postgresql://localhost/example', AUTH_JWT_SECRET: Buffer.alloc(48, 9).toString('base64url') };
  it.each([
    ['RATE_LIMIT_ONBOARDING_MAX', '0'], ['RATE_LIMIT_LOGIN_IP_MAX', '-1'], ['RATE_LIMIT_LOGIN_IDENTITY_MAX', '1.5'],
    ['RATE_LIMIT_LOGIN_WINDOW_SECONDS', 'NaN'], ['RATE_LIMIT_REFRESH_MAX', '10001'], ['RATE_LIMIT_REFRESH_WINDOW_SECONDS', '86401'],
    ['RATE_LIMIT_ONBOARDING_WINDOW_SECONDS', '0'], ['RATE_LIMIT_CLEANUP_INTERVAL_MS', '999'], ['RATE_LIMIT_HMAC_SECRET', 'short'],
    ['TRUST_PROXY', 'true'], ['TRUST_PROXY', '*'], ['TRUST_PROXY', '0.0.0.0/0'], ['TRUST_PROXY', '::/0'], ['TRUST_PROXY', '127.0.0.1,'],
  ])('rejects invalid %s (case %#) without exposing values', (variable, value) => {
    expect(() => parseEnvironment({ ...environment, [variable]: value })).toThrow(`Invalid environment configuration: ${variable}`);
  });
  it('defaults to no trusted proxy and accepts only explicit IPs and CIDRs', () => {
    expect(parseEnvironment(environment).TRUST_PROXY).toBe(false);
    expect(parseEnvironment({ ...environment, TRUST_PROXY: '127.0.0.1, 192.0.2.0/24, ::1' }).TRUST_PROXY).toEqual(['127.0.0.1', '192.0.2.0/24', '::1']);
    expect(parseEnvironment({ ...environment, NODE_ENV: 'production', AUTH_FRONTEND_ORIGIN: 'https://app.example.test' }).RATE_LIMIT_LOGIN_IP_MAX).toBe(10);
  });
});
