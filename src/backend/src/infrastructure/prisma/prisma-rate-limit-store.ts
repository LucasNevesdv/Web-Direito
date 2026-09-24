import type { PrismaClient } from '@prisma/client';
import type { RateLimitDecision, RateLimitPolicy, RateLimitScope, RateLimitStore } from '../../application/security/rate-limiter.js';

export class PrismaRateLimitStore implements RateLimitStore {
  constructor(private readonly prisma: Pick<PrismaClient, '$queryRaw' | '$executeRaw'>) {}

  async consume(scope: RateLimitScope, keyHash: string, policy: RateLimitPolicy): Promise<RateLimitDecision> {
    // The database clock and ON CONFLICT serialize increments across all processes.
    const [result] = await this.prisma.$queryRaw<RateLimitDecision[]>`
      INSERT INTO rate_limit_buckets (scope, key_hash, window_start, count, expires_at)
      SELECT ${scope}, ${keyHash}, start_at, 1, start_at + make_interval(secs => ${policy.windowSeconds}::int)
      FROM (SELECT to_timestamp(floor(extract(epoch FROM clock_timestamp()) / ${policy.windowSeconds}::int) * ${policy.windowSeconds}::int) AS start_at) AS bucket_window
      ON CONFLICT (scope, key_hash, window_start) DO UPDATE
      SET count = LEAST(rate_limit_buckets.count + 1, ${policy.limit + 1}::int)
      RETURNING count <= ${policy.limit}::int AS allowed,
        GREATEST(1, ceil(extract(epoch FROM expires_at - clock_timestamp())))::int AS "retryAfterSeconds"
    `;
    if (!result) throw new Error('Rate limiter unavailable');
    return result;
  }

  async deleteExpired(): Promise<number> {
    return this.prisma.$executeRaw`
      WITH expired AS (
        SELECT scope, key_hash, window_start FROM rate_limit_buckets
        WHERE expires_at <= clock_timestamp()
        ORDER BY expires_at LIMIT 500 FOR UPDATE SKIP LOCKED
      )
      DELETE FROM rate_limit_buckets AS bucket USING expired
      WHERE bucket.scope = expired.scope AND bucket.key_hash = expired.key_hash
        AND bucket.window_start = expired.window_start
    `;
  }
}
