import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import type { Prisma } from '@prisma/client';
import { prisma } from '../../apps/api/src/db.js';
import { JIRA_SYSTEM_SEMANTIC_AGGREGATES, listJiraSemanticAggregates } from '../../apps/api/src/services/jira-semantic-aggregates.js';
import { JIRA_SYSTEM_AGGREGATE_STANDARD_HISTORY } from '../../apps/api/src/services/jira-system-aggregate-standards.js';
import { reconcileJiraSystemSetup } from '../../apps/api/src/services/jira-system-setup.js';

const enabled = process.env.WORKFLOW_TEST_DATABASE === 'true';

type Definition = { outputFields: Array<{ key: string }>; basePopulation: { logic: string; filters: unknown[] }; description: string };
type Dashboard = { widgets: Array<{ id: string; aggregateId: string; aggregateVersion: number }> };

async function createProject(suffix: string) {
  const unit = await prisma.businessUnit.create({ data: { code: `js-${suffix}`, name: 'Jira setup' } });
  const project = await prisma.project.create({ data: { businessUnitId: unit.id, code: `JS-${suffix}`, name: 'Jira setup', portfolio: 'T', sponsor: 'T', projectManager: 'T', startDate: new Date('2026-09-01'), targetDate: new Date('2026-12-01'), budgetPlanned: 0, budgetForecast: 0, summary: '' } });
  return { unit, project };
}

async function cleanup(projectId: string, unitId: string) {
  await prisma.project.delete({ where: { id: projectId } });
  await prisma.businessUnit.delete({ where: { id: unitId } });
}

test('a project nobody has opened receives every system aggregate and the standard widgets', { skip: !enabled }, async () => {
  const { unit, project } = await createProject(randomUUID().slice(0, 8));
  try {
    assert.equal(await reconcileJiraSystemSetup(prisma, project), true);
    const rows = await prisma.jiraAggregateDefinition.findMany({ where: { projectId: project.id, system: true } });
    assert.deepEqual(rows.map((row) => row.aggregateKey).sort(), JIRA_SYSTEM_SEMANTIC_AGGREGATES.map((aggregate) => aggregate.key).sort());
    assert.ok(rows.every((row) => row.publishedVersion === 1), 'a fresh copy is already current');
    const catalog = await listJiraSemanticAggregates(prisma, project.id);
    for (const definition of catalog.filter((item) => item.system)) {
      assert.deepEqual(definition.standard, { version: JIRA_SYSTEM_AGGREGATE_STANDARD_HISTORY[definition.key]!.length, status: 'current' });
    }
    const settings = await prisma.jiraAnalyticsSettings.findUniqueOrThrow({ where: { projectId: project.id } });
    assert.ok((settings.dashboardConfig as unknown as Dashboard).widgets.length > 0);
  } finally {
    await cleanup(project.id, unit.id);
  }
});

