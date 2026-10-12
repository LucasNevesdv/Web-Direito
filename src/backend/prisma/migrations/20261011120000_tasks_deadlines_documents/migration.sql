-- CreateEnum
CREATE TYPE "task_status" AS ENUM ('PENDING', 'IN_PROGRESS', 'DONE', 'CANCELED');

-- CreateEnum
CREATE TYPE "task_priority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'URGENT');

-- CreateEnum
CREATE TYPE "deadline_source" AS ENUM ('INTIMATION', 'PUBLICATION', 'SUMMONS', 'ORDER', 'HEARING', 'OTHER');

-- CreateEnum
CREATE TYPE "deadline_status" AS ENUM ('PENDING', 'FULFILLED', 'CANCELED');

-- CreateEnum
CREATE TYPE "notification_kind" AS ENUM ('TASK_DUE_SOON', 'TASK_OVERDUE', 'DEADLINE_CRITICAL', 'DEADLINE_OVERDUE');

-- CreateEnum
CREATE TYPE "notification_email_status" AS ENUM ('PENDING', 'PROCESSING', 'SENT', 'FAILED');

-- CreateEnum
CREATE TYPE "document_category" AS ENUM ('CONTRACT', 'POWER_OF_ATTORNEY', 'PETITION', 'DECISION', 'EVIDENCE', 'PERSONAL_DOCUMENT', 'RECEIPT', 'OTHER');

