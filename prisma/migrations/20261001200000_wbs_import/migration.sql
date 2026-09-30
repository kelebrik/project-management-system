-- CreateTable
CREATE TABLE "WbsImport" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "importKey" TEXT NOT NULL,
    "userId" TEXT,
    "summary" JSONB NOT NULL,
    "createdIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WbsImport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WbsImport_projectId_importKey_key" ON "WbsImport"("projectId", "importKey");

-- AddForeignKey
ALTER TABLE "WbsImport" ADD CONSTRAINT "WbsImport_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
