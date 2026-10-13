import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import type { Router } from 'express';
import { prisma } from '../../apps/api/src/db.js';
import { registerProjectCalendarRoutes } from '../../apps/api/src/routes/projects/calendar.routes.js';
import { registerWbsAppendRoutes } from '../../apps/api/src/routes/wbs/append.routes.js';
import { registerWbsDependencyRoutes } from '../../apps/api/src/routes/wbs/dependencies.routes.js';
import { registerWbsItemOrderRoutes } from '../../apps/api/src/routes/wbs/item-order.routes.js';
import { registerWbsItemRoutes } from '../../apps/api/src/routes/wbs/items.routes.js';
import { registerWbsRevertRoutes } from '../../apps/api/src/routes/wbs/revert.routes.js';
import { registerWbsSnapshotRoutes } from '../../apps/api/src/routes/wbs/snapshot.routes.js';
import { recalculateProjectWbsSchedule } from '../../apps/api/src/services/wbs-schedule.js';
import { pruneStructureJournal, readStructureChanges } from '../../apps/api/src/services/wbs-structure-journal.js';
import { readStructureVersion } from '../../apps/api/src/services/wbs-structure-write.js';
import { getProjectWbsSnapshot } from '../../apps/api/src/services/wbs.js';
import { mergeStructureChanges, type StructureChanges, type StructureState } from '../../apps/web/src/app/structureStore.js';

// A browser that holds the Structure at some version and applies the changes
// read since then holds what the server holds now, whatever wrote them.

const enabled = process.env.WORKFLOW_TEST_DATABASE === 'true';
type Row = Record<string, unknown> & { id: string };
const plain = <T,>(value: T): T => JSON.parse(JSON.stringify(value));
const byId = (rows: Row[]) => [...rows].sort((left, right) => left.id.localeCompare(right.id));

async function fixture() {
  const suffix = randomUUID().slice(0, 8);
  const unit = await prisma.businessUnit.create({ data: { code: `sj-${suffix}`, name: 'Structure journal' } });
  const project = await prisma.project.create({ data: { businessUnitId: unit.id, code: `SJ-${suffix}`, name: 'Structure journal', portfolio: 'T', sponsor: 'T', projectManager: 'T', startDate: new Date('2026-10-01'), targetDate: new Date('2026-12-01'), budgetPlanned: 0, budgetForecast: 0, summary: '' } });
  const phase = await prisma.wbsItem.create({ data: { projectId: project.id, code: '1', title: 'Фаза', type: 'PHASE', status: 'NOT_STARTED', owner: '', wbsLevel: 1, sortOrder: 10 } });
  const tasks = [];
  for (let index = 1; index <= 4; index += 1) {
    tasks.push(await prisma.wbsItem.create({ data: { projectId: project.id, parentId: phase.id, code: `1.${index}`, title: `Работа ${index}`, type: 'TASK', status: 'NOT_STARTED', owner: '', startDate: new Date('2026-10-05'), dueDate: new Date('2026-10-09'), workDays: 5, wbsLevel: 2, sortOrder: 10 + index * 10 } }));
  }
  await prisma.wbsDependency.create({ data: { projectId: project.id, predecessorId: tasks[0]!.id, successorId: tasks[1]!.id, type: 'FS' } });
  // The first write journals from here on.
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
  registerWbsAppendRoutes(router);
  registerWbsSnapshotRoutes(router);
  registerWbsRevertRoutes(router);
  registerProjectCalendarRoutes(router, {} as never);
  return async (key: string, params: Record<string, string>, body: unknown) => {
    const handler = found.get(key);
    assert.ok(handler, `no route ${key}`);
    const res: any = { statusCode: 200, body: undefined, status(code: number) { this.statusCode = code; return this; }, json(value: unknown) { this.body = value; return this; }, send() { return this; }, setHeader() {} };
    await handler({ params, body, ip: '127.0.0.1', headers: {}, get: (name: string) => (name.toLowerCase() === 'x-pms-structure-delta' ? '2' : undefined) }, res);
    return res;
  };
}

/** The Structure as a browser keeps it at the current version. */
async function browserCopy(projectId: string): Promise<StructureState> {
  const snapshot = plain(await getProjectWbsSnapshot(projectId));
  return { version: await readStructureVersion(projectId), items: snapshot.wbsItems, dependencies: snapshot.wbsDependencies, criticalPath: null, calendarOverrides: [], today: null };
}

async function changesSince(projectId: string, since: string) {
  return plain(await readStructureChanges(projectId, since))! as unknown as StructureChanges & { journalFloor: string };
}

