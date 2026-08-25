-- Split managed Jira row sets from widget-level analytical queries.
-- Existing rows stay legacy-compatible until an administrator edits them.
ALTER TABLE "JiraAggregateDefinition"
  ADD COLUMN "definitionSchemaVersion" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "exposedFields" JSONB,
  ADD COLUMN "baseFilterLogic" TEXT,
  ADD COLUMN "baseFilters" JSONB;

-- A semantic fingerprint is useful for matching, but multiple named datasets
-- may intentionally expose the same row set while legacy widgets are migrated.
DROP INDEX IF EXISTS "JiraAggregateDefinition_projectId_fingerprint_key";
CREATE INDEX "JiraAggregateDefinition_projectId_fingerprint_idx"
  ON "JiraAggregateDefinition"("projectId", "fingerprint");
