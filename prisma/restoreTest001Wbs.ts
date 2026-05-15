import { PrismaClient } from '@prisma/client';
import { test001ProjectPlan } from './test001ProjectPlan';

const prisma = new PrismaClient();

function getParentWbsCode(code: string) {
  const parts = code.split('.');
  parts.pop();
  return parts.length > 0 ? parts.join('.') : null;
}

async function main() {
  const project = await prisma.project.findUnique({
    where: { code: test001ProjectPlan.code },
    select: { id: true, code: true },
  });

  if (!project) {
    throw new Error(`Project ${test001ProjectPlan.code} not found`);
  }

  const existingItems = await prisma.wbsItem.findMany({
    where: { projectId: project.id },
    select: { id: true, code: true },
  });
  const wbsIdByCode = new Map(existingItems.map((item) => [item.code, item.id]));
  let restoredWbsItems = 0;

  for (const item of test001ProjectPlan.wbsItems) {
    if (wbsIdByCode.has(item.code)) continue;

    const parentCode = getParentWbsCode(item.code);
    const created = await prisma.wbsItem.create({
      data: {
        projectId: project.id,
        parentId: parentCode ? (wbsIdByCode.get(parentCode) ?? null) : null,
        code: item.code,
        title: item.title,
        type: item.description.includes('Work days: 0') ? 'MILESTONE' : item.type,
        status: item.status,
        owner: item.owner,
        startDate: new Date(item.startDate),
        dueDate: new Date(item.dueDate),
        baselineStartDate: new Date(item.baselineStartDate),
        baselineDueDate: new Date(item.baselineDueDate),
        forecastStartDate: new Date(item.forecastStartDate),
        forecastDueDate: new Date(item.forecastDueDate),
        wbsLevel: item.wbsLevel,
        predecessor1: item.predecessor1,
        predecessor2: item.predecessor2,
        predecessor3: item.predecessor3,
        leadLagDays: item.leadLagDays,
        workDays: item.workDays,
        calendarDays: item.calendarDays,
        excelStartDate: item.excelStartDate ? new Date(item.excelStartDate) : null,
        excelEndDate: item.excelEndDate ? new Date(item.excelEndDate) : null,
        planWorkDays: item.planWorkDays,
        planCalendarDays: item.planCalendarDays,
        templateColor: item.templateColor,
        priority: item.priority,
        plannedCost: '0.00',
        forecastCost: '0.00',
        progress: item.progress,
        sortOrder: item.sortOrder,
        description: item.description,
      },
      select: { id: true },
    });

    wbsIdByCode.set(item.code, created.id);
    restoredWbsItems += 1;
  }

  let restoredDependencies = 0;
  for (const item of test001ProjectPlan.wbsItems) {
    const successorId = wbsIdByCode.get(item.code);
    if (!successorId) continue;

    for (const predecessorCode of [item.predecessor1, item.predecessor2, item.predecessor3]) {
      if (!predecessorCode) continue;
      const predecessorId = wbsIdByCode.get(predecessorCode);
      if (!predecessorId || predecessorId === successorId) continue;

      const result = await prisma.wbsDependency.upsert({
        where: {
          projectId_predecessorId_successorId_type: {
            projectId: project.id,
            predecessorId,
            successorId,
            type: 'FS',
          },
        },
        update: {
          lagDays: item.leadLagDays,
        },
        create: {
          projectId: project.id,
          predecessorId,
          successorId,
          type: 'FS',
          lagDays: item.leadLagDays,
        },
        select: { createdAt: true, updatedAt: true },
      });

      if (result.createdAt.getTime() === result.updatedAt.getTime()) {
        restoredDependencies += 1;
      }
    }
  }

  let restoredMilestones = 0;
  for (const item of test001ProjectPlan.milestones) {
    const existing = await prisma.milestone.findFirst({
      where: { projectId: project.id, code: item.code },
      select: { id: true },
    });
    if (existing) continue;

    await prisma.milestone.create({
      data: {
        projectId: project.id,
        code: item.code,
        title: item.title,
        dueDate: new Date(item.dueDate),
        status: item.status,
        owner: item.owner,
        description: item.description,
      },
    });
    restoredMilestones += 1;
  }

  const totalWbsItems = await prisma.wbsItem.count({ where: { projectId: project.id } });
  console.log(
    JSON.stringify(
      {
        project: project.code,
        restoredWbsItems,
        restoredDependencies,
        restoredMilestones,
        totalWbsItems,
      },
      null,
      2,
    ),
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
