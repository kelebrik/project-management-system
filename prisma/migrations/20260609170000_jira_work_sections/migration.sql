CREATE TABLE "JiraWorkSection" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "jql" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JiraWorkSection_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "JiraWorkSectionIssue" (
    "sectionId" TEXT NOT NULL,
    "snapshotId" TEXT NOT NULL,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JiraWorkSectionIssue_pkey" PRIMARY KEY ("sectionId","snapshotId")
);

CREATE UNIQUE INDEX "JiraWorkSection_projectId_sortOrder_key" ON "JiraWorkSection"("projectId", "sortOrder");
CREATE INDEX "JiraWorkSection_projectId_idx" ON "JiraWorkSection"("projectId");
CREATE INDEX "JiraWorkSectionIssue_snapshotId_idx" ON "JiraWorkSectionIssue"("snapshotId");

ALTER TABLE "JiraWorkSection" ADD CONSTRAINT "JiraWorkSection_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "JiraWorkSectionIssue" ADD CONSTRAINT "JiraWorkSectionIssue_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "JiraWorkSection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "JiraWorkSectionIssue" ADD CONSTRAINT "JiraWorkSectionIssue_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "JiraIssueSnapshot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "JiraWorkSection" ("id", "projectId", "sortOrder", "title", "jql", "createdAt", "updatedAt")
SELECT
  concat('jira-work-section-', p."id", '-', section_number),
  p."id",
  section_number - 1,
  concat('Раздел ', section_number),
  '',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "Project" p
CROSS JOIN generate_series(1, 5) AS section_numbers(section_number)
ON CONFLICT ("projectId", "sortOrder") DO NOTHING;
