-- Goal-to-Jira mappings are local analytics metadata. Jira remains read-only.
ALTER TABLE "WbsItem"
  ADD COLUMN "jiraGoalLabels" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
