-- `WbsBaselineItem.sourceWbsItemId` is a historical pointer, not a live relation:
-- a baseline keeps its snapshot after the work item it was taken from is gone.
-- The Prisma schema has never declared a relation for it, but databases created
-- or patched outside `prisma migrate` can still carry a restrictive foreign key,
-- which makes deleting a baselined WBS item fail with P2003.
--
-- Drop any foreign key from WbsBaselineItem to WbsItem, whatever its name.
-- Idempotent: on a database that never had one this is a no-op.
DO $$
DECLARE
  legacy_constraint text;
BEGIN
  FOR legacy_constraint IN
    SELECT con.conname
    FROM pg_constraint con
    JOIN pg_class child ON child.oid = con.conrelid
    JOIN pg_class parent ON parent.oid = con.confrelid
    JOIN pg_namespace ns ON ns.oid = child.relnamespace
    WHERE con.contype = 'f'
      AND ns.nspname = current_schema()
      AND child.relname = 'WbsBaselineItem'
      AND parent.relname = 'WbsItem'
  LOOP
    EXECUTE format('ALTER TABLE "WbsBaselineItem" DROP CONSTRAINT %I', legacy_constraint);
  END LOOP;
END $$;
