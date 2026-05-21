CREATE TABLE "RaidItemStatusUpdate" (
    "id" TEXT NOT NULL,
    "raidItemId" TEXT NOT NULL,
    "statusAt" TIMESTAMP(3) NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RaidItemStatusUpdate_pkey" PRIMARY KEY ("id")
);

INSERT INTO "RaidItemStatusUpdate" (
    "id",
    "raidItemId",
    "statusAt",
    "text",
    "createdAt",
    "updatedAt"
)
SELECT
    'raid_status_' || "id",
    "id",
    COALESCE("updatedAt", CURRENT_TIMESTAMP),
    CASE
        WHEN NULLIF(BTRIM(COALESCE("mitigationPlan", '')), '') IS NOT NULL THEN "mitigationPlan"
        WHEN NULLIF(BTRIM(COALESCE("description", '')), '') IS NOT NULL THEN "description"
        ELSE 'Статус не задан'
    END,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM "RaidItem"
WHERE NOT EXISTS (
    SELECT 1
    FROM "RaidItemStatusUpdate"
    WHERE "RaidItemStatusUpdate"."raidItemId" = "RaidItem"."id"
);

CREATE INDEX "RaidItemStatusUpdate_raidItemId_statusAt_idx" ON "RaidItemStatusUpdate"("raidItemId", "statusAt");
CREATE INDEX "RaidItemStatusUpdate_raidItemId_createdAt_idx" ON "RaidItemStatusUpdate"("raidItemId", "createdAt");

ALTER TABLE "RaidItemStatusUpdate"
ADD CONSTRAINT "RaidItemStatusUpdate_raidItemId_fkey"
FOREIGN KEY ("raidItemId") REFERENCES "RaidItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
