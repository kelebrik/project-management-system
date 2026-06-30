import type { Project, WbsItem, WbsItemStatus } from '@prisma/client';
import * as XLSX from 'xlsx';
import { prisma } from '../db.js';
import {
  getProjectWbsSnapshot,
  levelFromWbsItem,
  recalculateProjectWbsHierarchyStatuses,
  renumberProjectWbs,
} from './wbs.js';
import { recordWbsCommand } from './wbs-audit.js';
import { recalculateProjectWbsSchedule } from './wbs-schedule.js';
import { calendarDaysInclusive, startOfUtcDay, workingDaysInclusive } from './wbs-schedule/calendar.js';

export const WBS_IMPORT_TEMPLATE_HEADERS = [
  'Наименование',
  'Статус',
  'Дата начала',
  'Дата окончания',
] as const;

const MAX_IMPORT_ROWS = 2_000;

const statusAliases = new Map<string, WbsItemStatus>([
  ['not started', 'NOT_STARTED'],
  ['не начата', 'NOT_STARTED'],
  ['не начато', 'NOT_STARTED'],
  ['не начат', 'NOT_STARTED'],
  ['в работе', 'IN_PROGRESS'],
  ['in progress', 'IN_PROGRESS'],
  ['на проверке', 'IN_REVIEW'],
  ['in review', 'IN_REVIEW'],
  ['под риском', 'AT_RISK'],
  ['at risk', 'AT_RISK'],
  ['заблокировано', 'BLOCKED'],
  ['заблокирована', 'BLOCKED'],
  ['провалено', 'BLOCKED'],
  ['blocked', 'BLOCKED'],
  ['сделано', 'DONE'],
  ['готово', 'DONE'],
  ['завершено', 'DONE'],
  ['done', 'DONE'],
  ['отменено', 'CANCELLED'],
  ['отменена', 'CANCELLED'],
  ['отменен', 'CANCELLED'],
  ['cancelled', 'CANCELLED'],
  ['canceled', 'CANCELLED'],
]);

export type WbsImportTaskRow = {
  rowNumber: number;
  title: string;
  status: WbsItemStatus;
  startDate: Date | null;
  dueDate: Date | null;
};

export type WbsImportResult = {
  project: Pick<Project, 'id' | 'code' | 'name'>;
  phase: Pick<WbsItem, 'id' | 'code' | 'title'>;
  createdCount: number;
  importedRows: number;
  createdItemIds: string[];
  snapshot: Awaited<ReturnType<typeof getProjectWbsSnapshot>>;
};

export class WbsImportValidationError extends Error {
  errors: string[];

  constructor(errors: string[]) {
    super(errors[0] ?? 'Файл импорта заполнен некорректно');
    this.name = 'WbsImportValidationError';
    this.errors = errors;
  }
}

function normalizeToken(value: unknown) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[_\s\-–—]+/g, ' ')
    .trim();
}

function isEmptyCell(value: unknown) {
  return value === null || value === undefined || String(value).trim() === '';
}

function makeUtcDate(year: number, month: number, day: number) {
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return date;
}

function parseDateCell(value: unknown) {
  if (isEmptyCell(value)) return null;

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : startOfUtcDay(value);
  }

  if (typeof value === 'number') {
    const parsed = XLSX.SSF.parse_date_code(value);
    return parsed ? makeUtcDate(parsed.y, parsed.m, parsed.d) : null;
  }

  const text = String(value).trim();
  const isoMatch = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (isoMatch) {
    return makeUtcDate(
      Number(isoMatch[1]),
      Number(isoMatch[2]),
      Number(isoMatch[3]),
    );
  }

  const ruMatch = text.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2}|\d{4})$/);
  if (ruMatch) {
    const year = Number(ruMatch[3].length === 2 ? `20${ruMatch[3]}` : ruMatch[3]);
    return makeUtcDate(year, Number(ruMatch[2]), Number(ruMatch[1]));
  }

  return null;
}

function parseStatusCell(value: unknown) {
  if (isEmptyCell(value)) return 'NOT_STARTED' satisfies WbsItemStatus;
  const normalized = normalizeToken(value);
  const enumStatus = normalized.toUpperCase().replace(/\s+/g, '_') as WbsItemStatus;
  if (
    enumStatus === 'NOT_STARTED' ||
    enumStatus === 'IN_PROGRESS' ||
    enumStatus === 'IN_REVIEW' ||
    enumStatus === 'AT_RISK' ||
    enumStatus === 'BLOCKED' ||
    enumStatus === 'DONE' ||
    enumStatus === 'CANCELLED'
  ) {
    return enumStatus;
  }
  return statusAliases.get(normalized) ?? null;
}

