import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { prisma } from '../../apps/api/src/db.js';
import { captureProjectHistory, readProjectHistoryPayload } from '../../apps/api/src/services/project-history.js';
import { readProjectHistory, readProjectHistoryDays } from '../../apps/api/src/services/project-history-read.js';

const enabled = process.env.WORKFLOW_TEST_DATABASE === 'true';

async function fixture() {
  const suffix = randomUUID().slice(0, 8);
  const unit = await prisma.businessUnit.create({ data: { code: `hs-${suffix}`, name: 'History' } });
  const project = await prisma.project.create({ data: { businessUnitId: unit.id, code: `HS-${suffix}`, name: 'History', portfolio: 'T', sponsor: 'T', projectManager: 'T', startDate: new Date('2026-09-01'), targetDate: new Date('2026-12-01'), budgetPlanned: 0, budgetForecast: 0, summary: '' } });
  const item = await prisma.wbsItem.create({ data: { projectId: project.id, code: '1', title: 'Первая работа', type: 'TASK', status: 'NOT_STARTED', owner: 'Анна', startDate: new Date('2026-10-01'), dueDate: new Date('2026-10-20'), wbsLevel: 1, sortOrder: 10 } });
  return {
    unit, project, item,
    async cleanup() {
      await prisma.auditEvent.deleteMany({ where: { projectId: project.id } });
      await prisma.project.delete({ where: { id: project.id } });
      await prisma.businessUnit.delete({ where: { id: unit.id } });
    },
  };
}

test('a capture keeps the last state of each changed day, writes nothing unchanged, and serializes', { skip: !enabled }, async () => {
  const { project, item, cleanup } = await fixture();
  try {
    const at = (iso: string) => new Date(iso);
    assert.equal((await captureProjectHistory(project.id, { firstWriteAt: at('2026-10-05T09:00:00Z'), lastWriteAt: at('2026-10-05T09:00:00Z') })).status, 'captured');
    assert.equal((await captureProjectHistory(project.id, { firstWriteAt: at('2026-10-05T10:00:00Z'), lastWriteAt: at('2026-10-05T10:00:00Z') })).status, 'unchanged');
    await prisma.wbsItem.update({ where: { id: item.id }, data: { title: 'Переименована днём' } });
    await captureProjectHistory(project.id, { firstWriteAt: at('2026-10-05T12:00:00Z'), lastWriteAt: at('2026-10-05T12:00:00Z') });
    const days = await prisma.projectHistorySnapshot.findMany({ where: { projectId: project.id } });
    assert.equal(days.length, 1, 'the same day is replaced');
    assert.equal((days[0]!.payload as { wbs: { items: Array<{ title: string }> } }).wbs.items[0]!.title, 'Переименована днём');

    // Writes of 5 Oct and after Moscow midnight captured together: the row is the 6th and partial.
    await prisma.wbsItem.update({ where: { id: item.id }, data: { title: 'После полуночи' } });
    await captureProjectHistory(project.id, { firstWriteAt: at('2026-10-05T20:50:00Z'), lastWriteAt: at('2026-10-05T21:10:00Z') });
    const sixth = await prisma.projectHistorySnapshot.findUnique({ where: { projectId_day: { projectId: project.id, day: new Date('2026-10-06T00:00:00Z') } } });
    assert.equal(sixth?.partial, true);
    const currentNow = (await readProjectHistoryPayload(prisma, project.id))!;
    assert.equal((await readProjectHistory(project.id, '2026-10-06', currentNow)).structure.provenance, 'partial');

    // Two captures at once queue on the lock and the second finds nothing new.
    await prisma.wbsItem.update({ where: { id: item.id }, data: { title: 'Параллельно' } });
    const both = await Promise.all([1, 2].map(() => captureProjectHistory(project.id, { firstWriteAt: at('2026-10-07T09:00:00Z'), lastWriteAt: at('2026-10-07T09:00:00Z') })));
    assert.deepEqual(both.map((result) => result.status).sort(), ['captured', 'unchanged']);

    // A late capture stamped with an older day than the newest row writes to the newest row instead.
    await prisma.wbsItem.update({ where: { id: item.id }, data: { title: 'Поздний снимок' } });
    await captureProjectHistory(project.id, { firstWriteAt: at('2026-10-06T09:00:00Z'), lastWriteAt: at('2026-10-06T09:00:00Z') });
    const sixthAgain = await prisma.projectHistorySnapshot.findUnique({ where: { projectId_day: { projectId: project.id, day: new Date('2026-10-06T00:00:00Z') } } });
    assert.notEqual((sixthAgain?.payload as { wbs: { items: Array<{ title: string }> } }).wbs.items[0]!.title, 'Поздний снимок');
    const seventh = await prisma.projectHistorySnapshot.findUnique({ where: { projectId_day: { projectId: project.id, day: new Date('2026-10-07T00:00:00Z') } } });
    assert.equal((seventh?.payload as { wbs: { items: Array<{ title: string }> } }).wbs.items[0]!.title, 'Поздний снимок');

    // Too large to keep: the day stays, unavailable.
    await prisma.wbsItem.update({ where: { id: item.id }, data: { title: 'Слишком большой день' } });
    assert.equal((await captureProjectHistory(project.id, { firstWriteAt: at('2026-10-08T09:00:00Z'), lastWriteAt: at('2026-10-08T09:00:00Z') }, prisma, 100)).status, 'oversized');
    const current = (await readProjectHistoryPayload(prisma, project.id))!;
    assert.equal((await readProjectHistory(project.id, '2026-10-08', current)).structure.provenance, 'unavailable');

    const history = await readProjectHistory(project.id, '2026-10-05', current);
    assert.equal(history.structure.provenance, 'daily');
    assert.deepEqual(history.structure.compare?.changed[0]?.fields.find((field) => field.field === 'title'), { field: 'title', then: 'Переименована днём', now: 'Слишком большой день' });
    const daysList = await readProjectHistoryDays(project.id);
    assert.ok(daysList.some((day) => day.day === '2026-10-08' && day.unavailable));
    // Today's row is in the strip as well.
    await prisma.wbsItem.update({ where: { id: item.id }, data: { title: 'Сегодня' } });
    const today = new Date();
    await captureProjectHistory(project.id, { firstWriteAt: today, lastWriteAt: today });
    const todayKey = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Moscow', year: 'numeric', month: '2-digit', day: '2-digit' }).format(today);
    assert.ok((await readProjectHistoryDays(project.id)).some((day) => day.day === todayKey && day.captured));
  } finally {
    await cleanup();
  }
});

