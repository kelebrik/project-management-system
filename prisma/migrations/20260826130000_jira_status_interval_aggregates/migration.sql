-- Store configurable semantic row definitions without rewriting existing aggregates.
ALTER TABLE "JiraAggregateDefinition"
  ADD COLUMN "rowConfig" JSONB;

ALTER TABLE "JiraAggregateDefinition"
  DROP CONSTRAINT "JiraAggregateDefinition_source_check",
  ADD CONSTRAINT "JiraAggregateDefinition_source_check"
    CHECK ("source" IN ('issues', 'transitions', 'development', 'criticalBugs', 'statusIntervals')),
  ADD CONSTRAINT "JiraAggregateDefinition_rowConfig_check"
    CHECK (("source" = 'statusIntervals') = ("rowConfig" IS NOT NULL)),
  DROP CONSTRAINT "JiraAggregateDefinition_groupBy_check",
  ADD CONSTRAINT "JiraAggregateDefinition_groupBy_check"
    CHECK ("groupBy" IN ('none', 'project', 'status', 'assignee', 'reporter', 'priority', 'sprint', 'issueType', 'resolution', 'fromStatus', 'toStatus', 'week'));
