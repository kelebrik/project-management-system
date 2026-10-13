import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import type { Router } from 'express';
import { prisma } from '../../apps/api/src/db.js';
import { registerWbsItemRoutes } from '../../apps/api/src/routes/wbs/items.routes.js';
import { calculateProjectCriticalPath } from '../../apps/api/src/services/wbs-critical-path.js';
import { recalculateProjectWbsSchedule } from '../../apps/api/src/services/wbs-schedule.js';
import { getProjectWbsSnapshot } from '../../apps/api/src/services/wbs.js';
import { previewRowEdit, PREVIEW_FIELDS } from '../../apps/web/src/app/structurePreview.js';
import type { WbsItem } from '../../apps/web/src/app/domainTypes.js';
import { random } from '../oracle/random-plans.js';

// A row edit previewed in the browser must show what the server then writes:
// every row's dates, durations and status, and the critical path.

const enabled = process.env.WORKFLOW_TEST_DATABASE === 'true';
const DAY = 86_400_000;
const plain = (value: unknown) => JSON.parse(JSON.stringify(value));
const iso = (time: number) => new Date(time).toISOString().slice(0, 10);

/** A Structure of about 300 rows from a seed: nested phases and packages, every type, status and calendar, links of every kind. */
async function generatedProject(seed: number) {
  const next = random(seed);
  const pick = <T,>(values: readonly T[]) => values[Math.floor(next() * values.length)]!;
  const chance = (probability: number) => next() < probability;
  const suffix = randomUUID().slice(0, 8);
  const unit = await prisma.businessUnit.create({ data: { code: `pv-${suffix}`, name: 'Preview' } });
  const project = await prisma.project.create({ data: { businessUnitId: unit.id, code: `PV-${suffix}`, name: 'Preview', portfolio: 'T', sponsor: 'T', projectManager: 'T', startDate: new Date('2026-09-01'), targetDate: new Date('2027-06-01'), budgetPlanned: 0, budgetForecast: 0, summary: '' } });
  const base = Date.UTC(2026, 8, 1);
  const rows: Array<{ id: string; code: string }> = [];
  const parents: Array<string | null> = [null];
  const counters: number[] = [];
  for (let index = 0; index < 300; index += 1) {
    const level = Math.min(counters.length + 1, 1 + Math.floor(next() * 4));
    counters.length = level;
    counters[level - 1] = (counters[level - 1] ?? 0) + 1;
    const code = counters.join('.');
    const parentCode = counters.slice(0, -1).join('.');
    const parentId = rows.find((row) => row.code === parentCode)?.id ?? null;
    const type = level === 1 ? 'PHASE' : level === 2 ? pick(['WORK_PACKAGE', 'DELIVERABLE'] as const) : pick(['TASK', 'TASK', 'TASK', 'MILESTONE', 'GOAL', 'DELIVERABLE'] as const);
    const start = chance(0.1) ? null : base + Math.floor(next() * 120) * DAY;
    const row = await prisma.wbsItem.create({ data: {
      projectId: project.id, parentId, code, title: `Строка ${code}`, type, owner: '',
      status: pick(['NOT_STARTED', 'NOT_STARTED', 'IN_PROGRESS', 'DONE', 'AT_RISK', 'BLOCKED', 'IN_REVIEW', 'CANCELLED'] as const),
      startDate: start === null ? null : new Date(start),
      dueDate: start === null || chance(0.1) ? null : new Date(start + Math.floor(next() * 20) * DAY),
      workDays: chance(0.1) ? null : chance(0.05) ? 0 : 1 + Math.floor(next() * 15),
      calendarCode: pick(['RU', 'RU', 'RU', 'CN', 'RU_CN'] as const),
      wbsLevel: level,
      // Some rows share a plan position, as old imports left them.
      sortOrder: chance(0.05) && index > 0 ? (index - 1) * 10 : index * 10,
      predecessor1: null,
    } });
    rows.push({ id: row.id, code });
    parents.push(parentId);
  }
  // A link between a row and its own ancestor makes the schedule diverge on both sides; people link across branches.
  const family = (left: number, right: number) => rows[right]!.code.startsWith(`${rows[left]!.code}.`) || rows[left]!.code.startsWith(`${rows[right]!.code}.`);
  for (let index = 0; index < rows.length; index += 1) {
    if (!chance(0.08)) continue;
    const predecessor = Math.floor(next() * Math.max(1, index));
    if (predecessor === index || family(predecessor, index)) continue;
    await prisma.wbsItem.update({ where: { id: rows[index]!.id }, data: { predecessor1: rows[predecessor]!.code } });
  }
  const pairs = new Set<string>();
  for (let index = 0; index < 160; index += 1) {
    const successor = Math.floor(next() * rows.length);
    const predecessor = Math.floor(next() * Math.max(1, successor));
    if (predecessor === successor || family(predecessor, successor) || pairs.has(`${predecessor}:${successor}`)) continue;
    pairs.add(`${predecessor}:${successor}`);
    await prisma.wbsDependency.create({ data: { projectId: project.id, predecessorId: rows[predecessor]!.id, successorId: rows[successor]!.id, type: chance(0.7) ? 'FS' : pick(['SS', 'FF', 'SF'] as const), lagDays: chance(0.7) ? 0 : Math.floor(next() * 6) - 2 } });
  }
  for (let index = 0; index < 8; index += 1) {
    await prisma.projectCalendarOverride.create({ data: { projectId: project.id, calendarCode: pick(['RU', 'CN'] as const), date: new Date(base + Math.floor(next() * 150) * DAY), isWorkingDay: chance(0.3) } }).catch(() => undefined);
  }
  if (seed % 2 === 0) await recalculateProjectWbsSchedule(project.id);
  return {
    project,
    async cleanup() {
      await prisma.auditEvent.deleteMany({ where: { projectId: project.id } });
      await prisma.project.delete({ where: { id: project.id } });
      await prisma.businessUnit.delete({ where: { id: unit.id } });
    },
  };
}

