-- Supports bounded future cleanup queries by absolute session expiration.
-- No session records or existing constraints are changed.
CREATE INDEX "sessions_expires_at_idx" ON "sessions"("expires_at");
