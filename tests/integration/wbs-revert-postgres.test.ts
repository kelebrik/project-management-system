import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import type { Router } from 'express';
import { prisma } from '../../apps/api/src/db.js';
import { createApp } from '../../apps/api/src/server/app.js';
import { hashPassword } from '../../apps/api/src/server/auth.js';
import { registerWbsDependencyRoutes } from '../../apps/api/src/routes/wbs/dependencies.routes.js';
import { registerWbsItemOrderRoutes } from '../../apps/api/src/routes/wbs/item-order.routes.js';
import { registerWbsItemRoutes } from '../../apps/api/src/routes/wbs/items.routes.js';
import { registerWbsRevertRoutes } from '../../apps/api/src/routes/wbs/revert.routes.js';
import { recalculateProjectWbsSchedule } from '../../apps/api/src/services/wbs-schedule.js';
import { readStructureVersion } from '../../apps/api/src/services/wbs-structure-write.js';
import { restoreWbsTombstone } from '../../apps/api/src/services/wbs-tombstones.js';
import { getProjectWbsSnapshot, syncWbsPredecessorFields } from '../../apps/api/src/services/wbs.js';

const enabled = process.env.WORKFLOW_TEST_DATABASE === 'true';
type Row = Record<string, unknown> & { id: string };
type Delta = { version: string; items: Row[]; deletedItemIds: string[]; dependencies: Row[]; deletedDependencyIds: string[] };

async function fixture() {
  const suffix = randomUUID().slice(0, 8);
  const unit = await prisma.businessUnit.create({ data: { code: `rv-${suffix}`, name: 'Revert' } });
  const project = await prisma.project.create({ data: { businessUnitId: unit.id, code: `RV-${suffix}`, name: 'Revert', portfolio: 'T', sponsor: 'T', projectManager: 'T', startDate: new Date('2026-10-01'), targetDate: new Date('2026-12-01'), budgetPlanned: 0, budgetForecast: 0, summary: '' } });
  const phase = await prisma.wbsItem.create({ data: { projectId: project.id, code: '1', title: 'Фаза', type: 'PHASE', status: 'NOT_STARTED', owner: '', wbsLevel: 1, sortOrder: 10 } });
  const tasks = [];
  for (let index = 1; index <= 4; index += 1) {
    tasks.push(await prisma.wbsItem.create({ data: { projectId: project.id, parentId: phase.id, code: `1.${index}`, title: `Работа ${index}`, type: 'TASK', status: 'NOT_STARTED', owner: 'Анна', startDate: new Date('2026-10-05'), dueDate: new Date('2026-10-09'), workDays: 5, wbsLevel: 2, sortOrder: 10 + index * 10 } }));
  }
  await prisma.wbsDependency.create({ data: { projectId: project.id, predecessorId: tasks[0]!.id, successorId: tasks[1]!.id, type: 'FS' } });
  // As the link routes leave it: the predecessor codes on the row, and the schedule.
  await syncWbsPredecessorFields(project.id);
  await recalculateProjectWbsSchedule(project.id);
  return {
    project, phase, tasks,
    async cleanup() {
      await prisma.auditEvent.deleteMany({ where: { projectId: project.id } });
      await prisma.project.delete({ where: { id: project.id } });
      await prisma.businessUnit.delete({ where: { id: unit.id } });
    },
  };
}

function routes() {
  const found = new Map<string, Function>();
  const router = new Proxy({}, { get: (_t, verb) => (path: string, ...callbacks: Function[]) => { found.set(`${String(verb)} ${path}`, callbacks.at(-1)!); } }) as unknown as Router;
  registerWbsItemRoutes(router);
  registerWbsDependencyRoutes(router, { serverErrorMessage: (error, fallback) => (error instanceof Error ? error.message : fallback) });
  registerWbsItemOrderRoutes(router);
  registerWbsRevertRoutes(router);
  return (key: string) => found.get(key)!;
}

