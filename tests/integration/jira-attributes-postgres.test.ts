import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { JiraSyncRunKind, PrismaClient } from '@prisma/client';
import type { JiraIssueAttributes } from '../../apps/api/src/jira-attributes.js';
import type { JiraIssue } from '../../apps/api/src/jira.js';
import { createPrismaJiraAnalyticsSyncStore, rebuildJiraCurrentProjections, syncJiraIssueAnalytics } from '../../apps/api/src/services/jira-analytics-sync.js';
import { runBackgroundSyncTick } from '../../apps/api/src/services/jira-background-sync.js';
import { runJiraCurrentRefreshPipeline } from '../../apps/api/src/services/jira-current-refresh.js';
import { jiraAttributeConfigForProject, rememberJiraFieldNames } from '../../apps/api/src/services/jira-field-catalog.js';
import { clearJiraProjectData } from '../../apps/api/src/services/jira-project-data.js';
import { claimNextJiraSyncRun, enqueueJiraSyncRun } from '../../apps/api/src/services/jira-sync-runs.js';

const testDatabaseUrl = process.env.JIRA_HISTORY_TEST_DATABASE_URL?.trim() ?? '';

const attributes = (overrides: Partial<JiraIssueAttributes> = {}): JiraIssueAttributes => ({
  statusCategoryKey: 'indeterminate',
  parentKey: 'ATTR-1',
  epicKey: 'ATTR-1',
  components: ['Плата'],
  fixVersions: ['1.0'],
  storyPoints: 5,
  dueDate: '2026-10-20',
  assigneeLogin: 'ivanov.i',
  custom: { customfield_20000: 'Высокий' },
  ...overrides,
});

function issue(updatedAt: Date, extra: JiraIssueAttributes, withHistory = true): JiraIssue {
  return {
    jiraId: '20001', key: 'ATTR-2', url: 'https://jira.example/browse/ATTR-2', summary: 'Плата питания',
    status: 'In Progress', priority: 'Major', assignee: 'Иванов Иван', reporter: null, issueType: 'Task',
    statusCategory: 'In Progress', parentKey: extra.parentKey, epicKey: extra.epicKey, labels: ['attr'], sprintIds: [],
    resolution: null, resolutionAt: null, sprint: null, sprintAvailable: true, createdAt: new Date('2026-09-01T09:00:00Z'),
    criticalPriorityAt: null, criticalEndPriority: 'Major', updatedAt, transitions: [], transitionHistoryComplete: true, labelChanges: [],
    development: { commitCount: 0, mergeRequestCount: 0, updatedAt: null, available: true },
    attributes: extra,
    ...(withHistory
      ? { history: { document: { issue: { id: '20001', key: 'ATTR-2', fields: { summary: 'Плата питания', updated: updatedAt.toISOString() } }, changelog: [], comments: [], worklogs: [], remoteLinks: [] }, changelogComplete: true, commentsComplete: true, worklogsComplete: true, remoteLinksComplete: true, attachmentReferencesStripped: 0 } }
      : {}),
  };
}

