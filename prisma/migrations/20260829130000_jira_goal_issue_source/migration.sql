-- Allow the goal-to-ticket aggregate source introduced with WBS goal labels.
ALTER TABLE "JiraAggregateDefinition"
  DROP CONSTRAINT "JiraAggregateDefinition_source_check",
  ADD CONSTRAINT "JiraAggregateDefinition_source_check"
    CHECK ("source" IN ('issues', 'goalIssues', 'transitions', 'development', 'criticalBugs', 'statusIntervals'));