function validateHeaders(rows: unknown[][]) {
  const headerRow = rows[0] ?? [];
  const invalidHeaders = WBS_IMPORT_TEMPLATE_HEADERS.filter(
    (header, index) => normalizeToken(headerRow[index]) !== normalizeToken(header),
  );
  if (invalidHeaders.length === 0) return [];
  return [
    `В первой строке должны быть колонки: ${WBS_IMPORT_TEMPLATE_HEADERS.join(', ')}`,
  ];
}

export function createWbsImportTemplateBuffer() {
  const workbook = XLSX.utils.book_new();
  const sheet = XLSX.utils.aoa_to_sheet([[...WBS_IMPORT_TEMPLATE_HEADERS]]);
  sheet['!cols'] = [
    { wch: 44 },
    { wch: 18 },
    { wch: 16 },
    { wch: 16 },
  ];
  XLSX.utils.book_append_sheet(workbook, sheet, 'Импорт задач');
  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}

export function parseWbsImportWorkbook(buffer: Buffer): WbsImportTaskRow[] {
  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });
  } catch {
    throw new WbsImportValidationError(['Не удалось прочитать Excel-файл']);
  }

  const sheetName = workbook.SheetNames[0];
  const sheet = sheetName ? workbook.Sheets[sheetName] : null;
  if (!sheet) {
    throw new WbsImportValidationError(['В файле нет листов с задачами']);
  }

  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    blankrows: false,
    defval: null,
    raw: true,
  });
  const headerErrors = validateHeaders(rows);
  if (headerErrors.length > 0) {
    throw new WbsImportValidationError(headerErrors);
  }

  const errors: string[] = [];
  const taskRows: WbsImportTaskRow[] = [];

  for (const [index, row] of rows.slice(1).entries()) {
    const rowNumber = index + 2;
    const [titleCell, statusCell, startCell, dueCell] = row;
    if (
      isEmptyCell(titleCell) &&
      isEmptyCell(statusCell) &&
      isEmptyCell(startCell) &&
      isEmptyCell(dueCell)
    ) {
      continue;
    }

    const title = String(titleCell ?? '').trim();
    if (!title) {
      errors.push(`Строка ${rowNumber}: заполните наименование задачи`);
      continue;
    }

    const status = parseStatusCell(statusCell);
    if (!status) {
      errors.push(`Строка ${rowNumber}: неизвестный статус "${String(statusCell ?? '').trim()}"`);
      continue;
    }

    const startDate = parseDateCell(startCell);
    const dueDate = parseDateCell(dueCell);
    const hasStart = !isEmptyCell(startCell);
    const hasDue = !isEmptyCell(dueCell);

    if (hasStart && !startDate) {
      errors.push(`Строка ${rowNumber}: некорректная дата начала`);
      continue;
    }
    if (hasDue && !dueDate) {
      errors.push(`Строка ${rowNumber}: некорректная дата окончания`);
      continue;
    }
    if (Boolean(startDate) !== Boolean(dueDate)) {
      errors.push(`Строка ${rowNumber}: укажите обе даты или оставьте обе даты пустыми`);
      continue;
    }
    if (startDate && dueDate && dueDate.getTime() < startDate.getTime()) {
      errors.push(`Строка ${rowNumber}: дата окончания раньше даты начала`);
      continue;
    }

    taskRows.push({
      rowNumber,
      title,
      status,
      startDate,
      dueDate,
    });
  }

  if (taskRows.length > MAX_IMPORT_ROWS) {
    errors.push(`Файл содержит больше ${MAX_IMPORT_ROWS} задач`);
  }
  if (taskRows.length === 0 && errors.length === 0) {
    errors.push('В файле нет задач для импорта');
  }
  if (errors.length > 0) {
    throw new WbsImportValidationError(errors);
  }

  return taskRows;
}

function phaseSubtreeLastIndex(items: WbsItem[], phaseId: string) {
  const childrenByParent = new Map<string, WbsItem[]>();
  for (const item of items) {
    if (!item.parentId) continue;
    childrenByParent.set(item.parentId, [
      ...(childrenByParent.get(item.parentId) ?? []),
      item,
    ]);
  }

  const subtreeIds = new Set<string>([phaseId]);
  const stack = [phaseId];
  while (stack.length > 0) {
    const currentId = stack.pop();
    if (!currentId) continue;
    for (const child of childrenByParent.get(currentId) ?? []) {
      if (subtreeIds.has(child.id)) continue;
      subtreeIds.add(child.id);
      stack.push(child.id);
    }
  }

  return items.reduce(
    (lastIndex, item, index) => (subtreeIds.has(item.id) ? index : lastIndex),
    -1,
  );
}

