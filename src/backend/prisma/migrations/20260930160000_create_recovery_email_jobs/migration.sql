CREATE TYPE "recovery_email_status" AS ENUM ('PENDING', 'PROCESSING', 'SENT', 'FAILED');
CREATE TABLE "recovery_email_jobs" (
  "id" UUID PRIMARY KEY,
  "user_id" UUID NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  "recovery_id" UUID REFERENCES "password_recoveries"("id") ON DELETE SET NULL ON UPDATE RESTRICT,
  "status" "recovery_email_status" NOT NULL DEFAULT 'PENDING',
  "attempts" INTEGER NOT NULL DEFAULT 0 CHECK ("attempts" >= 0),
  "next_attempt_at" TIMESTAMPTZ(3) NOT NULL,
  "locked_at" TIMESTAMPTZ(3),
  "locked_until" TIMESTAMPTZ(3),
  "lease_id" UUID,
  "sent_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  "error_code" VARCHAR(40),
  CONSTRAINT "recovery_email_jobs_lease_check" CHECK (
    ("status" = 'PROCESSING' AND "lease_id" IS NOT NULL AND "locked_at" IS NOT NULL AND "locked_until" > "locked_at") OR
    ("status" <> 'PROCESSING' AND "lease_id" IS NULL AND "locked_at" IS NULL AND "locked_until" IS NULL)),
  CONSTRAINT "recovery_email_jobs_error_check" CHECK ("error_code" IS NULL OR "error_code" IN
    ('PROVEDOR_TRANSITORIO', 'PROVEDOR_DEFINITIVO', 'LIMITE_TENTATIVAS', 'SUBSTITUIDO', 'SENHA_ALTERADA', 'RECUPERACAO_INDISPONIVEL'))
);
CREATE INDEX "recovery_email_jobs_status_next_attempt_at_idx" ON "recovery_email_jobs"("status", "next_attempt_at");
CREATE INDEX "recovery_email_jobs_status_locked_until_idx" ON "recovery_email_jobs"("status", "locked_until");
CREATE INDEX "recovery_email_jobs_status_updated_at_idx" ON "recovery_email_jobs"("status", "updated_at");
CREATE INDEX "recovery_email_jobs_user_id_idx" ON "recovery_email_jobs"("user_id");
CREATE INDEX "recovery_email_jobs_recovery_id_idx" ON "recovery_email_jobs"("recovery_id");
