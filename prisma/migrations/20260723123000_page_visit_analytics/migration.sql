CREATE TYPE "PageVisitActorType" AS ENUM ('USER', 'ANONYMOUS');

CREATE TABLE "PageVisit" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "actorType" "PageVisitActorType" NOT NULL,
    "userId" TEXT,
    "userName" TEXT,
    "anonymousVisitorHash" TEXT,
    "projectId" TEXT,
    "projectCode" TEXT,
    "projectName" TEXT,
    "pageKey" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PageVisit_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PageVisit_eventId_key" ON "PageVisit"("eventId");
CREATE INDEX "PageVisit_occurredAt_idx" ON "PageVisit"("occurredAt");
CREATE INDEX "PageVisit_userId_idx" ON "PageVisit"("userId");

ALTER TABLE "PageVisit"
ADD CONSTRAINT "PageVisit_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
