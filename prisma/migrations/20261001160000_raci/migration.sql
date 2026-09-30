-- RACI: who is Responsible, Accountable, Consulted or Informed for a phase, package or deliverable.
CREATE TABLE "RaciAssignment" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "wbsItemId" TEXT NOT NULL,
    "personName" TEXT NOT NULL,
    "personKey" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RaciAssignment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "RaciAssignment_wbsItemId_personKey_key" ON "RaciAssignment"("wbsItemId", "personKey");
CREATE INDEX "RaciAssignment_projectId_idx" ON "RaciAssignment"("projectId");
-- One Accountable per row, whoever tries to set a second one at the same time.
CREATE UNIQUE INDEX "RaciAssignment_one_accountable_per_row" ON "RaciAssignment"("wbsItemId") WHERE "role" = 'A';

ALTER TABLE "RaciAssignment" ADD CONSTRAINT "RaciAssignment_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RaciAssignment" ADD CONSTRAINT "RaciAssignment_wbsItemId_fkey" FOREIGN KEY ("wbsItemId") REFERENCES "WbsItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
