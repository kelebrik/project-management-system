import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import type { Router } from 'express';
import { prisma } from '../../apps/api/src/db.js';
import { registerWbsAppendRoutes } from '../../apps/api/src/routes/wbs/append.routes.js';
import { registerWbsDependencyRoutes } from '../../apps/api/src/routes/wbs/dependencies.routes.js';
import { registerWbsItemOrderRoutes } from '../../apps/api/src/routes/wbs/item-order.routes.js';
import { registerWbsItemRoutes } from '../../apps/api/src/routes/wbs/items.routes.js';
import { registerWbsSnapshotRoutes } from '../../apps/api/src/routes/wbs/snapshot.routes.js';
import { ensureJiraSystemSemanticAggregates } from '../../apps/api/src/services/jira-semantic-aggregates.js';
import { recalculateProjectWbsSchedule } from '../../apps/api/src/services/wbs-schedule.js';
import { readStructureVersion, structureTransaction } from '../../apps/api/src/services/wbs-structure-write.js';
import { applyWbsImport } from '../../apps/api/src/routes/wbs-import.routes.js';
import { registerProjectCalendarRoutes } from '../../apps/api/src/routes/projects/calendar.routes.js';
import { createDefaultProjectStructure } from '../../apps/api/src/routes/projects/default-structure.js';
import { restoreWbsTombstone } from '../../apps/api/src/services/wbs-tombstones.js';
import { getProjectWbsSnapshot } from '../../apps/api/src/services/wbs.js';
import { mergeStructureDelta, type StructureState } from '../../apps/web/src/app/structureStore.js';

const enabled = process.env.WORKFLOW_TEST_DATABASE === 'true';
type Row = Record<string, unknown> & { id: string };

async function fixture() {
  const suffix = randomUUID().slice(0, 8);
  const unit = await prisma.businessUnit.create({ data: { code: `sd-${suffix}`, name: 'Structure delta' } });
  const project = await prisma.project.create({ data: { businessUnitId: unit.id, code: `SD-${suffix}`, name: 'Structure delta', portfolio: 'T', sponsor: 'T', projectManager: 'T', startDate: new Date('2026-10-01'), targetDate: new Date('2026-12-01'), budgetPlanned: 0, budgetForecast: 0, summary: '' } });
  const phase = await prisma.wbsItem.create({ data: { projectId: project.id, code: '1', title: 'Фаза', type: 'PHASE', status: 'NOT_STARTED', owner: '', wbsLevel: 1, sortOrder: 10 } });
  const tasks = [];
  for (let index = 1; index <= 4; index += 1) {
    tasks.push(await prisma.wbsItem.create({ data: { projectId: project.id, parentId: phase.id, code: `1.${index}`, title: `Работа ${index}`, type: 'TASK', status: 'NOT_STARTED', owner: 'Анна', startDate: new Date('2026-10-05'), dueDate: new Date('2026-10-09'), workDays: 5, wbsLevel: 2, sortOrder: 10 + index * 10 } }));
  }
  const goal = await prisma.wbsItem.create({ data: { projectId: project.id, code: '2', title: 'Релиз заводской прошивки', type: 'GOAL', status: 'NOT_STARTED', owner: '', startDate: new Date('2026-12-01'), dueDate: new Date('2026-12-01'), workDays: 0, wbsLevel: 1, sortOrder: 100 } });
  await prisma.wbsDependency.create({ data: { projectId: project.id, predecessorId: tasks[0]!.id, successorId: tasks[1]!.id, type: 'FS' } });
  await recalculateProjectWbsSchedule(project.id);
  return {
    project, phase, tasks, goal,
    async cleanup() {
      await prisma.auditEvent.deleteMany({ where: { projectId: project.id } });
      await prisma.project.delete({ where: { id: project.id } });
      await prisma.businessUnit.delete({ where: { id: unit.id } });
    },
  };
}

function handlers() {
  const found = new Map<string, Function>();
  const router = new Proxy({}, {
    get: (_target, verb) => (path: string, ...callbacks: Function[]) => { found.set(`${String(verb)} ${path}`, callbacks.at(-1)!); },
  }) as unknown as Router;
  registerWbsItemRoutes(router);
  registerWbsDependencyRoutes(router, { serverErrorMessage: (error, fallback) => (error instanceof Error ? error.message : fallback) });
  registerWbsItemOrderRoutes(router);
  registerWbsAppendRoutes(router);
  registerWbsSnapshotRoutes(router);
  return (key: string) => {
    const handler = found.get(key);
    assert.ok(handler, `no route ${key}`);
    return handler;
  };
}