test('an outdated system aggregate gains the fields of the code, keeps its own settings, and its widgets follow it', { skip: !enabled }, async () => {
  const { unit, project } = await createProject(randomUUID().slice(0, 8));
  try {
    await reconcileJiraSystemSetup(prisma, project);
    const issues = await prisma.jiraAggregateDefinition.findFirstOrThrow({ where: { projectId: project.id, aggregateKey: 'issues' } });
    const transitions = await prisma.jiraAggregateDefinition.findFirstOrThrow({ where: { projectId: project.id, aggregateKey: 'status-transitions' } });
    // Reporter is not a ticket-attribute field: only the code definition brings it back.
    const dropped = new Set(['storyPoints', 'ageDays', 'epic', 'components', 'reporter']);
    const customFilter = { id: 'custom-1', field: 'priority', operator: 'equals', value: 'Blocker' };

    // An old copy: published without some fields, with a filter of the project's own.
    const issuesRevision = await prisma.jiraAggregateDefinitionRevision.findFirstOrThrow({ where: { aggregateId: issues.id, version: 1 } });
    const oldIssues = issuesRevision.definition as unknown as Definition;
    const customizedIssues = {
      ...oldIssues,
      basePopulation: { logic: 'and', filters: [customFilter] },
      outputFields: oldIssues.outputFields.filter((field) => !dropped.has(field.key)),
    };
    await prisma.jiraAggregateDefinitionRevision.update({ where: { id: issuesRevision.id }, data: { definition: customizedIssues as unknown as Prisma.InputJsonObject } });
    await prisma.jiraAggregateDefinition.update({ where: { id: issues.id }, data: { draftDefinition: customizedIssues as unknown as Prisma.InputJsonObject } });

    // Another one with an unpublished draft on top of an old published version.
    const transitionsRevision = await prisma.jiraAggregateDefinitionRevision.findFirstOrThrow({ where: { aggregateId: transitions.id, version: 1 } });
    const oldTransitions = transitionsRevision.definition as unknown as Definition;
    const reducedTransitions = { ...oldTransitions, outputFields: oldTransitions.outputFields.filter((field) => field.key !== 'labels') };
    const draft = { ...reducedTransitions, description: 'Черновик проекта' };
    await prisma.jiraAggregateDefinitionRevision.update({ where: { id: transitionsRevision.id }, data: { definition: reducedTransitions as unknown as Prisma.InputJsonObject } });
    await prisma.jiraAggregateDefinitionRevision.create({ data: { projectId: project.id, aggregateId: transitions.id, version: 2, definition: draft as unknown as Prisma.InputJsonObject, fingerprint: 'd'.repeat(64), status: 'draft', changeKind: 'compatible' } });
    await prisma.jiraAggregateDefinition.update({ where: { id: transitions.id }, data: { version: 2, draftDefinition: draft as unknown as Prisma.InputJsonObject } });

    const settings = await prisma.jiraAnalyticsSettings.findUniqueOrThrow({ where: { projectId: project.id } });
    const issueWidgets = (settings.dashboardConfig as unknown as Dashboard).widgets.filter((widget) => widget.aggregateId === issues.id);
    assert.ok(issueWidgets.length > 0);
    assert.ok(issueWidgets.every((widget) => widget.aggregateVersion === 1));

    assert.equal(await reconcileJiraSystemSetup(prisma, project), true);

    const upgradedIssues = await prisma.jiraAggregateDefinition.findUniqueOrThrow({ where: { id: issues.id } });
    assert.equal(upgradedIssues.publishedVersion, 2);
    const publishedIssues = (await prisma.jiraAggregateDefinitionRevision.findFirstOrThrow({ where: { aggregateId: issues.id, version: 2 } })).definition as unknown as Definition;
    const codeIssues = JIRA_SYSTEM_SEMANTIC_AGGREGATES.find((aggregate) => aggregate.key === 'issues')!.definition;
    const publishedKeys = new Set(publishedIssues.outputFields.map((field) => field.key));
    assert.ok(codeIssues.outputFields.some((field) => field.key === 'reporter'));
    for (const field of codeIssues.outputFields) assert.ok(publishedKeys.has(field.key), `issues lacks ${field.key}`);
    assert.deepEqual(publishedIssues.basePopulation.filters, [customFilter], 'the project filter stays');
    const standardOf = async (key: string) => (await listJiraSemanticAggregates(prisma, project.id)).find((item) => item.key === key)?.standard;
    // Same standard number as any other project, while the local revision is 2.
    assert.deepEqual(await standardOf('issues'), { version: JIRA_SYSTEM_AGGREGATE_STANDARD_HISTORY.issues!.length, status: 'customized' });
    assert.deepEqual(await standardOf('goal-linked-issues'), { version: JIRA_SYSTEM_AGGREGATE_STANDARD_HISTORY['goal-linked-issues']!.length, status: 'current' });

    const upgradedTransitions = await prisma.jiraAggregateDefinition.findUniqueOrThrow({ where: { id: transitions.id } });
    assert.equal(upgradedTransitions.publishedVersion, 3);
    assert.equal(upgradedTransitions.version, 4);
    const newDraft = upgradedTransitions.draftDefinition as unknown as Definition;
    assert.equal(newDraft.description, 'Черновик проекта');
    assert.ok(newDraft.outputFields.some((field) => field.key === 'labels'));

    const followed = (await prisma.jiraAnalyticsSettings.findUniqueOrThrow({ where: { projectId: project.id } })).dashboardConfig as unknown as Dashboard;
    assert.ok(followed.widgets.filter((widget) => widget.aggregateId === issues.id).every((widget) => widget.aggregateVersion === 2));

    // Once current, another run changes nothing.
    const revisionCount = await prisma.jiraAggregateDefinitionRevision.count({ where: { projectId: project.id } });
    await Promise.all([reconcileJiraSystemSetup(prisma, project), reconcileJiraSystemSetup(prisma, project)]);
    assert.equal(await prisma.jiraAggregateDefinitionRevision.count({ where: { projectId: project.id } }), revisionCount);
  } finally {
    await cleanup(project.id, unit.id);
  }
});

