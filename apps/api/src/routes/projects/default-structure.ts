import { prisma } from '../../db.js';
import { recalculateProjectWbsHierarchyStatuses, renumberProjectWbs } from '../../services/wbs.js';
import { recalculateProjectWbsSchedule } from '../../services/wbs-schedule.js';

const defaultProjectWbsItems = [
  { code: '1', title: 'Инициация проекта', type: 'PHASE', status: 'IN_PROGRESS', owner: 'РП', startOffset: 0, duration: 14, level: 1 },
  { code: '1.1', title: 'Паспорт проекта', type: 'TASK', status: 'DONE', owner: 'РП', startOffset: 0, duration: 4, level: 2 },
  { code: '1.2', title: 'Команда и роли', type: 'TASK', status: 'DONE', owner: 'Проектный офис', startOffset: 4, duration: 3, level: 2 },
  { code: '1.3', title: 'Старт проекта', type: 'MILESTONE', status: 'DONE', owner: 'Спонсор', startOffset: 7, duration: 0, level: 2 },
  { code: '2', title: 'Планирование', type: 'PHASE', status: 'IN_PROGRESS', owner: 'РП', startOffset: 8, duration: 22, level: 1 },
  { code: '2.1', title: 'Декомпозиция структуры', type: 'TASK', status: 'IN_PROGRESS', owner: 'РП', startOffset: 8, duration: 6, level: 2 },
  { code: '2.1.1', title: 'Уточнение зависимостей', type: 'TASK', status: 'NOT_STARTED', owner: 'Технический лидер', startOffset: 14, duration: 5, level: 3 },
  { code: '2.2', title: 'Базовый план согласован', type: 'MILESTONE', status: 'NOT_STARTED', owner: 'Спонсор', startOffset: 21, duration: 0, level: 2 },
  { code: '3', title: 'Исполнение', type: 'PHASE', status: 'NOT_STARTED', owner: 'Лидер поставки', startOffset: 22, duration: 30, level: 1 },
  { code: '3.1', title: 'Первый пакет работ', type: 'TASK', status: 'NOT_STARTED', owner: 'Лидер команды', startOffset: 22, duration: 10, level: 2 },
] as const;

function addDays(value: Date, days: number) {
  const result = new Date(value);
  result.setDate(result.getDate() + days);
  return result;
}

export async function createDefaultProjectStructure(projectId: string, projectStartDate: Date) {
  const createdByCode = new Map<string, { id: string }>();
  for (const [index, item] of defaultProjectWbsItems.entries()) {
    const parentCode = item.code.split('.').slice(0, -1).join('.');
    const startDate = addDays(projectStartDate, item.startOffset);
    const dueDate = addDays(startDate, item.duration);
    const created = await prisma.wbsItem.create({
      data: {
        projectId,
        parentId: createdByCode.get(parentCode)?.id ?? null,
        code: item.code,
        title: item.title,
        type: item.type,
        status: item.status,
        owner: item.owner,
        startDate,
        dueDate,
        forecastStartDate: startDate,
        forecastDueDate: dueDate,
        wbsLevel: item.level,
        workDays: item.duration === 0 ? 0 : item.duration + 1,
        calendarDays: item.duration === 0 ? 0 : item.duration + 1,
        calendarCode: index % 3 === 0 ? 'CN' : 'RU',
        progress: item.status === 'DONE' ? 100 : item.status === 'IN_PROGRESS' ? 35 : 0,
        closedAt: item.status === 'DONE' ? dueDate : null,
        sortOrder: (index + 1) * 10,
      },
      select: { id: true },
    });
    createdByCode.set(item.code, created);
  }

  const dependencies = [
    ['1.1', '1.2'],
    ['1.2', '1.3'],
    ['1.3', '2.1'],
    ['2.1', '2.1.1'],
    ['2.1.1', '2.2'],
    ['2.2', '3.1'],
  ];
  for (const [predecessorCode, successorCode] of dependencies) {
    const predecessor = createdByCode.get(predecessorCode);
    const successor = createdByCode.get(successorCode);
    if (!predecessor || !successor) continue;
    await prisma.wbsDependency.create({
      data: {
        projectId,
        predecessorId: predecessor.id,
        successorId: successor.id,
        type: 'FS',
        lagDays: 0,
      },
    });
  }

  await renumberProjectWbs(projectId);
  await recalculateProjectWbsSchedule(projectId);
  await recalculateProjectWbsHierarchyStatuses(projectId);
}
