import { Prisma } from '@prisma/client';
import type { StructureDb } from './wbs-structure-write.js';

/** Columns a recalculation rewrites, with the SQL type each value is cast to. */
const WBS_BULK_COLUMNS = {
  code: 'text',
  parentId: 'text',
  wbsLevel: 'integer',
  predecessor1: 'text',
  predecessor2: 'text',
  predecessor3: 'text',
  predecessor4: 'text',
  predecessor5: 'text',
  predecessor6: 'text',
  sortOrder: 'integer',
  type: '"WbsItemType"',
  status: '"WbsItemStatus"',
  closedAt: 'timestamp(3)',
  startDate: 'timestamp(3)',
  dueDate: 'timestamp(3)',
  forecastStartDate: 'timestamp(3)',
  forecastDueDate: 'timestamp(3)',
  workDays: 'integer',
  calendarDays: 'integer',
} as const;

export type WbsBulkColumn = keyof typeof WBS_BULK_COLUMNS;
export type WbsBulkRow = { id: string } & Partial<Record<WbsBulkColumn, string | number | Date | null>>;

function bulkValue(value: string | number | Date | null | undefined) {
  if (value === null || value === undefined) return null;
  // timestamp(3) has no zone: Prisma keeps UTC wall time, so the ISO text without the Z is the stored value.
  if (value instanceof Date) return value.toISOString().slice(0, 23);
  return String(value);
}

/**
 * The SQL for one statement that sets `columns` on every row of the project
 * listed in `rows`, instead of one UPDATE per row. Values travel as text
 * arrays and are cast per column; column names come only from the list above.
 */
export function buildWbsBulkUpdate(projectId: string, rows: WbsBulkRow[], columns: WbsBulkColumn[]) {
  const ids = rows.map((row) => row.id);
  if (new Set(ids).size !== ids.length) throw new Error('Bulk Structure update repeats a row');
  if (columns.length === 0) throw new Error('Bulk Structure update sets no column');
  for (const column of columns) {
    if (!(column in WBS_BULK_COLUMNS)) throw new Error(`Unknown Structure column ${column}`);
  }

  const arrays = [
    Prisma.sql`${ids}::text[]`,
    ...columns.map((column) => Prisma.sql`${rows.map((row) => bulkValue(row[column]))}::text[]`),
  ];
  const names = Prisma.raw(['"id"', ...columns.map((column) => `"${column}"`)].join(', '));
  const assignments = Prisma.raw([
    ...columns.map((column) => `"${column}" = v."${column}"::${WBS_BULK_COLUMNS[column]}`),
    '"updatedAt" = CURRENT_TIMESTAMP(3)',
  ].join(', '));
  return Prisma.sql`UPDATE "WbsItem" AS w SET ${assignments}
    FROM unnest(${Prisma.join(arrays)}) AS v(${names})
    WHERE w."id" = v."id" AND w."projectId" = ${projectId}`;
}

/** Writes the rows in one statement; a row missing from the project rolls the whole write back. */
export async function bulkUpdateWbsItems(db: StructureDb, projectId: string, rows: WbsBulkRow[], columns: WbsBulkColumn[]) {
  if (rows.length === 0) return 0;
  const updated = await db.$executeRaw(buildWbsBulkUpdate(projectId, rows, columns));
  if (updated !== rows.length) {
    throw new Error(`Bulk Structure update touched ${updated} of ${rows.length} rows`);
  }
  return updated;
}
