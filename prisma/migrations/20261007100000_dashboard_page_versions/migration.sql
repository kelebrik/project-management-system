-- CreateTable
CREATE TABLE "DashboardPageRevision" (
    "id" TEXT NOT NULL,
    "pageId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "document" JSONB NOT NULL,
    "label" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DashboardPageRevision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DashboardPageRelease" (
    "id" TEXT NOT NULL,
    "pageId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "label" TEXT NOT NULL DEFAULT '',
    "document" JSONB NOT NULL,
    "answers" JSONB NOT NULL,
    "projectIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DashboardPageRelease_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DashboardPageShare" (
    "id" TEXT NOT NULL,
    "pageId" TEXT NOT NULL,
    "releaseId" TEXT,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DashboardPageShare_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DashboardPageRevision_pageId_createdAt_idx" ON "DashboardPageRevision"("pageId", "createdAt");

-- CreateIndex
CREATE INDEX "DashboardPageRelease_pageId_createdAt_idx" ON "DashboardPageRelease"("pageId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "DashboardPageShare_tokenHash_key" ON "DashboardPageShare"("tokenHash");

-- CreateIndex
CREATE INDEX "DashboardPageShare_pageId_idx" ON "DashboardPageShare"("pageId");

-- AddForeignKey
ALTER TABLE "DashboardPageRevision" ADD CONSTRAINT "DashboardPageRevision_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "DashboardPage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DashboardPageRelease" ADD CONSTRAINT "DashboardPageRelease_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "DashboardPage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DashboardPageShare" ADD CONSTRAINT "DashboardPageShare_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "DashboardPage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DashboardPageShare" ADD CONSTRAINT "DashboardPageShare_releaseId_fkey" FOREIGN KEY ("releaseId") REFERENCES "DashboardPageRelease"("id") ON DELETE CASCADE ON UPDATE CASCADE;
