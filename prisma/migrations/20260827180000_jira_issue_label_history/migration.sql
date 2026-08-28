ALTER TABLE "JiraIssueSnapshot"
ADD COLUMN "labels" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

UPDATE "JiraIssueSnapshot" AS snapshot
SET "labels" = version."labels"
FROM "JiraIssueVersion" AS version
WHERE snapshot."currentVersionId" = version."id"
  AND snapshot."projectionUnversionedSince" IS NULL
  AND snapshot."labels" IS DISTINCT FROM version."labels";

-- Snapshots explicitly marked as unversioned have no trustworthy immutable
-- observation to copy. Their current labels are filled by the next Jira sync.

CREATE INDEX "JiraIssueSnapshot_labels_idx"
ON "JiraIssueSnapshot" USING GIN ("labels");

CREATE TABLE "JiraIssueLabelChange" (
    "id" TEXT NOT NULL,
    "snapshotId" TEXT NOT NULL,
    "changeKey" TEXT NOT NULL,
    "changedAt" TIMESTAMP(3) NOT NULL,
    "fromLabels" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "toLabels" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "actor" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JiraIssueLabelChange_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "JiraIssueLabelChange_snapshotId_changeKey_key"
ON "JiraIssueLabelChange"("snapshotId", "changeKey");

CREATE INDEX "JiraIssueLabelChange_snapshotId_changedAt_idx"
ON "JiraIssueLabelChange"("snapshotId", "changedAt");

CREATE INDEX "JiraIssueLabelChange_changedAt_idx"
ON "JiraIssueLabelChange"("changedAt");

CREATE INDEX "JiraIssueLabelChange_fromLabels_idx"
ON "JiraIssueLabelChange" USING GIN ("fromLabels");

CREATE INDEX "JiraIssueLabelChange_toLabels_idx"
ON "JiraIssueLabelChange" USING GIN ("toLabels");

ALTER TABLE "JiraIssueLabelChange"
ADD CONSTRAINT "JiraIssueLabelChange_snapshotId_fkey"
FOREIGN KEY ("snapshotId") REFERENCES "JiraIssueSnapshot"("id") ON DELETE CASCADE ON UPDATE CASCADE;
