import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { encodeJiraSlice, jiraAnalyticsSliceSchema } from '@pms/shared';
import { prisma } from '../../apps/api/src/db.js';
import { createApp } from '../../apps/api/src/server/app.js';
import { hashPassword } from '../../apps/api/src/server/auth.js';

const enabled = process.env.WORKFLOW_TEST_DATABASE === 'true';

test('the Jira portfolio report counts open work per readable project, leaves cancelled issues out and narrows by assignee', { skip: !enabled }, async () => {
  const suffix = randomUUID().slice(0, 8);
  const [unit, otherUnit] = await Promise.all([
    prisma.businessUnit.create({ data: { code: `jp-${suffix}`, name: 'Jira portfolio' } }),
    prisma.businessUnit.create({ data: { code: `jpo-${suffix}`, name: 'Other' } }),
  ]);
  const user = await prisma.user.create({ data: { email: `jp-${suffix}@example.test`, name: 'Портфель', role: 'PROJECT_MANAGER', passwordHash: await hashPassword('test-jira-portfolio-only') } });
  const project = (code: string, businessUnitId: string) => prisma.project.create({ data: { businessUnitId, code, name: code, portfolio: 'TV', sponsor: 'T', projectManager: 'T', startDate: new Date('2026-01-01'), targetDate: new Date('2026-12-01'), budgetPlanned: 0, budgetForecast: 0, summary: '', jiraAnalyticsSettings: { create: { jiraScopeType: 'LABEL', jiraScopeValue: code.toLowerCase(), jiraLabel: code.toLowerCase(), lastSyncedAt: new Date() } } } });
  const [first, second, hidden] = await Promise.all([project(`JPA-${suffix}`, unit.id), project(`JPB-${suffix}`, unit.id), project(`JPH-${suffix}`, otherUnit.id)]);
  const snapshot = (projectId: string, key: string, data: object) => ({ projectId, issueKey: key, issueUrl: '', summary: key, priority: 'Major', issueType: 'Task', labels: [], updatedAt: new Date(), syncedAt: new Date(), issueCreatedAt: new Date(Date.now() - 10 * 86_400_000), status: 'In Progress', ...data });
  await prisma.jiraIssueSnapshot.createMany({ data: [
    snapshot(first.id, 'A-1', { assignee: 'Иванов', attributes: { statusCategoryKey: 'indeterminate', storyPoints: 5, dueDate: '2026-01-01' } }),
    snapshot(first.id, 'A-2', { status: 'Отменено', assignee: 'Иванов' }),
    snapshot(first.id, 'A-3', { status: 'Done', resolution: 'Done', resolutionAt: new Date(), assignee: 'Петров' }),
    snapshot(second.id, 'B-1', { assignee: 'Петров' }),
    snapshot(hidden.id, 'H-1', { assignee: 'Иванов' }),
  ] as never });

  process.env.DEPLOYMENT_PROFILE = 'cloud';
  const server = createApp().listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const address = server.address();
  assert(address && typeof address !== 'string');
  const url = `http://127.0.0.1:${address.port}`;
  try {
    const login = await fetch(`${url}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: user.email, password: 'test-jira-portfolio-only' }) });
    const cookie = login.headers.getSetCookie().map((value) => value.split(';')[0]).join('; ');
    const get = (query: string) => fetch(`${url}/api/reports/jira-portfolio?${query}`, { headers: { Cookie: cookie, 'x-business-unit-id': unit.id } });
    const report = await (await get('period=30')).json();
    const codes = report.projects.map((row: { projectCode: string }) => row.projectCode);
    assert.ok(codes.includes(first.code) && codes.includes(second.code));
    assert.equal(codes.includes(hidden.code), false, 'projects of another business unit are not shown');
    const line = report.projects.find((row: { projectCode: string }) => row.projectCode === first.code);
    assert.deepEqual([line.openIssues, line.inProgress, line.overdue, line.openStoryPoints, line.resolvedInPeriod, line.createdInPeriod], [1, 1, 1, 5, 1, 2]);
    assert.equal(report.total.openIssues >= 2, true);
    const narrowed = await (await get(`period=30&slice=${encodeJiraSlice(jiraAnalyticsSliceSchema.parse({ assignees: ['Петров'] }))}`)).json();
    assert.equal(narrowed.projects.find((row: { projectCode: string }) => row.projectCode === second.code).openIssues, 1);
    assert.equal(narrowed.projects.find((row: { projectCode: string }) => row.projectCode === first.code).openIssues, 0);
    assert.equal((await get('period=14')).status, 400);
    assert.equal((await get('slice=broken')).status, 400);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await prisma.project.deleteMany({ where: { id: { in: [first.id, second.id, hidden.id] } } });
    await prisma.user.delete({ where: { id: user.id } });
    await prisma.businessUnit.deleteMany({ where: { id: { in: [unit.id, otherUnit.id] } } });
  }
});
