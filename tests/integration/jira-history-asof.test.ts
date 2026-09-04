import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import {
  JIRA_SEMANTIC_EMPTY_DASHBOARD,
  jiraSemanticAggregateDefinitionSchema,
  jiraSemanticDashboardSchema,
} from '@pms/shared';
import { JiraSyncRunKind, Prisma, PrismaClient } from '@prisma/client';

import type { JiraIssue } from '../../apps/api/src/jira.js';
import {
  createPrismaJiraAnalyticsSyncStore,
  syncJiraIssueAnalytics,
} from '../../apps/api/src/services/jira-analytics-sync.js';
import { prepareJiraAsOfIssueBatches } from '../../apps/api/src/services/jira-history-asof.js';
import { jiraBackfillCompleteness } from '../../apps/api/src/services/jira-history.js';
import {
  clearJiraProjectData,
  JiraProjectDataBusyError,
} from '../../apps/api/src/services/jira-project-data.js';
import {
  requestJiraCurrentRefresh,
  runJiraCurrentRefreshPipeline,
} from '../../apps/api/src/services/jira-current-refresh.js';
import {
  ensureMissingJiraSystemSemanticAggregates,
  ensureJiraSystemSemanticAggregates,
  JIRA_SEMANTIC_DEFAULT_WIDGETS_VERSION,
  JIRA_SYSTEM_SEMANTIC_AGGREGATES,
} from '../../apps/api/src/services/jira-semantic-aggregates.js';
import {
  acquireJiraProjectionRebuildLease,
  assertJiraSyncFence,
  checkpointJiraSyncRun,
  claimNextJiraSyncRun,
  completeJiraSyncRun,
  enqueueJiraSyncRun,
  heartbeatJiraSyncRun,
  JiraSyncFencedError,
  JIRA_SYNC_RUN_MAX_WALL_MS,
  pauseJiraSyncRun,
  reapExpiredJiraSyncRuns,
  releaseJiraProjectionRebuildLease,
  releaseJiraSyncRunOnShutdown,
} from '../../apps/api/src/services/jira-sync-runs.js';

const testDatabaseUrl = process.env.JIRA_HISTORY_TEST_DATABASE_URL?.trim() ?? '';

async function createCurrentRefreshFixture(prisma: PrismaClient, prefix: string) {
  const suffix = randomUUID().replaceAll('-', '').slice(0, 10);
  const businessUnit = await prisma.businessUnit.create({
    data: { code: `${prefix}-bu-${suffix}`, name: `${prefix} BU ${suffix}` },
  });
  const project = await prisma.project.create({
    data: {
      businessUnitId: businessUnit.id,
      code: `${prefix}-${suffix}`,
      name: `${prefix} current Jira refresh fixture`,
      portfolio: 'Integration',
      sponsor: 'Integration',
      projectManager: 'Integration',
      startDate: new Date('2026-08-01T00:00:00Z'),
      targetDate: new Date('2026-09-01T00:00:00Z'),
      budgetPlanned: '0',
      budgetForecast: '0',
      summary: 'Disposable integration fixture',
    },
  });
  const lastSyncedAt = new Date('2026-09-01T08:00:00Z');
  const currentProjectionRefreshedAt = new Date('2026-09-01T09:00:00Z');
  await prisma.jiraAnalyticsSettings.create({
    data: {
      projectId: project.id,
      jiraScopeType: 'LABEL',
      jiraScopeValue: `${prefix}-scope`,
      jiraLabel: `${prefix}-scope`,
      syncStatus: 'OK',
      lastSyncedAt,
      currentProjectionRefreshedAt,
    },
  });
  return { businessUnit, project, lastSyncedAt, currentProjectionRefreshedAt };
}

const emptyRequestSummary = {
  count: 0,
  durationMsTotal: 0,
  durationMsMax: 0,
  byRoute: {},
  byStatusClass: {},
};

function aggregateWithoutLabels(value: unknown) {
  const definition = jiraSemanticAggregateDefinitionSchema.parse(value);
  return {
    ...definition,
    outputFields: definition.outputFields.filter((field) => field.key !== 'labels'),
  };
}

