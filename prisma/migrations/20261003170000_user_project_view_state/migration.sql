-- CreateTable
CREATE TABLE "UserProjectViewState" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "state" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserProjectViewState_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "UserProjectViewState_userId_projectId_key" ON "UserProjectViewState"("userId", "projectId");

-- CreateIndex
CREATE INDEX "UserProjectViewState_projectId_idx" ON "UserProjectViewState"("projectId");

-- AddForeignKey
ALTER TABLE "UserProjectViewState" ADD CONSTRAINT "UserProjectViewState_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserProjectViewState" ADD CONSTRAINT "UserProjectViewState_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
