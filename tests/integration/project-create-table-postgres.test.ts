import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { prisma } from '../../apps/api/src/db.js';
import { createApp } from '../../apps/api/src/server/app.js';
import { hashPassword } from '../../apps/api/src/server/auth.js';

const enabled = process.env.WORKFLOW_TEST_DATABASE === 'true';

test('a project is created with its team and a Structure from a table, or not at all when the table is refused', { skip: !enabled }, async () => {
  const suffix = randomUUID().slice(0, 8);
  const unit = await prisma.businessUnit.create({ data: { code: `pt-${suffix}`, name: `Unit ${suffix}` } });
  const admin = await prisma.user.create({ data: { email: `pta-${suffix}@example.test`, name: 'Админ', role: 'ADMIN', passwordHash: await hashPassword('test-create-only') } });
  process.env.DEPLOYMENT_PROFILE = 'cloud';
  const server = createApp().listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const address = server.address();
  assert(address && typeof address !== 'string');
  const url = `http://127.0.0.1:${address.port}`;
  const login = await fetch(`${url}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: admin.email, password: 'test-create-only' }) });
  const cookie = login.headers.getSetCookie().map((value) => value.split(';')[0]).join('; ');
  const call = (path: string, body: unknown) =>
    fetch(url + path, { method: 'POST', headers: { Cookie: cookie, 'x-business-unit-id': unit.id, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const base = { name: 'Проект из таблицы', projectManager: 'Анна', startDate: '2026-10-05', targetDate: '2027-01-05', budgetPlanned: 0, budgetForecast: 0, portfolio: '' };
  const rows = [
    { code: '1', title: 'Подготовка', type: 'PHASE' },
    { code: '1.1', title: 'Требования', type: 'TASK', startDate: '2026-10-05', dueDate: '2026-10-09' },
    { code: '1.2', title: 'Макет', type: 'TASK', startDate: '2026-10-12', dueDate: '2026-10-16', predecessors: ['1.1'] },
  ];
  try {
    const preview = await (await call('/api/wbs-import/preview', { rows })).json();
    assert.equal(preview.errors.length, 0);
    assert.equal(preview.creates.length, 3);

    const refused = await call('/api/projects', { ...base, code: `PTX-${suffix}`, structureSource: 'table', importKey: `key-${suffix}-bad`, importRows: [{ code: '1.1', title: 'Без родителя' }] });
    assert.equal(refused.status, 422, await refused.clone().text());
    assert.equal(await prisma.project.count({ where: { code: `PTX-${suffix}` } }), 0);

    const created = await call('/api/projects', {
      ...base, code: `PT-${suffix}`, sponsor: 'Бизнес-заказчик', productOwner: 'Олег', hwTpm: 'Ира', swTpm: 'Петя',
      structureSource: 'table', importKey: `key-${suffix}-ok`, importRows: rows,
    });
    assert.equal(created.status, 201, await created.clone().text());
    const project = await prisma.project.findUniqueOrThrow({ where: { code: `PT-${suffix}` }, include: { wbsItems: { orderBy: { sortOrder: 'asc' } } } });
    assert.deepEqual([project.sponsor, project.productOwner, project.hwTpm, project.swTpm], ['Бизнес-заказчик', 'Олег', 'Ира', 'Петя']);
    // The table is the whole Structure: no standard rows beside it.
    assert.deepEqual(project.wbsItems.map((item) => item.code), ['1', '1.1', '1.2']);

    // Copying needs something to copy.
    assert.equal((await call('/api/projects', { ...base, code: `PTC-${suffix}`, structureSource: 'copy' })).status, 400);
    assert.equal((await call('/api/projects', { ...base, code: `PTT-${suffix}`, structureSource: 'table' })).status, 400);
  } finally {
    server.close();
    await prisma.project.deleteMany({ where: { businessUnitId: unit.id } }).catch(() => undefined);
    await prisma.user.deleteMany({ where: { id: admin.id } }).catch(() => undefined);
    await prisma.businessUnit.deleteMany({ where: { id: unit.id } }).catch(() => undefined);
  }
});
