-- Store Jira-like field-level changelog rows for audit events without duplicating full snapshots.
CREATE TABLE "AuditEventChange" (
    "id" TEXT NOT NULL,
    "auditEventId" TEXT NOT NULL,
    "actorId" TEXT,
    "projectId" TEXT,
    "objectType" TEXT NOT NULL,
    "objectId" TEXT,
    "field" TEXT NOT NULL,
    "oldValue" JSONB,
    "newValue" JSONB,
    "oldText" TEXT,
    "newText" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditEventChange_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AuditEventChange_auditEventId_idx" ON "AuditEventChange"("auditEventId");
CREATE INDEX "AuditEventChange_projectId_createdAt_idx" ON "AuditEventChange"("projectId", "createdAt");
CREATE INDEX "AuditEventChange_objectType_objectId_createdAt_idx" ON "AuditEventChange"("objectType", "objectId", "createdAt");
CREATE INDEX "AuditEventChange_field_createdAt_idx" ON "AuditEventChange"("field", "createdAt");
CREATE INDEX "AuditEventChange_actorId_createdAt_idx" ON "AuditEventChange"("actorId", "createdAt");

ALTER TABLE "AuditEventChange"
    ADD CONSTRAINT "AuditEventChange_auditEventId_fkey"
    FOREIGN KEY ("auditEventId") REFERENCES "AuditEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AuditEventChange"
    ADD CONSTRAINT "AuditEventChange_actorId_fkey"
    FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