async function call(handler: Function, params: Record<string, string>, body: unknown) {
  const res: any = { statusCode: 200, body: undefined, status(code: number) { this.statusCode = code; return this; }, json(value: unknown) { this.body = value; return this; }, setHeader() {} };
  await handler({ params, body: JSON.parse(JSON.stringify(body)), ip: '127.0.0.1', headers: {}, get: (name: string) => (name.toLowerCase() === 'x-pms-structure-delta' ? '1' : undefined) }, res);
  return res;
}

const plain = (value: unknown) => JSON.parse(JSON.stringify(value));
/** The Structure without write and closing times, which an undo may restamp. */
async function structure(projectId: string) {
  const snapshot = plain(await getProjectWbsSnapshot(projectId));
  const strip = (row: Row) => { const { updatedAt, createdAt, closedAt, ...rest } = row; void updatedAt; void createdAt; void closedAt; return rest; };
  return {
    items: (snapshot.wbsItems as Row[]).map(strip).sort((a, b) => String(a.id).localeCompare(String(b.id))),
    links: (snapshot.wbsDependencies as Row[]).map((link) => ({ id: link.id, predecessorId: link.predecessorId, successorId: link.successorId, type: link.type, lagDays: link.lagDays })).sort((a, b) => String(a.id).localeCompare(String(b.id))),
  };
}

/** An undo step as the browser builds it: the rows and links a change wrote, as they were and as it left them. */
function step(before: { wbsItems: Row[]; wbsDependencies: Row[] }, delta: Delta) {
  const itemsBefore = new Map(before.wbsItems.map((row) => [row.id, row]));
  const linksBefore = new Map(before.wbsDependencies.map((row) => [row.id, row]));
  const link = (row: Row) => ({ id: row.id, predecessorId: row.predecessorId, successorId: row.successorId, type: row.type, lagDays: row.lagDays, createdAt: row.createdAt });
  const items = [...delta.items.map((row) => ({ id: row.id, before: itemsBefore.get(row.id) ?? null, after: row as Row | null })), ...delta.deletedItemIds.map((id) => ({ id, before: itemsBefore.get(id)!, after: null }))];
  const links = [...delta.dependencies.map((row) => ({ id: row.id, before: linksBefore.has(row.id) ? link(linksBefore.get(row.id)!) : null, after: link(row) as Row | null })), ...delta.deletedDependencyIds.map((id) => ({ id, before: link(linksBefore.get(id)!), after: null }))];
  return { afterVersion: delta.version, items, links };
}

function revertBody(change: ReturnType<typeof step>, baseVersion = change.afterVersion) {
  return {
    baseVersion,
    put: { items: change.items.filter((entry) => entry.before).map((entry) => entry.before), links: change.links.filter((entry) => entry.before).map((entry) => entry.before) },
    remove: { itemIds: change.items.filter((entry) => !entry.before).map((entry) => entry.id), linkIds: change.links.filter((entry) => !entry.before).map((entry) => entry.id) },
    expect: {
      items: change.items.filter((entry) => entry.after).map((entry) => entry.after),
      absentItemIds: change.items.filter((entry) => !entry.after).map((entry) => entry.id),
      links: change.links.filter((entry) => entry.after).map((entry) => entry.after),
      absentLinkIds: change.links.filter((entry) => !entry.after).map((entry) => entry.id),
    },
  };
}

/** Makes a change through its route and answers the undo step it leaves. */
async function change(projectId: string, run: () => Promise<any>) {
  const before = plain(await getProjectWbsSnapshot(projectId));
  const res = await run();
  assert.ok(res.statusCode < 300, `change answered ${res.statusCode}: ${JSON.stringify(res.body)}`);
  return step(before, plain(res.body.structureDelta));
}

async function revert(projectId: string, body: unknown) {
  return call(routes()('post /projects/:projectId/wbs-snapshot/revert'), { projectId }, body);
}

