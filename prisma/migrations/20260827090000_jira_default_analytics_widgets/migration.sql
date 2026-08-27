-- NULL marks a dashboard that has never been configured and may receive the
-- default widget set. A deliberately saved empty v5 dashboard remains JSON and
-- is therefore never repopulated by bootstrap.
UPDATE "JiraAnalyticsSettings"
SET "dashboardConfig" = NULL
WHERE "dashboardConfig" = '{"version":5,"periodDays":180,"assignee":"","widgets":[]}'::jsonb;
