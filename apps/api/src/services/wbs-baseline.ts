import { prisma } from "../db.js";

export async function createWbsBaselineFromCurrentPlan(projectId: string) {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`
      UPDATE "WbsItem"
      SET
        "baselineStartDate" = "startDate",
        "baselineDueDate" = "dueDate",
        "forecastStartDate" = COALESCE("forecastStartDate", "startDate"),
        "forecastDueDate" = COALESCE("forecastDueDate", "dueDate")
      WHERE "projectId" = ${projectId}
    `;

    const [latestBaseline, items] = await Promise.all([
      tx.wbsBaseline.aggregate({
        where: { projectId },
        _max: { version: true },
      }),
      tx.wbsItem.findMany({
        where: { projectId },
        orderBy: [{ sortOrder: "asc" }, { code: "asc" }],
      }),
    ]);

    const version = (latestBaseline._max.version ?? 0) + 1;
    const codeById = new Map(items.map((item) => [item.id, item.code]));

    return tx.wbsBaseline.create({
      data: {
        projectId,
        version,
        title: `Базовый план v${version}`,
        status: "ACTIVE",
        items: {
          create: items.map((item) => ({
            sourceWbsItemId: item.id,
            parentCode: item.parentId ? codeById.get(item.parentId) ?? null : null,
            code: item.code,
            title: item.title,
            type: item.type,
            status: item.status,
            owner: item.owner,
            startDate: item.startDate,
            dueDate: item.dueDate,
            wbsLevel: item.wbsLevel,
            predecessor1: item.predecessor1,
            predecessor2: item.predecessor2,
            predecessor3: item.predecessor3,
            predecessor4: item.predecessor4,
            predecessor5: item.predecessor5,
            predecessor6: item.predecessor6,
            leadLagDays: item.leadLagDays,
            workDays: item.workDays,
            calendarDays: item.calendarDays,
            calendarCode: item.calendarCode,
            progress: item.progress,
            sortOrder: item.sortOrder,
          })),
        },
      },
    });
  });
}

const predecessorFields = [
  "predecessor1",
  "predecessor2",
  "predecessor3",
  "predecessor4",
  "predecessor5",
  "predecessor6",
] as const;

export async function copyLatestWbsBaselineToProject(input: {
  sourceProjectId: string;
  targetProjectId: string;
  createdById?: string | null;
}) {
  return prisma.$transaction(async (tx) => {
    const baseline = await tx.wbsBaseline.findFirst({
      where: {
        projectId: input.sourceProjectId,
        status: "ACTIVE",
      },
      orderBy: [{ version: "desc" }, { createdAt: "desc" }],
      include: {
        project: { select: { code: true, name: true } },
        items: { orderBy: [{ sortOrder: "asc" }, { code: "asc" }] },
      },
    });

    if (!baseline || baseline.items.length === 0) {
      throw new Error("У выбранного проекта нет активного базового плана");
    }

    const sourceCalendarOverrides = await tx.projectCalendarOverride.findMany({
      where: { projectId: input.sourceProjectId },
      orderBy: [{ calendarCode: "asc" }, { date: "asc" }],
    });
    if (sourceCalendarOverrides.length > 0) {
      await tx.projectCalendarOverride.createMany({
        data: sourceCalendarOverrides.map((override) => ({
          projectId: input.targetProjectId,
          calendarCode: override.calendarCode,
          date: override.date,
          isWorkingDay: override.isWorkingDay,
          description: override.description,
        })),
        skipDuplicates: true,
      });
    }

    const itemIdByCode = new Map<string, string>();
    const itemSourceIdByCode = new Map<string, string>();
    for (const item of baseline.items) {
      const created = await tx.wbsItem.create({
        data: {
          projectId: input.targetProjectId,
          parentId: null,
          code: item.code,
          title: item.title,
          type: item.type,
          status: item.status,
          owner: item.owner,
          startDate: item.startDate,
          dueDate: item.dueDate,
          baselineStartDate: item.startDate,
          baselineDueDate: item.dueDate,
          forecastStartDate: item.startDate,
          forecastDueDate: item.dueDate,
          wbsLevel: item.wbsLevel,
          predecessor1: item.predecessor1,
          predecessor2: item.predecessor2,
          predecessor3: item.predecessor3,
          predecessor4: item.predecessor4,
          predecessor5: item.predecessor5,
          predecessor6: item.predecessor6,
          leadLagDays: item.leadLagDays,
          workDays: item.workDays,
          calendarDays: item.calendarDays,
          calendarCode: item.calendarCode,
          progress: item.progress,
          sortOrder: item.sortOrder,
        },
        select: { id: true },
      });
      itemIdByCode.set(item.code, created.id);
      itemSourceIdByCode.set(item.code, item.sourceWbsItemId ?? created.id);
    }

    for (const item of baseline.items) {
      const itemId = itemIdByCode.get(item.code);
      if (!itemId || !item.parentCode) continue;
      await tx.wbsItem.update({
        where: { id: itemId },
        data: { parentId: itemIdByCode.get(item.parentCode) ?? null },
      });
    }

    const dependencyKeys = new Set<string>();
    for (const item of baseline.items) {
      const successorId = itemIdByCode.get(item.code);
      if (!successorId) continue;
      for (const field of predecessorFields) {
        const predecessorCode = item[field];
        if (!predecessorCode) continue;
        const predecessorId = itemIdByCode.get(predecessorCode);
        if (!predecessorId || predecessorId === successorId) continue;
        const key = `${predecessorId}:${successorId}:FS`;
        if (dependencyKeys.has(key)) continue;
        dependencyKeys.add(key);
        await tx.wbsDependency.create({
          data: {
            projectId: input.targetProjectId,
            predecessorId,
            successorId,
            type: "FS",
            lagDays: item.leadLagDays,
          },
        });
      }
    }

    const latestTargetBaseline = await tx.wbsBaseline.aggregate({
      where: { projectId: input.targetProjectId },
      _max: { version: true },
    });
    const targetVersion = (latestTargetBaseline._max.version ?? 0) + 1;
    const copiedBaseline = await tx.wbsBaseline.create({
      data: {
        projectId: input.targetProjectId,
        version: targetVersion,
        title: `Скопирован из ${baseline.project.code} v${baseline.version}`,
        status: "ACTIVE",
        createdById: input.createdById ?? null,
        items: {
          create: baseline.items.map((item) => ({
            sourceWbsItemId: itemIdByCode.get(item.code) ?? itemSourceIdByCode.get(item.code) ?? null,
            parentCode: item.parentCode,
            code: item.code,
            title: item.title,
            type: item.type,
            status: item.status,
            owner: item.owner,
            startDate: item.startDate,
            dueDate: item.dueDate,
            wbsLevel: item.wbsLevel,
            predecessor1: item.predecessor1,
            predecessor2: item.predecessor2,
            predecessor3: item.predecessor3,
            predecessor4: item.predecessor4,
            predecessor5: item.predecessor5,
            predecessor6: item.predecessor6,
            leadLagDays: item.leadLagDays,
            workDays: item.workDays,
            calendarDays: item.calendarDays,
            calendarCode: item.calendarCode,
            progress: item.progress,
            sortOrder: item.sortOrder,
          })),
        },
      },
      select: {
        id: true,
        version: true,
        title: true,
      },
    });

    return {
      sourceBaselineId: baseline.id,
      sourceProjectCode: baseline.project.code,
      sourceProjectName: baseline.project.name,
      sourceVersion: baseline.version,
      copiedBaseline,
      itemCount: baseline.items.length,
      dependencyCount: dependencyKeys.size,
    };
  });
}
