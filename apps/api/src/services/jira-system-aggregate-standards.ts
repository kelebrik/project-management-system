import type { JiraSemanticAggregateDefinition, JiraSystemAggregateStandard } from '@pms/shared';
import { jiraDashboardConfigHash } from './jira-aggregates-core.js';
import { JIRA_SYSTEM_SEMANTIC_AGGREGATES } from './jira-semantic-system-aggregates.js';

/**
 * Every code definition a system aggregate has had, oldest first; the
 * standard version is the position in this list, the same in every project.
 * When a system definition changes, append its new fingerprint here — never
 * replace one — and the version moves forward everywhere at once.
 */
export const JIRA_SYSTEM_AGGREGATE_STANDARD_HISTORY: Readonly<Record<string, readonly string[]>> = {
  'issues': ['79bc41744de5ef7f6b25e6b80545955f1289756f1ccc6c6a19004d52ea581f00'],
  'goal-linked-issues': ['711de035fd8d8d9e23dd58bacaf530ea911a1a17d7a4b4baec379d82416a27df'],
  'status-transitions': ['3adbaf3567bf26904ed2cf3dae4515f6ec9931b7b72124a65213311ff8f5abc5'],
  'development-activity': ['44efc09e647f539108951db85a286536844ac47e013449c7cb7122e2b8284d35'],
  'status-intervals': ['fde3b67feab04705ce12fcdff92db28e61804e939159a36a604865a74c41d192'],
  'critical-blocker-sla': ['3b4d536c7fa6780dde43649f5e8ae97771403dae8b6a6d1ee9160cd983d2147c'],
  'critical-blocker-task-sla': ['52a4dceeedbd09e97e0e498970e997315c80cbbdae6db07a26a1911b0d1294bc'],
  'critical-blocker-risk': ['5d8ee59426b882185d63ee283f13f59f7185eda59e7e0cdd350e523557b9b12d'],
  'in-progress-resolution': ['cd6df9482c5bf4d98e852d5d60f3103bf63e959c6995dd91e817b3c5e0f860e5'],
  'gitlab-branch-commits': ['5615758d14a24791ce3d34204cdec737c1d58d77ec1e0952bbe42ae1add94683'],
  'cvte968-mp-unresolved': ['d7b2465e1fb62aefaba7120c648da81c43e72e98d39a7cba995b460047695443'],
};

/** Upgrades append fields, so field order is not part of a definition's identity. */
export function jiraSystemAggregateFingerprint(definition: JiraSemanticAggregateDefinition) {
  return jiraDashboardConfigHash({
    ...definition,
    outputFields: [...definition.outputFields].sort((left, right) => left.key.localeCompare(right.key)),
  });
}

/**
 * Where a project's published copy stands against the standard: `behind`
 * lacks fields of the code (whatever else it has), `current` is the code
 * exactly, `customized` has every field of the code and changes of its own.
 */
export function jiraSystemAggregateStandard(
  key: string,
  published: JiraSemanticAggregateDefinition | null,
): JiraSystemAggregateStandard | null {
  const code = JIRA_SYSTEM_SEMANTIC_AGGREGATES.find((aggregate) => aggregate.key === key)?.definition;
  const history = JIRA_SYSTEM_AGGREGATE_STANDARD_HISTORY[key];
  if (!code || !history?.length) return null;
  const version = history.length;
  if (!published) return { version, status: 'unpublished' };
  const publishedKeys = new Set(published.outputFields.map((field) => field.key));
  if (code.outputFields.some((field) => !publishedKeys.has(field.key))) return { version, status: 'behind' };
  return {
    version,
    status: jiraSystemAggregateFingerprint(published) === jiraSystemAggregateFingerprint(code) ? 'current' : 'customized',
  };
}