/** Calls a route as the browser does; deltaVersion is the X-PMS-Structure-Delta it sends, none for another client. */
async function call(handler: Function, params: Record<string, string>, body: unknown, deltaVersion: '1' | '2' | null = '2') {
  const res: any = {
    statusCode: 200,
    body: undefined as unknown,
    headers: {} as Record<string, string>,
    status(code: number) { this.statusCode = code; return this; },
    json(value: unknown) { this.body = value; return this; },
    setHeader(name: string, value: string) { this.headers[name] = value; },
  };
  const req = { params, body, ip: '127.0.0.1', headers: {}, get: (name: string) => (name.toLowerCase() === 'x-pms-structure-delta' ? deltaVersion ?? undefined : undefined) };
  await handler(req, res);
  return res;
}

const plain = (value: unknown) => JSON.parse(JSON.stringify(value));
const byId = (rows: Row[]) => [...rows].sort((left, right) => left.id.localeCompare(right.id));

/** The Structure as the browser keeps it, read with the project's calendar as the project page reads it. */
async function browserState(projectId: string): Promise<StructureState> {
  const snapshot = plain(await getProjectWbsSnapshot(projectId));
  return {
    version: await readStructureVersion(projectId),
    items: snapshot.wbsItems,
    dependencies: snapshot.wbsDependencies,
    criticalPath: snapshot.criticalPath,
    calendarOverrides: plain(await prisma.projectCalendarOverride.findMany({ where: { projectId } })),
  };
}

/** Runs a write and checks that its changes, applied to the Structure before it, give the Structure after it. */
async function expectExactChange(projectId: string, write: () => Promise<any>) {
  const before = await browserState(projectId);
  const version = BigInt(before.version);
  const res = await write();
  assert.ok(res.statusCode < 300, `answer ${res.statusCode}: ${JSON.stringify(res.body)}`);
  assert.equal(res.headers['X-PMS-Structure'], undefined, 'the header is set by the app middleware, not the route');
  const delta = plain(res.body.structureDelta);
  assert.ok(delta, 'the answer carries changes, not the whole Structure');
  assert.equal(res.body.wbsItems, undefined);
  assert.equal(delta.projectId, projectId);
  assert.equal(delta.baseVersion, String(version));
  assert.equal(delta.version, String(version + 1n));
  assert.equal(await readStructureVersion(projectId), String(version + 1n));
  const after = plain(await getProjectWbsSnapshot(projectId));
  // The browser applies the change and works out the critical path itself, for the server's day.
  assert.equal('criticalPath' in delta, false, 'the server leaves the critical path to the browser');
  assert.equal(delta.today, new Date().toISOString().slice(0, 10));
  const mine = mergeStructureDelta(before, delta);
  assert.deepEqual(byId(mine.items as unknown as Row[]), byId(after.wbsItems));
  assert.deepEqual(byId(mine.dependencies as unknown as Row[]), byId(after.wbsDependencies));
  assert.deepEqual(mine.criticalPath, after.criticalPath);
  // The write's last journal command carries the same changes, numbered in the write.
  const commands = await prisma.wbsCommand.findMany({ where: { projectId, structureVersion: version + 1n }, orderBy: { commandOrdinal: 'asc' } });
  assert.ok(commands.length > 0, 'the write is journaled with its version');
  assert.deepEqual(commands.map((command) => command.commandOrdinal), commands.map((_, index) => index));
  const last = commands.at(-1)!.payload as { structureDelta?: { items: Row[]; deletedItemIds: string[] } };
  assert.deepEqual(byId(last.structureDelta!.items).map((row) => row.id), byId(delta.items).map((row) => row.id));
  assert.deepEqual([...last.structureDelta!.deletedItemIds].sort(), [...delta.deletedItemIds].sort());
  return res;
}

