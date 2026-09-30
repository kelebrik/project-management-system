import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { prisma } from '../../apps/api/src/db.js';
import { createApp } from '../../apps/api/src/server/app.js';
import { hashPassword } from '../../apps/api/src/server/auth.js';

const enabled = process.env.WORKFLOW_TEST_DATABASE === 'true';
const day = (value: string) => new Date(`${value}T00:00:00.000Z`);

test('lessons are drafted from records, kept after closure and found in the register', { skip: !enabled }, async () => {
  const suffix = randomUUID().slice(0, 8);
  const unit = await prisma.businessUnit.create({ data: { code: `ls-${suffix}`, name: 'Lesson test' } });
  const password = await hashPassword('test-lessons-only');
  const pm = await prisma.user.create({ data: { email: `lpm-${suffix}@example.test`, name: 'РП', role: 'PROJECT_MANAGER', passwordHash: password } });
  const reader = await prisma.user.create({ data: { email: `lrd-${suffix}@example.test`, name: 'Читатель', role: 'EXECUTIVE_VIEWER', passwordHash: password } });
  const project = await prisma.project.create({
    data: { code: `LS-${suffix}`, name: 'Lessons', businessUnitId: unit.id, portfolio: 'TEST', sponsor: 'Test', projectManager: 'Test', startDate: day('2026-10-01'), targetDate: day('2026-12-01'), budgetPlanned: 0, budgetForecast: 0, summary: '' },
  });
  await prisma.projectAccess.create({ data: { projectId: project.id, userId: pm.id, level: 'EDIT' } });
  await prisma.raidItem.create({ data: { projectId: project.id, type: 'DEPENDENCY', title: 'Нет стенда', description: 'x', owner: '', status: 'CLOSED', probability: 3, impact: 3, riskScore: 9, mitigationPlan: 'Арендовали' } as never });
  await prisma.decision.create({ data: { projectId: project.id, title: 'Доставка', decision: 'Платит заказчик', status: 'APPROVED' } });
  process.env.DEPLOYMENT_PROFILE = 'cloud';
  const server = createApp().listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const address = server.address();
  assert(address && typeof address !== 'string');
  const url = `http://127.0.0.1:${address.port}`;
  const session = async (email: string) => {
    const login = await fetch(`${url}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: 'test-lessons-only' }) });
    const cookie = login.headers.getSetCookie().map((value) => value.split(';')[0]).join('; ');
    return (path: string, method = 'GET', body?: unknown) =>
      fetch(url + path, { method, headers: { Cookie: cookie, 'x-business-unit-id': unit.id, 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  };
  try {
    const asPm = await session(pm.email);
    const asReader = await session(reader.email);
    const draft = await (await asPm(`/api/projects/${project.id}/lessons/draft`)).json();
    assert.deepEqual(draft.map((row: { sourceKind: string }) => row.sourceKind).sort(), ['DECISION', 'RISK']);
    const problem = draft.find((row: { sourceKind: string }) => row.sourceKind === 'RISK');
    assert.equal((await asReader(`/api/projects/${project.id}/lessons`, 'POST', problem)).status, 403);
    const saved = await asPm(`/api/projects/${project.id}/lessons`, 'POST', { ...problem, recommendation: 'Бронировать стенд заранее' });
    assert.equal(saved.status, 201, await saved.clone().text());
    const next = await (await asPm(`/api/projects/${project.id}/lessons/draft`)).json();
    assert.equal(next.some((row: { sourceRef: string }) => row.sourceRef === problem.sourceRef), false);

    // Lessons are written at the end: a closed project still takes them.
    await prisma.project.update({ where: { id: project.id }, data: { status: 'CLOSED' } });
    const late = await asPm(`/api/projects/${project.id}/lessons`, 'POST', { category: 'GOOD_PRACTICE', title: 'Еженедельный комитет помог', text: '' });
    assert.equal(late.status, 201, await late.clone().text());

    const register = await (await asReader(`/api/lessons?q=${encodeURIComponent('стенд')}`)).json();
    assert.equal(register.total, 1);
    assert.equal(register.rows[0].project.code, `LS-${suffix}`);
    const good = await (await asReader('/api/lessons?category=GOOD_PRACTICE')).json();
    assert.ok(good.rows.every((row: { category: string }) => row.category === 'GOOD_PRACTICE'));
  } finally {
    server.close();
    await prisma.project.deleteMany({ where: { id: project.id } }).catch(() => undefined);
    await prisma.user.deleteMany({ where: { id: { in: [pm.id, reader.id] } } }).catch(() => undefined);
  }
});
