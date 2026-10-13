import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import type { Router } from 'express';
import { prisma } from '../../apps/api/src/db.js';
import { applyWbsImport } from '../../apps/api/src/routes/wbs-import.routes.js';
import { registerWbsDependencyRoutes } from '../../apps/api/src/routes/wbs/dependencies.routes.js';
import { registerWbsItemOrderRoutes } from '../../apps/api/src/routes/wbs/item-order.routes.js';
import { registerWbsItemRoutes } from '../../apps/api/src/routes/wbs/items.routes.js';
import { calculateProjectCriticalPath } from '../../apps/api/src/services/wbs-critical-path.js';
import { recalculateProjectWbsSchedule } from '../../apps/api/src/services/wbs-schedule.js';
import { readStructureVersion, structureTransaction, StructureWriteRejection } from '../../apps/api/src/services/wbs-structure-write.js';

// A row cannot be linked with its own ancestor or descendant: such links are
// refused on every path, and the ones a project already has do not count.

const enabled = process.env.WORKFLOW_TEST_DATABASE === 'true';

async function fixture() {
  const suffix = randomUUID().slice(0, 8);
  const unit = await prisma.businessUnit.create({ data: { code: `fl-${suffix}`, name: 'Family links' } });
  const project = await prisma.project.create({ data: { businessUnitId: unit.id, code: `FL-${suffix}`, name: 'Family links', portfolio: 'T', sponsor: 'T', projectManager: 'T', startDate: new Date('2026-10-01'), targetDate: new Date('2026-12-01'), budgetPlanned: 0, budgetForecast: 0, summary: '' } });
  const row = (code: string, parentId: string | null, sortOrder: number) => prisma.wbsItem.create({ data: {
    projectId: project.id, parentId, code, title: `Строка ${code}`, type: code.includes('.') ? 'TASK' : 'PHASE', status: 'NOT_STARTED', owner: '',
    startDate: new Date('2026-10-05'), dueDate: new Date('2026-10-09'), workDays: 5, wbsLevel: code.split('.').length, sortOrder,
  } });
  const phase = await row('1', null, 10);
  const first = await row('1.1', phase.id, 20);
  const second = await row('1.2', phase.id, 30);
  const other = await row('2', null, 40);
  await recalculateProjectWbsSchedule(project.id);
  return {
    project, phase, first, second, other,
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
  return async (key: string, params: Record<string, string>, body: unknown) => {
    const res: any = { statusCode: 200, body: undefined, status(code: number) { this.statusCode = code; return this; }, json(value: unknown) { this.body = value; return this; }, send() { return this; }, setHeader() {} };
    await found.get(key)!({ params, body, ip: '127.0.0.1', headers: {}, get: (name: string) => (name.toLowerCase() === 'x-pms-structure-delta' ? '2' : undefined) }, res);
    return res;
  };
}

test("a link with the row's own ancestor or descendant is refused on every path, and nothing of the write stays", { skip: !enabled }, async () => {
  const send = routes();
  const { project, phase, first, second, other, cleanup } = await fixture();
  try {
    const id = project.id;
    const state = async () => JSON.stringify(await Promise.all([
      readStructureVersion(id),
      prisma.wbsItem.findMany({ where: { projectId: id }, orderBy: { id: 'asc' } }),
      prisma.wbsDependency.findMany({ where: { projectId: id }, orderBy: { id: 'asc' } }),
      prisma.projectStructureCommit.count({ where: { projectId: id } }),
    ]));
    const refused = async (key: string, params: Record<string, string>, body: unknown) => {
      const before = await state();
      const res = await send(key, params, body);
      assert.equal(res.statusCode, 409, `${key}: ${JSON.stringify(res.body)}`);
      assert.equal(res.body.code, 'FAMILY_LINK');
      assert.equal(new Set(res.body.links.map((link: { predecessorId: string; successorId: string }) => `${link.predecessorId}:${link.successorId}`)).size, res.body.links.length, 'each pair once');
      assert.equal(await state(), before, 'rows, links, version and journal stay as they were');
      return res;
    };
    // A link drawn from a phase to its own task, or back.
    const drawn = await refused('post /projects/:projectId/wbs-dependencies', { projectId: id }, { predecessorId: phase.id, successorId: first.id, type: 'FS', lagDays: 0 });
    assert.match(drawn.body.error, /«1\.1 Строка 1\.1» не может зависеть от «1 Строка 1»/);
    await refused('post /projects/:projectId/wbs-dependencies', { projectId: id }, { predecessorId: second.id, successorId: phase.id, type: 'FF', lagDays: 0 });
    // The parent's code in a predecessor column.
    await refused('patch /wbs-items/:itemId', { itemId: second.id }, { predecessor1: '1' });
    // A row moved under the row it is linked with.
    const link = await send('post /projects/:projectId/wbs-dependencies', { projectId: id }, { predecessorId: other.id, successorId: first.id, type: 'FS', lagDays: 0 });
    assert.equal(link.statusCode, 201, JSON.stringify(link.body));
    const linkedVersion = await readStructureVersion(id);
    const moved = await send('patch /wbs-items/:itemId', { itemId: first.id }, { sortOrder: 45 });
    assert.equal(moved.statusCode, 409, JSON.stringify(moved.body));
    assert.equal(await readStructureVersion(id), linkedVersion);
    // An import that would write one.
    await assert.rejects(
      structureTransaction(async (tx) => {
        await applyWbsImport(tx, { projectId: id, rows: [{ code: '1.2', predecessors: ['1'] }] as never, importKey: `import-${randomUUID()}`, userId: null });
        await recalculateProjectWbsSchedule(id, {}, tx);
      }),
      (error: unknown) => error instanceof StructureWriteRejection && error.body.code === 'FAMILY_LINK',
    );
  } finally {
    await cleanup();
  }
});

test('family links a project already has are not counted, do not block other edits and can be deleted one by one', { skip: !enabled }, async () => {
  const send = routes();
  const { project, phase, first, second, cleanup } = await fixture();
  try {
    const id = project.id;
    // Written before the rule, straight into the tables.
    const up = await prisma.wbsDependency.create({ data: { projectId: id, predecessorId: first.id, successorId: phase.id, type: 'FS' } });
    const down = await prisma.wbsDependency.create({ data: { projectId: id, predecessorId: phase.id, successorId: second.id, type: 'FS' } });
    await prisma.wbsItem.update({ where: { id: second.id }, data: { predecessor1: '1' } });
    assert.ok(await recalculateProjectWbsSchedule(id) >= 0, 'the project is scheduled');
    const path = await calculateProjectCriticalPath(id);
    assert.ok(path.warnings.some((warning) => warning.includes('не учитывается')), JSON.stringify(path.warnings));
    const edited = await send('patch /wbs-items/:itemId', { itemId: first.id }, { workDays: 7, scheduleDriver: 'workDays' });
    assert.equal(edited.statusCode, 200, JSON.stringify(edited.body));
    for (const linkId of [up.id, down.id]) {
      const removed = await send('delete /wbs-dependencies/:dependencyId', { dependencyId: linkId }, {});
      assert.ok(removed.statusCode < 300, JSON.stringify(removed.body));
    }
    const cleared = await send('patch /wbs-items/:itemId', { itemId: second.id }, { predecessor1: null });
    assert.equal(cleared.statusCode, 200, JSON.stringify(cleared.body));
  } finally {
    await cleanup();
  }
});

test('renumbering cannot turn a link foreseen as a family one into a real one', { skip: !enabled }, async () => {
  const send = routes();
  const { project, phase, other, cleanup } = await fixture();
  try {
    const id = project.id;
    // An older project: a row given a deeper level that was never renumbered, linked with the row above it.
    const deeper = await prisma.wbsItem.create({ data: { projectId: id, code: '3', title: 'Строка 3', type: 'TASK', status: 'NOT_STARTED', owner: '', wbsLevel: 2, sortOrder: 50, startDate: new Date('2026-10-05'), workDays: 2 } });
    await prisma.wbsDependency.create({ data: { projectId: id, predecessorId: other.id, successorId: deeper.id, type: 'FS' } });
    const renumbered = await send('post /projects/:projectId/wbs-items/renumber', { projectId: id }, {});
    assert.equal(renumbered.statusCode, 409, JSON.stringify(renumbered.body));
    assert.equal(renumbered.body.code, 'FAMILY_LINK');
    assert.equal((await prisma.wbsItem.findUniqueOrThrow({ where: { id: deeper.id } })).code, '3');
    void phase;
  } finally {
    await cleanup();
  }
});
