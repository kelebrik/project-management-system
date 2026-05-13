CREATE TYPE "RaidItemType" AS ENUM ('RISK', 'ASSUMPTION', 'DEPENDENCY');
CREATE TYPE "RaidItemStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'MITIGATED', 'VALIDATED', 'BREACHED', 'CLOSED');
CREATE TYPE "ChangeRequestType" AS ENUM ('SCOPE', 'BUDGET', 'SCHEDULE', 'RESOURCE');
CREATE TYPE "ChangeRequestStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'IN_REVIEW', 'APPROVED', 'REJECTED', 'IMPLEMENTED');

CREATE TABLE "RaidItem" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "type" "RaidItemType" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "owner" TEXT NOT NULL,
    "status" "RaidItemStatus" NOT NULL DEFAULT 'OPEN',
    "probability" INTEGER NOT NULL DEFAULT 0,
    "impact" INTEGER NOT NULL DEFAULT 0,
    "riskScore" INTEGER NOT NULL DEFAULT 0,
    "mitigationPlan" TEXT,
    "contingencyPlan" TEXT,
    "dueDate" TIMESTAMP(3),
    "residualRisk" INTEGER NOT NULL DEFAULT 0,
    "validationDate" TIMESTAMP(3),
    "linkedRiskId" TEXT,
    "dependencyType" TEXT,
    "predecessor" TEXT,
    "successor" TEXT,
    "supplier" TEXT,
    "decisionRequired" BOOLEAN NOT NULL DEFAULT false,
    "escalationLevel" TEXT NOT NULL DEFAULT 'Project',
    "scheduleImpactDays" INTEGER NOT NULL DEFAULT 0,
    "budgetImpact" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RaidItem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ChangeRequest" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "type" "ChangeRequestType" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "owner" TEXT NOT NULL,
    "status" "ChangeRequestStatus" NOT NULL DEFAULT 'DRAFT',
    "impactAnalysis" TEXT NOT NULL,
    "affectedBaseline" TEXT NOT NULL,
    "implementationPlan" TEXT,
    "scheduleImpactDays" INTEGER NOT NULL DEFAULT 0,
    "budgetImpact" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "scopeImpact" TEXT,
    "approvalRoute" TEXT NOT NULL DEFAULT 'PMO -> Sponsor',
    "decisionRequired" BOOLEAN NOT NULL DEFAULT false,
    "dueDate" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChangeRequest_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "RaidItem_projectId_type_status_idx" ON "RaidItem"("projectId", "type", "status");
CREATE INDEX "RaidItem_projectId_riskScore_idx" ON "RaidItem"("projectId", "riskScore");
CREATE INDEX "RaidItem_linkedRiskId_idx" ON "RaidItem"("linkedRiskId");
CREATE INDEX "ChangeRequest_projectId_status_idx" ON "ChangeRequest"("projectId", "status");
CREATE INDEX "ChangeRequest_projectId_updatedAt_idx" ON "ChangeRequest"("projectId", "updatedAt");

ALTER TABLE "RaidItem" ADD CONSTRAINT "RaidItem_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RaidItem" ADD CONSTRAINT "RaidItem_linkedRiskId_fkey" FOREIGN KEY ("linkedRiskId") REFERENCES "RaidItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ChangeRequest" ADD CONSTRAINT "ChangeRequest_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