test('each kind of change is undone to the Structure before it, and redone from what the undo answered', { skip: !enabled }, async () => {
  const route = routes();
  const { project, phase, tasks, cleanup } = await fixture();
  try {
    const id = project.id;
    const changes: Array<() => Promise<any>> = [
      () => call(route('patch /wbs-items/:itemId'), { itemId: tasks[0]!.id }, { workDays: 9, scheduleDriver: 'workDays' }),
      () => call(route('patch /wbs-items/:itemId'), { itemId: tasks[2]!.id }, { dueDate: '2026-10-20T00:00:00.000Z', scheduleDriver: 'dates' }),
      () => call(route('patch /wbs-items/:itemId'), { itemId: tasks[3]!.id }, { status: 'DONE' }),
      () => call(route('post /projects/:projectId/wbs-items/insert-after'), { projectId: id }, { afterItemId: tasks[0]!.id }),
      () => call(route('post /projects/:projectId/wbs-dependencies'), { projectId: id }, { predecessorId: tasks[2]!.id, successorId: tasks[3]!.id, type: 'FS', lagDays: 2 }),
      () => call(route('delete /wbs-items/:itemId'), { itemId: tasks[1]!.id }, {}),
      () => call(route('delete /projects/:projectId/wbs-items'), { projectId: id }, { itemIds: [tasks[2]!.id, tasks[3]!.id] }),
      async () => {
        const order = (await prisma.wbsItem.findMany({ where: { projectId: id }, orderBy: { sortOrder: 'asc' } })).map((row) => row.id);
        return call(route('post /projects/:projectId/wbs-items/reorder'), { projectId: id }, { orderedIds: [order[0], ...order.slice(1).reverse()] });
      },
    ];
    for (const run of changes) {
      const original = await structure(id);
      const undoStep = await change(id, run);
      const changed = await structure(id);
      const beforeUndo = plain(await getProjectWbsSnapshot(id));
      const undone = await revert(id, revertBody(undoStep));
      assert.equal(undone.statusCode, 200, JSON.stringify(undone.body));
      assert.deepEqual(await structure(id), original);
      // Redo is built from what the undo answered, like any change.
      const redoStep = step(beforeUndo, plain(undone.body.structureDelta));
      const redone = await revert(id, revertBody(redoStep));
      assert.equal(redone.statusCode, 200, JSON.stringify(redone.body));
      assert.deepEqual(await structure(id), changed);
    }
    void phase;
  } finally {
    await cleanup();
  }
});

test('steps are undone in reverse order; without other writes there is no recalculation', { skip: !enabled }, async () => {
  const route = routes();
  const { project, tasks, cleanup } = await fixture();
  try {
    const id = project.id;
    const original = await structure(id);
    const first = await change(id, () => call(route('patch /wbs-items/:itemId'), { itemId: tasks[0]!.id }, { workDays: 7, scheduleDriver: 'workDays' }));
    const afterFirst = await structure(id);
    const second = await change(id, () => call(route('post /projects/:projectId/wbs-items/insert-after'), { projectId: id }, { afterItemId: tasks[0]!.id }));
    const fast = await revert(id, revertBody(second));
    assert.equal(fast.statusCode, 200);
    assert.deepEqual(await structure(id), afterFirst);
    const fastCommand = await prisma.wbsCommand.findFirstOrThrow({ where: { projectId: id, structureVersion: BigInt(fast.body.structureVersion), commandOrdinal: 0 } });
    assert.equal((fastCommand.payload as { recalculated: boolean }).recalculated, false);
    // The first step is older than the project now, so the plan is recalculated around it; its rows still match.
    const slow = await revert(id, revertBody(first));
    assert.equal(slow.statusCode, 200, JSON.stringify(slow.body));
    assert.deepEqual(await structure(id), original);
  } finally {
    await cleanup();
  }
});

