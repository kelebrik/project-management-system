CREATE TABLE "GitlabBranchSyncRun" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "aggregateId" TEXT NOT NULL,
    "aggregateVersion" INTEGER NOT NULL,
    "scopeKey" CHAR(64) NOT NULL,
    "projectPath" TEXT NOT NULL,
    "targetBranch" TEXT NOT NULL,
    "headSha" TEXT,
    "lookbackDays" INTEGER NOT NULL,
    "includeMergeCommits" BOOLEAN NOT NULL,
    "windowStartedAt" TIMESTAMP(3) NOT NULL,
    "windowEndedAt" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL,
    "commitCount" INTEGER NOT NULL DEFAULT 0,
    "linkedCount" INTEGER NOT NULL DEFAULT 0,
    "unlinkedCount" INTEGER NOT NULL DEFAULT 0,
    "undeterminedCount" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "createdById" TEXT,

    CONSTRAINT "GitlabBranchSyncRun_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "GitlabBranchSyncRun"
    ADD CONSTRAINT "GitlabBranchSyncRun_status_check"
    CHECK ("status" IN ('RUNNING', 'COMPLETED', 'FAILED'));

ALTER TABLE "JiraAggregateDefinition"
    DROP CONSTRAINT "JiraAggregateDefinition_source_check",
    ADD CONSTRAINT "JiraAggregateDefinition_source_check"
      CHECK ("source" IN ('issues', 'goalIssues', 'transitions', 'development', 'criticalBugs', 'statusIntervals', 'gitlabCommits'));

CREATE TABLE "GitlabBranchCommit" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "syncRunId" TEXT,
    "scopeKey" CHAR(64) NOT NULL,
    "projectPath" TEXT NOT NULL,
    "targetBranch" TEXT NOT NULL,
    "commitSha" TEXT NOT NULL,
    "shortSha" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "authorName" TEXT NOT NULL,
    "authorEmail" TEXT,
    "committedAt" TIMESTAMP(3) NOT NULL,
    "webUrl" TEXT NOT NULL,
    "sourceBranch" TEXT,
    "mergeRequestIid" INTEGER,
    "mergeRequestTitle" TEXT,
    "mergeRequestUrl" TEXT,
    "jiraKeys" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "jiraLinkState" TEXT NOT NULL,
    "observedAt" TIMESTAMP(3) NOT NULL,
    "retiredAt" TIMESTAMP(3),

    CONSTRAINT "GitlabBranchCommit_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "GitlabBranchCommit"
    ADD CONSTRAINT "GitlabBranchCommit_jiraLinkState_check"
    CHECK ("jiraLinkState" IN ('linked', 'unlinked', 'undetermined'));

CREATE INDEX "GitlabBranchSyncRun_projectId_aggregateId_startedAt_idx"
    ON "GitlabBranchSyncRun"("projectId", "aggregateId", "startedAt");
CREATE INDEX "GitlabBranchSyncRun_projectId_scopeKey_startedAt_idx"
    ON "GitlabBranchSyncRun"("projectId", "scopeKey", "startedAt");
CREATE UNIQUE INDEX "GitlabBranchCommit_projectId_scopeKey_commitSha_key"
    ON "GitlabBranchCommit"("projectId", "scopeKey", "commitSha");
CREATE INDEX "GitlabBranchCommit_projectId_scopeKey_committedAt_idx"
    ON "GitlabBranchCommit"("projectId", "scopeKey", "committedAt");
CREATE INDEX "GitlabBranchCommit_projectId_jiraLinkState_committedAt_idx"
    ON "GitlabBranchCommit"("projectId", "jiraLinkState", "committedAt");
CREATE INDEX "GitlabBranchCommit_syncRunId_idx" ON "GitlabBranchCommit"("syncRunId");

ALTER TABLE "GitlabBranchSyncRun"
    ADD CONSTRAINT "GitlabBranchSyncRun_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GitlabBranchCommit"
    ADD CONSTRAINT "GitlabBranchCommit_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GitlabBranchCommit"
    ADD CONSTRAINT "GitlabBranchCommit_syncRunId_fkey"
    FOREIGN KEY ("syncRunId") REFERENCES "GitlabBranchSyncRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;
