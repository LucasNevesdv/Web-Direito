-- CreateEnum
CREATE TYPE "AppointmentType" AS ENUM ('AUDIENCIA', 'REUNIAO', 'PERICIA', 'EVENTO_INTERNO');

-- CreateEnum
CREATE TYPE "AppointmentStatus" AS ENUM ('AGENDADO', 'REALIZADO', 'CANCELADO');

-- CreateTable
CREATE TABLE "appointments" (
    "id" UUID NOT NULL,
    "office_id" UUID NOT NULL,
    "creator_id" UUID NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "description" VARCHAR(4000) NOT NULL,
    "type" "AppointmentType" NOT NULL,
    "status" "AppointmentStatus" NOT NULL DEFAULT 'AGENDADO',
    "starts_at" TIMESTAMPTZ(3) NOT NULL,
    "ends_at" TIMESTAMPTZ(3) NOT NULL,
    "location" VARCHAR(500) NOT NULL,
    "remote_link" VARCHAR(2000) NOT NULL,
    "reminder_minutes" INTEGER,
    "client_id" UUID,
    "case_id" UUID,
    "process_id" UUID,
    "version" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "appointments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "appointment_participants" (
    "appointment_id" UUID NOT NULL,
    "office_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,

    CONSTRAINT "appointment_participants_pkey" PRIMARY KEY ("appointment_id","user_id")
);

-- CreateTable
CREATE TABLE "appointment_history" (
    "id" UUID NOT NULL,
    "appointment_id" UUID NOT NULL,
    "actor_id" UUID NOT NULL,
    "action" VARCHAR(40) NOT NULL,
    "previous" JSONB,
    "current" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "appointment_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "appointment_reminders" (
    "id" UUID NOT NULL,
    "appointment_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "due_at" TIMESTAMPTZ(3) NOT NULL,
    "read_at" TIMESTAMPTZ(3),

    CONSTRAINT "appointment_reminders_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "appointments_office_id_status_starts_at_idx" ON "appointments"("office_id", "status", "starts_at");

-- CreateIndex
CREATE INDEX "appointments_office_id_ends_at_idx" ON "appointments"("office_id", "ends_at");

-- CreateIndex
CREATE UNIQUE INDEX "appointments_id_office_id_key" ON "appointments"("id", "office_id");

-- CreateIndex
CREATE INDEX "appointment_participants_office_id_user_id_idx" ON "appointment_participants"("office_id", "user_id");

-- CreateIndex
CREATE INDEX "appointment_history_appointment_id_created_at_idx" ON "appointment_history"("appointment_id", "created_at");

-- CreateIndex
CREATE INDEX "appointment_reminders_user_id_due_at_idx" ON "appointment_reminders"("user_id", "due_at");

-- CreateIndex
CREATE UNIQUE INDEX "appointment_reminders_appointment_id_user_id_key" ON "appointment_reminders"("appointment_id", "user_id");

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_office_id_fkey" FOREIGN KEY ("office_id") REFERENCES "offices"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_creator_id_fkey" FOREIGN KEY ("creator_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "appointment_participants" ADD CONSTRAINT "appointment_participants_appointment_id_office_id_fkey" FOREIGN KEY ("appointment_id", "office_id") REFERENCES "appointments"("id", "office_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "appointment_participants" ADD CONSTRAINT "appointment_participants_office_id_user_id_fkey" FOREIGN KEY ("office_id", "user_id") REFERENCES "memberships"("office_id", "user_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "appointment_history" ADD CONSTRAINT "appointment_history_appointment_id_fkey" FOREIGN KEY ("appointment_id") REFERENCES "appointments"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "appointment_history" ADD CONSTRAINT "appointment_history_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "appointment_reminders" ADD CONSTRAINT "appointment_reminders_appointment_id_fkey" FOREIGN KEY ("appointment_id") REFERENCES "appointments"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "appointment_reminders" ADD CONSTRAINT "appointment_reminders_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "appointments" ADD CONSTRAINT "appointments_period_check" CHECK ("ends_at" > "starts_at");
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_reminder_check" CHECK ("reminder_minutes" BETWEEN 0 AND 10080);
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_single_link_check" CHECK (num_nonnulls("client_id", "case_id", "process_id") <= 1);
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "legal_cases"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_process_id_fkey" FOREIGN KEY ("process_id") REFERENCES "legal_processes"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

CREATE TRIGGER "appointment_history_audit" AFTER INSERT ON "appointment_history"
  FOR EACH ROW EXECUTE FUNCTION "audit_from_history"('COMPROMISSO', 'appointments', 'appointment_id');
CREATE TRIGGER "appointment_history_append_only" BEFORE UPDATE OR DELETE ON "appointment_history"
  FOR EACH ROW EXECUTE FUNCTION "reject_append_only_change"();
