import { SharedRateLimiter, type RateLimitPolicy, type RateLimitScope, type RateLimitStore } from '../../src/application/security/rate-limiter.js';
import { HmacRateLimitKeys } from '../../src/infrastructure/security/hmac-rate-limit-keys.js';

export function rateLimiterFixture(overrides: Partial<Record<RateLimitScope, Partial<RateLimitPolicy>>> = {}, now = () => Date.now()) {
  const buckets = new Map<string, { count: number; expiresAt: number }>();
  const store: RateLimitStore = {
    async consume(scope, keyHash, policy) {
      const start = Math.floor(now() / (policy.windowSeconds * 1000)) * policy.windowSeconds * 1000;
      const key = `${scope}:${keyHash}:${start}`;
      const bucket = buckets.get(key) ?? { count: 0, expiresAt: start + policy.windowSeconds * 1000 };
      ++bucket.count;
      buckets.set(key, bucket);
      return { allowed: bucket.count <= policy.limit, retryAfterSeconds: Math.max(1, Math.ceil((bucket.expiresAt - now()) / 1000)) };
    },
    async deleteExpired() {
      let deleted = 0;
      for (const [key, value] of buckets) if (value.expiresAt <= now()) { buckets.delete(key); ++deleted; }
      return deleted;
    },
  };
  const scopes: RateLimitScope[] = ['onboarding-ip', 'login-ip', 'login-identity', 'refresh-ip'];
  const policies = Object.fromEntries(scopes.map((scope) => [scope, { limit: 1000, windowSeconds: 900, ...overrides[scope] }])) as Record<RateLimitScope, RateLimitPolicy>;
  const keys = new HmacRateLimitKeys(Buffer.alloc(48, 8).toString('base64url'));
  return { limiter: new SharedRateLimiter(store, keys, policies), store, keys, buckets, policies };
}
