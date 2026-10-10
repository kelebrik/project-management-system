-- CreateTable
CREATE TABLE "ProjectHistorySnapshot" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "day" DATE NOT NULL,
    "takenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastWriteAt" TIMESTAMP(3) NOT NULL,
    "contentHash" CHAR(64) NOT NULL,
    "payload" JSONB,
    "sizeBytes" INTEGER NOT NULL,
    "oversized" BOOLEAN NOT NULL DEFAULT false,
    "partial" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "ProjectHistorySnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProjectHistorySnapshot_projectId_day_key" ON "ProjectHistorySnapshot"("projectId", "day");

-- CreateIndex
CREATE INDEX "ProjectHistorySnapshot_projectId_takenAt_idx" ON "ProjectHistorySnapshot"("projectId", "takenAt");

-- AddForeignKey
ALTER TABLE "ProjectHistorySnapshot" ADD CONSTRAINT "ProjectHistorySnapshot_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
