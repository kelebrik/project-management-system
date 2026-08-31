-- AlterTable
ALTER TABLE "Issue"
ADD COLUMN "phaseId" TEXT,
ADD COLUMN "workPackageId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Issue_workPackageId_key" ON "Issue"("workPackageId");

-- CreateIndex
CREATE INDEX "Issue_projectId_phaseId_idx" ON "Issue"("projectId", "phaseId");

-- AddForeignKey
ALTER TABLE "Issue"
ADD CONSTRAINT "Issue_phaseId_fkey"
FOREIGN KEY ("phaseId") REFERENCES "WbsItem"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Issue"
ADD CONSTRAINT "Issue_workPackageId_fkey"
FOREIGN KEY ("workPackageId") REFERENCES "WbsItem"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
