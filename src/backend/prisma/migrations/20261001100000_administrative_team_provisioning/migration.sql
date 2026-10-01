ALTER TYPE "membership_role" ADD VALUE 'ADMIN';
ALTER TYPE "membership_role" ADD VALUE 'LAWYER';
ALTER TYPE "membership_role" ADD VALUE 'INTERN';
ALTER TYPE "membership_role" ADD VALUE 'SECRETARY';
ALTER TABLE "users" ADD COLUMN "must_change_password" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "sessions" ADD COLUMN "restricted" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "memberships"
  ADD COLUMN "active" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "permissions" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "version" INTEGER NOT NULL DEFAULT 0 CHECK (version >= 0),
  ADD COLUMN "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD CONSTRAINT "memberships_permissions_check" CHECK (permissions <@ ARRAY['EQUIPE_VISUALIZAR','EQUIPE_CADASTRAR_USUARIO','EQUIPE_ALTERAR_USUARIO','EQUIPE_DEFINIR_PERMISSOES','EQUIPE_ATIVAR_INATIVAR_USUARIO']::TEXT[]);
UPDATE "memberships" SET "updated_at" = "created_at", "permissions" = ARRAY['EQUIPE_VISUALIZAR','EQUIPE_CADASTRAR_USUARIO','EQUIPE_ALTERAR_USUARIO','EQUIPE_DEFINIR_PERMISSOES','EQUIPE_ATIVAR_INATIVAR_USUARIO'] WHERE "role"::text = 'OWNER';
CREATE TABLE "membership_history" (
  "id" UUID PRIMARY KEY,
  "membership_id" UUID NOT NULL REFERENCES "memberships"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  "actor_id" UUID NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  "action" VARCHAR(32) NOT NULL,
  "previous" JSONB,
  "current" JSONB NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL
);
CREATE INDEX "membership_history_membership_id_created_at_idx" ON "membership_history"("membership_id", "created_at");
CREATE INDEX "memberships_office_id_active_created_at_idx" ON "memberships"("office_id", "active", "created_at");
CREATE INDEX "sessions_active_office_id_user_id_revoked_at_idx" ON "sessions"("active_office_id", "user_id", "revoked_at");
