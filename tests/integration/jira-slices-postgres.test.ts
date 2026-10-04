import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { prisma } from '../../apps/api/src/db.js';
import { createApp } from '../../apps/api/src/server/app.js';
import { hashPassword } from '../../apps/api/src/server/auth.js';

const enabled = process.env.WORKFLOW_TEST_DATABASE === 'true';

test('the slice bar gets values from the project snapshots, and saved slices are checked and kept per project', { skip: !enabled }, async () => {
  const suffix = randomUUID().slice(0, 8);
  const unit = await prisma.businessUnit.create({ data: { code: `sl-${suffix}`, name: 'Slices' } });
  const user = await prisma.user.create({ data: { email: `sl-${suffix}@example.test`, name: 'Срезы', role: 'PROJECT_MANAGER', passwordHash: await hashPassword('test-slices-only') } });
  const project = await prisma.project.create({ data: { businessUnitId: unit.id, code: `SL-${suffix}`, name: 'Slices', portfolio: 'T', sponsor: 'T', projectManager: 'T', startDate: new Date('2026-09-01'), targetDate: new Date('2026-12-01'), budgetPlanned: 0, budgetForecast: 0, summary: '' } });
  await prisma.projectAccess.create({ data: { projectId: project.id, userId: user.id, level: 'VIEW' } });
  const snapshot = (n: number, assignee: string | null, attributes: object | null, retired = false) => ({
    projectId: project.id, issueKey: `SL-${n}`, issueUrl: '', summary: `Задача ${n}`, status: 'In Progress', priority: 'Major', assignee, issueType: 'Task',
    labels: ['tv'], updatedAt: new Date(), syncedAt: new Date(), ...(attributes ? { attributes } : {}), retiredAt: retired ? new Date() : null,
  });
  await prisma.jiraIssueSnapshot.createMany({ data: [
    snapshot(1, 'Иванов', { statusCategoryKey: 'indeterminate', epicKey: 'SL-E1', components: ['Плата'], fixVersions: ['1.0'] }),
    snapshot(2, 'Иванов', { statusCategoryKey: 'new', epicKey: null, components: [], fixVersions: [] }),
    snapshot(3, null, null),
    snapshot(4, 'Выбывший', null, true),
  ] });

  process.env.DEPLOYMENT_PROFILE = 'cloud';
  const server = createApp().listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const address = server.address();
  assert(address && typeof address !== 'string');
  const url = `http://127.0.0.1:${address.port}`;
  try {
    const login = await fetch(`${url}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: user.email, password: 'test-slices-only' }) });
    const cookie = login.headers.getSetCookie().map((value) => value.split(';')[0]).join('; ');
    const call = (path: string, method = 'GET', body?: unknown) =>
      fetch(url + path, { method, headers: { Cookie: cookie, 'x-business-unit-id': unit.id, 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });

    const facets = await (await call(`/api/projects/${project.id}/jira/analytics-facets`)).json();
    assert.equal(facets.issueCount, 3, 'retired issues are not offered');
    assert.deepEqual(facets.values.assignees.values, [{ value: 'Иванов', count: 2 }, { value: '', count: 1 }]);
    assert.deepEqual(facets.values.epics.values, [{ value: '', count: 2 }, { value: 'SL-E1', count: 1 }]);
    assert.deepEqual(facets.values.statusCategories.values.map((entry: { value: string }) => entry.value).sort(), ['', 'indeterminate', 'new']);
    assert.deepEqual(facets.assignees, ['Иванов']);

    const slice = { version: 1, slice: { assignees: ['Иванов'], components: ['Плата'] } };
    assert.equal((await call('/api/saved-views', 'POST', { viewType: 'jira-slice', name: 'Без проекта', config: slice })).status, 400);
    assert.equal((await call('/api/saved-views', 'POST', { viewType: 'jira-slice', projectId: project.id, name: 'Плохой', config: { version: 1, slice: { owners: ['x'] } } })).status, 400);
    const created = await call('/api/saved-views', 'POST', { viewType: 'jira-slice', projectId: project.id, name: 'Плата Иванова', config: slice, isShared: true });
    assert.equal(created.status, 201);
    const listed = await (await call(`/api/saved-views?viewType=jira-slice&projectId=${project.id}`)).json();
    assert.equal(listed.length, 1);
    assert.equal(listed[0].name, 'Плата Иванова');
    assert.equal((await call(`/api/saved-views/${listed[0].id}`, 'PATCH', { config: { version: 1, slice: { assignees: 'Иванов' } } })).status, 400);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await prisma.savedView.deleteMany({ where: { ownerId: user.id } });
    await prisma.auditEvent.deleteMany({ where: { actorId: user.id } });
    await prisma.project.delete({ where: { id: project.id } });
    await prisma.user.delete({ where: { id: user.id } });
    await prisma.businessUnit.delete({ where: { id: unit.id } });
  }
});