test('a widget pinned to an older version stays there when the standard widgets are seeded', { skip: !enabled }, async () => {
  const { unit, project } = await createProject(randomUUID().slice(0, 8));
  const reduce = async (aggregateId: string, version: number, field: string) => {
    const revision = await prisma.jiraAggregateDefinitionRevision.findFirstOrThrow({ where: { aggregateId, version } });
    const definition = revision.definition as unknown as Definition;
    const reduced = { ...definition, outputFields: definition.outputFields.filter((item) => item.key !== field) };
    await prisma.jiraAggregateDefinitionRevision.update({ where: { id: revision.id }, data: { definition: reduced as unknown as Prisma.InputJsonObject } });
    await prisma.jiraAggregateDefinition.update({ where: { id: aggregateId }, data: { draftDefinition: reduced as unknown as Prisma.InputJsonObject } });
  };
  try {
    await reconcileJiraSystemSetup(prisma, project);
    const issues = await prisma.jiraAggregateDefinition.findFirstOrThrow({ where: { projectId: project.id, aggregateKey: 'issues' } });
    await reduce(issues.id, 1, 'reporter');
    await reconcileJiraSystemSetup(prisma, project);

    const settings = await prisma.jiraAnalyticsSettings.findUniqueOrThrow({ where: { projectId: project.id } });
    const dashboard = settings.dashboardConfig as unknown as Dashboard;
    const pinned = { ...dashboard.widgets.find((widget) => widget.aggregateId === issues.id)!, id: 'custom-old-pin', aggregateVersion: 1 };
    await prisma.jiraAnalyticsSettings.update({
      where: { projectId: project.id },
      data: { semanticDefaultWidgetsVersion: 7, dashboardConfig: { ...dashboard, widgets: [...dashboard.widgets, pinned] } as unknown as Prisma.InputJsonObject },
    });
    await reduce(issues.id, 2, 'reporter');
    await reconcileJiraSystemSetup(prisma, project);

    assert.equal((await prisma.jiraAggregateDefinition.findUniqueOrThrow({ where: { id: issues.id } })).publishedVersion, 3);
    const after = (await prisma.jiraAnalyticsSettings.findUniqueOrThrow({ where: { projectId: project.id } })).dashboardConfig as unknown as Dashboard;
    assert.equal(after.widgets.find((widget) => widget.id === 'custom-old-pin')?.aggregateVersion, 1);
    assert.ok(after.widgets.filter((widget) => widget.aggregateId === issues.id && widget.id !== 'custom-old-pin').every((widget) => widget.aggregateVersion === 3));
  } finally {
    await cleanup(project.id, unit.id);
  }
});