/** Every copy kept so far, brought up to date with the changes since its version, equals the Structure now. */
async function expectCopiesCatchUp(projectId: string, copies: StructureState[]) {
  const now = await browserCopy(projectId);
  for (const copy of copies) {
    const changes = await changesSince(projectId, copy.version);
    assert.equal(changes.version, now.version);
    assert.equal(changes.full, false, `changes since ${copy.version} come from the journal`);
    const caughtUp = mergeStructureChanges(copy, changes);
    assert.deepEqual(byId(caughtUp.items as unknown as Row[]), byId(now.items as unknown as Row[]), `rows since ${copy.version}`);
    assert.deepEqual(byId(caughtUp.dependencies as unknown as Row[]), byId(now.dependencies as unknown as Row[]), `links since ${copy.version}`);
    assert.deepEqual(changes.calendarOverrides, plain(await prisma.projectCalendarOverride.findMany({ where: { projectId }, orderBy: [{ calendarCode: 'asc' }, { date: 'asc' }] })));
  }
  copies.push(now);
}

test('changes read since any journaled version bring a copy to the Structure now, whatever wrote them', { skip: !enabled }, async () => {
  const send = routes();
  const { project, phase, tasks, cleanup } = await fixture();
  try {
    const id = project.id;
    const copies = [await browserCopy(id)];
    const ok = async (key: string, params: Record<string, string>, body: unknown) => {
      const res = await send(key, params, body);
      assert.ok(res.statusCode < 300, `${key}: ${res.statusCode} ${JSON.stringify(res.body)}`);
      await expectCopiesCatchUp(id, copies);
      return res;
    };
    await ok('patch /wbs-items/:itemId', { itemId: tasks[0]!.id }, { workDays: 8, scheduleDriver: 'workDays' });
    // A renamed predecessor: the link that names it comes along although the link itself did not change.
    await ok('patch /wbs-items/:itemId', { itemId: tasks[0]!.id }, { title: 'Переименована' });
    const inserted = await ok('post /projects/:projectId/wbs-items/insert-after', { projectId: id }, { afterItemId: tasks[0]!.id });
    await ok('post /projects/:projectId/wbs-dependencies', { projectId: id }, { predecessorId: inserted.body.insertedItemId, successorId: tasks[3]!.id, type: 'FS', lagDays: 1 });
    await ok('post /projects/:projectId/wbs-items/renumber', { projectId: id }, {});
    await ok('put /projects/:projectId/calendar-overrides', { projectId: id }, { calendarCode: 'RU', date: '2026-10-07', isWorkingDay: false });
    // A calendar day reset changes the calendar, whether or not rows move.
    await ok('delete /projects/:projectId/calendar-overrides', { projectId: id }, { calendarCode: 'RU', date: '2026-10-07' });
    const deleted = await ok('delete /wbs-items/:itemId', { itemId: tasks[2]!.id }, {});
    // Undo brings the deleted row back with the same id, and the rows the deletion renumbered as they were.
    const delta = plain(deleted.body.structureDelta);
    assert.ok(delta.deletedItemIds.includes(tasks[2]!.id));
    const before = copies.at(-2)!;
    const itemBefore = (rowId: string) => before.items.find((row) => row.id === rowId);
    const linkBefore = (linkId: string) => before.dependencies.find((row) => row.id === linkId);
    const link = (row: Row) => ({ id: row.id, predecessorId: row.predecessorId, successorId: row.successorId, type: row.type, lagDays: row.lagDays, createdAt: row.createdAt });
    await ok('post /projects/:projectId/wbs-snapshot/revert', { projectId: id }, {
      baseVersion: copies.at(-1)!.version,
      put: {
        items: [...delta.items.map((row: Row) => itemBefore(row.id)), ...delta.deletedItemIds.map(itemBefore)].filter(Boolean),
        links: [...delta.dependencies.map((row: Row) => linkBefore(row.id)), ...delta.deletedDependencyIds.map(linkBefore)].filter(Boolean).map((row) => link(row as unknown as Row)),
      },
      remove: { itemIds: [], linkIds: [] },
      expect: { items: delta.items, absentItemIds: delta.deletedItemIds, links: delta.dependencies.map(link), absentLinkIds: delta.deletedDependencyIds },
    });
    await ok('post /projects/:projectId/wbs-items/append', { projectId: id }, { parentId: phase.id, title: 'С нагрузки', owner: '', type: 'TASK', startDate: '2026-10-12', dueDate: '2026-10-14' });
    await ok('delete /projects/:projectId/wbs-items', { projectId: id }, { itemIds: [inserted.body.insertedItemId] });

    // A write that is refused journals nothing and leaves the version.
    const version = await readStructureVersion(id);
    const lastCommit = await prisma.projectStructureCommit.findFirstOrThrow({ where: { projectId: id }, orderBy: { version: 'desc' } });
    assert.equal(lastCommit.changeCount, await prisma.projectStructureChange.count({ where: { projectId: id, version: lastCommit.version } }), 'a commit counts what it touched');
    assert.ok(lastCommit.changeCount > 0);
    const refused = await send('patch /wbs-items/:itemId', { itemId: tasks[0]!.id }, { workDays: 3, scheduleDriver: 'workDays', expectedUpdatedAt: '2000-01-01T00:00:00.000Z' });
    assert.equal(refused.statusCode, 409);
    assert.equal(await readStructureVersion(id), version);
    assert.equal(await prisma.projectStructureCommit.count({ where: { projectId: id, version: { gt: BigInt(version) } } }), 0);

    // Versions the journal cannot answer for are read whole.
    for (const since of [undefined, 'x', '-1', String(BigInt(version) + 1n)]) {
      assert.equal((await readStructureChanges(id, since))!.full, true, `since ${since}`);
    }
    const unchanged = await changesSince(id, version);
    assert.equal(unchanged.full, false);
    assert.deepEqual([unchanged.items, unchanged.dependencies, unchanged.deletedItemIds], [[], [], []]);
  } finally {
    await cleanup();
  }
});

