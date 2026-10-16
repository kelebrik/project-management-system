import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { prisma } from '../../apps/api/src/db.js';
import { createApp } from '../../apps/api/src/server/app.js';
import { hashPassword } from '../../apps/api/src/server/auth.js';
import { loadPortfolioReport } from '../../apps/api/src/services/portfolio-reports.js';
import { projectShiftLadders } from '../../apps/api/src/services/schedule-shifts.js';

const enabled = process.env.WORKFLOW_TEST_DATABASE === 'true';
const day = (value: string) => new Date(`${value}T00:00:00.000Z`);

test('failed work is closed like done work: it gets the day it failed, keeps it between done and failed, loses it when reopened', { skip: !enabled }, async () => {
  const suffix = randomUUID().slice(0, 8);
  const unit = await prisma.businessUnit.create({ data: { code: `fw-${suffix}`, name: 'Failed work test' } });
  const user = await prisma.user.create({ data: { email: `fw-${suffix}@example.test`, name: 'РП', role: 'ADMIN', passwordHash: await hashPassword('test-failed-only') } });
  const project = await prisma.project.create({
    data: { code: `FW-${suffix}`, name: 'Failed work', businessUnitId: unit.id, portfolio: 'TEST', sponsor: 'Test', projectManager: 'Test', startDate: day('2026-10-01'), targetDate: day('2026-12-01'), budgetPlanned: 0, budgetForecast: 0, summary: '' },
  });
  const task = await prisma.wbsItem.create({ data: { projectId: project.id, code: '1', title: 'Задача', type: 'TASK', status: 'IN_PROGRESS', owner: 'РП', startDate: day('2026-10-05'), dueDate: day('2026-10-09'), workDays: 5, sortOrder: 10, wbsLevel: 1 } });
  process.env.DEPLOYMENT_PROFILE = 'cloud';
  const server = createApp().listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const address = server.address();
  assert(address && typeof address !== 'string');
  const base = `http://127.0.0.1:${address.port}`;
  let cookie = '';
  const request = (url: string, options: RequestInit = {}) =>
    fetch(base + url, { ...options, headers: { Cookie: cookie, 'x-business-unit-id': unit.id, 'Content-Type': 'application/json', ...options.headers } });
  const status = async (value: string) => {
    const answer = await request(`/api/wbs-items/${task.id}`, { method: 'PATCH', body: JSON.stringify({ status: value }) });
    assert.equal(answer.status, 200, await answer.clone().text());
    return (await prisma.wbsItem.findUniqueOrThrow({ where: { id: task.id } })).closedAt;
  };
  try {
    const login = await request('/api/auth/login', { method: 'POST', body: JSON.stringify({ email: user.email, password: 'test-failed-only' }) });
    cookie = login.headers.getSetCookie().map((value) => value.split(';')[0]).join('; ');

    const before = Date.now();
    const failedAt = await status('BLOCKED');
    assert.ok(failedAt && failedAt.getTime() >= before - 1000, 'failing closes the work now');
    assert.equal((await status('DONE'))?.getTime(), failedAt!.getTime(), 'done after failed keeps the day');
    assert.equal((await status('BLOCKED'))?.getTime(), failedAt!.getTime(), 'and back');
    assert.equal(await status('IN_PROGRESS'), null, 'reopened work is not closed');

    // Failed work past its date is not overdue in the portfolio report, nor is a failed milestone late.
    await prisma.wbsItem.update({ where: { id: task.id }, data: { status: 'BLOCKED', dueDate: day('2026-10-09') } });
    const open = await prisma.wbsItem.create({ data: { projectId: project.id, code: '2', title: 'Открытая', type: 'TASK', status: 'IN_PROGRESS', owner: 'РП', startDate: day('2026-10-05'), dueDate: day('2026-10-09'), workDays: 5, sortOrder: 20, wbsLevel: 1 } });
    const report = await loadPortfolioReport({ id: project.id }, { now: day('2026-10-20'), horizonDays: 30, periodDays: 30 });
    assert.equal(report.summary[0]?.overdueWork, 1);
    const milestone = await prisma.wbsItem.create({ data: { projectId: project.id, code: '3', title: 'Веха', type: 'MILESTONE', status: 'BLOCKED', owner: '', startDate: day('2026-11-20'), dueDate: day('2026-11-20'), baselineDueDate: day('2026-11-01'), workDays: 0, sortOrder: 30, wbsLevel: 1 } });
    await prisma.wbsBaseline.create({ data: { projectId: project.id, version: 1, title: 'v1' } });
    assert.deepEqual((await projectShiftLadders(project.id)).map((ladder) => ladder.id).filter((id) => id === milestone.id), []);
    await prisma.wbsItem.delete({ where: { id: open.id } });
  } finally {
    server.close();
    await prisma.project.deleteMany({ where: { id: project.id } }).catch(() => undefined);
    await prisma.user.delete({ where: { id: user.id } }).catch(() => undefined);
    await prisma.businessUnit.delete({ where: { id: unit.id } }).catch(() => undefined);
  }
});
