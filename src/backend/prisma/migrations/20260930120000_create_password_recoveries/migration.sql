CREATE TABLE "password_recoveries" (
  "id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "token_hash" CHAR(64) NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL,
  "expires_at" TIMESTAMPTZ(3) NOT NULL,
  "used_at" TIMESTAMPTZ(3),
  "invalidated_at" TIMESTAMPTZ(3),
  CONSTRAINT "password_recoveries_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "password_recoveries_token_hash_check" CHECK ("token_hash" ~ '^[a-f0-9]{64}$'),
  CONSTRAINT "password_recoveries_expiration_check" CHECK ("expires_at" > "created_at"),
  CONSTRAINT "password_recoveries_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT
);
CREATE UNIQUE INDEX "password_recoveries_token_hash_key" ON "password_recoveries"("token_hash");
CREATE INDEX "password_recoveries_user_id_idx" ON "password_recoveries"("user_id");
CREATE INDEX "password_recoveries_expires_at_idx" ON "password_recoveries"("expires_at");
-- A emissão invalida o registro anterior sob bloqueio de users antes de inserir.
CREATE UNIQUE INDEX "password_recoveries_one_pending_per_user" ON "password_recoveries"("user_id")
  WHERE "used_at" IS NULL AND "invalidated_at" IS NULL;