function patchRoute() {
  let handler: Function | undefined;
  registerWbsItemRoutes(new Proxy({}, { get: (_t, verb) => (path: string, ...callbacks: Function[]) => { if (`${String(verb)} ${path}` === 'patch /wbs-items/:itemId') handler = callbacks.at(-1); } }) as unknown as Router);
  return async (itemId: string, body: unknown) => {
    const res: any = { statusCode: 200, body: undefined, headers: {}, status(code: number) { this.statusCode = code; return this; }, json(value: unknown) { this.body = value; return this; }, setHeader() {} };
    await handler!({ params: { itemId }, body, ip: '127.0.0.1', headers: {}, get: (name: string) => (name.toLowerCase() === 'x-pms-structure-delta' ? '2' : undefined) }, res);
    return res;
  };
}

/** A row edit as the Structure table sends it. */
function randomEdit(next: () => number, item: WbsItem) {
  const pick = <T,>(values: readonly T[]) => values[Math.floor(next() * values.length)]!;
  const date = iso(Date.UTC(2026, 8, 1) + Math.floor(next() * 150) * DAY);
  switch (Math.floor(next() * 10)) {
    case 0: return { startDate: date, forecastStartDate: date, excelStartDate: date, scheduleDriver: 'dates' };
    case 1: return { dueDate: date, forecastDueDate: date, excelEndDate: date, scheduleDriver: 'dates' };
    case 2: return { workDays: Math.floor(next() * 20), scheduleDriver: 'workDays' };
    case 3: {
      const status = pick(['NOT_STARTED', 'IN_PROGRESS', 'DONE', 'AT_RISK', 'BLOCKED', 'IN_REVIEW', 'CANCELLED'] as const);
      return status === 'CANCELLED' ? { status, workDays: 0, scheduleDriver: 'workDays' } : { status };
    }
    case 4: return { type: item.type === 'MILESTONE' ? 'TASK' : pick(['MILESTONE', 'GOAL', 'TASK'] as const) };
    case 5: return { calendarCode: pick(['RU', 'CN', 'RU_CN'] as const) };
    case 6: return { startDate: null, forecastStartDate: null, excelStartDate: null, scheduleDriver: 'dates' };
    case 7: return { calendarDays: Math.floor(next() * 30) };
    case 8: return { startDate: date, dueDate: iso(Date.parse(date) + Math.floor(next() * 10) * DAY) };
    default: return { progress: Math.floor(next() * 100), title: 'Переименована' };
  }
}

test('a previewed row edit shows what the server writes, on generated Structures', { skip: !enabled }, async () => {
  const send = patchRoute();
  let compared = 0;
  let failed = 0;
  for (const seed of [1, 2, 3, 4]) {
    const { project, cleanup } = await generatedProject(seed);
    try {
      const next = random(seed * 7919);
      for (let edit = 0; edit < 50; edit += 1) {
        const before = plain(await getProjectWbsSnapshot(project.id));
        const today = new Date().toISOString().slice(0, 10);
        const base = { items: before.wbsItems as WbsItem[], dependencies: before.wbsDependencies, calendarOverrides: plain(await prisma.projectCalendarOverride.findMany({ where: { projectId: project.id } })), today };
        const item = base.items[Math.floor(next() * base.items.length)]!;
        const patch = randomEdit(next, item);
        let preview: ReturnType<typeof previewRowEdit>;
        try {
          preview = previewRowEdit(base, item.id, patch as never);
        } catch (error) {
          // A plan the engine cannot schedule fails the same way on the server; the page then sends the edit without a preview.
          await assert.rejects(send(item.id, patch), { message: (error as Error).message });
          failed += 1;
          continue;
        }
        assert.ok(preview, `seed ${seed} edit ${edit}: ${JSON.stringify(patch)} is previewed`);
        const res = await send(item.id, patch);
        if (res.statusCode !== 200) continue;
        const after = plain(await getProjectWbsSnapshot(project.id));
        const afterById = new Map((after.wbsItems as WbsItem[]).map((row) => [row.id, row]));
        for (const row of preview.items) {
          const server = afterById.get(row.id)!;
          for (const field of PREVIEW_FIELDS) {
            assert.equal(row[field] ?? null, server[field] ?? null, `seed ${seed} edit ${edit} ${JSON.stringify(patch)} on ${item.code}: ${row.code}.${field}`);
          }
        }
        assert.deepEqual(preview.criticalPath, plain(await calculateProjectCriticalPath(project.id, prisma, new Date(`${today}T12:00:00.000Z`))), `seed ${seed} edit ${edit}: critical path`);
        compared += 1;
      }
    } finally {
      await cleanup();
    }
  }
  assert.ok(compared >= 150, `compared ${compared} edits, ${failed} failed on both sides`);
});
