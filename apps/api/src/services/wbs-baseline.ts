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
