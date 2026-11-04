-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "office_id" UUID,
    "actor_id" UUID,
    "action" VARCHAR(48) NOT NULL,
    "entity_type" VARCHAR(32) NOT NULL,
    "entity_id" UUID,
    "previous" JSONB,
    "current" JSONB,
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "audit_logs_office_id_created_at_idx" ON "audit_logs"("office_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "audit_logs_office_id_actor_id_created_at_idx" ON "audit_logs"("office_id", "actor_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_logs_office_id_entity_type_entity_id_idx" ON "audit_logs"("office_id", "entity_type", "entity_id");



-- Unified audit trail fed by the per-module history tables in the same transaction.
-- Trigger arguments: entity type, parent table holding office_id, column in the history row that references the parent.
CREATE FUNCTION "audit_from_history"() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  linha jsonb := to_jsonb(NEW);
  id_entidade uuid := (linha ->> TG_ARGV[2])::uuid;
  id_escritorio uuid;
BEGIN
  EXECUTE format('SELECT office_id FROM %I WHERE id = $1', TG_ARGV[1]) INTO id_escritorio USING id_entidade;
  INSERT INTO "audit_logs" ("id", "office_id", "actor_id", "action", "entity_type", "entity_id", "previous", "current", "metadata", "created_at")
  VALUES (gen_random_uuid(), id_escritorio, (linha ->> 'actor_id')::uuid, linha ->> 'action', TG_ARGV[0], id_entidade,
    linha -> 'previous', linha -> 'current',
    NULLIF(jsonb_strip_nulls(jsonb_build_object('numeroVersao', linha -> 'version_number', 'detalhes', linha -> 'details')), '{}'::jsonb),
    (linha ->> 'created_at')::timestamptz);
  RETURN NULL;
END;
$$;

CREATE TRIGGER "task_history_audit" AFTER INSERT ON "task_history"
  FOR EACH ROW EXECUTE FUNCTION "audit_from_history"('TAREFA', 'tasks', 'task_id');
CREATE TRIGGER "judicial_deadline_history_audit" AFTER INSERT ON "judicial_deadline_history"
  FOR EACH ROW EXECUTE FUNCTION "audit_from_history"('PRAZO_JUDICIAL', 'judicial_deadlines', 'deadline_id');
CREATE TRIGGER "document_events_audit" AFTER INSERT ON "document_events"
  FOR EACH ROW EXECUTE FUNCTION "audit_from_history"('DOCUMENTO', 'documents', 'document_id');
CREATE TRIGGER "membership_history_audit" AFTER INSERT ON "membership_history"
  FOR EACH ROW EXECUTE FUNCTION "audit_from_history"('MEMBRO', 'memberships', 'membership_id');

-- Session start and end (logout, revocation by the team, refresh reuse detection).
CREATE FUNCTION "audit_session_change"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO "audit_logs" ("id", "office_id", "actor_id", "action", "entity_type", "entity_id", "metadata", "created_at")
    VALUES (gen_random_uuid(), NEW."active_office_id", NEW."user_id", 'SESSAO_INICIADA', 'SESSAO', NEW."id",
      jsonb_build_object('navegador', NEW."browser", 'dispositivo', NEW."device", 'ipMascarado', NEW."masked_ip"), NEW."created_at");
  ELSE
    INSERT INTO "audit_logs" ("id", "office_id", "actor_id", "action", "entity_type", "entity_id", "created_at")
    VALUES (gen_random_uuid(), NEW."active_office_id", NEW."user_id", 'SESSAO_ENCERRADA', 'SESSAO', NEW."id", NEW."revoked_at");
  END IF;
  RETURN NULL;
END;
$$;
CREATE TRIGGER "sessions_audit_start" AFTER INSERT ON "sessions"
  FOR EACH ROW EXECUTE FUNCTION "audit_session_change"();
CREATE TRIGGER "sessions_audit_end" AFTER UPDATE OF "revoked_at" ON "sessions"
  FOR EACH ROW WHEN (OLD."revoked_at" IS NULL AND NEW."revoked_at" IS NOT NULL) EXECUTE FUNCTION "audit_session_change"();

-- Backfill events recorded before this migration.
INSERT INTO "audit_logs" ("id", "office_id", "actor_id", "action", "entity_type", "entity_id", "previous", "current", "created_at")
SELECT gen_random_uuid(), t."office_id", h."actor_id", h."action", 'TAREFA', h."task_id", h."previous", h."current", h."created_at"
FROM "task_history" h JOIN "tasks" t ON t."id" = h."task_id";
INSERT INTO "audit_logs" ("id", "office_id", "actor_id", "action", "entity_type", "entity_id", "previous", "current", "created_at")
SELECT gen_random_uuid(), d."office_id", h."actor_id", h."action", 'PRAZO_JUDICIAL', h."deadline_id", h."previous", h."current", h."created_at"
FROM "judicial_deadline_history" h JOIN "judicial_deadlines" d ON d."id" = h."deadline_id";
INSERT INTO "audit_logs" ("id", "office_id", "actor_id", "action", "entity_type", "entity_id", "metadata", "created_at")
SELECT gen_random_uuid(), d."office_id", e."actor_id", e."action", 'DOCUMENTO', e."document_id",
  NULLIF(jsonb_strip_nulls(jsonb_build_object('numeroVersao', e."version_number", 'detalhes', e."details")), '{}'::jsonb), e."created_at"
FROM "document_events" e JOIN "documents" d ON d."id" = e."document_id";
INSERT INTO "audit_logs" ("id", "office_id", "actor_id", "action", "entity_type", "entity_id", "previous", "current", "created_at")
SELECT gen_random_uuid(), m."office_id", h."actor_id", h."action", 'MEMBRO', h."membership_id", h."previous", h."current", h."created_at"
FROM "membership_history" h JOIN "memberships" m ON m."id" = h."membership_id";
INSERT INTO "audit_logs" ("id", "office_id", "actor_id", "action", "entity_type", "entity_id", "metadata", "created_at")
SELECT gen_random_uuid(), s."active_office_id", s."user_id", 'SESSAO_INICIADA', 'SESSAO', s."id",
  jsonb_build_object('navegador', s."browser", 'dispositivo', s."device", 'ipMascarado', s."masked_ip"), s."created_at"
FROM "sessions" s;
INSERT INTO "audit_logs" ("id", "office_id", "actor_id", "action", "entity_type", "entity_id", "created_at")
SELECT gen_random_uuid(), s."active_office_id", s."user_id", 'SESSAO_ENCERRADA', 'SESSAO', s."id", s."revoked_at"
FROM "sessions" s WHERE s."revoked_at" IS NOT NULL;

-- The audit trail is append-only. It keeps no foreign keys so records outlive the entities they describe.
CREATE TRIGGER "audit_logs_append_only" BEFORE UPDATE OR DELETE ON "audit_logs" FOR EACH ROW EXECUTE FUNCTION "reject_append_only_change"();
