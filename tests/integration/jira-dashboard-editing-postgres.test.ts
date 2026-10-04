import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { prisma } from '../../apps/api/src/db.js';
import { createApp } from '../../apps/api/src/server/app.js';
import { hashPassword } from '../../apps/api/src/server/auth.js';

const enabled = process.env.WORKFLOW_TEST_DATABASE === 'true';

test('the shared Jira dashboard is set up by those who may change the project, aggregates stay with administrators, and each person keeps a layer', { skip: !enabled }, async () => {
  const suffix = randomUUID().slice(0, 8);
  const unit = await prisma.businessUnit.create({ data: { code: `jd-${suffix}`, name: 'Dashboards' } });
  const password = await hashPassword('test-dashboard-only');
  const [editor, viewer] = await Promise.all(['ed', 'vw'].map((tag) => prisma.user.create({ data: { email: `${tag}-${suffix}@example.test`, name: tag, role: 'PROJECT_MANAGER', passwordHash: password } })));
  const project = await prisma.project.create({ data: { businessUnitId: unit.id, code: `JD-${suffix}`, name: 'Dashboards', portfolio: 'T', sponsor: 'T', projectManager: 'T', startDate: new Date('2026-09-01'), targetDate: new Date('2026-12-01'), budgetPlanned: 0, budgetForecast: 0, summary: '' } });
  await prisma.projectAccess.createMany({ data: [{ projectId: project.id, userId: editor.id, level: 'EDIT' }, { projectId: project.id, userId: viewer.id, level: 'VIEW' }] });

  process.env.DEPLOYMENT_PROFILE = 'cloud';
  const server = createApp().listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const address = server.address();
  assert(address && typeof address !== 'string');
  const url = `http://127.0.0.1:${address.port}`;
  const session = async (email: string) => {
    const login = await fetch(`${url}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: 'test-dashboard-only' }) });
    const cookie = login.headers.getSetCookie().map((value) => value.split(';')[0]).join('; ');
    return (path: string, method = 'GET', body?: unknown) =>
      fetch(url + path, { method, headers: { Cookie: cookie, 'x-business-unit-id': unit.id, 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  };
  try {
    const asEditor = await session(editor.email);
    const asViewer = await session(viewer.email);
    const catalogOf = async (call: typeof asEditor) => (await call(`/api/projects/${project.id}/jira/semantic-aggregates`)).json();
    const editorCatalog = await catalogOf(asEditor);
    assert.equal(editorCatalog.canEditDashboard, true);
    assert.equal((await catalogOf(asViewer)).canEditDashboard, false);

    const config = { version: 5, periodDays: 180, assignee: '', widgets: [] };
    assert.equal((await asViewer(`/api/projects/${project.id}/jira/semantic-dashboard`, 'PATCH', { config, expectedConfigHash: editorCatalog.dashboardConfigHash })).status, 403);
    const saved = await asEditor(`/api/projects/${project.id}/jira/semantic-dashboard`, 'PATCH', { config, expectedConfigHash: editorCatalog.dashboardConfigHash });
    assert.equal(saved.status, 200);
    assert.equal((await asEditor(`/api/projects/${project.id}/jira/semantic-aggregates/bootstrap`, 'POST', {})).status, 403, 'aggregates stay with administrators');

    const layer = { version: 1, hidden: ['shared-1'], order: ['shared-2'], widgets: [] };
    assert.equal((await asViewer(`/api/projects/${project.id}/my-view`, 'PATCH', { jiraDashboard: layer })).status, 200);
    const view = await (await asViewer(`/api/projects/${project.id}/my-view`)).json();
    assert.deepEqual(view.state.jiraDashboard, layer);
    assert.equal((await asViewer(`/api/projects/${project.id}/my-view`, 'PATCH', { jiraDashboard: { version: 2 } })).status, 400);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await prisma.auditEvent.deleteMany({ where: { actorId: { in: [editor.id, viewer.id] } } });
    await prisma.project.delete({ where: { id: project.id } });
    await prisma.user.deleteMany({ where: { id: { in: [editor.id, viewer.id] } } });
    await prisma.businessUnit.delete({ where: { id: unit.id } });
  }
});

test('a KPI widget gets the value of the period before from the same batch, whatever other widgets are called', { skip: !enabled }, async () => {
  const suffix = randomUUID().slice(0, 8);
  const unit = await prisma.businessUnit.create({ data: { code: `kpi-${suffix}`, name: 'KPI' } });
  const admin = await prisma.user.create({ data: { email: `kpi-${suffix}@example.test`, name: 'Админ', role: 'ADMIN', passwordHash: await hashPassword('test-dashboard-only') } });
  const project = await prisma.project.create({ data: { businessUnitId: unit.id, code: `KPI-${suffix}`, name: 'KPI', portfolio: 'T', sponsor: 'T', projectManager: 'T', startDate: new Date('2026-01-01'), targetDate: new Date('2026-12-01'), budgetPlanned: 0, budgetForecast: 0, summary: '' } });
  const daysAgo = (days: number) => new Date(Date.now() - days * 86_400_000);
  const resolvedAt = [2, 5, 9, 40];
  await prisma.jiraIssueSnapshot.createMany({ data: resolvedAt.map((days, index) => ({ projectId: project.id, issueKey: `KPI-${index}`, issueUrl: '', summary: `${index}`, status: 'Done', priority: 'Major', issueType: 'Task', labels: [], resolution: 'Done', resolutionAt: daysAgo(days), issueCreatedAt: daysAgo(60), updatedAt: new Date(), syncedAt: new Date() })) });

  process.env.DEPLOYMENT_PROFILE = 'cloud';
  const server = createApp().listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const address = server.address();
  assert(address && typeof address !== 'string');
  const url = `http://127.0.0.1:${address.port}`;
  try {
    const login = await fetch(`${url}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: admin.email, password: 'test-dashboard-only' }) });
    const cookie = login.headers.getSetCookie().map((value) => value.split(';')[0]).join('; ');
    const call = (path: string, method = 'GET', body?: unknown) => fetch(url + path, { method, headers: { Cookie: cookie, 'x-business-unit-id': unit.id, 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
    assert.equal((await call(`/api/projects/${project.id}/jira/semantic-aggregates/bootstrap-missing`, 'POST', {})).status < 300, true);
    const catalog = await (await call(`/api/projects/${project.id}/jira/semantic-aggregates`)).json();
    const issues = catalog.definitions.find((definition: { published?: { rowConfig: { kind: string } } }) => definition.published?.rowConfig.kind === 'issue');
    const query = { aggregateVersion: issues.publishedVersion, selectedFields: ['issueKey'], metric: 'count', groupBy: 'none', filters: [], filterLogic: 'and', periodDays: 30, dateField: 'resolutionAt', assignee: '', sortBy: 'default', sortDirection: 'desc', page: 1, pageSize: 20 };
    const answer = await (await call(`/api/projects/${project.id}/jira/semantic-aggregates/query-batch`, 'POST', { queries: [
      { widgetId: 'a', aggregateId: issues.id, query: { ...query, visualization: 'kpi' } },
      { widgetId: 'a::previous', aggregateId: issues.id, query: { ...query, visualization: 'number' } },
    ] })).json();
    const byId = Object.fromEntries(answer.results.map((item: { widgetId: string; result: { value: number; previousValue?: number } }) => [item.widgetId, item.result]));
    assert.deepEqual([byId.a.value, byId.a.previousValue], [3, 1], 'three resolved in the last 30 days, one in the 30 before');
    assert.equal(byId['a::previous'].value, 3);
    assert.equal(byId['a::previous'].previousValue, undefined);
    const misuse = await (await call(`/api/projects/${project.id}/jira/semantic-aggregates/query-batch`, 'POST', { queries: [{ widgetId: 'b', aggregateId: issues.id, query: { ...query, visualization: 'number', compare: 'previousPeriod' } }] })).json();
    assert.match(misuse.results[0].error, /только у показателя/);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await prisma.auditEvent.deleteMany({ where: { actorId: admin.id } });
    await prisma.project.delete({ where: { id: project.id } });
    await prisma.user.delete({ where: { id: admin.id } });
    await prisma.businessUnit.delete({ where: { id: unit.id } });
  }
});
