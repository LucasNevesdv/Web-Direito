-- CreateEnum
CREATE TYPE "case_nature" AS ENUM ('JUDICIAL', 'EXTRAJUDICIAL', 'ADMINISTRATIVE', 'ADVISORY');

-- CreateEnum
CREATE TYPE "case_priority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'URGENT');

-- CreateEnum
CREATE TYPE "case_status" AS ENUM ('ACTIVE', 'SUSPENDED', 'CLOSED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "process_relation_type" AS ENUM ('MAIN', 'APPEAL', 'INCIDENTAL', 'EXECUTION');

-- CreateEnum
CREATE TYPE "process_instance" AS ENUM ('FIRST_INSTANCE', 'SECOND_INSTANCE', 'SUPERIOR_COURT', 'ADMINISTRATIVE');

-- Update memberships permissions check constraint to include CASO_*
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
    'CLIENTE_ATIVAR_INATIVAR',
    'CASO_VISUALIZAR',
    'CASO_CADASTRAR',
    'CASO_EDITAR',
    'CASO_ARQUIVAR_REABRIR',
    'CASO_REGISTRAR_MOVIMENTACAO'
  ]::TEXT[]
);

-- Backfill default CASO_* permissions for existing memberships
UPDATE "memberships"
SET "permissions" = ARRAY(
  SELECT DISTINCT unnest("permissions" || ARRAY[
    'CASO_VISUALIZAR',
    'CASO_CADASTRAR',
    'CASO_EDITAR',
    'CASO_ARQUIVAR_REABRIR',
    'CASO_REGISTRAR_MOVIMENTACAO'
  ]::TEXT[])
)
WHERE "role"::text IN ('OWNER', 'ADMIN', 'LAWYER');

UPDATE "memberships"
SET "permissions" = ARRAY(
  SELECT DISTINCT unnest("permissions" || ARRAY[
    'CASO_VISUALIZAR',
    'CASO_CADASTRAR',
    'CASO_EDITAR',
    'CASO_REGISTRAR_MOVIMENTACAO'
  ]::TEXT[])
)
WHERE "role"::text IN ('INTERN');

UPDATE "memberships"
SET "permissions" = ARRAY(
  SELECT DISTINCT unnest("permissions" || ARRAY[
    'CASO_VISUALIZAR',
    'CASO_CADASTRAR',
    'CASO_EDITAR'
  ]::TEXT[])
)
WHERE "role"::text IN ('SECRETARY');

-- CreateTable
CREATE TABLE "legal_cases" (
  "id" UUID PRIMARY KEY,
  "office_id" UUID NOT NULL REFERENCES "offices"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  "title" VARCHAR(160) NOT NULL,
  "description" TEXT,
  "nature" "case_nature" NOT NULL,
  "legal_area" VARCHAR(40) NOT NULL,
  "priority" "case_priority" NOT NULL DEFAULT 'MEDIUM',
  "status" "case_status" NOT NULL DEFAULT 'ACTIVE',
  "responsible_membership_id" UUID REFERENCES "memberships"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  "claim_amount_cents" BIGINT,
  "involved_amount_cents" BIGINT,
  "last_activity_at" TIMESTAMPTZ(3) NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 0 CHECK ("version" >= 0),
  "created_at" TIMESTAMPTZ(3) NOT NULL,
  "updated_at" TIMESTAMPTZ(3) NOT NULL
);

-- CreateIndexes on legal_cases
CREATE INDEX "legal_cases_office_id_status_last_activity_at_idx" ON "legal_cases"("office_id", "status", "last_activity_at");
CREATE INDEX "legal_cases_office_id_status_responsible_membership_id_idx" ON "legal_cases"("office_id", "status", "responsible_membership_id");
CREATE INDEX "legal_cases_office_id_legal_area_status_idx" ON "legal_cases"("office_id", "legal_area", "status");
CREATE INDEX "legal_cases_office_id_priority_status_idx" ON "legal_cases"("office_id", "priority", "status");

-- CreateTable
CREATE TABLE "case_clients" (
  "office_id" UUID NOT NULL REFERENCES "offices"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  "case_id" UUID NOT NULL REFERENCES "legal_cases"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  "client_id" UUID NOT NULL REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  "created_at" TIMESTAMPTZ(3) NOT NULL,
  PRIMARY KEY ("case_id", "client_id")
);

