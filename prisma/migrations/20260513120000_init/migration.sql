-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "RagStatus" AS ENUM ('GREEN', 'AMBER', 'RED');

-- CreateEnum
CREATE TYPE "ProjectStatus" AS ENUM ('DRAFT', 'ACTIVE', 'ON_HOLD', 'CLOSED');

-- CreateEnum
CREATE TYPE "IssueSource" AS ENUM ('INTERNAL', 'JIRA');

-- CreateEnum
CREATE TYPE "IssueSeverity" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "OverviewStatus" AS ENUM ('DRAFT', 'GENERATED', 'PM_REVIEW', 'APPROVED', 'PUBLISHED');

-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "portfolio" TEXT NOT NULL,
    "sponsor" TEXT NOT NULL,
    "projectManager" TEXT NOT NULL,
    "status" "ProjectStatus" NOT NULL DEFAULT 'ACTIVE',
    "rag" "RagStatus" NOT NULL DEFAULT 'GREEN',
    "startDate" TIMESTAMP(3) NOT NULL,
    "targetDate" TIMESTAMP(3) NOT NULL,
    "budgetPlanned" DECIMAL(14,2) NOT NULL,
    "budgetForecast" DECIMAL(14,2) NOT NULL,
    "scheduleVariance" INTEGER NOT NULL DEFAULT 0,
    "progress" INTEGER NOT NULL DEFAULT 0,
    "summary" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JiraIntegration" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "baseUrl" TEXT NOT NULL,
    "boardUrl" TEXT NOT NULL,
    "projectKey" TEXT NOT NULL,
    "issuesJql" TEXT NOT NULL,
    "openIssuesJql" TEXT NOT NULL,
    "syncStatus" TEXT NOT NULL DEFAULT 'NOT_CONFIGURED',
    "lastSyncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JiraIntegration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Task" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "owner" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "priority" TEXT NOT NULL,
    "dueDate" TIMESTAMP(3),
    "jiraTicketKey" TEXT,
    "jiraTicketUrl" TEXT,
    "jiraStatus" TEXT,
    "jiraAssignee" TEXT,
    "jiraPriority" TEXT,
    "jiraUpdatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Task_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Issue" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "source" "IssueSource" NOT NULL,
    "title" TEXT NOT NULL,
    "severity" "IssueSeverity" NOT NULL,
    "status" TEXT NOT NULL,
    "owner" TEXT NOT NULL,
    "impact" TEXT NOT NULL,
    "decisionRequired" BOOLEAN NOT NULL DEFAULT false,
    "dueDate" TIMESTAMP(3),
    "jiraTicketKey" TEXT,
    "jiraTicketUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Issue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JiraIssueSnapshot" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "issueKey" TEXT NOT NULL,
    "issueUrl" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "priority" TEXT NOT NULL,
    "assignee" TEXT,
    "issueType" TEXT NOT NULL,
    "sprint" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JiraIssueSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExecutiveOverview" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "status" "OverviewStatus" NOT NULL DEFAULT 'DRAFT',
    "generatedAt" TIMESTAMP(3),
    "publishedAt" TIMESTAMP(3),
    "executiveSummary" TEXT NOT NULL,
    "decisions" JSONB NOT NULL,
    "evidence" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExecutiveOverview_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Project_code_key" ON "Project"("code");

-- CreateIndex
CREATE UNIQUE INDEX "JiraIntegration_projectId_key" ON "JiraIntegration"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "JiraIssueSnapshot_projectId_issueKey_key" ON "JiraIssueSnapshot"("projectId", "issueKey");

-- CreateIndex
CREATE UNIQUE INDEX "ExecutiveOverview_projectId_version_key" ON "ExecutiveOverview"("projectId", "version");

-- AddForeignKey
ALTER TABLE "JiraIntegration" ADD CONSTRAINT "JiraIntegration_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Issue" ADD CONSTRAINT "Issue_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JiraIssueSnapshot" ADD CONSTRAINT "JiraIssueSnapshot_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExecutiveOverview" ADD CONSTRAINT "ExecutiveOverview_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

