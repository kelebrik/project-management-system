import { z } from 'zod';

const id = z.string().min(1).max(128);
export const artifactTableSchema = z.object({
  revision: z.number().int().min(0),
  columns: z.array(z.object({ id, title: z.string().max(500) })).min(1).max(50),
  rows: z.array(z.object({
    id,
    date: z.union([z.literal(''), z.iso.date()]),
    cells: z.record(id, z.string().max(20000)),
    files: z.record(id, z.array(z.object({ id, name: z.string().min(1).max(255) })).max(20)),
  })).min(1).max(1000),
}).superRefine((table, ctx) => {
  const columns = new Set(table.columns.map(column => column.id));
  if (columns.size !== table.columns.length || !columns.has('date')) ctx.addIssue({ code: 'custom', message: 'Unique columns including date are required' });
  if (table.columns[0]?.id !== 'date') ctx.addIssue({ code: 'custom', message: 'Date must be the first column' });
  if (new Set(table.rows.map(row => row.id)).size !== table.rows.length) ctx.addIssue({ code: 'custom', message: 'Duplicate row IDs' });
  for (const row of table.rows) {
    if ([...Object.keys(row.cells), ...Object.keys(row.files)].some(key => !columns.has(key) || key === 'date')) ctx.addIssue({ code: 'custom', message: 'Unknown cell column' });
  }
});
