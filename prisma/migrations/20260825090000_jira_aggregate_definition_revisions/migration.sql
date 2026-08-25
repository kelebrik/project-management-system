CREATE TABLE "JiraAggregateDefinitionRevision" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "aggregateId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "definition" JSONB NOT NULL,
    "fingerprint" CHAR(64) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JiraAggregateDefinitionRevision_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "JiraAggregateDefinitionRevision_version_check" CHECK ("version" > 0)
);

INSERT INTO "JiraAggregateDefinitionRevision" (
    "id",
    "projectId",
    "aggregateId",
    "version",
    "definition",
    "fingerprint",
    "createdAt"
)
SELECT
    'revision-' || md5("id" || ':' || "version"::text),
    "projectId",
    "id",
    "version",
    jsonb_build_object(
        'name', "name",
        'description', "description",
        'source', "source",
        'metric', "metric",
        'groupBy', "groupBy",
        'scope', "scope",
        'filterLogic', "filterLogic",
        'filters', "filters",
        'periodMode', "periodMode",
        'periodDays', "periodDays",
        'timeZone', "timeZone",
        'sortOrder', "sortOrder"
    ),
    "fingerprint",
    "updatedAt"
FROM "JiraAggregateDefinition";

CREATE UNIQUE INDEX "JiraAggregateDefinitionRevision_aggregateId_version_key"
ON "JiraAggregateDefinitionRevision"("aggregateId", "version");

CREATE INDEX "JiraAggregateDefinitionRevision_projectId_aggregateId_version_idx"
ON "JiraAggregateDefinitionRevision"("projectId", "aggregateId", "version");

ALTER TABLE "JiraAggregateDefinitionRevision"
ADD CONSTRAINT "JiraAggregateDefinitionRevision_projectId_fkey"
FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "JiraAggregateDefinitionRevision"
ADD CONSTRAINT "JiraAggregateDefinitionRevision_aggregateId_fkey"
FOREIGN KEY ("aggregateId") REFERENCES "JiraAggregateDefinition"("id") ON DELETE CASCADE ON UPDATE CASCADE;
