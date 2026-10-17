-- Done and failed work closed before the day was noted: the day is taken from the audit
-- journal, as the start of the last run of closed statuses (done and failed keep the day
-- between them; a reopening starts a new run). Rows whose journal does not tell stay empty.
WITH changes AS (
  SELECT c."objectId" AS id, c."createdAt", c."newText" IN ('DONE', 'BLOCKED') AS closing
  FROM "AuditEventChange" c
  WHERE c."objectType" = 'WbsItem' AND c."field" = 'status' AND c."newText" IS NOT NULL AND c."objectId" IS NOT NULL
), reopened AS (
  SELECT id, MAX(CASE WHEN NOT closing THEN "createdAt" END) AS last_reopen FROM changes GROUP BY id
), starts AS (
  SELECT c.id, MIN(c."createdAt") AS closed_at
  FROM changes c JOIN reopened r ON r.id = c.id
  WHERE c.closing AND (r.last_reopen IS NULL OR c."createdAt" > r.last_reopen)
  GROUP BY c.id
)
UPDATE "WbsItem" w
SET "closedAt" = s.closed_at
FROM starts s
WHERE w."id" = s.id AND w."closedAt" IS NULL AND w."status" IN ('DONE', 'BLOCKED');
