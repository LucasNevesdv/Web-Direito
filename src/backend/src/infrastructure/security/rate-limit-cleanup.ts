import type { RateLimitStore } from '../../application/security/rate-limiter.js';

export function startRateLimitCleanup(store: Pick<RateLimitStore, 'deleteExpired'>, intervalMs: number,
  reportFailure: () => void = () => console.error('Rate limit cleanup failed.')) {
  let pending: Promise<void> | undefined;
  let stopped = false;
  const timer = setInterval(() => {
    if (stopped || pending) return;
    pending = store.deleteExpired().then(() => {}, () => reportFailure()).finally(() => { pending = undefined; });
  }, intervalMs);
  timer.unref();
  return { async stop(): Promise<void> { stopped = true; clearInterval(timer); await pending; } };
}
