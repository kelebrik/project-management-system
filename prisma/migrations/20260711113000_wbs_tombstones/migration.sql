-- Keep recoverable snapshots of deleted WBS items for a bounded 30-day window.
CREATE TABLE "WbsTombstone" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "auditEventId" TEXT,
    "deletedById" TEXT,
    "restoredById" TEXT,
    "itemIds" JSONB NOT NULL,
    "itemCount" INTEGER NOT NULL,
    "items" JSONB NOT NULL,
    "dependencies" JSONB,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "restoredAt" TIMESTAMP(3),
    "restoredRootId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WbsTombstone_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WbsTombstone_auditEventId_key" ON "WbsTombstone"("auditEventId");
CREATE INDEX "WbsTombstone_projectId_createdAt_idx" ON "WbsTombstone"("projectId", "createdAt");
CREATE INDEX "WbsTombstone_expiresAt_idx" ON "WbsTombstone"("expiresAt");
CREATE INDEX "WbsTombstone_restoredAt_idx" ON "WbsTombstone"("restoredAt");
CREATE INDEX "WbsTombstone_deletedById_createdAt_idx" ON "WbsTombstone"("deletedById", "createdAt");
CREATE INDEX "WbsTombstone_restoredById_restoredAt_idx" ON "WbsTombstone"("restoredById", "restoredAt");

ALTER TABLE "WbsTombstone"
    ADD CONSTRAINT "WbsTombstone_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "WbsTombstone"
    ADD CONSTRAINT "WbsTombstone_auditEventId_fkey"
    FOREIGN KEY ("auditEventId") REFERENCES "AuditEvent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "WbsTombstone"
    ADD CONSTRAINT "WbsTombstone_deletedById_fkey"
    FOREIGN KEY ("deletedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "WbsTombstone"
    ADD CONSTRAINT "WbsTombstone_restoredById_fkey"
    FOREIGN KEY ("restoredById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