-- CreateIndexes on case_clients
CREATE INDEX "case_clients_office_id_client_id_idx" ON "case_clients"("office_id", "client_id");
CREATE INDEX "case_clients_office_id_case_id_idx" ON "case_clients"("office_id", "case_id");

-- CreateTable
CREATE TABLE "case_team_members" (
  "office_id" UUID NOT NULL REFERENCES "offices"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  "case_id" UUID NOT NULL REFERENCES "legal_cases"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  "membership_id" UUID NOT NULL REFERENCES "memberships"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  "created_at" TIMESTAMPTZ(3) NOT NULL,
  PRIMARY KEY ("case_id", "membership_id")
);

-- CreateIndexes on case_team_members
CREATE INDEX "case_team_members_office_id_membership_id_idx" ON "case_team_members"("office_id", "membership_id");

-- CreateTable
CREATE TABLE "case_parties" (
  "id" UUID PRIMARY KEY,
  "office_id" UUID NOT NULL REFERENCES "offices"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  "case_id" UUID NOT NULL REFERENCES "legal_cases"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  "party_role" VARCHAR(40) NOT NULL,
  "name" VARCHAR(150) NOT NULL,
  "document_number" VARCHAR(14),
  "oab" VARCHAR(20),
  "contact_info" VARCHAR(200),
  "notes" VARCHAR(500),
  "created_at" TIMESTAMPTZ(3) NOT NULL,
  "updated_at" TIMESTAMPTZ(3) NOT NULL
);

-- CreateIndexes on case_parties
CREATE INDEX "case_parties_office_id_case_id_created_at_idx" ON "case_parties"("office_id", "case_id", "created_at");

-- CreateTable
CREATE TABLE "legal_processes" (
  "id" UUID PRIMARY KEY,
  "office_id" UUID NOT NULL REFERENCES "offices"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  "case_id" UUID NOT NULL REFERENCES "legal_cases"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  "cnj_number" CHAR(20) NOT NULL,
  "relation_type" "process_relation_type" NOT NULL DEFAULT 'MAIN',
  "court" VARCHAR(60) NOT NULL,
  "district" VARCHAR(120),
  "chamber" VARCHAR(120),
  "instance" "process_instance" NOT NULL,
  "procedural_phase" VARCHAR(40) NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 0 CHECK ("version" >= 0),
  "created_at" TIMESTAMPTZ(3) NOT NULL,
  "updated_at" TIMESTAMPTZ(3) NOT NULL
);

-- CreateIndexes on legal_processes
CREATE UNIQUE INDEX "legal_processes_office_id_case_id_cnj_number_key" ON "legal_processes"("office_id", "case_id", "cnj_number");
CREATE INDEX "legal_processes_office_id_cnj_number_idx" ON "legal_processes"("office_id", "cnj_number");
CREATE INDEX "legal_processes_office_id_case_id_created_at_idx" ON "legal_processes"("office_id", "case_id", "created_at");

-- CreateTable
CREATE TABLE "process_movements" (
  "id" UUID PRIMARY KEY,
  "office_id" UUID NOT NULL REFERENCES "offices"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  "case_id" UUID NOT NULL REFERENCES "legal_cases"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  "process_id" UUID NOT NULL REFERENCES "legal_processes"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  "actor_id" UUID NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  "occurred_at" TIMESTAMPTZ(3) NOT NULL,
  "description" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL
);

-- CreateIndexes on process_movements
CREATE INDEX "process_movements_office_id_process_id_occurred_at_idx" ON "process_movements"("office_id", "process_id", "occurred_at");
CREATE INDEX "process_movements_office_id_case_id_occurred_at_idx" ON "process_movements"("office_id", "case_id", "occurred_at");

-- CreateTable
CREATE TABLE "case_timeline_events" (
  "id" UUID PRIMARY KEY,
  "office_id" UUID NOT NULL REFERENCES "offices"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  "case_id" UUID NOT NULL REFERENCES "legal_cases"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  "process_id" UUID REFERENCES "legal_processes"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  "actor_id" UUID NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  "action" VARCHAR(40) NOT NULL,
  "previous" JSONB,
  "current" JSONB NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL
);

-- CreateIndexes on case_timeline_events
CREATE INDEX "case_timeline_events_office_id_case_id_created_at_idx" ON "case_timeline_events"("office_id", "case_id", "created_at");
CREATE INDEX "case_timeline_events_office_id_process_id_created_at_idx" ON "case_timeline_events"("office_id", "process_id", "created_at");