test('every Structure route answers with exactly the changes it made, and moves the version by one', { skip: !enabled }, async () => {
  const route = handlers();
  const { project, phase, tasks, cleanup } = await fixture();
  try {
    const id = project.id;
    await expectExactChange(id, () => call(route('patch /wbs-items/:itemId'), { itemId: tasks[0]!.id }, { workDays: 8, scheduleDriver: 'workDays' }));
    await expectExactChange(id, () => call(route('patch /wbs-items/:itemId'), { itemId: tasks[2]!.id }, { dueDate: '2026-10-16T00:00:00.000Z', scheduleDriver: 'dates' }));
    await expectExactChange(id, () => call(route('patch /wbs-items/:itemId'), { itemId: tasks[3]!.id }, { status: 'DONE' }));
    await expectExactChange(id, () => call(route('patch /projects/:projectId/wbs-items/bulk'), { projectId: id }, { items: [{ id: tasks[1]!.id, patch: { progress: 40 } }, { id: tasks[2]!.id, patch: { title: 'Переименована' } }] }));
    const created = await expectExactChange(id, () => call(route('post /projects/:projectId/wbs-items'), { projectId: id }, { parentId: phase.id, code: '1.9', title: 'Новая', type: 'TASK', status: 'NOT_STARTED', owner: '', sortOrder: 95, startDate: '2026-10-05', workDays: 3 }));
    const inserted = await expectExactChange(id, () => call(route('post /projects/:projectId/wbs-items/insert-after'), { projectId: id }, { afterItemId: tasks[0]!.id }));
    const link = await expectExactChange(id, () => call(route('post /projects/:projectId/wbs-dependencies'), { projectId: id }, { predecessorId: inserted.body.insertedItemId, successorId: tasks[3]!.id, type: 'FS', lagDays: 1 }));
    const linkId = (link.body.structureDelta.dependencies as Row[]).find((row) => row.predecessorId === inserted.body.insertedItemId)!.id;
    await expectExactChange(id, () => call(route('patch /wbs-dependencies/:dependencyId'), { dependencyId: linkId }, { predecessorId: inserted.body.insertedItemId, successorId: tasks[3]!.id, type: 'SS', lagDays: 2 }));
    const moved = (await prisma.wbsDependency.findFirstOrThrow({ where: { projectId: id, predecessorId: inserted.body.insertedItemId } })).id;
    await expectExactChange(id, () => call(route('delete /wbs-dependencies/:dependencyId'), { dependencyId: moved }, {}));
    const order = (await prisma.wbsItem.findMany({ where: { projectId: id }, orderBy: { sortOrder: 'asc' } })).map((row) => row.id);
    await expectExactChange(id, () => call(route('post /projects/:projectId/wbs-items/reorder'), { projectId: id }, { orderedIds: [order[0], order[3], order[1], order[2], ...order.slice(4)] }));
    await expectExactChange(id, () => call(route('post /projects/:projectId/wbs-items/renumber'), { projectId: id }, {}));
    // A day off in the calendar: the page reads the project again, and the next change counts with it.
    const calendar = new Map<string, Function>();
    registerProjectCalendarRoutes(new Proxy({}, { get: (_t, verb) => (path: string, ...callbacks: Function[]) => calendar.set(`${String(verb)} ${path}`, callbacks.at(-1)!) }) as unknown as Router, {} as never);
    assert.equal((await call(calendar.get('put /projects/:projectId/calendar-overrides')!, { projectId: id }, { calendarCode: 'RU', date: '2026-10-07', isWorkingDay: false })).statusCode, 200);
    await expectExactChange(id, () => call(route('patch /wbs-items/:itemId'), { itemId: tasks[0]!.id }, { workDays: 6, scheduleDriver: 'workDays' }));
    await expectExactChange(id, () => call(route('post /projects/:projectId/wbs-baseline'), { projectId: id }, {}));
    await expectExactChange(id, () => call(route('post /projects/:projectId/wbs-items/append'), { projectId: id }, { parentId: phase.id, title: 'С нагрузки', owner: 'Анна', type: 'TASK', startDate: '2026-10-12', dueDate: '2026-10-14' }));
    const saved = plain(await getProjectWbsSnapshot(id));
    await expectExactChange(id, () => call(route('delete /wbs-items/:itemId'), { itemId: created.body.item.id }, {}));
    await expectExactChange(id, () => call(route('delete /projects/:projectId/wbs-items'), { projectId: id }, { itemIds: [tasks[1]!.id, inserted.body.insertedItemId] }));
    await expectExactChange(id, () => call(route('post /projects/:projectId/wbs-snapshot/restore'), { projectId: id }, {
      wbsItems: saved.wbsItems,
      wbsDependencies: saved.wbsDependencies.map((row: Row) => ({ predecessorId: row.predecessorId, successorId: row.successorId, type: row.type, lagDays: row.lagDays })),
    }));
  } finally {
    await cleanup();
  }
});