function jiraIssue(summary: string, updatedAt: Date): JiraIssue {
  return {
    jiraId: '10001',
    key: 'A1RACE-1',
    url: 'https://jira.example/browse/A1RACE-1',
    summary,
    status: 'In Progress',
    priority: 'Major',
    assignee: null,
    reporter: 'Integration test',
    issueType: 'Task',
    statusCategory: 'In Progress',
    parentKey: null,
    epicKey: null,
    labels: ['a1-race'],
    sprintIds: [],
    resolution: null,
    resolutionAt: null,
    sprint: null,
    sprintAvailable: true,
    createdAt: new Date('2026-08-20T09:00:00Z'),
    criticalPriorityAt: null,
    criticalEndPriority: 'Major',
    updatedAt,
    transitions: [],
    transitionHistoryComplete: true,
    labelChanges: [],
    development: {
      commitCount: 0,
      mergeRequestCount: 0,
      updatedAt: null,
      available: true,
    },
    history: {
      document: {
        issue: {
          id: '10001',
          key: 'A1RACE-1',
          fields: {
            summary,
            status: { name: 'In Progress' },
            priority: { name: 'Major' },
            labels: ['a1-race'],
            created: '2026-08-20T09:00:00Z',
            updated: updatedAt.toISOString(),
          },
        },
        changelog: [],
        comments: [],
        worklogs: [],
        remoteLinks: [],
      },
      changelogComplete: true,
      commentsComplete: true,
      worklogsComplete: true,
      remoteLinksComplete: true,
      attachmentReferencesStripped: 0,
    },
  };
}

