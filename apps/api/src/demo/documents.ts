import type { Prisma, Project } from '@prisma/client';
import { dateAt, demoId, owners } from './project.js';

export async function fillDocuments(tx: Prisma.TransactionClient, project: Project, base: Date) {
  const id = (key: string) => demoId(project.id, key);
  for (let i = 0; i < 3; i++) {
    await tx.changeRequest.upsert({ where: { id: id(`change-${i}`) }, update: {}, create: {
      id: id(`change-${i}`), projectId: project.id, type: (['SCHEDULE', 'BUDGET', 'SCOPE'] as const)[i],
      title: ['Перенос пилота на неделю', 'Резерв на дополнительную проверку', 'Расширение отчёта по SLA'][i],
      description: 'Демонстрационная заявка на изменение согласованного плана.', owner: owners[i],
      status: (['IN_REVIEW', 'APPROVED', 'IMPLEMENTED'] as const)[i],
      impactAnalysis: 'Плановая оценка: срок +7 дней, бюджет +150 тыс. руб.; основной бизнес-эффект сохраняется.',
      affectedBaseline: 'Демонстрационный базовый план', implementationPlan: 'Уточнить объём, согласовать ресурсы, выполнить проверку приёмки.',
      scheduleImpactDays: i === 0 ? 7 : 0, budgetImpact: i === 1 ? 150000 : 0,
      scopeImpact: 'Дополнительная проверка устойчивости сервиса.', dueDate: dateAt(i * 4 + 1, base),
      approvedAt: i > 0 ? dateAt(-3, base) : null, decisionRequired: i === 0,
    } });
    await tx.projectCalendarOverride.upsert({
      where: { projectId_calendarCode_date: { projectId: project.id, calendarCode: 'RU', date: dateAt(14 + i, base) } },
      update: {}, create: { projectId: project.id, calendarCode: 'RU', date: dateAt(14 + i, base),
        isWorkingDay: i !== 0, description: i === 0 ? 'Демо: обучение команды' : 'Демо: согласованное окно испытаний' },
    });
  }
  if (await tx.wbsBaseline.count({ where: { projectId: project.id } }) === 0) {
    const rows = await tx.wbsItem.findMany({ where: { projectId: project.id } });
    const codes = new Map(rows.map((row) => [row.id, row.code]));
    await tx.wbsBaseline.create({ data: {
      id: id('baseline'), projectId: project.id, version: 1, title: 'Демо: исходный план', status: 'ACTIVE',
      items: { create: rows.map((row) => ({
        sourceWbsItemId: row.id, code: row.code, parentCode: row.parentId ? codes.get(row.parentId) : null,
        title: row.title, type: row.type, status: row.status, owner: row.owner,
        startDate: row.baselineStartDate ?? row.startDate, dueDate: row.baselineDueDate ?? row.dueDate,
        wbsLevel: row.wbsLevel, calendarCode: row.calendarCode, effortPercent: row.effortPercent,
        progress: row.progress, sortOrder: row.sortOrder,
      })) },
    } });
  }
  const reportId = id('overview');
  if (!await tx.executiveOverview.findUnique({ where: { id: reportId } })) {
    const latest = await tx.executiveOverview.aggregate({ where: { projectId: project.id }, _max: { version: true } });
    await tx.executiveOverview.create({ data: {
      id: reportId, projectId: project.id, version: (latest._max.version ?? 0) + 1, status: 'GENERATED', generatedAt: base,
      executiveSummary: `Демо-обзор «${project.name}»: проектирование завершено, реализация выполняется. Для пилота необходимо решение по двум критическим вопросам.`,
      kpis: [{ name: 'Готовность пилота', value: '55%', target: '100%' }],
      risks: [{ title: 'Срыв поставки компонентов', score: 25, owner: owners[0], mitigation: 'Подготовить резервного поставщика' }],
      qualityGates: [{ title: 'Критерии приёмки согласованы', status: 'AMBER' }],
      nextSteps: [{ title: 'Завершить проверку API', owner: owners[1], dueDate: dateAt(7, base).toISOString() }],
      decisions: [{ title: 'Утвердить резерв поставки', owner: project.sponsor, deadline: dateAt(5, base).toISOString() }],
      evidence: [{ metric: 'Демонстрационный сценарий', source: 'Локальные демоданные, не производственная отчётность' }],
    } });
  }
}