test('a page loaded before the browser worked out the critical path still gets it, and other clients the whole Structure', { skip: !enabled }, async () => {
  const route = handlers();
  const { project, tasks, cleanup } = await fixture();
  try {
    const older = await call(route('patch /wbs-items/:itemId'), { itemId: tasks[0]!.id }, { workDays: 7, scheduleDriver: 'workDays' }, '1');
    const after = plain(await getProjectWbsSnapshot(project.id));
    assert.deepEqual(plain(older.body.structureDelta.criticalPath), after.criticalPath);
    assert.equal(older.body.structureDelta.today, undefined);
    const whole = await call(route('patch /wbs-items/:itemId'), { itemId: tasks[0]!.id }, { workDays: 4, scheduleDriver: 'workDays' }, null);
    assert.equal(whole.body.structureDelta, undefined);
    assert.deepEqual(plain(whole.body.criticalPath), plain(await getProjectWbsSnapshot(project.id)).criticalPath);
    // The journal keeps the changes without any critical path.
    const command = await prisma.wbsCommand.findFirstOrThrow({ where: { projectId: project.id }, orderBy: [{ structureVersion: 'desc' }, { commandOrdinal: 'desc' }] });
    assert.equal('criticalPath' in ((command.payload as { structureDelta: object }).structureDelta), false);
  } finally {
    await cleanup();
  }
});

test('writers outside the Structure routes move the version too', { skip: !enabled }, async () => {
  const { project, cleanup } = await fixture();
  try {
    const id = project.id;
    const version = async () => BigInt(await readStructureVersion(id));
    const start = await version();
    // The legacy entry points without a transaction lock and version by themselves.
    await recalculateProjectWbsSchedule(id);
    assert.equal(await version(), start + 1n);
    // System goal labels are written once, as a Structure write of their own; a second run writes nothing.
    await ensureJiraSystemSemanticAggregates(prisma, id);
    assert.equal(await version(), start + 2n);
    await ensureJiraSystemSemanticAggregates(prisma, id);
    assert.equal(await version(), start + 2n);

    // A table import, with its recalculation.
    await structureTransaction(async (tx) => {
      await applyWbsImport(tx, { projectId: id, rows: [{ code: '3', title: 'Из таблицы', type: 'TASK', owner: '', startDate: '2026-10-05', workDays: 2 }] as never, importKey: `import-${randomUUID()}`, userId: null });
      await recalculateProjectWbsSchedule(id, {}, tx);
    });
    assert.equal(await version(), start + 3n);

    // A working day changed in the project's calendar reschedules under the lock.
    const calendar = new Map<string, Function>();
    registerProjectCalendarRoutes(new Proxy({}, { get: (_t, verb) => (path: string, ...callbacks: Function[]) => calendar.set(`${String(verb)} ${path}`, callbacks.at(-1)!) }) as unknown as Router, {} as never);
    const put = await call(calendar.get('put /projects/:projectId/calendar-overrides')!, { projectId: id }, { calendarCode: 'RU', date: '2026-10-06', isWorkingDay: false });
    assert.equal(put.statusCode, 200);
    assert.equal(await version(), start + 4n);

    // A deleted row comes back from its tombstone as one Structure write.
    const route = handlers();
    const removed = (await prisma.wbsItem.findFirstOrThrow({ where: { projectId: id, title: 'Из таблицы' } })).id;
    await call(route('delete /wbs-items/:itemId'), { itemId: removed }, {});
    assert.equal(await version(), start + 5n);
    const tombstone = await prisma.wbsTombstone.findFirstOrThrow({ where: { projectId: id } });
    const restored = await restoreWbsTombstone({ tombstoneId: tombstone.id, actor: null });
    assert.equal(restored.structureVersion, String(start + 6n));
    assert.equal(await version(), start + 6n);

    // The standard Structure of a new, empty project.
    const empty = await prisma.project.create({ data: { businessUnitId: project.businessUnitId, code: `${project.code}-N`, name: 'Новый', portfolio: 'T', sponsor: 'T', projectManager: 'T', startDate: new Date('2026-10-01'), targetDate: new Date('2026-12-01'), budgetPlanned: 0, budgetForecast: 0, summary: '' } });
    try {
      await structureTransaction((tx) => createDefaultProjectStructure(empty.id, new Date('2026-10-01'), tx));
      assert.equal(await readStructureVersion(empty.id), '1');
      assert.ok(await prisma.wbsItem.count({ where: { projectId: empty.id } }) > 0);
    } finally {
      await prisma.project.delete({ where: { id: empty.id } });
    }
  } finally {
    await cleanup();
  }
});
