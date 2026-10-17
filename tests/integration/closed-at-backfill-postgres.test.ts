import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { prisma } from '../../apps/api/src/db.js';

const enabled = process.env.WORKFLOW_TEST_DATABASE === 'true';
const day = (value: string) => new Date(`${value}T12:00:00.000Z`);

test('the day old done and failed work was closed comes from the audit journal: the start of its last run of closed statuses', { skip: !enabled }, async () => {
  const suffix = randomUUID().slice(0, 8);
  const unit = await prisma.businessUnit.create({ data: { code: `cb-${suffix}`, name: 'Closed-at backfill' } });
  const project = await prisma.project.create({
    data: { code: `CB-${suffix}`, name: 'Backfill', businessUnitId: unit.id, portfolio: 'TEST', sponsor: '', projectManager: 'РП', startDate: day('2026-01-01'), targetDate: day('2026-12-01'), budgetPlanned: 0, budgetForecast: 0, summary: '' },
  });
  const row = (code: string, status: string, closedAt: Date | null = null) =>
    prisma.wbsItem.create({ data: { projectId: project.id, code, title: code, type: 'TASK', status: status as never, owner: '', startDate: day('2026-01-05'), dueDate: day('2026-02-01'), workDays: 5, sortOrder: Number(code) * 10, wbsLevel: 1, closedAt } });
  const audit = async (itemId: string, steps: Array<[day: string, from: string, to: string]>) => {
    for (const [at, from, to] of steps) {
      await prisma.auditEvent.create({
        data: {
          action: 'wbs_item.update', objectType: 'WbsItem', objectId: itemId, projectId: project.id, createdAt: day(at),
          changes: { create: { objectType: 'WbsItem', objectId: itemId, projectId: project.id, field: 'status', oldValue: from, newValue: to, oldText: from, newText: to, createdAt: day(at) } },
        },
      });
    }
  };
  // Done once: the day it was done.
  const done = await row('1', 'DONE');
  await audit(done.id, [['2026-03-01', 'NOT_STARTED', 'IN_PROGRESS'], ['2026-03-10', 'IN_PROGRESS', 'DONE']]);
  // Done, then failed: the day it was done, as the live rule keeps it.
  const doneThenFailed = await row('2', 'BLOCKED');
  await audit(doneThenFailed.id, [['2026-03-02', 'IN_PROGRESS', 'DONE'], ['2026-03-12', 'DONE', 'BLOCKED']]);
  // Failed, then done: the day it failed.
  const failedThenDone = await row('3', 'DONE');
  await audit(failedThenDone.id, [['2026-03-03', 'IN_PROGRESS', 'BLOCKED'], ['2026-03-13', 'BLOCKED', 'DONE']]);
  // Done, reopened, failed: the day it failed, after the reopening.
  const reopened = await row('4', 'BLOCKED');
  await audit(reopened.id, [['2026-03-04', 'IN_PROGRESS', 'DONE'], ['2026-03-14', 'DONE', 'IN_PROGRESS'], ['2026-03-24', 'IN_PROGRESS', 'BLOCKED']]);
  // Closed with no journal of it (a bulk change): left empty.
  const silent = await row('5', 'BLOCKED');
  // The journal says it was reopened and never closed again (closed in bulk): left empty.
  const inconsistent = await row('6', 'DONE');
  await audit(inconsistent.id, [['2026-03-06', 'IN_PROGRESS', 'DONE'], ['2026-03-16', 'DONE', 'IN_PROGRESS']]);
  // A day already noted stays.
  const noted = await row('7', 'DONE', day('2026-04-01'));
  await audit(noted.id, [['2026-03-07', 'IN_PROGRESS', 'DONE']]);
  // Open work is not touched, whatever its journal.
  const open = await row('8', 'IN_PROGRESS');
  await audit(open.id, [['2026-03-08', 'IN_PROGRESS', 'DONE'], ['2026-03-18', 'DONE', 'IN_PROGRESS']]);
  try {
    const sql = readFileSync(new URL('../../prisma/migrations/20261017120000_closed_at_from_audit/migration.sql', import.meta.url), 'utf8');
    const update = sql.slice(sql.indexOf('WITH changes')).replace(/;\s*$/, '');
    const scoped = `${update} AND w."projectId" = '${project.id}'`;
    await prisma.$executeRawUnsafe(scoped);
    const closedAt = async (id: string) => (await prisma.wbsItem.findUniqueOrThrow({ where: { id } })).closedAt?.toISOString().slice(0, 10) ?? null;
    assert.equal(await closedAt(done.id), '2026-03-10');
    assert.equal(await closedAt(doneThenFailed.id), '2026-03-02');
    assert.equal(await closedAt(failedThenDone.id), '2026-03-03');
    assert.equal(await closedAt(reopened.id), '2026-03-24');
    assert.equal(await closedAt(silent.id), null);
    assert.equal(await closedAt(inconsistent.id), null);
    assert.equal(await closedAt(noted.id), '2026-04-01');
    assert.equal(await closedAt(open.id), null);
    // Run again: nothing changes.
    const before = await prisma.wbsItem.findMany({ where: { projectId: project.id }, select: { id: true, closedAt: true }, orderBy: { code: 'asc' } });
    await prisma.$executeRawUnsafe(scoped);
    assert.deepEqual(await prisma.wbsItem.findMany({ where: { projectId: project.id }, select: { id: true, closedAt: true }, orderBy: { code: 'asc' } }), before);
  } finally {
    await prisma.auditEvent.deleteMany({ where: { projectId: project.id } }).catch(() => undefined);
    await prisma.project.deleteMany({ where: { id: project.id } }).catch(() => undefined);
    await prisma.businessUnit.delete({ where: { id: unit.id } }).catch(() => undefined);
  }
});