test('a version written without the journal, and versions older than the journal keeps, are read whole', { skip: !enabled }, async () => {
  const send = routes();
  const { project, tasks, cleanup } = await fixture();
  try {
    const id = project.id;
    const start = await readStructureVersion(id);
    await send('patch /wbs-items/:itemId', { itemId: tasks[0]!.id }, { workDays: 6, scheduleDriver: 'workDays' });
    assert.equal((await readStructureChanges(id, start))!.full, false);
    // A server from before the journal moves the version without a record, as during a deploy.
    await prisma.projectStructureVersion.update({ where: { projectId: id }, data: { version: { increment: 1 } } });
    assert.equal((await readStructureChanges(id, start))!.full, true);
    const afterGap = await readStructureVersion(id);
    await send('patch /wbs-items/:itemId', { itemId: tasks[1]!.id }, { workDays: 4, scheduleDriver: 'workDays' });
    assert.equal((await readStructureChanges(id, afterGap))!.full, false, 'the journal is whole again after the gap');

    // Old entries go from the start of the journal; the floor follows.
    const versions = (await prisma.projectStructureCommit.findMany({ where: { projectId: id }, orderBy: { version: 'asc' }, select: { version: true } })).map((row) => row.version);
    await prisma.projectStructureCommit.updateMany({ where: { projectId: id, version: { lte: versions[1]! } }, data: { createdAt: new Date('2026-01-01T00:00:00.000Z') } });
    const floor = await pruneStructureJournal(id, new Date('2026-10-13T00:00:00.000Z'));
    // The floor stops just before the first version kept.
    assert.equal(floor, versions[2]! - 1n);
    assert.equal(await prisma.projectStructureCommit.count({ where: { projectId: id, version: { lte: floor! } } }), 0);
    assert.equal((await readStructureChanges(id, String(versions[0]))).full, true, 'older than the floor');
    assert.equal((await readStructureChanges(id, String(floor))).full, false, 'from the floor on the journal answers');
    assert.equal(await pruneStructureJournal(id, new Date('2026-10-13T00:00:00.000Z')), floor, 'pruning again changes nothing');
    assert.equal(await readStructureChanges('no-such-project', undefined), null, 'a project that is gone is not found');
    // A gap holding more changes than reading the Structure whole costs is read whole.
    const latest = await prisma.projectStructureCommit.findFirstOrThrow({ where: { projectId: id }, orderBy: { version: 'desc' } });
    await prisma.projectStructureCommit.update({ where: { projectId_version: { projectId: id, version: latest.version } }, data: { changeCount: 5_000 } });
    assert.equal((await readStructureChanges(id, String(latest.version - 1n)))!.full, false);
    await prisma.projectStructureCommit.update({ where: { projectId_version: { projectId: id, version: latest.version } }, data: { changeCount: 5_001 } });
    assert.equal((await readStructureChanges(id, String(latest.version - 1n)))!.full, true);
  } finally {
    await cleanup();
  }
});
