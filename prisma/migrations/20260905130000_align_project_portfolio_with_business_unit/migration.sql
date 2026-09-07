UPDATE "Project" AS project
SET "portfolio" = business_unit."name"
FROM "BusinessUnit" AS business_unit
WHERE project."businessUnitId" = business_unit."id"
  AND project."portfolio" IS DISTINCT FROM business_unit."name";
