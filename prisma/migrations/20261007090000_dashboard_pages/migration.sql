-- CreateTable
CREATE TABLE "DashboardPage" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "document" JSONB NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DashboardPage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DashboardPage_ownerId_updatedAt_idx" ON "DashboardPage"("ownerId", "updatedAt");

-- AddForeignKey
ALTER TABLE "DashboardPage" ADD CONSTRAINT "DashboardPage_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