test('extra Jira fields are kept in the snapshot and its version, survive a rebuild, follow a current refresh, and the catalog resets on clear', { skip: !testDatabaseUrl }, async () => {
  const prisma = new PrismaClient({ datasourceUrl: testDatabaseUrl });
  const suffix = randomUUID().slice(0, 8);
  const unit = await prisma.businessUnit.create({ data: { code: `attr-${suffix}`, name: 'Attributes' } });
  try {
    const project = await prisma.project.create({ data: { businessUnitId: unit.id, code: `ATTR-${suffix}`, name: 'Attributes', portfolio: 'T', sponsor: 'T', projectManager: 'T', startDate: new Date('2026-09-01'), targetDate: new Date('2026-12-01'), budgetPlanned: '0', budgetForecast: '0', summary: '' } });
    await prisma.jiraAnalyticsSettings.create({ data: { projectId: project.id, jiraScopeType: 'LABEL', jiraScopeValue: 'attr', jiraLabel: 'attr', syncStatus: 'OK', lastSyncedAt: new Date('2026-09-01T08:00:00Z'), currentProjectionRefreshedAt: new Date('2026-09-01T09:00:00Z'), extraFieldIds: ['customfield_20000'] } });

    await prisma.$transaction((transaction) => syncJiraIssueAnalytics(createPrismaJiraAnalyticsSyncStore(transaction), project.id, issue(new Date('2026-09-10T10:00:00Z'), attributes()), new Date('2026-09-10T10:05:00Z'), `attr-run-${suffix}`));
    const snapshot = await prisma.jiraIssueSnapshot.findUniqueOrThrow({ where: { projectId_issueKey: { projectId: project.id, issueKey: 'ATTR-2' } }, include: { currentVersion: { select: { attributes: true } } } });
    assert.deepEqual(snapshot.attributes, attributes());
    assert.deepEqual(snapshot.currentVersion?.attributes, attributes());

    // Rebuilding the projection from the version brings the fields back.
    await prisma.jiraIssueSnapshot.update({ where: { id: snapshot.id }, data: { attributes: { stale: true } } });
    await rebuildJiraCurrentProjections(prisma, project.id);
    assert.deepEqual((await prisma.jiraIssueSnapshot.findUniqueOrThrow({ where: { id: snapshot.id } })).attributes, attributes());

    // A current refresh with new values updates the snapshot.
    const queued = await enqueueJiraSyncRun(prisma, { projectId: project.id, kind: JiraSyncRunKind.CURRENT, scopeType: 'LABEL', scopeValue: 'attr', scopeChanged: false, preserveStoredScope: true });
    await prisma.jiraSyncRun.update({ where: { id: queued.id }, data: { enqueuedAt: new Date('2000-01-01T00:00:00Z') } });
    const claimed = await claimNextJiraSyncRun(prisma, `attr-worker-${suffix}`);
    assert.equal(claimed?.id, queued.id);
    const moved = attributes({ statusCategoryKey: 'done', storyPoints: 8, components: ['ПО'] });
    await runJiraCurrentRefreshPipeline(claimed!, { prisma, fetchIssues: async () => ({ issues: [issue(new Date('2026-09-11T10:00:00Z'), moved, false)], jiraUsers: ['read-only-test'] }) });
    assert.deepEqual((await prisma.jiraIssueSnapshot.findUniqueOrThrow({ where: { id: snapshot.id } })).attributes, moved);

    // The catalog learns field names; Epic Link and Story Points are found by name; extra fields go into the config.
    await rememberJiraFieldNames(prisma, project.id, { customfield_10008: 'Epic Link', customfield_10002: 'Story Points', customfield_20000: 'Severity' });
    assert.deepEqual(await jiraAttributeConfigForProject(prisma, project.id), { epicLinkFieldId: 'customfield_10008', storyPointsFieldId: 'customfield_10002', extraFieldIds: ['customfield_20000'] });

    await clearJiraProjectData(prisma, project.id);
    const cleared = await prisma.jiraAnalyticsSettings.findUniqueOrThrow({ where: { projectId: project.id } });
    assert.equal(cleared.fieldCatalog, null);
    assert.deepEqual(cleared.extraFieldIds, ['customfield_20000']);

    // With background updates off nothing is queued.
    await prisma.systemSetting.upsert({ where: { key: 'jira.backgroundSync' }, update: { value: 'off' }, create: { key: 'jira.backgroundSync', value: 'off' } });
    assert.deepEqual(await runBackgroundSyncTick(prisma, new Date('2026-10-05T09:31:00Z')), []);
  } finally {
    await prisma.systemSetting.deleteMany({ where: { key: 'jira.backgroundSync' } });
    await prisma.project.deleteMany({ where: { businessUnitId: unit.id } });
    await prisma.businessUnit.delete({ where: { id: unit.id } });
    await prisma.$disconnect();
  }
});

test('aggregates made before the new ticket fields get them as a compatible version, once', { skip: !testDatabaseUrl }, async () => {
  const { JIRA_SYSTEM_SEMANTIC_AGGREGATES, jiraSemanticCreateData, jiraSemanticRevisionCreateData, upgradeJiraAggregateTicketFields } = await import('../../apps/api/src/services/jira-semantic-aggregates.js');
  const prisma = new PrismaClient({ datasourceUrl: testDatabaseUrl });
  const suffix = randomUUID().slice(0, 8);
  const unit = await prisma.businessUnit.create({ data: { code: `agg-${suffix}`, name: 'Aggregates' } });
  try {
    const project = await prisma.project.create({ data: { businessUnitId: unit.id, code: `AGG-${suffix}`, name: 'Aggregates', portfolio: 'T', sponsor: 'T', projectManager: 'T', startDate: new Date('2026-09-01'), targetDate: new Date('2026-12-01'), budgetPlanned: '0', budgetForecast: '0', summary: '' } });
    const issuesAggregate = JIRA_SYSTEM_SEMANTIC_AGGREGATES.find((aggregate) => aggregate.definition.rowConfig.kind === 'issue')!;
    const fresh = new Set(['statusCategory', 'epic', 'components', 'fixVersions', 'storyPoints', 'dueDate', 'ageDays']);
    // A user's aggregate published before: without the new fields.
    const old = { ...issuesAggregate.definition, name: 'Мои тикеты', outputFields: issuesAggregate.definition.outputFields.filter((field) => !fresh.has(field.key)) };
    const row = await prisma.jiraAggregateDefinition.create({ data: { ...jiraSemanticCreateData(project.id, `user-${suffix}`, old), publishedVersion: 1 } });
    await prisma.jiraAggregateDefinitionRevision.create({ data: { ...jiraSemanticRevisionCreateData(project.id, row.id, 1, old, 'compatible'), status: 'published', publishedAt: new Date() } });

    await upgradeJiraAggregateTicketFields(prisma, project.id);
    const upgraded = await prisma.jiraAggregateDefinition.findUniqueOrThrow({ where: { id: row.id } });
    assert.equal(upgraded.publishedVersion, 2);
    for (const field of fresh) assert.ok(upgraded.exposedFields.includes(field), field);
    await upgradeJiraAggregateTicketFields(prisma, project.id);
    assert.equal((await prisma.jiraAggregateDefinition.findUniqueOrThrow({ where: { id: row.id } })).publishedVersion, 2, 'nothing new the second time');
  } finally {
    await prisma.project.deleteMany({ where: { businessUnitId: unit.id } });
    await prisma.businessUnit.delete({ where: { id: unit.id } });
    await prisma.$disconnect();
  }
});
