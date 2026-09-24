CREATE TABLE "rate_limit_buckets" (
    "scope" VARCHAR(32) NOT NULL,
    "key_hash" CHAR(64) NOT NULL,
    "window_start" TIMESTAMPTZ(3) NOT NULL,
    "count" INTEGER NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "rate_limit_buckets_pkey" PRIMARY KEY ("scope", "key_hash", "window_start"),
    CONSTRAINT "rate_limit_buckets_count_check" CHECK ("count" > 0),
    CONSTRAINT "rate_limit_buckets_key_check" CHECK ("key_hash" ~ '^[a-f0-9]{64}$'),
    CONSTRAINT "rate_limit_buckets_expiration_check" CHECK ("expires_at" > "window_start")
);
-- Bounded cleanup scans expiration order; primary key serializes each bucket.
CREATE INDEX "rate_limit_buckets_expires_at_idx" ON "rate_limit_buckets"("expires_at");
