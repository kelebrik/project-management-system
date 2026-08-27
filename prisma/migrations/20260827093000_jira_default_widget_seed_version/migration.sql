-- Versioned seed state lets defaults be added once to existing non-empty
-- dashboards without recreating widgets that an administrator later deletes.
ALTER TABLE "JiraAnalyticsSettings"
  ADD COLUMN "semanticDefaultWidgetsVersion" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "JiraAnalyticsSettings"
  ADD CONSTRAINT "JiraAnalyticsSettings_semanticDefaultWidgetsVersion_check"
    CHECK ("semanticDefaultWidgetsVersion" >= 0);