test("someone else's edit of a row of the step blocks the undo; an edit elsewhere does not", { skip: !enabled }, async () => {
  const route = routes();
  const { project, phase, tasks, cleanup } = await fixture();
  try {
    const id = project.id;
    const mine = await change(id, () => call(route('patch /wbs-items/:itemId'), { itemId: tasks[2]!.id }, { title: 'Моё название' }));
    // A colleague renames the same row: nothing is written, the codes are named.
    await call(route('patch /wbs-items/:itemId'), { itemId: tasks[2]!.id }, { title: 'Название коллеги' });
    const before = await structure(id);
    const refused = await revert(id, revertBody(mine));
    assert.equal(refused.statusCode, 409);
    assert.equal(refused.body.code, 'UNDO_CONFLICT');
    assert.deepEqual(refused.body.codes, ['1.3']);
    assert.deepEqual(await structure(id), before);
    // Sending the current version instead of the step's does not skip the check.
    const sly = await revert(id, revertBody(mine, await readStructureVersion(id)));
    assert.equal(sly.statusCode, 409);

    const other = await change(id, () => call(route('patch /wbs-items/:itemId'), { itemId: tasks[3]!.id }, { owner: 'Пётр' }));
    await call(route('patch /wbs-items/:itemId'), { itemId: phase.id }, { owner: 'Коллега' });
    const passed = await revert(id, revertBody(other));
    assert.equal(passed.statusCode, 200, JSON.stringify(passed.body));
    assert.equal((await prisma.wbsItem.findUniqueOrThrow({ where: { id: tasks[3]!.id } })).owner, 'Анна');
    assert.equal((await prisma.wbsItem.findUniqueOrThrow({ where: { id: phase.id } })).owner, 'Коллега');
  } finally {
    await cleanup();
  }
});

test('a plan that was out of step before the change comes back as it was, unless others wrote since', { skip: !enabled }, async () => {
  const route = routes();
  const { project, phase, tasks, cleanup } = await fixture();
  try {
    const id = project.id;
    // Five working days on the row, but dates that say otherwise: an old, never recalculated state.
    await prisma.wbsItem.update({ where: { id: tasks[3]!.id }, data: { workDays: 2 } });
    const original = await structure(id);
    const quick = await change(id, () => call(route('patch /wbs-items/:itemId'), { itemId: tasks[3]!.id }, { dueDate: '2026-10-21T00:00:00.000Z', scheduleDriver: 'dates' }));
    assert.equal((await revert(id, revertBody(quick))).statusCode, 200);
    assert.deepEqual(await structure(id), original);

    const slow = await change(id, () => call(route('patch /wbs-items/:itemId'), { itemId: tasks[3]!.id }, { dueDate: '2026-10-21T00:00:00.000Z', scheduleDriver: 'dates' }));
    await call(route('patch /wbs-items/:itemId'), { itemId: phase.id }, { owner: 'Коллега' });
    const before = await structure(id);
    const refused = await revert(id, revertBody(slow));
    assert.equal(refused.statusCode, 409, 'the recalculation would move the row put back');
    assert.deepEqual(await structure(id), before);
  } finally {
    await cleanup();
  }
});

test('a new row others hang on is not removed by undo, and undone deletions settle their tombstone', { skip: !enabled }, async () => {
  const route = routes();
  const { project, tasks, cleanup } = await fixture();
  try {
    const id = project.id;
    const inserted = await change(id, () => call(route('post /projects/:projectId/wbs-items/insert-after'), { projectId: id }, { afterItemId: tasks[0]!.id }));
    const newRow = inserted.items.find((entry) => !entry.before)!.id;
    await prisma.raciAssignment.create({ data: { projectId: id, wbsItemId: newRow, personKey: 'p1', personName: 'Пётр', role: 'R' } });
    const refused = await revert(id, revertBody(inserted));
    assert.equal(refused.statusCode, 409);
    assert.ok(await prisma.wbsItem.findUnique({ where: { id: newRow } }));
    await prisma.raciAssignment.deleteMany({ where: { wbsItemId: newRow } });

    const deleted = await change(id, () => call(route('delete /wbs-items/:itemId'), { itemId: tasks[3]!.id }, {}));
    const tombstone = await prisma.wbsTombstone.findFirstOrThrow({ where: { projectId: id }, orderBy: { createdAt: 'desc' } });
    const beforeUndo = plain(await getProjectWbsSnapshot(id));
    const undone = await revert(id, revertBody(deleted));
    assert.equal(undone.statusCode, 200);
    assert.ok((await prisma.wbsTombstone.findUniqueOrThrow({ where: { id: tombstone.id } })).restoredAt, 'the row is back, so its tombstone is used up');
    // Redo deletes it again and leaves a fresh tombstone an administrator can restore.
    const redo = await revert(id, revertBody(step(beforeUndo, plain(undone.body.structureDelta))));
    assert.equal(redo.statusCode, 200);
    assert.equal(await prisma.wbsTombstone.count({ where: { projectId: id, restoredAt: null } }), 1);
  } finally {
    await cleanup();
  }
});

