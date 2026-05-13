ALTER TABLE "ExecutiveOverview" ADD COLUMN "reviewRequestedAt" TIMESTAMP(3);
ALTER TABLE "ExecutiveOverview" ADD COLUMN "approvedAt" TIMESTAMP(3);
ALTER TABLE "ExecutiveOverview" ADD COLUMN "approvedBy" TEXT;
ALTER TABLE "ExecutiveOverview" ADD COLUMN "kpis" JSONB;
ALTER TABLE "ExecutiveOverview" ADD COLUMN "qualityGates" JSONB;
ALTER TABLE "ExecutiveOverview" ADD COLUMN "risks" JSONB;
ALTER TABLE "ExecutiveOverview" ADD COLUMN "nextSteps" JSONB;
