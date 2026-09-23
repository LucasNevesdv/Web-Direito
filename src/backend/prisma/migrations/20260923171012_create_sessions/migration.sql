BEGIN;

-- AlterEnum
ALTER TYPE "user_status" ADD VALUE 'INACTIVE';

-- CreateTable
CREATE TABLE "sessions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "active_office_id" UUID NOT NULL,
    "refresh_token_hash" CHAR(64) NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "revoked_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "last_used_at" TIMESTAMPTZ(3),

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "sessions_refresh_hash_check" CHECK ("refresh_token_hash" ~ '^[a-f0-9]{64}$'),
    CONSTRAINT "sessions_dates_check" CHECK ("expires_at" > "created_at" AND "updated_at" >= "created_at")
);

-- CreateIndex
CREATE INDEX "memberships_user_id_idx" ON "memberships"("user_id");

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_active_office_id_fkey" FOREIGN KEY ("active_office_id") REFERENCES "offices"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_active_office_id_user_id_fkey" FOREIGN KEY ("active_office_id", "user_id") REFERENCES "memberships"("office_id", "user_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

COMMIT;