export async function importWbsTasksIntoPhase(input: {
  projectId: string;
  phaseId: string;
  rows: WbsImportTaskRow[];
}): Promise<WbsImportResult> {
  const [project, phase, items, calendarOverrides] = await Promise.all([
    prisma.project.findUnique({
      where: { id: input.projectId },
      select: { id: true, code: true, name: true, status: true },
    }),
    prisma.wbsItem.findUnique({
      where: { id: input.phaseId },
    }),
    prisma.wbsItem.findMany({
      where: { projectId: input.projectId },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
    }),
    prisma.projectCalendarOverride.findMany({
      where: { projectId: input.projectId },
      select: {
        calendarCode: true,
        date: true,
        isWorkingDay: true,
      },
    }),
  ]);

  if (!project) {
    throw new WbsImportValidationError(['Проект не найден']);
  }
  if (project.status === 'CLOSED') {
    throw new WbsImportValidationError(['Проект закрыт и доступен только для чтения']);
  }
  if (!phase || phase.projectId !== project.id || phase.type !== 'PHASE') {
    throw new WbsImportValidationError(['Выбранная фаза не найдена в проекте']);
  }

  const phaseIndex = items.findIndex((item) => item.id === phase.id);
  if (phaseIndex === -1) {
    throw new WbsImportValidationError(['Выбранная фаза не найдена в структуре проекта']);
  }

  const insertIndex = phaseSubtreeLastIndex(items, phase.id) + 1;
  const phaseLevel = levelFromWbsItem(phase);
  const importedLevel = phaseLevel + 1;
  const now = Date.now();
  const overridesByKey = new Map(
    calendarOverrides.map((override) => [
      `${override.calendarCode}:${startOfUtcDay(override.date).toISOString().slice(0, 10)}`,
      override.isWorkingDay,
    ]),
  );

  const createdItems = await prisma.$transaction(async (tx) => {
    for (const [index, item] of items.entries()) {
      await tx.wbsItem.update({
        where: { id: item.id },
        data: {
          sortOrder: (index < insertIndex ? index + 1 : index + input.rows.length + 1) * 10,
        },
      });
    }

    const created: WbsItem[] = [];
    for (const [index, row] of input.rows.entries()) {
      const workDays =
        row.status === 'CANCELLED'
          ? 0
          : null;
      const calendarDays =
        row.startDate && row.dueDate
          ? calendarDaysInclusive(row.startDate, row.dueDate)
          : null;
      const planWorkDays =
        row.startDate && row.dueDate && row.status !== 'CANCELLED'
          ? workingDaysInclusive(row.startDate, row.dueDate, 'RU', overridesByKey)
          : workDays;
      created.push(
        await tx.wbsItem.create({
          data: {
            projectId: project.id,
            parentId: phase.id,
            code: `__import_${now}_${index + 1}`,
            title: row.title,
            type: 'TASK',
            status: row.status,
            owner: '',
            startDate: row.startDate,
            dueDate: row.dueDate,
            baselineStartDate: row.startDate,
            baselineDueDate: row.dueDate,
            forecastStartDate: row.startDate,
            forecastDueDate: row.dueDate,
            wbsLevel: importedLevel,
            leadLagDays: 0,
            workDays,
            calendarDays,
            excelStartDate: row.startDate,
            excelEndDate: row.dueDate,
            planWorkDays,
            planCalendarDays: calendarDays,
            calendarCode: 'RU',
            effortPercent: 0,
            plannedCost: 0,
            forecastCost: 0,
            progress: 0,
            closedAt: row.status === 'DONE' ? new Date() : null,
            sortOrder: (insertIndex + index + 1) * 10,
          },
        }),
      );
    }
    return created;
  });

  await renumberProjectWbs(project.id);
  await recalculateProjectWbsSchedule(project.id);
  await recalculateProjectWbsHierarchyStatuses(project.id);
  const snapshot = await getProjectWbsSnapshot(project.id);

  await recordWbsCommand({
    projectId: project.id,
    type: 'BULK_UPDATE',
    payload: {
      action: 'admin-import',
      phaseId: phase.id,
      createdItemIds: createdItems.map((item) => item.id),
      importedRows: input.rows.map((row) => row.rowNumber),
    },
    afterSnapshot: snapshot,
  });

  return {
    project,
    phase,
    createdCount: createdItems.length,
    importedRows: input.rows.length,
    createdItemIds: createdItems.map((item) => item.id),
    snapshot,
  };
}
