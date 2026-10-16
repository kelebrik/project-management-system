-- A person's layout kept the same in every project.
CREATE TABLE "UserViewDefaults" (
    "userId" TEXT NOT NULL,
    "state" JSONB NOT NULL DEFAULT '{}',
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "UserViewDefaults_pkey" PRIMARY KEY ("userId")
);

ALTER TABLE "UserViewDefaults" ADD CONSTRAINT "UserViewDefaults_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Each field from the project the person arranged it in last.
INSERT INTO "UserViewDefaults" ("userId", "state", "updatedAt")
SELECT latest."userId", jsonb_object_agg(latest."key", latest."value"), CURRENT_TIMESTAMP
FROM (
  SELECT DISTINCT ON (v."userId", field."key") v."userId", field."key", field."value"
  FROM "UserProjectViewState" v
  CROSS JOIN LATERAL jsonb_each(CASE WHEN jsonb_typeof(v."state") = 'object' THEN v."state" ELSE '{}'::jsonb END) AS field
  WHERE field."key" IN ('wbsColumnOrder', 'wbsHiddenColumns', 'wbsColumnWidths', 'wbsSort', 'ganttPanelHeight', 'ganttPanelWidth', 'ganttWbsWidth', 'sidebarCollapsed')
  ORDER BY v."userId", field."key", v."updatedAt" DESC
) latest
GROUP BY latest."userId";
