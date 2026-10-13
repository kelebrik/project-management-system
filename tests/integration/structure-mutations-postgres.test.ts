import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { prisma } from '../../apps/api/src/db.js';
import { createApp } from '../../apps/api/src/server/app.js';
import { hashPassword } from '../../apps/api/src/server/auth.js';
import { Prisma } from '@prisma/client';
import { mutationPayloadHash, runAsStructureMutation, settleReceipt } from '../../apps/api/src/services/structure-mutations.js';
import { runStructureWrite } from '../../apps/api/src/services/wbs-structure-write.js';

// A Structure write sent again with its mutation id is answered with its
// first outcome and never runs twice, whatever happened in between.

const enabled = process.env.WORKFLOW_TEST_DATABASE === 'true';
const day = (value: string) => new Date(`${value}T00:00:00.000Z`);

test('a Structure write sent again with its mutation id runs once and is answered the same', { skip: !enabled }, async () => {
  assert.match(new URL(process.env.DATABASE_URL!).pathname, /test/);
  const suffix = randomUUID().slice(0, 8);
  const unit = await prisma.businessUnit.create({ data: { code: `sm-${suffix}`, name: 'Structure mutations' } });
  const password = await hashPassword('test-structure-mutations');
  const pm = await prisma.user.create({ data: { email: `sm-${suffix}@example.test`, name: 'РП', role: 'PROJECT_MANAGER', passwordHash: password } });
  const base = { businessUnitId: unit.id, portfolio: 'TEST', sponsor: 'Test', projectManager: 'Test', startDate: day('2026-10-01'), targetDate: day('2026-12-01'), budgetPlanned: 0, budgetForecast: 0, summary: '' };
  const project = await prisma.project.create({ data: { ...base, code: `SM-${suffix}`, name: 'Mutations' } });
  const gone = await prisma.project.create({ data: { ...base, code: `SG-${suffix}`, name: 'Gone' } });
  for (const id of [project.id, gone.id]) await prisma.projectAccess.create({ data: { projectId: id, userId: pm.id, level: 'EDIT' } });
  const phase = await prisma.wbsItem.create({ data: { projectId: project.id, code: '1', title: 'Фаза', type: 'PHASE', status: 'NOT_STARTED', owner: '', wbsLevel: 1, sortOrder: 10 } });

  const previousProfile = process.env.DEPLOYMENT_PROFILE;
  process.env.DEPLOYMENT_PROFILE = 'cloud';
  const server = createApp().listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const address = server.address();
  assert(address && typeof address !== 'string');
  const baseUrl = `http://127.0.0.1:${address.port}`;
  let cookie = '';
  const send = (path: string, method: string, body: unknown, mutationId?: string) =>
    fetch(baseUrl + path, {
      method,
      headers: { Cookie: cookie, 'x-business-unit-id': unit.id, 'Content-Type': 'application/json', 'X-PMS-Structure-Delta': '2', ...(mutationId ? { 'X-PMS-Mutation-Id': mutationId } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(30_000),
    });
  const receipt = (mutationId: string) => prisma.structureMutationReceipt.findUnique({ where: { userId_mutationId: { userId: pm.id, mutationId } } });
  const rows = () => prisma.wbsItem.count({ where: { projectId: project.id } });

  try {
    const login = await fetch(`${baseUrl}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: pm.email, password: 'test-structure-mutations' }) });
    assert.equal(login.status, 200);
    cookie = login.headers.getSetCookie().map((value) => value.split(';')[0]).join('; ');
    // The same row added twice under one id: one row, the same answer, the second marked as a repeat.
    const addId = randomUUID();
    const add = { code: '1.1', title: 'Работа', type: 'TASK', status: 'NOT_STARTED', owner: '', parentId: phase.id, wbsLevel: 2 };
    const first = await send(`/api/projects/${project.id}/wbs-items`, 'POST', add, addId);
    assert.ok(first.status < 300, await first.clone().text());
    const firstBody = await first.json();
    const version = first.headers.get('X-PMS-Structure-Version');
    assert.ok(version);
    const again = await send(`/api/projects/${project.id}/wbs-items`, 'POST', add, addId);
    assert.equal(again.status, first.status);
    assert.equal(again.headers.get('X-PMS-Mutation-Replayed'), '1');
    assert.equal(again.headers.get('X-PMS-Structure-Version'), version);
    assert.equal(again.headers.get('X-PMS-Structure'), first.headers.get('X-PMS-Structure'));
    assert.deepEqual(await again.json(), firstBody);
    assert.equal(await rows(), 2);
    assert.equal((await receipt(addId))?.state, 'COMMITTED');

    // The same id for another request is refused, and nothing runs.
    const reused = await send(`/api/projects/${project.id}/wbs-items`, 'POST', { ...add, title: 'Другая' }, addId);
    assert.equal(reused.status, 409);
    assert.equal((await reused.json()).code, 'MUTATION_ID_REUSED');
    assert.equal(await rows(), 2);

    // Two deletions of one row at once under one id: both answered as deleted, none with "not found".
    const task = await prisma.wbsItem.create({ data: { projectId: project.id, parentId: phase.id, code: '1.9', title: 'Удаляемая', type: 'TASK', status: 'NOT_STARTED', owner: '', wbsLevel: 2, sortOrder: 90 } });
    const deleteId = randomUUID();
    const deletions = await Promise.all([1, 2].map(() => send(`/api/wbs-items/${task.id}`, 'DELETE', undefined, deleteId)));
    assert.deepEqual(deletions.map((answer) => answer.status), [deletions[0]!.status, deletions[0]!.status]);
    assert.ok(deletions[0]!.status < 300, await deletions[0]!.clone().text());
    assert.equal(deletions.filter((answer) => answer.headers.get('X-PMS-Mutation-Replayed') === '1').length, 1);
    // Sent again later, when the row is long gone: still the deletion's answer.
    const late = await send(`/api/wbs-items/${task.id}`, 'DELETE', undefined, deleteId);
    assert.equal(late.status, deletions[0]!.status);

    // A refusal for a closed project stays a refusal after the project opens again.
    await prisma.project.update({ where: { id: project.id }, data: { status: 'CLOSED' } });
    const closedId = randomUUID();
    const closedAdd = { ...add, code: '1.5' };
    const closed = await send(`/api/projects/${project.id}/wbs-items`, 'POST', closedAdd, closedId);
    assert.equal(closed.status, 423);
    assert.equal((await closed.json()).code, 'PROJECT_CLOSED');
    assert.equal((await receipt(closedId))?.state, 'TERMINAL');
    await prisma.project.update({ where: { id: project.id }, data: { status: 'ACTIVE' } });
    const refusedAgain = await send(`/api/projects/${project.id}/wbs-items`, 'POST', closedAdd, closedId);
    assert.equal(refusedAgain.status, 423);
    assert.equal(await rows(), 2);

    // A claim left by a request that died is taken over; a claim still alive is waited for, not run twice.
    const staleId = randomUUID();
    const stalePayload = { ...add, code: '1.3', title: 'После сбоя' };
    await prisma.structureMutationReceipt.create({ data: { userId: pm.id, mutationId: staleId, method: 'POST', path: `/projects/${project.id}/wbs-items`, payloadHash: mutationPayloadHash('POST', `/projects/${project.id}/wbs-items`, stalePayload), state: 'IN_PROGRESS', claimToken: 'dead', claimedAt: new Date(Date.now() - 10 * 60_000) } });
    const takenOver = await send(`/api/projects/${project.id}/wbs-items`, 'POST', stalePayload, staleId);
    assert.ok(takenOver.status < 300, await takenOver.clone().text());
    assert.equal(await rows(), 3);
    const taken = await receipt(staleId);
    assert.equal(taken?.state, 'COMMITTED');
    assert.notEqual(taken?.claimToken, 'dead');

    // A transaction whose claim was taken over writes nothing.
    const lostId = randomUUID();
    await prisma.structureMutationReceipt.create({ data: { userId: pm.id, mutationId: lostId, method: 'POST', path: '/x', payloadHash: 'x', state: 'IN_PROGRESS', claimToken: 'theirs' } });
    await assert.rejects(runAsStructureMutation(
      { userId: pm.id, mutationId: lostId, claimToken: 'mine', projectId: null, committed: false, commitVersion: null, pendingCommitVersion: null, closed: false },
      () => runStructureWrite(project.id, (db) => db.wbsItem.update({ where: { id: phase.id }, data: { title: 'Не должно сохраниться' } })),
    ));
    assert.equal((await prisma.wbsItem.findUniqueOrThrow({ where: { id: phase.id } })).title, 'Фаза');

    // A committed write whose answer was kept only in part is answered with that part, marked for the page to catch up.
    await prisma.structureMutationReceipt.update({ where: { userId_mutationId: { userId: pm.id, mutationId: addId } }, data: { outcomeComplete: false } });
    const partial = await send(`/api/projects/${project.id}/wbs-items`, 'POST', add, addId);
    assert.equal(partial.status, first.status);
    assert.equal(partial.headers.get('X-PMS-Mutation-Incomplete'), '1');
    assert.equal(partial.headers.get('X-PMS-Structure-Project'), project.id);
    assert.equal(partial.headers.get('X-PMS-Structure-Version'), version);
    assert.equal(partial.headers.get('X-PMS-Structure'), null);
    const { structureDelta: _changes, ...firstWithoutChanges } = firstBody;
    assert.deepEqual(await partial.json(), firstWithoutChanges);
    // With nothing kept, only its version.
    await prisma.structureMutationReceipt.update({ where: { userId_mutationId: { userId: pm.id, mutationId: addId } }, data: { outcome: Prisma.DbNull } });
    const bare = await send(`/api/projects/${project.id}/wbs-items`, 'POST', add, addId);
    assert.equal(bare.status, 200);
    assert.equal(bare.headers.get('X-PMS-Mutation-Incomplete'), '1');
    assert.deepEqual(await bare.json(), { replayed: true, incomplete: true, projectId: project.id, structureVersion: version });

    // A request that lost its claim does not send its own refusal: the mutation's outcome goes instead, as any repeat.
    const handedId = randomUUID();
    const handedPayload = { ...add, code: '1.4', title: 'Перехвачено' };
    await prisma.structureMutationReceipt.create({ data: { userId: pm.id, mutationId: handedId, method: 'POST', path: `/projects/${project.id}/wbs-items`, payloadHash: mutationPayloadHash('POST', `/projects/${project.id}/wbs-items`, handedPayload), state: 'IN_PROGRESS', claimToken: 'old-owner', claimedAt: new Date(Date.now() - 10 * 60_000) } });
    const newOwner = await send(`/api/projects/${project.id}/wbs-items`, 'POST', handedPayload, handedId);
    assert.ok(newOwner.status < 300, await newOwner.clone().text());
    const headers = new Map<string, string>();
    const oldAnswer: any = {
      statusCode: 423,
      getHeader: (name: string) => headers.get(name.toLowerCase()) ?? (name.toLowerCase() === 'content-type' ? 'application/json' : undefined),
      setHeader: (name: string, value: string) => headers.set(name.toLowerCase(), value),
      removeHeader: (name: string) => headers.delete(name.toLowerCase()),
    };
    const replacement = await settleReceipt(prisma, { get: () => undefined } as never, oldAnswer, { userId: pm.id, mutationId: handedId, claimToken: 'old-owner', projectId: project.id, committed: false, commitVersion: null, pendingCommitVersion: null, closed: false }, JSON.stringify({ error: 'closed', code: 'PROJECT_CLOSED' }), async () => true);
    assert.equal(oldAnswer.statusCode, newOwner.status);
    assert.equal(headers.get('x-pms-mutation-replayed'), '1');
    assert.equal(headers.get('x-pms-structure-version'), newOwner.headers.get('X-PMS-Structure-Version'));
    assert.deepEqual(JSON.parse(String(replacement)), await newOwner.json());
    assert.equal((await receipt(handedId))?.state, 'COMMITTED');

    // A repeat to someone who can no longer read the project tells nothing of it.
    const goneId = randomUUID();
    const goneAdd = await send(`/api/projects/${gone.id}/wbs-items`, 'POST', { ...add, code: '1', parentId: null, wbsLevel: 1, type: 'PHASE' }, goneId);
    assert.ok(goneAdd.status < 300, await goneAdd.clone().text());
    await prisma.project.delete({ where: { id: gone.id } });
    assert.equal((await send(`/api/projects/${gone.id}/wbs-items`, 'POST', { ...add, code: '1', parentId: null, wbsLevel: 1, type: 'PHASE' }, goneId)).status, 404);

    // A write kept on a device for someone else is not run under this session.
    const elsewhereId = randomUUID();
    const elsewhere = await fetch(`${baseUrl}/api/projects/${project.id}/wbs-items`, {
      method: 'POST',
      headers: { Cookie: cookie, 'x-business-unit-id': unit.id, 'Content-Type': 'application/json', 'X-PMS-Mutation-Id': elsewhereId, 'X-PMS-Expected-User': 'someone-else' },
      body: JSON.stringify({ ...add, code: '1.8' }),
    });
    assert.equal(elsewhere.status, 401);
    assert.equal((await elsewhere.json()).code, 'SESSION_USER_MISMATCH');
    assert.equal(await receipt(elsewhereId), null);

    // Without an id nothing is kept: two sends make two rows.
    const before = await rows();
    await send(`/api/projects/${project.id}/wbs-items`, 'POST', { ...add, code: '1.6' });
    await send(`/api/projects/${project.id}/wbs-items`, 'POST', { ...add, code: '1.7' });
    assert.equal(await rows(), before + 2);
  } finally {
    server.close();
    process.env.DEPLOYMENT_PROFILE = previousProfile;
    await prisma.structureMutationReceipt.deleteMany({ where: { userId: pm.id } });
    await prisma.auditEvent.deleteMany({ where: { projectId: { in: [project.id, gone.id] } } });
    await prisma.project.deleteMany({ where: { id: { in: [project.id, gone.id] } } });
    await prisma.user.delete({ where: { id: pm.id } }).catch(() => undefined);
    await prisma.businessUnit.delete({ where: { id: unit.id } }).catch(() => undefined);
  }
});
