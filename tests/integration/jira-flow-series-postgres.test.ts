import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { encodeJiraSlice, jiraAnalyticsSliceSchema } from '@pms/shared';
import { prisma } from '../../apps/api/src/db.js';
import { createApp } from '../../apps/api/src/server/app.js';
import { hashPassword } from '../../apps/api/src/server/auth.js';

const enabled = process.env.WORKFLOW_TEST_DATABASE === 'true';
const daysAgo = (days: number) => new Date(Date.now() - days * 86_400_000);

test('the flow of Jira work is counted from snapshots and transitions for any reader, within a slice', { skip: !enabled }, async () => {
  const suffix = randomUUID().slice(0, 8);
  const unit = await prisma.businessUnit.create({ data: { code: `fl-${suffix}`, name: 'Flow' } });
  const reader = await prisma.user.create({ data: { email: `fl-${suffix}@example.test`, name: 'Читатель', role: 'PROJECT_MANAGER', passwordHash: await hashPassword('test-flow-only') } });
  const project = await prisma.project.create({ data: { businessUnitId: unit.id, code: `FL-${suffix}`, name: 'Flow', portfolio: 'T', sponsor: 'T', projectManager: 'T', startDate: daysAgo(100), targetDate: daysAgo(-100), budgetPlanned: 0, budgetForecast: 0, summary: '' } });
  await prisma.projectAccess.create({ data: { projectId: project.id, userId: reader.id, level: 'VIEW' } });
  const snapshot = (key: string, data: object) => prisma.jiraIssueSnapshot.create({ data: { projectId: project.id, issueKey: key, issueUrl: '', summary: key, priority: 'Major', issueType: 'Task', labels: [], updatedAt: new Date(), syncedAt: new Date(), ...data } as never });
  const done = await snapshot('FL-1', { status: 'Done', resolution: 'Done', issueCreatedAt: daysAgo(20), resolutionAt: daysAgo(3), assignee: 'Иванов', attributes: { statusCategoryKey: 'done', storyPoints: 5, components: ['Плата'], fixVersions: [] } });
  await prisma.jiraIssueStatusTransition.create({ data: { snapshotId: done.id, transitionKey: 't1', fromStatus: 'Open', toStatus: 'Done', transitionedAt: daysAgo(3) } });
  await snapshot('FL-2', { status: 'In Progress', issueCreatedAt: daysAgo(10), assignee: 'Петров', attributes: { statusCategoryKey: 'indeterminate', storyPoints: 3, components: [], fixVersions: [] } });
  await snapshot('FL-3', { status: 'Отменено', issueCreatedAt: daysAgo(5), assignee: 'Иванов' });

  process.env.DEPLOYMENT_PROFILE = 'cloud';
  const server = createApp().listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const address = server.address();
  assert(address && typeof address !== 'string');
  const url = `http://127.0.0.1:${address.port}`;
  try {
    const login = await fetch(`${url}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: reader.email, password: 'test-flow-only' }) });
    const cookie = login.headers.getSetCookie().map((value) => value.split(';')[0]).join('; ');
    const get = (query: string) => fetch(`${url}/api/projects/${project.id}/jira/flow-series?${query}`, { headers: { Cookie: cookie, 'x-business-unit-id': unit.id } });

    const flow = await (await get('periodDays=30&step=week&metric=count')).json();
    assert.equal(flow.quality.issues, 2, 'cancelled work is left out');
    const last = flow.buckets.at(-1);
    assert.deepEqual([last.scope, last.done, last.open], [2, 1, 1]);
    assert.equal(flow.buckets.reduce((sum: number, bucket: { created: number }) => sum + bucket.created, 0), 2);

    const points = await (await get('periodDays=30&step=week&metric=storyPoints')).json();
    assert.deepEqual([points.buckets.at(-1).scope, points.buckets.at(-1).done], [8, 5]);

    const sliced = await (await get(`periodDays=30&step=week&metric=count&slice=${encodeJiraSlice(jiraAnalyticsSliceSchema.parse({ assignees: ['Петров'] }))}`)).json();
    assert.equal(sliced.quality.issues, 1);
    assert.equal((await get('periodDays=7&step=week')).status, 400);
    assert.equal((await get('slice=garbage')).status, 400);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await prisma.project.delete({ where: { id: project.id } });
    await prisma.user.delete({ where: { id: reader.id } });
    await prisma.businessUnit.delete({ where: { id: unit.id } });
  }
});