-- CreateTable
CREATE TABLE "tasks" (
    "id" UUID NOT NULL,
    "office_id" UUID NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "description" VARCHAR(4000) NOT NULL DEFAULT '',
    "status" "task_status" NOT NULL DEFAULT 'PENDING',
    "priority" "task_priority" NOT NULL DEFAULT 'MEDIUM',
    "responsible_id" UUID NOT NULL,
    "reviewer_id" UUID,
    "creator_id" UUID NOT NULL,
    "internal_due_date" DATE,
    "client_id" UUID,
    "case_id" UUID,
    "process_id" UUID,
    "completed_at" TIMESTAMPTZ(3),
    "completed_by_id" UUID,
    "completion_note" VARCHAR(2000),
    "version" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "task_checklist_items" (
    "id" UUID NOT NULL,
    "task_id" UUID NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "done" BOOLEAN NOT NULL DEFAULT false,
    "done_at" TIMESTAMPTZ(3),
    "done_by_id" UUID,
    "position" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "task_checklist_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "task_history" (
    "id" UUID NOT NULL,
    "task_id" UUID NOT NULL,
    "actor_id" UUID NOT NULL,
    "action" VARCHAR(40) NOT NULL,
    "previous" JSONB,
    "current" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "task_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "judicial_deadlines" (
    "id" UUID NOT NULL,
    "office_id" UUID NOT NULL,
    "description" VARCHAR(500) NOT NULL,
    "due_date" DATE NOT NULL,
    "source" "deadline_source" NOT NULL,
    "source_details" VARCHAR(500) NOT NULL DEFAULT '',
    "status" "deadline_status" NOT NULL DEFAULT 'PENDING',
    "responsible_id" UUID NOT NULL,
    "confirmed_by_id" UUID NOT NULL,
    "confirmed_at" TIMESTAMPTZ(3) NOT NULL,
    "task_id" UUID,
    "client_id" UUID,
    "case_id" UUID,
    "process_id" UUID,
    "completed_at" TIMESTAMPTZ(3),
    "completed_by_id" UUID,
    "completion_note" VARCHAR(2000),
    "version" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "judicial_deadlines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "judicial_deadline_history" (
    "id" UUID NOT NULL,
    "deadline_id" UUID NOT NULL,
    "actor_id" UUID NOT NULL,
    "action" VARCHAR(40) NOT NULL,
    "previous" JSONB,
    "current" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "judicial_deadline_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL,
    "office_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "kind" "notification_kind" NOT NULL,
    "escalated" BOOLEAN NOT NULL DEFAULT false,
    "task_id" UUID,
    "deadline_id" UUID,
    "target_id" UUID NOT NULL,
    "reference_date" DATE NOT NULL,
    "title" VARCHAR(300) NOT NULL,
    "due_date" DATE NOT NULL,
    "read_at" TIMESTAMPTZ(3),
    "email_status" "notification_email_status" NOT NULL DEFAULT 'PENDING',
    "email_attempts" INTEGER NOT NULL DEFAULT 0,
    "next_attempt_at" TIMESTAMPTZ(3) NOT NULL,
    "locked_until" TIMESTAMPTZ(3),
    "lease_id" UUID,
    "sent_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "documents" (
    "id" UUID NOT NULL,
    "office_id" UUID NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "description" VARCHAR(2000) NOT NULL DEFAULT '',
    "category" "document_category" NOT NULL,
    "confidential" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "client_id" UUID,
    "case_id" UUID,
    "process_id" UUID,
    "current_version" INTEGER NOT NULL,
    "creator_id" UUID NOT NULL,
    "inactivated_at" TIMESTAMPTZ(3),
    "inactivated_by_id" UUID,
    "version" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_versions" (
    "id" UUID NOT NULL,
    "document_id" UUID NOT NULL,
    "number" INTEGER NOT NULL,
    "storage_key" VARCHAR(300) NOT NULL,
    "original_name" VARCHAR(255) NOT NULL,
    "content_type" VARCHAR(120) NOT NULL,
    "size_bytes" BIGINT NOT NULL,
    "sha256" CHAR(64) NOT NULL,
    "uploader_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "document_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_events" (
    "id" UUID NOT NULL,
    "document_id" UUID NOT NULL,
    "actor_id" UUID NOT NULL,
    "action" VARCHAR(40) NOT NULL,
    "version_number" INTEGER,
    "details" JSONB,
    "created_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "document_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "tasks_office_id_status_internal_due_date_idx" ON "tasks"("office_id", "status", "internal_due_date");

-- CreateIndex
CREATE INDEX "tasks_office_id_responsible_id_status_idx" ON "tasks"("office_id", "responsible_id", "status");

-- CreateIndex
CREATE INDEX "task_checklist_items_task_id_position_idx" ON "task_checklist_items"("task_id", "position");

-- CreateIndex
CREATE INDEX "task_history_task_id_created_at_idx" ON "task_history"("task_id", "created_at");

-- CreateIndex
CREATE INDEX "judicial_deadlines_office_id_status_due_date_idx" ON "judicial_deadlines"("office_id", "status", "due_date");

-- CreateIndex
CREATE INDEX "judicial_deadlines_task_id_idx" ON "judicial_deadlines"("task_id");

-- CreateIndex
CREATE INDEX "judicial_deadline_history_deadline_id_created_at_idx" ON "judicial_deadline_history"("deadline_id", "created_at");

-- CreateIndex
CREATE INDEX "notifications_office_id_user_id_read_at_created_at_idx" ON "notifications"("office_id", "user_id", "read_at", "created_at");

-- CreateIndex
CREATE INDEX "notifications_email_status_next_attempt_at_idx" ON "notifications"("email_status", "next_attempt_at");

-- CreateIndex
CREATE INDEX "notifications_task_id_idx" ON "notifications"("task_id");

-- CreateIndex
CREATE INDEX "notifications_deadline_id_idx" ON "notifications"("deadline_id");

-- CreateIndex
CREATE UNIQUE INDEX "notifications_user_id_kind_target_id_reference_date_key" ON "notifications"("user_id", "kind", "target_id", "reference_date");

-- CreateIndex
CREATE INDEX "documents_office_id_active_category_updated_at_idx" ON "documents"("office_id", "active", "category", "updated_at");

-- CreateIndex
CREATE UNIQUE INDEX "document_versions_storage_key_key" ON "document_versions"("storage_key");

-- CreateIndex
CREATE UNIQUE INDEX "document_versions_document_id_number_key" ON "document_versions"("document_id", "number");

-- CreateIndex
CREATE INDEX "document_events_document_id_created_at_idx" ON "document_events"("document_id", "created_at");

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_office_id_fkey" FOREIGN KEY ("office_id") REFERENCES "offices"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_responsible_id_fkey" FOREIGN KEY ("responsible_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_reviewer_id_fkey" FOREIGN KEY ("reviewer_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_creator_id_fkey" FOREIGN KEY ("creator_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_completed_by_id_fkey" FOREIGN KEY ("completed_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "task_checklist_items" ADD CONSTRAINT "task_checklist_items_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "task_checklist_items" ADD CONSTRAINT "task_checklist_items_done_by_id_fkey" FOREIGN KEY ("done_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "task_history" ADD CONSTRAINT "task_history_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "task_history" ADD CONSTRAINT "task_history_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "judicial_deadlines" ADD CONSTRAINT "judicial_deadlines_office_id_fkey" FOREIGN KEY ("office_id") REFERENCES "offices"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "judicial_deadlines" ADD CONSTRAINT "judicial_deadlines_responsible_id_fkey" FOREIGN KEY ("responsible_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "judicial_deadlines" ADD CONSTRAINT "judicial_deadlines_confirmed_by_id_fkey" FOREIGN KEY ("confirmed_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "judicial_deadlines" ADD CONSTRAINT "judicial_deadlines_completed_by_id_fkey" FOREIGN KEY ("completed_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "judicial_deadlines" ADD CONSTRAINT "judicial_deadlines_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "judicial_deadline_history" ADD CONSTRAINT "judicial_deadline_history_deadline_id_fkey" FOREIGN KEY ("deadline_id") REFERENCES "judicial_deadlines"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "judicial_deadline_history" ADD CONSTRAINT "judicial_deadline_history_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_office_id_fkey" FOREIGN KEY ("office_id") REFERENCES "offices"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_deadline_id_fkey" FOREIGN KEY ("deadline_id") REFERENCES "judicial_deadlines"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_office_id_fkey" FOREIGN KEY ("office_id") REFERENCES "offices"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_creator_id_fkey" FOREIGN KEY ("creator_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_inactivated_by_id_fkey" FOREIGN KEY ("inactivated_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "document_versions" ADD CONSTRAINT "document_versions_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "documents"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "document_versions" ADD CONSTRAINT "document_versions_uploader_id_fkey" FOREIGN KEY ("uploader_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "document_events" ADD CONSTRAINT "document_events_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "documents"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "document_events" ADD CONSTRAINT "document_events_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;


-- Integrity rules that the Prisma schema cannot express.
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_single_link" CHECK (num_nonnulls("client_id", "case_id", "process_id") <= 1);
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_completion" CHECK (("status" = 'DONE') = ("completed_at" IS NOT NULL AND "completed_by_id" IS NOT NULL));
ALTER TABLE "judicial_deadlines" ADD CONSTRAINT "judicial_deadlines_single_link" CHECK (num_nonnulls("client_id", "case_id", "process_id") <= 1);
ALTER TABLE "judicial_deadlines" ADD CONSTRAINT "judicial_deadlines_completion" CHECK (("status" = 'FULFILLED') = ("completed_at" IS NOT NULL AND "completed_by_id" IS NOT NULL));
ALTER TABLE "documents" ADD CONSTRAINT "documents_single_link" CHECK (num_nonnulls("client_id", "case_id", "process_id") <= 1);
ALTER TABLE "documents" ADD CONSTRAINT "documents_inactivation" CHECK ("active" = ("inactivated_at" IS NULL));
ALTER TABLE "document_versions" ADD CONSTRAINT "document_versions_size" CHECK ("size_bytes" > 0);
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_single_target" CHECK (num_nonnulls("task_id", "deadline_id") = 1 AND "target_id" = COALESCE("task_id", "deadline_id"));

-- History, events and stored versions are append-only.
CREATE FUNCTION "reject_append_only_change"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'append-only table: %', TG_TABLE_NAME USING ERRCODE = 'integrity_constraint_violation';
END;
$$;
CREATE TRIGGER "task_history_append_only" BEFORE UPDATE OR DELETE ON "task_history" FOR EACH ROW EXECUTE FUNCTION "reject_append_only_change"();
CREATE TRIGGER "judicial_deadline_history_append_only" BEFORE UPDATE OR DELETE ON "judicial_deadline_history" FOR EACH ROW EXECUTE FUNCTION "reject_append_only_change"();
CREATE TRIGGER "document_events_append_only" BEFORE UPDATE OR DELETE ON "document_events" FOR EACH ROW EXECUTE FUNCTION "reject_append_only_change"();
CREATE TRIGGER "document_versions_append_only" BEFORE UPDATE OR DELETE ON "document_versions" FOR EACH ROW EXECUTE FUNCTION "reject_append_only_change"();
