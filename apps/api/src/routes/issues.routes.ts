import { Router } from 'express';
import { registerJiraSemanticAggregateRoutes } from './jira-semantic-aggregates.routes.js';
import { registerIssueJiraRoutes } from './issues-jira.routes.js';
import { registerOpenIssueLinkRoutes } from './issues-open-links.routes.js';
import { registerOpenIssueRoutes } from './issues-open.routes.js';

export {
  JIRA_CAPACITY_DEFAULT_ALLOCATED_GIB,
  JIRA_CAPACITY_DEFAULT_STORAGE_GIB,
  issueJiraStateAfterLinkDeletion,
  issueJiraUrlForKey,
  normalizeIssueJiraKey,
  openIssuePhaseSelectionError,
} from './issues-route-support.js';

export {
  isFatalJiraHistoryBatchError,
  jiraHistoryFullSweepState,
  jiraHistoryIssueIsRetryEligible,
  jiraHistorySyncFailedCompletely,
} from '../services/jira-sync-pipeline.js';

export function createIssuesRouter() {
  const router = Router();
  registerJiraSemanticAggregateRoutes(router);
  registerOpenIssueRoutes(router);
  registerOpenIssueLinkRoutes(router);
  registerIssueJiraRoutes(router);
  return router;
}
