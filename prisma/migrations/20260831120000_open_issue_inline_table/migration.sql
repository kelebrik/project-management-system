-- Additive fields used by the inline open-issues register.
ALTER TABLE "Issue"
  ADD COLUMN "category" TEXT NOT NULL DEFAULT 'Без раздела',
  ADD COLUMN "referenceLabel" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "referenceUrl" TEXT,
  ADD COLUMN "readiness" "RagStatus" NOT NULL DEFAULT 'RED';