test('undo needs the right to change the project, an open project, and accepts a large step', { skip: !enabled }, async () => {
  const { project, tasks, cleanup } = await fixture();
  const suffix = randomUUID().slice(0, 8);
  const password = await hashPassword('test-revert-only');
  const reader = await prisma.user.create({ data: { email: `rd-${suffix}@example.test`, name: 'Читатель', role: 'EXECUTIVE_VIEWER', passwordHash: password } });
  const admin = await prisma.user.create({ data: { email: `ad-${suffix}@example.test`, name: 'Админ', role: 'ADMIN', passwordHash: password } });
  process.env.DEPLOYMENT_PROFILE = 'cloud';
  const server = createApp().listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const address = server.address();
  assert(address && typeof address !== 'string');
  const url = `http://127.0.0.1:${address.port}`;
  const session = async (email: string) => {
    const login = await fetch(`${url}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: 'test-revert-only' }) });
    const cookie = login.headers.getSetCookie().map((value) => value.split(';')[0]).join('; ');
    return (body: unknown) => fetch(`${url}/api/projects/${project.id}/wbs-snapshot/revert`, { method: 'POST', headers: { Cookie: cookie, 'x-business-unit-id': project.businessUnitId, 'Content-Type': 'application/json', 'X-PMS-Structure-Delta': '1' }, body: JSON.stringify(body) });
  };
  try {
    const route = routes();
    const renamed = await change(project.id, () => call(route('patch /wbs-items/:itemId'), { itemId: tasks[0]!.id }, { title: 'Новое' }));
    assert.equal((await (await session(reader.email))(revertBody(renamed))).status, 403);
    // Over the 5 MB every other request is held to: the step's own limit is larger.
    const large = revertBody(renamed) as { put: { items: Array<Record<string, unknown>> } };
    large.put.items[0]!.description = 'x'.repeat(6 * 1024 * 1024);
    const asAdmin = await session(admin.email);
    assert.notEqual((await asAdmin(large)).status, 413);
    await prisma.project.update({ where: { id: project.id }, data: { status: 'CLOSED' } });
    assert.equal((await asAdmin(revertBody(renamed))).status, 423);
  } finally {
    server.close();
    await prisma.user.deleteMany({ where: { id: { in: [reader.id, admin.id] } } });
    await cleanup();
  }
});

test("undo leaves others' links, labels and projects alone, and puts rows and links back with their creation time", { skip: !enabled }, async () => {
  const route = routes();
  const mine = await fixture();
  const other = await fixture();
  try {
    const id = mine.project.id;
    // A colleague links the row my step created: removing it would take their link along.
    const inserted = await change(id, () => call(route('post /projects/:projectId/wbs-items/insert-after'), { projectId: id }, { afterItemId: mine.tasks[0]!.id }));
    const newRow = inserted.items.find((entry) => !entry.before)!.id;
    await call(route('post /projects/:projectId/wbs-dependencies'), { projectId: id }, { predecessorId: newRow, successorId: mine.tasks[3]!.id, type: 'FS', lagDays: 0 });
    const before = await structure(id);
    assert.equal((await revert(id, revertBody(inserted))).statusCode, 409);
    assert.deepEqual(await structure(id), before);

    // A link id that belongs to another project is never written from here.
    const foreignLink = await prisma.wbsDependency.findFirstOrThrow({ where: { projectId: other.project.id } });
    const forged = { baseVersion: await readStructureVersion(id), put: { items: [], links: [{ id: foreignLink.id, predecessorId: mine.tasks[2]!.id, successorId: mine.tasks[3]!.id, type: 'FS', lagDays: 0 }] }, remove: { itemIds: [], linkIds: [] }, expect: { items: [], absentItemIds: [], links: [], absentLinkIds: [] } };
    assert.equal((await revert(id, forged)).statusCode, 409);
    assert.equal((await prisma.wbsDependency.findUniqueOrThrow({ where: { id: foreignLink.id } })).projectId, other.project.id);

    // Goal labels someone set since my edit of the row are a change to the row.
    const goal = await prisma.wbsItem.create({ data: { projectId: id, code: '9', title: 'Цель', type: 'GOAL', status: 'NOT_STARTED', owner: '', sortOrder: 900, wbsLevel: 1 } });
    const renamed = await change(id, () => call(route('patch /wbs-items/:itemId'), { itemId: goal.id }, { title: 'Цель релиза' }));
    await prisma.wbsItem.update({ where: { id: goal.id }, data: { jiraGoalLabels: ['MP'] } });
    assert.equal((await revert(id, revertBody(renamed))).statusCode, 409);
    assert.deepEqual((await prisma.wbsItem.findUniqueOrThrow({ where: { id: goal.id } })).jiraGoalLabels, ['MP']);

    // A deleted row and its link come back with the creation times they had.
    const linkBefore = await prisma.wbsDependency.findFirstOrThrow({ where: { projectId: id, predecessorId: mine.tasks[0]!.id } });
    const rowBefore = await prisma.wbsItem.findUniqueOrThrow({ where: { id: mine.tasks[1]!.id } });
    const deleted = await change(id, () => call(route('delete /wbs-items/:itemId'), { itemId: mine.tasks[1]!.id }, {}));
    assert.equal((await revert(id, revertBody(deleted))).statusCode, 200);
    assert.equal((await prisma.wbsItem.findUniqueOrThrow({ where: { id: rowBefore.id } })).createdAt.toISOString(), rowBefore.createdAt.toISOString());
    assert.equal((await prisma.wbsDependency.findUniqueOrThrow({ where: { id: linkBefore.id } })).createdAt.toISOString(), linkBefore.createdAt.toISOString());
  } finally {
    await mine.cleanup();
    await other.cleanup();
  }
});

test('a row redone away goes to a tombstone with its links, which an administrator can restore', { skip: !enabled }, async () => {
  const route = routes();
  const { project, tasks, cleanup } = await fixture();
  try {
    const id = project.id;
    const deleted = await change(id, () => call(route('delete /wbs-items/:itemId'), { itemId: tasks[1]!.id }, {}));
    const beforeUndo = plain(await getProjectWbsSnapshot(id));
    const undone = await revert(id, revertBody(deleted));
    assert.equal(undone.statusCode, 200);
    const redone = await revert(id, revertBody(step(beforeUndo, plain(undone.body.structureDelta))));
    assert.equal(redone.statusCode, 200);
    const tombstone = await prisma.wbsTombstone.findFirstOrThrow({ where: { projectId: id, restoredAt: null } });
    // The tombstone keeps the row's link as it was, like one left by an ordinary deletion.
    const kept = tombstone.dependencies as Array<{ id: string; predecessorId: string; successorId: string; createdAt: string }>;
    const original = deleted.links.find((entry) => !entry.after)!.before!;
    assert.deepEqual(kept.map((link) => [link.id, link.predecessorId, link.successorId, new Date(link.createdAt).toISOString()]), [[original.id, original.predecessorId, original.successorId, new Date(String(original.createdAt)).toISOString()]]);
    const restored = await restoreWbsTombstone({ tombstoneId: tombstone.id, actor: null });
    assert.equal(restored.restoredItemCount, 1);
  } finally {
    await cleanup();
  }
});