test('Jira as-of reconstruction selects deterministic observed winners in PostgreSQL', {
  skip: !testDatabaseUrl,
}, async () => {
  const databaseName = new URL(testDatabaseUrl).pathname.replace(/^\//, '');
  assert.match(databaseName, /test/i, 'JIRA_HISTORY_TEST_DATABASE_URL must target a test database');
  const prisma = new PrismaClient({ datasourceUrl: testDatabaseUrl });
  const suffix = randomUUID().replaceAll('-', '').slice(0, 12);
  let businessUnitId: string | null = null;
  let projectId: string | null = null;
  const asOf = new Date('2026-08-23T13:30:00Z');

  const versionData = (
    snapshotId: string,
    jiraIssueId: string,
    issueKey: string,
    sequence: number,
    values: {
      observedAt: string;
      jiraUpdatedAt: string;
      summary: string;
      priority?: string;
      provenance?: 'OBSERVED' | 'RECONSTRUCTED';
    },
  ) => ({
    id: `c1-${suffix}-${jiraIssueId}-${sequence}`,
    projectId: projectId!,
    snapshotId,
    jiraIssueId,
    issueKey,
    observedAt: new Date(values.observedAt),
    jiraUpdatedAt: new Date(values.jiraUpdatedAt),
    provenance: values.provenance ?? 'OBSERVED',
    contentHash: sequence.toString(16).padStart(64, '0'),
    payload: { fixture: true, sequence },
    payloadBytes: 32,
    syncRunId: `c1-${suffix}`,
    changelogComplete: true,
    commentsComplete: true,
    worklogsComplete: true,
    remoteLinksComplete: true,
    summary: values.summary,
    issueUrl: `https://jira.example/browse/${issueKey}`,
    issueType: 'Bug',
    status: 'In Progress',
    priority: values.priority ?? 'Major',
    issueCreatedAt: new Date('2026-08-20T09:00:00Z'),
    issueUpdatedAt: new Date(values.jiraUpdatedAt),
    criticalPriorityAt: values.priority === 'Critical'
      ? new Date('2026-08-22T09:00:00Z')
      : null,
    criticalEndPriority: values.priority ?? 'Major',
    developmentDataAvailable: true,
    transitionHistoryComplete: true,
  });

  try {
    const businessUnit = await prisma.businessUnit.create({
      data: { code: `c1-asof-${suffix}`, name: `C1 as-of ${suffix}` },
    });
    businessUnitId = businessUnit.id;
    const project = await prisma.project.create({
      data: {
        businessUnitId: businessUnit.id,
        code: `C1ASOF-${suffix}`,
        name: 'C1 as-of PostgreSQL test',
        portfolio: 'Integration',
        sponsor: 'Integration',
        projectManager: 'Integration',
        startDate: new Date('2026-08-01T00:00:00Z'),
        targetDate: new Date('2026-09-01T00:00:00Z'),
        budgetPlanned: '0',
        budgetForecast: '0',
        summary: 'Disposable integration fixture',
      },
    });
    projectId = project.id;

    const active = await prisma.jiraIssueSnapshot.create({
      data: {
        projectId,
        jiraId: `c1-active-${suffix}`,
        issueKey: `C1ACTIVE-${suffix}`,
        issueUrl: 'https://jira.example/browse/C1ACTIVE-1',
        summary: 'Current state does not drive reconstruction',
        status: 'Done',
        priority: 'Minor',
        issueType: 'Bug',
        issueCreatedAt: new Date('2026-08-20T09:00:00Z'),
        updatedAt: new Date('2026-08-24T09:00:00Z'),
      },
    });
    const retiredAfter = await prisma.jiraIssueSnapshot.create({
      data: {
        projectId,
        jiraId: `c1-retired-after-${suffix}`,
        issueKey: `C1RETIRED-${suffix}`,
        issueUrl: 'https://jira.example/browse/C1RETIRED-1',
        summary: 'Retired after selected instant',
        status: 'Done',
        priority: 'Major',
        issueType: 'Task',
        issueCreatedAt: new Date('2026-08-20T09:00:00Z'),
        updatedAt: new Date('2026-08-23T11:00:00Z'),
        retiredAt: new Date('2026-08-24T00:00:00Z'),
      },
    });
    const withoutObservation = await prisma.jiraIssueSnapshot.create({
      data: {
        projectId,
        jiraId: `c1-no-observation-${suffix}`,
        issueKey: `C1EMPTY-${suffix}`,
        issueUrl: 'https://jira.example/browse/C1EMPTY-1',
        summary: 'No observed history',
        status: 'Open',
        priority: 'Major',
        issueType: 'Task',
        issueCreatedAt: new Date('2026-08-20T09:00:00Z'),
        updatedAt: new Date('2026-08-23T11:00:00Z'),
      },
    });
    const retiredBefore = await prisma.jiraIssueSnapshot.create({
      data: {
        projectId,
        jiraId: `c1-retired-before-${suffix}`,
        issueKey: `C1OLD-${suffix}`,
        issueUrl: 'https://jira.example/browse/C1OLD-1',
        summary: 'Retired before selected instant',
        status: 'Done',
        priority: 'Major',
        issueType: 'Task',
        issueCreatedAt: new Date('2026-08-20T09:00:00Z'),
        updatedAt: new Date('2026-08-22T11:00:00Z'),
        retiredAt: new Date('2026-08-23T00:00:00Z'),
      },
    });
    await prisma.jiraIssueSnapshot.create({
      data: {
        projectId,
        jiraId: active.jiraId,
        issueKey: `C1RENAMED-${suffix}`,
        issueUrl: 'https://jira.example/browse/C1RENAMED-1',
        summary: 'Renamed key for the same stable Jira ID',
        status: 'Open',
        priority: 'Major',
        issueType: 'Bug',
        issueCreatedAt: new Date('2026-08-20T09:00:00Z'),
        updatedAt: new Date('2026-08-23T11:00:00Z'),
      },
    });
    await prisma.jiraIssueSnapshot.create({
      data: {
        projectId,
        jiraId: `c1-created-after-${suffix}`,
        issueKey: `C1FUTURE-${suffix}`,
        issueUrl: 'https://jira.example/browse/C1FUTURE-1',
        summary: 'Created after selected instant',
        status: 'Open',
        priority: 'Major',
        issueType: 'Task',
        issueCreatedAt: new Date('2026-08-24T09:00:00Z'),
        updatedAt: new Date('2026-08-24T09:00:00Z'),
      },
    });

    await prisma.jiraIssueVersion.createMany({
      data: [
        versionData(active.id, active.jiraId!, active.issueKey, 1, {
          observedAt: '2026-08-22T10:00:00Z',
          jiraUpdatedAt: '2026-08-22T09:00:00Z',
          summary: 'Initial observed state',
        }),
        versionData(active.id, active.jiraId!, active.issueKey, 2, {
          observedAt: '2026-08-23T12:00:00Z',
          jiraUpdatedAt: '2026-08-23T11:00:00Z',
          summary: 'Earlier observation for equal Jira update',
          priority: 'Critical',
        }),
        versionData(active.id, active.jiraId!, active.issueKey, 3, {
          observedAt: '2026-08-23T13:00:00Z',
          jiraUpdatedAt: '2026-08-23T11:00:00Z',
          summary: 'Deterministic winner',
          priority: 'Critical',
        }),
        versionData(active.id, active.jiraId!, active.issueKey, 4, {
          observedAt: '2026-08-23T13:10:00Z',
          jiraUpdatedAt: '2026-08-23T12:00:00Z',
          summary: 'Reconstructed rows are excluded',
          priority: 'Blocker',
          provenance: 'RECONSTRUCTED',
        }),
        versionData(retiredAfter.id, retiredAfter.jiraId!, retiredAfter.issueKey, 5, {
          observedAt: '2026-08-23T11:30:00Z',
          jiraUpdatedAt: '2026-08-23T11:00:00Z',
          summary: 'Visible before retirement',
        }),
        versionData(retiredBefore.id, retiredBefore.jiraId!, retiredBefore.issueKey, 6, {
          observedAt: '2026-08-22T12:00:00Z',
          jiraUpdatedAt: '2026-08-22T11:00:00Z',
          summary: 'Excluded by retirement boundary',
        }),
      ],
    });

    const prepared = await prepareJiraAsOfIssueBatches(prisma, projectId, asOf);
    const issues = [];
    for await (const batch of prepared.batches) issues.push(...batch);

    assert.deepEqual(issues.map((issue) => issue.summary).sort(), [
      'Deterministic winner',
      'Visible before retirement',
    ]);
    assert.equal(issues.find((issue) => issue.issueKey === active.issueKey)?.criticalSlaTracked, true);
    assert.equal(prepared.reconstruction.tickets, 2);
    assert.equal(prepared.reconstruction.ticketsWithoutObservation, 1);
    assert.equal(prepared.reconstruction.ticketsRetiredAfterAsOf, 1);
    assert.equal(prepared.reconstruction.versionRowsScanned, 4);
    assert.equal(prepared.reconstruction.provenance, 'RECONSTRUCTED');
    assert.equal(prepared.reconstruction.basis, 'OBSERVED_VERSIONS');
    assert.equal(prepared.reconstruction.beforeHistoryStart, false);
    assert.ok(prepared.reconstruction.stalenessHours);

    const beforeHistory = await prepareJiraAsOfIssueBatches(
      prisma,
      projectId,
      new Date('2026-08-21T00:00:00Z'),
    );
    assert.equal(beforeHistory.reconstruction.tickets, 0);
    assert.equal(beforeHistory.reconstruction.ticketsWithoutObservation, 4);
    assert.equal(beforeHistory.reconstruction.beforeHistoryStart, true);
    assert.equal(beforeHistory.reconstruction.earliestObservationAt, null);
    assert.equal(withoutObservation.projectId, projectId);
  } finally {
    if (projectId) await prisma.project.delete({ where: { id: projectId } });
    if (businessUnitId) await prisma.businessUnit.delete({ where: { id: businessUnitId } });
    await prisma.$disconnect();
  }
});
test('project Jira clear removes one project population and preserves the other project data', {
  skip: !testDatabaseUrl,
}, async () => {
  const databaseName = new URL(testDatabaseUrl).pathname.replace(/^\//, '');
  assert.match(databaseName, /test/i, 'JIRA_HISTORY_TEST_DATABASE_URL must target a test database');
  const prisma = new PrismaClient({ datasourceUrl: testDatabaseUrl });
  const suffix = randomUUID().replaceAll('-', '').slice(0, 12);
  let businessUnitId: string | null = null;
  try {
    const businessUnit = await prisma.businessUnit.create({
      data: { code: `clear-${suffix}`, name: `Clear isolation ${suffix}` },
    });
    businessUnitId = businessUnit.id;
    const projectData = (code: string, name: string) => ({
      businessUnitId: businessUnit.id,
      code,
      name,
      portfolio: 'Integration',
      sponsor: 'Integration',
      projectManager: 'Integration',
      startDate: new Date('2026-08-01T00:00:00Z'),
      targetDate: new Date('2026-09-01T00:00:00Z'),
      budgetPlanned: '0',
      budgetForecast: '0',
      summary: 'Disposable integration fixture',
    });
    const [selectedProject, otherProject] = await Promise.all([
      prisma.project.create({
        data: projectData(`CLEAR-A-${suffix}`, 'Selected project'),
      }),
      prisma.project.create({
        data: projectData(`CLEAR-B-${suffix}`, 'Other project'),
      }),
    ]);
    const dashboardConfig = { version: 2, widgets: [] };
    await prisma.jiraAnalyticsSettings.createMany({
      data: [
        {
          projectId: selectedProject.id,
          jiraScopeType: 'LABEL',
          jiraScopeValue: 'selected-scope',
          jiraLabel: 'selected-scope',
          dashboardConfig,
          historyCursorJiraIssueId: '10001',
          historyCursorUpdatedAt: new Date('2026-08-24T10:00:00Z'),
        },
        {
          projectId: otherProject.id,
          jiraScopeType: 'LABEL',
          jiraScopeValue: 'other-scope',
          jiraLabel: 'other-scope',
        },
      ],
    });
    await prisma.jiraAggregateDefinition.create({
      data: {
        projectId: selectedProject.id,
        name: 'Preserved aggregate',
        nameKey: 'preserved-aggregate',
        source: 'issues',
        metric: 'count',
        groupBy: 'none',
        scope: 'active',
        filterLogic: 'and',
        filters: [],
        periodMode: 'DASHBOARD',
        fingerprint: 'a'.repeat(64),
      },
    });
    await prisma.issue.create({
      data: {
        projectId: selectedProject.id,
        source: 'INTERNAL',
        title: 'Preserved project issue',
        severity: 'MEDIUM',
        status: 'Open',
        owner: 'Integration',
        impact: 'Must survive Jira clear',
      },
    });

    const importedIssue: JiraIssue = {
      ...jiraIssue('Imported ticket', new Date('2026-08-24T10:00:00Z')),
      transitions: [{
        key: 'clear-transition',
        fromStatus: 'Open',
        toStatus: 'In Progress',
        transitionedAt: new Date('2026-08-24T09:00:00Z'),
        actor: 'Integration',
      }],
      transitionHistoryComplete: true,
      labels: ['integration-label'],
      labelChanges: [{
        key: 'clear-label-change',
        changedAt: new Date('2026-08-24T09:15:00Z'),
        fromLabels: [],
        toLabels: ['integration-label'],
        actor: 'Integration',
      }],
      development: {
        commitCount: 2,
        mergeRequestCount: 1,
        updatedAt: new Date('2026-08-24T09:30:00Z'),
        available: true,
      },
    };
    for (const project of [selectedProject, otherProject]) {
      await prisma.$transaction((transaction) => syncJiraIssueAnalytics(
        createPrismaJiraAnalyticsSyncStore(transaction),
        project.id,
        importedIssue,
        new Date('2026-08-24T10:01:00Z'),
        `clear-run-${project.id}`,
      ));
      await prisma.jiraIssueHistoryRetry.create({
        data: {
          projectId: project.id,
          jiraIssueId: importedIssue.jiraId,
          issueKey: importedIssue.key,
          reasonCode: 'TEST_RETRY',
          lastError: 'Disposable retry',
          nextRetryAt: new Date('2026-08-24T11:00:00Z'),
        },
      });
    }
    const selectedSnapshot = await prisma.jiraIssueSnapshot.findUniqueOrThrow({
      where: {
        projectId_issueKey: {
          projectId: selectedProject.id,
          issueKey: importedIssue.key,
        },
      },
    });
    const otherSnapshot = await prisma.jiraIssueSnapshot.findUniqueOrThrow({
      where: {
        projectId_issueKey: {
          projectId: otherProject.id,
          issueKey: importedIssue.key,
        },
      },
    });
    const section = await prisma.jiraWorkSection.create({
      data: { projectId: selectedProject.id, sortOrder: 0, title: 'Preserved section' },
    });
    await prisma.jiraWorkSectionIssue.create({
      data: { sectionId: section.id, snapshotId: selectedSnapshot.id },
    });

    const result = await clearJiraProjectData(prisma, selectedProject.id);

    assert.equal(result.ticketsDeleted, 1);
    assert.equal(result.versionsDeleted, 1);
    assert.equal(result.statusTransitionsDeleted, 1);
    assert.equal(result.labelChangesDeleted, 1);
    assert.equal(result.developmentActivitiesDeleted, 1);
    assert.equal(result.membershipsDeleted, 1);
    assert.equal(result.retriesDeleted, 1);
    assert.equal(await prisma.jiraIssueSnapshot.count({ where: { projectId: selectedProject.id } }), 0);
    assert.equal(await prisma.jiraIssueVersion.count({ where: { projectId: selectedProject.id } }), 0);
    assert.equal(await prisma.jiraIssueLabelChange.count({ where: { snapshot: { projectId: selectedProject.id } } }), 0);
    assert.equal(await prisma.jiraIssueHistoryRetry.count({ where: { projectId: selectedProject.id } }), 0);
    assert.equal(await prisma.jiraIssueSnapshot.count({ where: { projectId: otherProject.id } }), 1);
    assert.equal(await prisma.jiraIssueVersion.count({ where: { projectId: otherProject.id } }), 1);
    assert.equal(await prisma.jiraIssueHistoryRetry.count({ where: { projectId: otherProject.id } }), 1);
    assert.equal(await prisma.jiraIssueStatusTransition.count({ where: { snapshotId: otherSnapshot.id } }), 1);
    assert.equal(await prisma.jiraIssueLabelChange.count({ where: { snapshotId: otherSnapshot.id } }), 1);
    assert.equal(await prisma.jiraDevelopmentActivity.count({ where: { snapshotId: otherSnapshot.id } }), 1);
    assert.equal(await prisma.jiraAggregateDefinition.count({ where: { projectId: selectedProject.id } }), 1);
    assert.equal(await prisma.issue.count({ where: { projectId: selectedProject.id } }), 1);
    assert.equal(await prisma.jiraWorkSection.count({ where: { projectId: selectedProject.id } }), 1);
    const preservedSettings = await prisma.jiraAnalyticsSettings.findUniqueOrThrow({
      where: { projectId: selectedProject.id },
    });
    assert.equal(preservedSettings.jiraScopeValue, 'selected-scope');
    assert.deepEqual(preservedSettings.dashboardConfig, dashboardConfig);
    assert.equal(preservedSettings.historyCursorJiraIssueId, null);

    const rebuild = await acquireJiraProjectionRebuildLease(prisma, selectedProject.id);
    assert.ok(rebuild);
    await assert.rejects(
      clearJiraProjectData(prisma, selectedProject.id),
      JiraProjectDataBusyError,
    );
    await releaseJiraProjectionRebuildLease(prisma, rebuild, 'CONFIGURED');
  } finally {
    if (businessUnitId) await prisma.project.deleteMany({ where: { businessUnitId } });
    if (businessUnitId) await prisma.businessUnit.delete({ where: { id: businessUnitId } });
    await prisma.$disconnect();
  }
});

test('system aggregate bootstrap publishes labels, preserves drafts, and repins existing widgets', {
  skip: !testDatabaseUrl,
}, async () => {
  const databaseName = new URL(testDatabaseUrl).pathname.replace(/^\//, '');
  assert.match(databaseName, /test/i, 'JIRA_HISTORY_TEST_DATABASE_URL must target a test database');
  const prisma = new PrismaClient({ datasourceUrl: testDatabaseUrl });
  const suffix = randomUUID().replaceAll('-', '').slice(0, 12);
  let businessUnitId: string | null = null;
  try {
    const businessUnit = await prisma.businessUnit.create({
      data: { code: `labels-bootstrap-${suffix}`, name: `Labels bootstrap ${suffix}` },
    });
    businessUnitId = businessUnit.id;
    const project = await prisma.project.create({
      data: {
        businessUnitId: businessUnit.id,
        code: `LBLBOOT-${suffix}`,
        name: 'Labels aggregate bootstrap test',
        portfolio: 'Integration',
        sponsor: 'Integration',
        projectManager: 'Integration',
        startDate: new Date('2026-08-01T00:00:00Z'),
        targetDate: new Date('2026-09-01T00:00:00Z'),
        budgetPlanned: '0',
        budgetForecast: '0',
        summary: 'Disposable integration fixture',
      },
    });

    await ensureJiraSystemSemanticAggregates(prisma, project.id);
    const seededRows = await prisma.jiraAggregateDefinition.findMany({
      where: { projectId: project.id, system: true },
      include: { revisions: true },
    });
    assert.equal(seededRows.length, JIRA_SYSTEM_SEMANTIC_AGGREGATES.length);
    const seededSettings = await prisma.jiraAnalyticsSettings.findUniqueOrThrow({
      where: { projectId: project.id },
    });
    const seededDashboard = jiraSemanticDashboardSchema.parse(seededSettings.dashboardConfig);
    const removedWidget = seededDashboard.widgets.find((widget) => widget.id === 'active-without-sprint-with-code')!;
    const gitlabWidget = seededDashboard.widgets.find((widget) => widget.id === 'active-gitlab-unlinked-branch-commits')!;
    const legacyDashboard = {
      ...seededDashboard,
      widgets: seededDashboard.widgets
        .filter((widget) => widget.id !== removedWidget.id && widget.id !== gitlabWidget.id)
        .map((widget) => ({ ...widget, aggregateVersion: 1 })),
    };

    for (const row of seededRows) {
      const published = row.revisions.find((revision) => revision.version === 1);
      assert.ok(published);
      const legacyPublished = aggregateWithoutLabels(published.definition);
      await prisma.jiraAggregateDefinitionRevision.update({
        where: { aggregateId_version: { aggregateId: row.id, version: 1 } },
        data: { definition: legacyPublished as unknown as Prisma.InputJsonObject },
      });
      if (row.aggregateKey === 'issues') {
        const legacyDraft = { ...legacyPublished, name: 'Черновик тикетов' };
        await prisma.jiraAggregateDefinitionRevision.create({
          data: {
            projectId: project.id,
            aggregateId: row.id,
            version: 2,
            definition: legacyDraft as unknown as Prisma.InputJsonObject,
            fingerprint: 'd'.repeat(64),
            status: 'draft',
            changeKind: 'compatible',
          },
        });
        await prisma.jiraAggregateDefinition.update({
          where: { id: row.id },
          data: {
            version: 2,
            publishedVersion: 1,
            draftDefinition: legacyDraft as unknown as Prisma.InputJsonObject,
            exposedFields: legacyDraft.outputFields.map((field) => field.key),
          },
        });
      } else {
        await prisma.jiraAggregateDefinition.update({
          where: { id: row.id },
          data: {
            version: 1,
            publishedVersion: 1,
            draftDefinition: legacyPublished as unknown as Prisma.InputJsonObject,
            exposedFields: legacyPublished.outputFields.map((field) => field.key),
          },
        });
      }
    }
    await prisma.jiraAnalyticsSettings.update({
      where: { projectId: project.id },
      data: {
        dashboardConfig: legacyDashboard as unknown as Prisma.InputJsonObject,
        semanticDefaultWidgetsVersion: 2,
      },
    });

    await ensureJiraSystemSemanticAggregates(prisma, project.id);

    const upgradedRows = await prisma.jiraAggregateDefinition.findMany({
      where: { projectId: project.id, system: true },
      include: { revisions: { orderBy: { version: 'asc' } } },
    });
    const publishedVersions = new Map<string, number>();
    for (const row of upgradedRows) {
      assert.ok(row.publishedVersion);
      publishedVersions.set(row.id, row.publishedVersion);
      const published = row.revisions.find((revision) => revision.version === row.publishedVersion);
      assert.ok(published);
      const publishedDefinition = jiraSemanticAggregateDefinitionSchema.parse(published.definition);
      if (publishedDefinition.rowConfig.kind !== 'gitlabBranchCommit') {
        assert.ok(
          publishedDefinition.outputFields.some((field) => field.key === 'labels'),
        );
      }
      if (row.aggregateKey === 'issues') {
        assert.equal(row.publishedVersion, 3);
        assert.equal(row.version, 4);
        assert.equal(row.revisions.find((revision) => revision.version === 2)?.status, 'archived');
        const draft = row.revisions.find((revision) => revision.version === 4);
        assert.equal(draft?.status, 'draft');
        assert.equal(jiraSemanticAggregateDefinitionSchema.parse(draft?.definition).name, 'Черновик тикетов');
        assert.ok(
          jiraSemanticAggregateDefinitionSchema.parse(draft?.definition)
            .outputFields.some((field) => field.key === 'labels'),
        );
      } else if (publishedDefinition.rowConfig.kind === 'gitlabBranchCommit') {
        assert.equal(row.publishedVersion, 1);
        assert.equal(row.version, 1);
      } else {
        assert.equal(row.publishedVersion, 2);
        assert.equal(row.version, 2);
      }
    }
    const upgradedSettings = await prisma.jiraAnalyticsSettings.findUniqueOrThrow({
      where: { projectId: project.id },
    });
    assert.equal(upgradedSettings.semanticDefaultWidgetsVersion, JIRA_SEMANTIC_DEFAULT_WIDGETS_VERSION);
    const upgradedDashboard = jiraSemanticDashboardSchema.parse(upgradedSettings.dashboardConfig);
    assert.equal(upgradedDashboard.widgets.length, legacyDashboard.widgets.length + 1);
    assert.equal(upgradedDashboard.widgets.some((widget) => widget.id === removedWidget.id), false);
    assert.equal(upgradedDashboard.widgets.some((widget) => widget.id === gitlabWidget.id), true);
    for (const widget of upgradedDashboard.widgets) {
      assert.equal(widget.aggregateVersion, publishedVersions.get(widget.aggregateId));
    }

    const revisionCount = await prisma.jiraAggregateDefinitionRevision.count({
      where: { projectId: project.id },
    });
    const invalidDashboard = { version: 999, invalid: true };
    await prisma.jiraAnalyticsSettings.update({
      where: { projectId: project.id },
      data: {
        dashboardConfig: invalidDashboard,
        semanticDefaultWidgetsVersion: 2,
      },
    });
    await ensureJiraSystemSemanticAggregates(prisma, project.id);
    const invalidSettings = await prisma.jiraAnalyticsSettings.findUniqueOrThrow({
      where: { projectId: project.id },
    });
    assert.deepEqual(invalidSettings.dashboardConfig, invalidDashboard);
    assert.equal(invalidSettings.semanticDefaultWidgetsVersion, 2);
    assert.equal(
      await prisma.jiraAggregateDefinitionRevision.count({ where: { projectId: project.id } }),
      revisionCount,
    );
  } finally {
    if (businessUnitId) await prisma.project.deleteMany({ where: { businessUnitId } });
    if (businessUnitId) await prisma.businessUnit.delete({ where: { id: businessUnitId } });
    await prisma.$disconnect();
  }
});
