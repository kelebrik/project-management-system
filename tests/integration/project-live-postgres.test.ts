import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { prisma } from '../../apps/api/src/db.js';
import { createApp } from '../../apps/api/src/server/app.js';
import { hashPassword } from '../../apps/api/src/server/auth.js';

const enabled = process.env.WORKFLOW_TEST_DATABASE === 'true';

test('a successful write reaches the open pages of the project once, a refused one does not', { skip: !enabled }, async () => {
  const suffix = randomUUID().slice(0, 8);
  const unit = await prisma.businessUnit.create({ data: { code: `live-${suffix}`, name: 'Live' } });
  const password = await hashPassword('test-live-only');
  const [writer, reader] = await Promise.all(['wr', 'rd'].map((tag) => prisma.user.create({ data: { email: `${tag}-${suffix}@example.test`, name: tag === 'wr' ? 'Писатель' : 'Читатель', role: 'ADMIN', passwordHash: password } })));
  const project = await prisma.project.create({ data: { businessUnitId: unit.id, code: `LV-${suffix}`, name: 'Live', portfolio: 'T', sponsor: 'T', projectManager: 'T', startDate: new Date('2026-09-01'), targetDate: new Date('2026-12-01'), budgetPlanned: 0, budgetForecast: 0, summary: '' } });

  process.env.DEPLOYMENT_PROFILE = 'cloud';
  const server = createApp().listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const address = server.address();
  assert(address && typeof address !== 'string');
  const url = `http://127.0.0.1:${address.port}`;
  const session = async (email: string) => {
    const login = await fetch(`${url}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: 'test-live-only' }) });
    return login.headers.getSetCookie().map((value) => value.split(';')[0]).join('; ');
  };
  const controller = new AbortController();
  try {
    const [writerCookie, readerCookie] = await Promise.all([session(writer.email), session(reader.email)]);
    const stream = await fetch(`${url}/api/projects/${project.id}/events`, { headers: { Cookie: readerCookie, 'x-business-unit-id': unit.id }, signal: controller.signal });
    assert.equal(stream.status, 200);
    const body = stream.body!.getReader();
    const decoder = new TextDecoder();
    let text = '';
    const pump = (async () => {
      for (;;) {
        const { value, done } = await body.read().catch(() => ({ value: undefined, done: true }));
        if (done) return;
        text += decoder.decode(value);
      }
    })();
    const write = (payload: unknown) => fetch(`${url}/api/projects/${project.id}/open-issues`, {
      method: 'POST',
      headers: { Cookie: writerCookie, 'x-business-unit-id': unit.id, 'Content-Type': 'application/json', 'X-PMS-Client': 'tab-writer-0001' },
      body: JSON.stringify(payload),
    });
    assert.equal((await write({})).status, 400);
    assert.equal((await write({ title: 'Живой вопрос' })).status, 201);
    for (let attempt = 0; attempt < 50 && !/event: change/.test(text); attempt += 1) await new Promise((resolve) => setTimeout(resolve, 20));
    const events = [...text.matchAll(/event: change\ndata: (.*)\n\n/g)].map((match) => JSON.parse(match[1]!));
    assert.equal(events.length, 1, 'only the successful write');
    assert.deepEqual(
      { section: events[0].section, actorName: events[0].actorName, clientId: events[0].clientId, projectId: events[0].projectId },
      { section: 'issues', actorName: 'Писатель', clientId: 'tab-writer-0001', projectId: project.id },
    );
    // A lesson edit, which the write checks leave to role permissions, still names its project.
    const lesson = await prisma.lesson.create({ data: { projectId: project.id, category: 'Процесс', title: 'Урок для живого обновления' } });
    const lessonEdit = await fetch(`${url}/api/lessons/${lesson.id}`, {
      method: 'PATCH',
      headers: { Cookie: writerCookie, 'x-business-unit-id': unit.id, 'Content-Type': 'application/json', 'X-PMS-Client': 'tab-writer-0001' },
      body: JSON.stringify({ title: 'Урок после правки' }),
    });
    assert.equal(lessonEdit.status, 200);
    for (let attempt = 0; attempt < 50 && !/"section":"lessons"/.test(text); attempt += 1) await new Promise((resolve) => setTimeout(resolve, 20));
    assert.match(text, /"section":"lessons"/);
    controller.abort();
    await pump;
  } finally {
    controller.abort();
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await prisma.auditEvent.deleteMany({ where: { actorId: { in: [writer.id, reader.id] } } });
    await prisma.project.delete({ where: { id: project.id } });
    await prisma.user.deleteMany({ where: { id: { in: [writer.id, reader.id] } } });
    await prisma.businessUnit.delete({ where: { id: unit.id } });
  }
});
