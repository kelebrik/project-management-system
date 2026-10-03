import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { prisma } from '../db.js';
import { createApp } from '../server/app.js';
import { hashPassword } from '../server/auth.js';
import { REPORTS_PER_HOUR } from './problem-reports.js';

const enabled = process.env.WORKFLOW_TEST_DATABASE === 'true';

test('a problem report reaches the administrators, who mark it done', { skip: !enabled }, async () => {
  const suffix = randomUUID().slice(0, 8);
  const password = await hashPassword('test-reports-only');
  const admin = await prisma.user.create({ data: { email: `pra-${suffix}@example.test`, name: 'Админ', role: 'ADMIN', passwordHash: password } });
  const reader = await prisma.user.create({ data: { email: `prr-${suffix}@example.test`, name: 'Читатель', role: 'EXECUTIVE_VIEWER', passwordHash: password } });
  process.env.DEPLOYMENT_PROFILE = 'cloud';
  const app = createApp();
  assert.equal(await app.locals.cloudRoutesReady, true);
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const address = server.address();
  assert(address && typeof address !== 'string');
  const url = `http://127.0.0.1:${address.port}`;
  const session = async (email: string) => {
    const login = await fetch(`${url}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: 'test-reports-only' }) });
    const cookie = login.headers.getSetCookie().map((value) => value.split(';')[0]).join('; ');
    return (path: string, method = 'GET', body?: unknown) =>
      fetch(url + path, { method, headers: { Cookie: cookie, 'Content-Type': 'application/json', 'User-Agent': 'report-test' }, body: body === undefined ? undefined : JSON.stringify(body) });
  };
  try {
    const asReader = await session(reader.email);
    const asAdmin = await session(admin.email);
    // A read-only person can still report; only the path of the page is kept.
    assert.equal((await asReader('/api/problem-reports', 'POST', { message: 'коротко' })).status, 400);
    assert.equal((await asReader('/api/problem-reports', 'POST', { message: 'Не открывается Гант проекта', page: '/TV/gantt?token=1' })).status, 400);
    assert.equal((await asReader('/api/problem-reports', 'POST', { message: 'Не открывается Гант проекта', context: { extra: 'x' } })).status, 400);
    const created = await asReader('/api/problem-reports', 'POST', { message: 'Не открывается Гант проекта', page: '/TV/gantt', context: { viewport: '1600x1000', locale: 'ru' } });
    assert.equal(created.status, 201, await created.clone().text());
    const { id } = await created.json();

    assert.equal((await asReader('/api/problem-reports')).status, 403);
    const list = await (await asAdmin('/api/problem-reports')).json();
    const mine = list.items.find((item: { id: string }) => item.id === id);
    assert.equal(mine.message, 'Не открывается Гант проекта');
    assert.equal(mine.page, '/TV/gantt');
    assert.equal(mine.author, 'Читатель');
    assert.equal(mine.userAgent, 'report-test');
    assert.equal(mine.status, 'OPEN');
    const openBefore = list.openCount;

    const done = await (await asAdmin(`/api/problem-reports/${id}`, 'PATCH', { status: 'DONE' })).json();
    assert.equal(done.openCount, openBefore - 1);
    const openList = await (await asAdmin('/api/problem-reports')).json();
    assert.equal(openList.items.some((item: { id: string }) => item.id === id), false);
    const all = await (await asAdmin('/api/problem-reports?status=all')).json();
    assert.equal(all.items.find((item: { id: string }) => item.id === id).status, 'DONE');
    await asAdmin(`/api/problem-reports/${id}`, 'PATCH', { status: 'OPEN' });
    assert.equal((await (await asAdmin('/api/problem-reports')).json()).openCount, openBefore);
    assert.equal((await asAdmin('/api/problem-reports/missing', 'PATCH', { status: 'DONE' })).status, 404);

    // Five an hour per person.
    for (let index = 1; index < REPORTS_PER_HOUR; index += 1) {
      assert.equal((await asReader('/api/problem-reports', 'POST', { message: `Ещё одна проблема ${index}` })).status, 201);
    }
    assert.equal((await asReader('/api/problem-reports', 'POST', { message: 'Шестая проблема за час' })).status, 429);

    // Sent at the same moment, still no more than five an hour.
    const asAdminBurst = await Promise.all(
      Array.from({ length: 8 }, (_, index) => asAdmin('/api/problem-reports', 'POST', { message: `Одновременное обращение ${index}` })),
    );
    assert.equal(asAdminBurst.filter((answer) => answer.status === 201).length, REPORTS_PER_HOUR);
    assert.equal(asAdminBurst.filter((answer) => answer.status === 429).length, 8 - REPORTS_PER_HOUR);
  } finally {
    server.close();
    await prisma.auditEvent.deleteMany({ where: { actorId: { in: [admin.id, reader.id] } } }).catch(() => undefined);
    await prisma.user.deleteMany({ where: { id: { in: [admin.id, reader.id] } } }).catch(() => undefined);
  }
});
