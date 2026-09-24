export type RateLimitScope = 'onboarding-ip' | 'login-ip' | 'login-identity' | 'refresh-ip';
export interface RateLimitDecision { allowed: boolean; retryAfterSeconds: number }
export interface RateLimitPolicy { limit: number; windowSeconds: number }
export interface RateLimitStore {
  consume(scope: RateLimitScope, keyHash: string, policy: RateLimitPolicy): Promise<RateLimitDecision>;
  deleteExpired(): Promise<number>;
}
export interface RateLimitKeys {
  digest(scope: RateLimitScope, ip: string, email?: string): string;
}
export interface RateLimiter {
  check(scope: RateLimitScope, ip: string, email?: string): Promise<RateLimitDecision>;
}

export class SharedRateLimiter implements RateLimiter {
  constructor(private readonly store: RateLimitStore, private readonly keys: RateLimitKeys,
    private readonly policies: Record<RateLimitScope, RateLimitPolicy>) {}

  check(scope: RateLimitScope, ip: string, email?: string): Promise<RateLimitDecision> {
    return this.store.consume(scope, this.keys.digest(scope, ip, email), this.policies[scope]);
  }
}

// Missing composition must never silently disable protection.
export const unavailableRateLimiter: RateLimiter = {
  async check() { throw new Error('Rate limiter unavailable'); },
};
