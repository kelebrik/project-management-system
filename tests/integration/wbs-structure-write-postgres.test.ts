import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import type { Router } from 'express';
import { prisma } from '../../apps/api/src/db.js';
import { registerProjectCrudRoutes } from '../../apps/api/src/routes/projects/crud.routes.js';
import { registerWbsSnapshotRoutes } from '../../apps/api/src/routes/wbs/snapshot.routes.js';
import { recordAuditEvent } from '../../apps/api/src/services/audit.js';
import { bulkUpdateWbsItems } from '../../apps/api/src/services/wbs-bulk-write.js';
import { recalculateProjectWbsSchedule } from '../../apps/api/src/services/wbs-schedule.js';
import { readStructureVersion, runStructureWrite } from '../../apps/api/src/services/wbs-structure-write.js';
import { getProjectWbsSnapshot, renumberProjectWbs } from '../../apps/api/src/services/wbs.js';

const enabled = process.env.WORKFLOW_TEST_DATABASE === 'true';

async function fixture(rows = 3) {
  const suffix = randomUUID().slice(0, 8);
  const unit = await prisma.businessUnit.create({ data: { code: `sw-${suffix}`, name: 'Structure write' } });
  const project = await prisma.project.create({ data: { businessUnitId: unit.id, code: `SW-${suffix}`, name: 'Structure write', portfolio: 'T', sponsor: 'T', projectManager: 'T', startDate: new Date('2026-10-01'), targetDate: new Date('2026-12-01'), budgetPlanned: 0, budgetForecast: 0, summary: '' } });
  const items = [];
  for (let index = 1; index <= rows; index += 1) {
    items.push(await prisma.wbsItem.create({ data: { projectId: project.id, code: `${index}`, title: `Работа ${index}`, type: 'TASK', status: 'NOT_STARTED', owner: 'Анна', startDate: new Date('2026-10-05'), dueDate: new Date('2026-10-09'), workDays: 5, wbsLevel: 1, sortOrder: index * 10 } }));
  }
  return {
    project, items,
    async cleanup() {
      await prisma.project.delete({ where: { id: project.id } });
      await prisma.businessUnit.delete({ where: { id: unit.id } });
    },
  };
}

function handlerOf(register: (router: Router) => void, path: string, method = 'post') {
  let handler: Function | undefined;
  const router = new Proxy({}, {
    get: (_target, verb) => (candidate: string, ...callbacks: Function[]) => {
      if (verb === method && candidate === path) handler = callbacks.at(-1);
    },
  });
  register(router as unknown as Router);
  return handler!;
}

async function call(handler: Function, params: Record<string, string>, body: unknown) {
  const res: any = {
    statusCode: 200,
    body: undefined as unknown,
    status(code: number) { this.statusCode = code; return this; },
    json(value: unknown) { this.body = value; return this; },
  };
  await handler({ params, body, get: () => undefined, headers: {} }, res);
  return res;
}

test('a write that fails after its first step leaves no row and no temporary code behind', { skip: !enabled }, async () => {
  const { project, cleanup } = await fixture();
  try {
    await assert.rejects(runStructureWrite(project.id, async (db) => {
      await db.wbsItem.create({ data: { projectId: project.id, code: '__insert_test', title: '', type: 'TASK', owner: '', sortOrder: 15 } });
      await renumberProjectWbs(project.id, db);
      throw new Error('the schedule failed');
    }), /the schedule failed/);
    const rows = await prisma.wbsItem.findMany({ where: { projectId: project.id }, orderBy: { sortOrder: 'asc' } });
    assert.deepEqual(rows.map((row) => row.code), ['1', '2', '3']);
  } finally {
    await cleanup();
  }
});

test('a failed audit record undoes the change it describes instead of committing without it', { skip: !enabled }, async () => {
  const { project, items, cleanup } = await fixture();
  try {
    // An actor that is no user breaks the audit row's foreign key inside the transaction.
    await assert.rejects(runStructureWrite(project.id, async (db) => {
      await db.wbsItem.update({ where: { id: items[0]!.id }, data: { title: 'Не сохранится' } });
      await recordAuditEvent({ actor: { id: 'missing-user', email: 'x@example.com', name: 'X' }, action: 'wbs_item.update', objectType: 'WbsItem', objectId: items[0]!.id, projectId: project.id }, db);
    }));
    assert.equal((await prisma.wbsItem.findUniqueOrThrow({ where: { id: items[0]!.id } })).title, 'Работа 1');
  } finally {
    await cleanup();
  }
});