test('before the first capture each section says how it was rebuilt, and an unprovable row is unknown', { skip: !enabled }, async () => {
  const { project, item, cleanup } = await fixture();
  try {
    const risk = await prisma.raidItem.create({ data: { projectId: project.id, type: 'RISK', title: 'Риск сейчас', description: '', owner: 'Анна', probability: 3, impact: 3, riskScore: 9 } });
    await prisma.auditEvent.create({ data: { action: 'raid_item.update', objectType: 'RaidItem', objectId: risk.id, projectId: project.id, createdAt: new Date('2026-10-07T10:00:00Z'), beforeValue: { ...risk, title: 'Риск раньше' }, afterValue: { ...risk } } });
    await prisma.wbsCommand.create({ data: { projectId: project.id, type: 'MOVE', payload: {}, createdAt: new Date('2026-10-02T10:00:00Z'), afterSnapshot: { wbsItems: [{ ...item, title: 'Работа тогда' }], wbsDependencies: [] } } });
    const current = (await readProjectHistoryPayload(prisma, project.id))!;
    const history = await readProjectHistory(project.id, '2026-10-05', current);
    assert.equal(history.raid.provenance, 'reconstructed');
    assert.equal(history.raid.data?.[0]?.title, 'Риск раньше');
    assert.equal(history.structure.provenance, 'reconstructed');
    assert.equal(history.structure.data?.rows[0]?.title, 'Работа тогда');
    // The project row changed today and has no journal: its state then is not guessed.
    assert.equal(history.project.provenance, 'unknown');
  } finally {
    await cleanup();
  }
});
