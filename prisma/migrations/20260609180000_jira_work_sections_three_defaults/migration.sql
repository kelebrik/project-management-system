DELETE FROM "JiraWorkSection" AS jws
WHERE jws."sortOrder" >= 3
  AND jws."jql" = ''
  AND jws."title" = concat('Раздел ', jws."sortOrder" + 1)
  AND NOT EXISTS (
    SELECT 1
    FROM "JiraWorkSectionIssue" AS jwi
    WHERE jwi."sectionId" = jws."id"
  );
