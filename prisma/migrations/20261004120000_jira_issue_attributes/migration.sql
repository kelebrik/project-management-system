-- AlterTable
ALTER TABLE "JiraAnalyticsSettings" ADD COLUMN "extraFieldIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN "fieldCatalog" JSONB;

-- AlterTable
ALTER TABLE "JiraIssueSnapshot" ADD COLUMN "attributes" JSONB;

-- AlterTable
ALTER TABLE "JiraIssueVersion" ADD COLUMN "attributes" JSONB;