test('renumbering writes only the rows whose code moves and leaves no temporary code', { skip: !enabled }, async () => {
  const { project, items, cleanup } = await fixture();
  try {
    // The last two rows swap places: their codes move, the first row keeps its own and its version.
    await prisma.wbsItem.update({ where: { id: items[1]!.id }, data: { sortOrder: 40 } });
    const before = await prisma.wbsItem.findUniqueOrThrow({ where: { id: items[0]!.id } });
    await renumberProjectWbs(project.id);
    const rows = await prisma.wbsItem.findMany({ where: { projectId: project.id }, orderBy: { sortOrder: 'asc' } });
    assert.deepEqual(rows.map((row) => [row.title, row.code]), [['Работа 1', '1'], ['Работа 3', '2'], ['Работа 2', '3']]);
    const first = rows.find((row) => row.id === items[0]!.id)!;
    assert.equal(first.updatedAt.getTime(), before.updatedAt.getTime());
    assert.ok(rows.every((row) => !row.code.startsWith('__')));
  } finally {
    await cleanup();
  }
});

test('a bulk update refuses a row of another project and changes nothing', { skip: !enabled }, async () => {
  const mine = await fixture();
  const other = await fixture(1);
  try {
    await assert.rejects(runStructureWrite(mine.project.id, (db) => bulkUpdateWbsItems(db, mine.project.id, [
      { id: mine.items[0]!.id, code: '9' },
      { id: other.items[0]!.id, code: '9' },
    ], ['code'])), /touched 1 of 2 rows/);
    assert.equal((await prisma.wbsItem.findUniqueOrThrow({ where: { id: mine.items[0]!.id } })).code, '1');
    assert.equal((await prisma.wbsItem.findUniqueOrThrow({ where: { id: other.items[0]!.id } })).code, '1');
  } finally {
    await mine.cleanup();
    await other.cleanup();
  }
});

test('two writes of one project wait for each other under the lock', { skip: !enabled }, async () => {
  const { project, cleanup } = await fixture();
  try {
    // Each reads the last position and appends after it; without the lock both would read the same one.
    const append = (title: string) => runStructureWrite(project.id, async (db) => {
      const last = await db.wbsItem.findFirst({ where: { projectId: project.id }, orderBy: { sortOrder: 'desc' } });
      await new Promise((resolve) => setTimeout(resolve, 50));
      await db.wbsItem.create({ data: { projectId: project.id, code: title, title, type: 'TASK', owner: '', sortOrder: (last?.sortOrder ?? 0) + 10 } });
    });
    await Promise.all([append('A'), append('B')]);
    const orders = (await prisma.wbsItem.findMany({ where: { projectId: project.id }, orderBy: { sortOrder: 'asc' } })).map((row) => row.sortOrder);
    assert.deepEqual(orders, [10, 20, 30, 40, 50]);
  } finally {
    await cleanup();
  }
});

