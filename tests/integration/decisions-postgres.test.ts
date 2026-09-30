import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { prisma } from '../../apps/api/src/db.js';
import { createApp } from '../../apps/api/src/server/app.js';
import { hashPassword } from '../../apps/api/src/server/auth.js';

const enabled = process.env.WORKFLOW_TEST_DATABASE === 'true';
const day = (value: string) => new Date(`${value}T00:00:00.000Z`);

test('decisions move through proposal, one approver and supersession, each step once', { skip: !enabled }, async () => {
  assert.match(new URL(process.env.DATABASE_URL!).pathname, /test/);
  const suffix = randomUUID().slice(0, 8);
  const unit = await prisma.businessUnit.create({ data: { code: `dc-${suffix}`, name: 'Decision test' } });
  const password = await hashPassword('test-decisions-only');
  const pm = await prisma.user.create({ data: { email: `pm-${suffix}@example.test`, name: 'РП', role: 'PROJECT_MANAGER', passwordHash: password } });
  const sponsor = await prisma.user.create({ data: { email: `sp-${suffix}@example.test`, name: 'Спонсор', role: 'EXECUTIVE_VIEWER', passwordHash: password } });
  const base = { businessUnitId: unit.id, portfolio: 'TEST', sponsor: 'Test', projectManager: 'Test', startDate: day('2026-10-01'), targetDate: day('2026-12-01'), budgetPlanned: 0, budgetForecast: 0, summary: '' };
  const project = await prisma.project.create({ data: { ...base, code: `DC-${suffix}`, name: 'Decisions' } });
  const other = await prisma.project.create({ data: { ...base, code: `DO-${suffix}`, name: 'Other' } });
  await prisma.projectAccess.create({ data: { projectId: project.id, userId: pm.id, level: 'EDIT' } });
  const issue = await prisma.issue.create({ data: { projectId: project.id, source: 'INTERNAL', impact: '', title: 'Кто платит', owner: 'РП', severity: 'CRITICAL', readiness: 'RED', status: 'Open' } as never });
  const foreignIssue = await prisma.issue.create({ data: { projectId: other.id, source: 'INTERNAL', impact: '', title: 'Чужой', owner: '', severity: 'LOW', readiness: 'GREEN', status: 'Open' } as never });

  const previousProfile = process.env.DEPLOYMENT_PROFILE;
  process.env.DEPLOYMENT_PROFILE = 'cloud';
  const server = createApp().listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const address = server.address();
  assert(address && typeof address !== 'string');
  const baseUrl = `http://127.0.0.1:${address.port}`;
  const session = async (email: string) => {
    const login = await fetch(`${baseUrl}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: 'test-decisions-only' }) });
    assert.equal(login.status, 200);
    const cookie = login.headers.getSetCookie().map((value) => value.split(';')[0]).join('; ');
    return (path: string, method = 'GET', body?: unknown) =>
      fetch(baseUrl + path, { method, headers: { Cookie: cookie, 'x-business-unit-id': unit.id, 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  };
  try {
    const asPm = await session(pm.email);
    const asSponsor = await session(sponsor.email);

    assert.equal((await asPm(`/api/projects/${project.id}/decisions`, 'POST', { title: 'Чужая ссылка', issueId: foreignIssue.id })).status, 400);
    const created = await asPm(`/api/projects/${project.id}/decisions`, 'POST', { title: 'Платит заказчик', context: 'Спор о доставке', issueId: issue.id });
    assert.equal(created.status, 201, await created.clone().text());
    const draft = await created.json();
    assert.equal(draft.status, 'PROPOSED');

    const edited = await asPm(`/api/decisions/${draft.id}`, 'PATCH', { decision: 'Доставку оплачивает заказчик', expectedVersion: 1 });
    assert.equal(edited.status, 200);
    assert.equal((await asPm(`/api/decisions/${draft.id}`, 'PATCH', { decision: 'Старая версия', expectedVersion: 1 })).status, 409);

    assert.equal((await asSponsor(`/api/projects/${project.id}/decisions`, 'POST', { title: 'Спонсор не пишет' })).status, 403);
    const requested = await asPm(`/api/decisions/${draft.id}/request-approval`, 'POST', { approverUserId: sponsor.id, expectedVersion: 2 });
    assert.equal(requested.status, 200, await requested.clone().text());

    assert.equal((await asPm(`/api/decisions/${draft.id}/answer`, 'POST', { verdict: 'APPROVE', comment: 'Сам себе', expectedVersion: 3 })).status, 403);
    const waiting = await (await asSponsor('/api/decisions/awaiting-me')).json();
    assert.deepEqual(waiting.map((row: { id: string }) => row.id), [draft.id]);
    assert.equal((await asSponsor(`/api/decisions/${draft.id}/answer`, 'POST', { verdict: 'APPROVE', comment: '' , expectedVersion: 3 })).status, 400);

    // Two answers at once: exactly one wins.
    const answers = await Promise.all([
      asSponsor(`/api/decisions/${draft.id}/answer`, 'POST', { verdict: 'APPROVE', comment: 'Согласовано', expectedVersion: 3 }),
      asSponsor(`/api/decisions/${draft.id}/answer`, 'POST', { verdict: 'REJECT', comment: 'Нет', expectedVersion: 3 }),
    ]);
    assert.deepEqual(answers.map((answer) => answer.status).sort(), [200, 409]);
    const approved = await prisma.decision.findUniqueOrThrow({ where: { id: draft.id } });
    assert.ok(approved.status === 'APPROVED' || approved.status === 'REJECTED');

    if (approved.status === 'APPROVED') {
      const replacing = await asPm(`/api/projects/${project.id}/decisions`, 'POST', {
        title: 'Платим пополам',
        decision: 'Доставку делим пополам',
        mode: 'RECORD',
        decidedBy: 'Комитет',
        decidedAt: '2026-10-05',
        supersedesId: draft.id,
      });
      assert.equal(replacing.status, 201, await replacing.clone().text());
      assert.equal((await prisma.decision.findUniqueOrThrow({ where: { id: draft.id } })).status, 'SUPERSEDED');
      assert.equal(await prisma.auditEvent.count({ where: { objectId: draft.id, action: 'decision.supersede' } }), 1);
      assert.equal(
        (await asPm(`/api/projects/${project.id}/decisions`, 'POST', { title: 'Снова', decision: 'x', mode: 'RECORD', decidedBy: 'Комитет', decidedAt: '2026-10-06', supersedesId: draft.id })).status,
        409,
      );
    }

    // Search by decisions finds issues that need one by criticality and readiness, and only them.
    await prisma.issue.create({ data: { projectId: project.id, source: 'INTERNAL', impact: '', title: 'Кто платит поменьше', owner: '', severity: 'LOW', readiness: 'GREEN', status: 'Open' } as never });
    const found = await (await asPm(`/api/search?q=${encodeURIComponent('Кто платит')}&types=decision&projectId=${project.id}`)).json();
    const titles = JSON.stringify(found);
    assert.match(titles, /Кто платит"/);
    assert.doesNotMatch(titles, /Кто платит поменьше/);

    assert.equal((await asPm(`/api/decisions/${draft.id}`, 'DELETE')).status, 409);
    const scratch = await (await asPm(`/api/projects/${project.id}/decisions`, 'POST', { title: 'Черновик на удаление' })).json();
    assert.equal((await asPm(`/api/decisions/${scratch.id}`, 'DELETE')).status, 204);
    const actions = (await prisma.auditEvent.findMany({ where: { projectId: project.id, action: { startsWith: 'decision.' } }, select: { action: true } })).map((row) => row.action).sort();
    assert.ok(actions.includes('decision.request') && actions.includes('decision.delete'), actions.join());
  } finally {
    server.close();
    process.env.DEPLOYMENT_PROFILE = previousProfile;
    await prisma.project.deleteMany({ where: { id: { in: [project.id, other.id] } } }).catch(() => undefined);
    await prisma.user.deleteMany({ where: { id: { in: [pm.id, sponsor.id] } } }).catch(() => undefined);
  }
});
