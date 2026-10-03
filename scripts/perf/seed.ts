/**
 * Fills an empty database with a load-test portfolio: many ordinary
 * projects and a few large ones, with a realistic Structure (phases, work
 * packages, tasks), finish-to-start links and owners. Run against a
 * throwaway database only:
 *   DATABASE_URL=... DEPLOYMENT_PROFILE=cloud npx tsx scripts/perf/seed.ts
 * PERF_PLAN sets the projects as count x rows (default 50x200,1x2000,1x5000);
 * the admin perf@example.com signs in with perf-password-123.
 */
import { PrismaClient, type Prisma } from '@prisma/client';
import { grantAdmin, setPassword } from '../../apps/api/src/services/admin-provision.js';
import { recalculateProjectWbsSchedule } from '../../apps/api/src/services/wbs-schedule.js';

const prisma = new PrismaClient();
const DAY = 86_400_000;
const people = Array.from({ length: 120 }, (_, index) => `Сотрудник ${String(index + 1).padStart(3, '0')}`);
const plan = (process.env.PERF_PLAN ?? '50x200,1x2000,1x5000').split(',').map((part) => {
  const [count, rows] = part.split('x').map(Number);
  return { count, rows };
});

async function seedProject(index: number, rows: number, businessUnitId: string) {
  // Ten phases; each has packages of ten tasks, as many as come closest to the requested rows.
  const phases = 10;
  const tasksPerPackage = 10;
  const packagesPerPhase = Math.max(1, Math.round((rows - phases) / phases / (tasksPerPackage + 1)));
  const total = phases * (1 + packagesPerPhase * (tasksPerPackage + 1));
  const start = new Date(Date.UTC(2026, 0, 12) + (index % 20) * 7 * DAY);
  const project = await prisma.project.create({
    data: {
      businessUnitId,
      code: `PERF-${String(index).padStart(3, '0')}-${rows}`,
      name: `Нагрузочный проект ${index} (${total} строк)`,
      portfolio: `Портфель ${index % 5}`,
      sponsor: people[index % people.length],
      projectManager: people[(index + 7) % people.length],
      startDate: start,
      targetDate: new Date(start.getTime() + 400 * DAY),
      budgetPlanned: 1_000_000,
      budgetForecast: 1_000_000,
      summary: 'Синтетические данные для замеров',
    },
  });
  const items: Prisma.WbsItemCreateManyInput[] = [];
  const links: Array<[number, number]> = [];
  let sortOrder = 0;
  for (let p = 1; p <= phases; p += 1) {
    const phaseId = `${project.id}-p${p}`;
    items.push({ id: phaseId, projectId: project.id, code: `${p}`, title: `Фаза ${p}`, type: 'PHASE', owner: '', wbsLevel: 1, sortOrder: (sortOrder += 10) });
    for (let w = 1; w <= packagesPerPhase; w += 1) {
      const packageId = `${phaseId}-w${w}`;
      items.push({ id: packageId, projectId: project.id, parentId: phaseId, code: `${p}.${w}`, title: `Пакет работ ${p}.${w}`, type: 'WORK_PACKAGE', owner: people[(p * 13 + w) % people.length], wbsLevel: 2, sortOrder: (sortOrder += 10) });
      for (let t = 1; t <= tasksPerPackage; t += 1) {
        const taskStart = new Date(start.getTime() + ((p - 1) * 30 + w * 3 + t * 2) * DAY);
        items.push({
          id: `${packageId}-t${t}`, projectId: project.id, parentId: packageId, code: `${p}.${w}.${t}`, title: `Задача ${p}.${w}.${t}: подготовить и согласовать результат`,
          type: 'TASK', owner: people[(p * 31 + w * 7 + t) % people.length], wbsLevel: 3, sortOrder: (sortOrder += 10),
          startDate: taskStart, dueDate: new Date(taskStart.getTime() + 4 * DAY), baselineStartDate: taskStart, baselineDueDate: new Date(taskStart.getTime() + 4 * DAY),
          progress: (t * 11) % 100, status: t < 3 ? 'DONE' : t < 6 ? 'IN_PROGRESS' : 'NOT_STARTED',
        });
        if (t > 1 && t % 3 !== 0) links.push([items.length - 2, items.length - 1]);
      }
    }
  }
  for (let offset = 0; offset < items.length; offset += 1000) await prisma.wbsItem.createMany({ data: items.slice(offset, offset + 1000) });
  await prisma.wbsDependency.createMany({ data: links.map(([from, to]) => ({ projectId: project.id, predecessorId: items[from].id as string, successorId: items[to].id as string, type: 'FS' as const })) });
  const began = Date.now();
  await recalculateProjectWbsSchedule(project.id);
  return { code: project.code, rows: items.length, links: links.length, recalcMs: Date.now() - began };
}

async function main() {
  // Never on a real database: only a freshly migrated one. Migrations add the
  // default business unit, the cloud owner account and four TEST-00x projects.
  const [projects, users, units] = await Promise.all([
    prisma.project.count({ where: { code: { notIn: ['TEST-001', 'TEST-002', 'TEST-003', 'TEST-004'] } } }),
    prisma.user.count({ where: { NOT: { email: { in: ['kelebrik@gmail.com', 'perf@example.com'] } } } }),
    prisma.businessUnit.count(),
  ]);
  if (projects > 0 || users > 0 || units > 1) {
    throw new Error(`The database is not empty (${projects} projects, ${users} users, ${units} business units); use a freshly migrated one.`);
  }
  await grantAdmin(prisma, { email: 'perf@example.com', name: 'Нагрузочный админ' });
  await setPassword(prisma, { email: 'perf@example.com', password: 'perf-password-123' });
  const unit = await prisma.businessUnit.findFirst({ where: { isDefault: true } })
    ?? await prisma.businessUnit.create({ data: { code: 'PERF', name: 'Нагрузочный юнит', isDefault: true } });
  let index = 0;
  for (const { count, rows } of plan) {
    for (let n = 0; n < count; n += 1) {
      index += 1;
      const result = await seedProject(index, rows, unit.id);
      if (rows >= 1000 || index % 10 === 0) console.log(JSON.stringify(result));
    }
  }
}

main().finally(() => prisma.$disconnect());
