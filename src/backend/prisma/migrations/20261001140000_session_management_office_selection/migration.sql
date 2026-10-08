ALTER TABLE "sessions"
  ADD COLUMN "browser" VARCHAR(64) NOT NULL DEFAULT 'Desconhecido',
  ADD COLUMN "device" VARCHAR(64) NOT NULL DEFAULT 'Desconhecido',
  ADD COLUMN "masked_ip" VARCHAR(64) NOT NULL DEFAULT 'Indisponível',
  ADD COLUMN "last_activity_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
UPDATE "sessions" SET "last_activity_at" = COALESCE("last_used_at", "created_at");
-- O contexto legado já é protegido pela FK composta (active_office_id, user_id).
-- Nenhuma sessão é reassociada a outro escritório ou revogada arbitrariamente.
CREATE INDEX "sessions_user_id_created_at_idx" ON "sessions"("user_id", "created_at");
CREATE TABLE "office_selections" (
  "token_hash" CHAR(64) PRIMARY KEY,
  "user_id" UUID NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  "user_updated_at" TIMESTAMPTZ(3) NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL,
  "expires_at" TIMESTAMPTZ(3) NOT NULL,
  "consumed_at" TIMESTAMPTZ(3),
  CONSTRAINT "office_selections_hash_check" CHECK ("token_hash" ~ '^[a-f0-9]{64}$'),
  CONSTRAINT "office_selections_expiration_check" CHECK ("expires_at" > "created_at" AND "expires_at" <= "created_at" + INTERVAL '5 minutes')
);
CREATE INDEX "office_selections_user_id_idx" ON "office_selections"("user_id");
CREATE INDEX "office_selections_expires_at_idx" ON "office_selections"("expires_at");
CREATE UNIQUE INDEX "office_selections_pending_user_idx" ON "office_selections"("user_id") WHERE "consumed_at" IS NULL;