test('undo restores the snapshot exactly and refuses a row of another project', { skip: !enabled }, async () => {
  const mine = await fixture();
  const other = await fixture(1);
  const restore = handlerOf(registerWbsSnapshotRoutes, '/projects/:projectId/wbs-snapshot/restore');
  try {
    await prisma.wbsDependency.create({ data: { projectId: mine.project.id, predecessorId: mine.items[0]!.id, successorId: mine.items[1]!.id, type: 'FS' } });
    await recalculateProjectWbsSchedule(mine.project.id);
    const saved = await getProjectWbsSnapshot(mine.project.id);
    const snapshot = {
      wbsItems: saved.wbsItems.map((item) => ({ ...item })),
      wbsDependencies: saved.wbsDependencies.map((link) => ({ predecessorId: link.predecessorId, successorId: link.successorId, type: link.type, lagDays: link.lagDays })),
    };
    const shape = async () => (await prisma.wbsItem.findMany({ where: { projectId: mine.project.id }, orderBy: { sortOrder: 'asc' } }))
      .map((row) => [row.id, row.code, row.title, row.parentId, row.sortOrder, row.dueDate?.toISOString()]);
    const expected = await shape();

    // Edits to undo: a renamed row, a new one, a removed link.
    await prisma.wbsItem.update({ where: { id: mine.items[2]!.id }, data: { title: 'Переименована' } });
    await prisma.wbsItem.create({ data: { projectId: mine.project.id, code: '4', title: 'Лишняя', type: 'TASK', owner: '', sortOrder: 40 } });
    await prisma.wbsDependency.deleteMany({ where: { projectId: mine.project.id } });

    const restored = await call(restore, { projectId: mine.project.id }, JSON.parse(JSON.stringify(snapshot)));
    assert.equal(restored.statusCode, 200);
    assert.deepEqual(await shape(), expected);
    assert.equal(await prisma.wbsDependency.count({ where: { projectId: mine.project.id } }), 1);

    const foreign = JSON.parse(JSON.stringify(snapshot));
    foreign.wbsItems.push({ ...foreign.wbsItems[0], id: other.items[0]!.id, code: '9', sortOrder: 90 });
    const refused = await call(restore, { projectId: mine.project.id }, foreign);
    assert.equal(refused.statusCode, 409);
    assert.deepEqual(await shape(), expected);
    const otherRow = await prisma.wbsItem.findUniqueOrThrow({ where: { id: other.items[0]!.id } });
    assert.equal(otherRow.projectId, other.project.id);
  } finally {
    await mine.cleanup();
    await other.cleanup();
  }
});

test('a failed audit record of a new target date undoes the date, the goal and the recalculation', { skip: !enabled }, async () => {
  const { project, cleanup } = await fixture();
  const user = await prisma.user.create({ data: { email: `target-${randomUUID().slice(0, 8)}@example.com`, name: 'Ответственный', role: 'ADMIN' } });
  let actor = { id: 'missing-user', email: 'x@example.com', name: 'X', role: 'ADMIN' };
  const changeTarget = handlerOf((router) => registerProjectCrudRoutes(router, {
    requireAdmin: () => true,
    // First a signed-in person who is no user row, so the audit event's foreign key fails inside the transaction.
    currentUser: () => actor,
    ensureProjectWritable: async () => project,
    ensureEntityProjectWritable: async () => true,
  } as never), '/projects/:projectId/target-date', 'patch');
  try {
    const goal = await prisma.wbsItem.create({ data: { projectId: project.id, code: '4', title: 'Цель', type: 'GOAL', status: 'NOT_STARTED', owner: '', startDate: new Date('2026-12-01'), dueDate: new Date('2026-12-01'), workDays: 0, wbsLevel: 1, sortOrder: 40 } });
    await assert.rejects(call(changeTarget, { projectId: project.id }, { targetDate: '2026-12-21', reason: 'Перенос поставки' }));
    assert.equal((await prisma.project.findUniqueOrThrow({ where: { id: project.id } })).targetDate.toISOString(), '2026-12-01T00:00:00.000Z');
    assert.equal((await prisma.wbsItem.findUniqueOrThrow({ where: { id: goal.id } })).dueDate?.toISOString(), '2026-12-01T00:00:00.000Z');
    assert.equal(await prisma.projectTargetDateChange.count({ where: { projectId: project.id } }), 0);

    // The same change by a real user goes through, so the refusal above came from the audit row.
    actor = { id: user.id, email: user.email, name: 'Ответственный', role: 'ADMIN' };
    const versionBefore = BigInt(await readStructureVersion(project.id));
    const accepted = await call(changeTarget, { projectId: project.id }, { targetDate: '2026-12-21', reason: 'Перенос поставки' });
    assert.equal(accepted.statusCode, 200);
    assert.equal(accepted.body.structureVersion, String(versionBefore + 1n));
    assert.equal(await readStructureVersion(project.id), String(versionBefore + 1n));
    assert.equal((await prisma.wbsItem.findUniqueOrThrow({ where: { id: goal.id } })).dueDate?.toISOString(), '2026-12-21T00:00:00.000Z');
    assert.equal(await prisma.auditEvent.count({ where: { projectId: project.id, action: 'project.target_date.update' } }), 1);
  } finally {
    await prisma.auditEvent.deleteMany({ where: { projectId: project.id } });
    await cleanup();
    await prisma.user.delete({ where: { id: user.id } });
  }
});
