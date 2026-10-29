-- CreateEnum
CREATE TYPE "client_type" AS ENUM ('INDIVIDUAL', 'LEGAL_ENTITY');

-- CreateEnum
CREATE TYPE "client_status" AS ENUM ('ACTIVE', 'INACTIVE');

-- Update memberships permissions check constraint to include CLIENTE_*
ALTER TABLE "memberships" DROP CONSTRAINT "memberships_permissions_check";
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_permissions_check" CHECK (
  permissions <@ ARRAY[
    'EQUIPE_VISUALIZAR',
    'EQUIPE_CADASTRAR_USUARIO',
    'EQUIPE_ALTERAR_USUARIO',
    'EQUIPE_DEFINIR_PERMISSOES',
    'EQUIPE_ATIVAR_INATIVAR_USUARIO',
    'CLIENTE_VISUALIZAR',
    'CLIENTE_VISUALIZAR_OBSERVACOES',
    'CLIENTE_CADASTRAR',
    'CLIENTE_EDITAR',
    'CLIENTE_ATIVAR_INATIVAR'
  ]::TEXT[]
);

-- Backfill default CLIENTE_* permissions for existing memberships
UPDATE "memberships"
SET "permissions" = ARRAY(
  SELECT DISTINCT unnest("permissions" || ARRAY[
    'CLIENTE_VISUALIZAR',
    'CLIENTE_VISUALIZAR_OBSERVACOES',
    'CLIENTE_CADASTRAR',
    'CLIENTE_EDITAR',
    'CLIENTE_ATIVAR_INATIVAR'
  ]::TEXT[])
)
WHERE "role"::text IN ('OWNER', 'ADMIN', 'LAWYER');

UPDATE "memberships"
SET "permissions" = ARRAY(
  SELECT DISTINCT unnest("permissions" || ARRAY[
    'CLIENTE_VISUALIZAR',
    'CLIENTE_VISUALIZAR_OBSERVACOES',
    'CLIENTE_CADASTRAR',
    'CLIENTE_EDITAR'
  ]::TEXT[])
)
WHERE "role"::text IN ('INTERN', 'SECRETARY');

-- CreateTable
CREATE TABLE "clients" (
  "id" UUID PRIMARY KEY,
  "office_id" UUID NOT NULL REFERENCES "offices"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  "type" "client_type" NOT NULL,
  "name" VARCHAR(150) NOT NULL,
  "social_name" VARCHAR(150),
  "document_number" VARCHAR(14) NOT NULL,
  "email" VARCHAR(254),
  "phone" VARCHAR(20),
  "address_zip_code" CHAR(8),
  "address_street" VARCHAR(160),
  "address_number" VARCHAR(20),
  "address_complement" VARCHAR(80),
  "address_neighborhood" VARCHAR(80),
  "address_city" VARCHAR(80),
  "address_state" CHAR(2),
  "internal_notes" TEXT,
  "responsible_membership_id" UUID REFERENCES "memberships"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  "status" "client_status" NOT NULL DEFAULT 'ACTIVE',
  "version" INTEGER NOT NULL DEFAULT 0 CHECK ("version" >= 0),
  "created_at" TIMESTAMPTZ(3) NOT NULL,
  "updated_at" TIMESTAMPTZ(3) NOT NULL
);

-- CreateIndexes on clients
CREATE UNIQUE INDEX "clients_office_id_document_number_key" ON "clients"("office_id", "document_number");
CREATE INDEX "clients_office_id_status_name_idx" ON "clients"("office_id", "status", "name");
CREATE INDEX "clients_office_id_email_idx" ON "clients"("office_id", "email");
CREATE INDEX "clients_office_id_phone_idx" ON "clients"("office_id", "phone");
CREATE INDEX "clients_office_id_responsible_membership_id_idx" ON "clients"("office_id", "responsible_membership_id");

-- CreateTable
CREATE TABLE "client_contacts" (
  "id" UUID PRIMARY KEY,
  "office_id" UUID NOT NULL REFERENCES "offices"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  "client_id" UUID NOT NULL REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  "name" VARCHAR(120) NOT NULL,
  "role_or_relation" VARCHAR(80),
  "email" VARCHAR(254),
  "phone" VARCHAR(20),
  "notes" VARCHAR(500),
  "created_at" TIMESTAMPTZ(3) NOT NULL,
  "updated_at" TIMESTAMPTZ(3) NOT NULL
);

-- CreateIndexes on client_contacts
CREATE INDEX "client_contacts_office_id_client_id_created_at_idx" ON "client_contacts"("office_id", "client_id", "created_at");

-- CreateTable
CREATE TABLE "client_timeline_events" (
  "id" UUID PRIMARY KEY,
  "office_id" UUID NOT NULL REFERENCES "offices"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  "client_id" UUID NOT NULL REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  "actor_id" UUID NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  "action" VARCHAR(40) NOT NULL,
  "previous" JSONB,
  "current" JSONB NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL
);

-- CreateIndexes on client_timeline_events
CREATE INDEX "client_timeline_events_office_id_client_id_created_at_idx" ON "client_timeline_events"("office_id", "client_id", "created_at");
