import type { PrismaClient } from '@prisma/client';
import { SharedRateLimiter } from './application/security/rate-limiter.js';
import type { Environment } from './environment.js';
import { PrismaRateLimitStore } from './infrastructure/prisma/prisma-rate-limit-store.js';
import { HmacRateLimitKeys } from './infrastructure/security/hmac-rate-limit-keys.js';
import { startRateLimitCleanup } from './infrastructure/security/rate-limit-cleanup.js';

export function createRateLimiting(prisma: PrismaClient, environment: Environment) {
  const store = new PrismaRateLimitStore(prisma);
  const keys = new HmacRateLimitKeys(environment.RATE_LIMIT_HMAC_SECRET ?? environment.AUTH_JWT_SECRET);
  const limiter = new SharedRateLimiter(store, keys, {
    'onboarding-ip': { limit: environment.RATE_LIMIT_ONBOARDING_MAX, windowSeconds: environment.RATE_LIMIT_ONBOARDING_WINDOW_SECONDS },
    'login-ip': { limit: environment.RATE_LIMIT_LOGIN_IP_MAX, windowSeconds: environment.RATE_LIMIT_LOGIN_WINDOW_SECONDS },
    'login-identity': { limit: environment.RATE_LIMIT_LOGIN_IDENTITY_MAX, windowSeconds: environment.RATE_LIMIT_LOGIN_WINDOW_SECONDS },
    'refresh-ip': { limit: environment.RATE_LIMIT_REFRESH_MAX, windowSeconds: environment.RATE_LIMIT_REFRESH_WINDOW_SECONDS },
  });
  return { limiter, startCleanup: () => startRateLimitCleanup(store, environment.RATE_LIMIT_CLEANUP_INTERVAL_MS) };
}
