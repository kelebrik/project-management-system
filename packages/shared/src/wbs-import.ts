import { z } from "zod";

/** The columns a Structure table can bring in; each one is optional except the code. */
export const wbsImportFields = [
  "id",
  "code",
  "title",
  "type",
  "status",
  "owner",
  "startDate",
  "dueDate",
  "workDays",
  "predecessors",
  "progress",
  "priority",
  "comment",
] as const;
export type WbsImportField = (typeof wbsImportFields)[number];

export const WBS_IMPORT_LIMITS = { rows: 3000, text: 500, comment: 4000 } as const;

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const date = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
  });

/**
 * One row of a table after its columns were matched and its cells read. A
 * field that is absent was not in the table and stays as it is; null clears it.
 */
export const wbsImportRowSchema = z
  .object({
    /** The row id an export writes; when present it, not the code, says which row this is. */
    id: z.string().trim().min(1).max(64).optional(),
    code: z.string().trim().regex(/^\d{1,4}(\.\d{1,4}){0,9}$/),
    title: z.string().trim().min(1).max(WBS_IMPORT_LIMITS.text).optional(),
    type: z.enum(["PHASE", "WORK_PACKAGE", "DELIVERABLE", "MILESTONE", "GOAL", "TASK"]).optional(),
    status: z.enum(["NOT_STARTED", "IN_PROGRESS", "IN_REVIEW", "AT_RISK", "BLOCKED", "DONE", "CANCELLED"]).optional(),
    owner: z.string().trim().max(WBS_IMPORT_LIMITS.text).optional(),
    startDate: isoDate.nullable().optional(),
    dueDate: isoDate.nullable().optional(),
    workDays: z.number().int().min(0).max(10_000).nullable().optional(),
    predecessors: z.array(z.string().trim().regex(/^\d{1,4}(\.\d{1,4}){0,9}$/)).max(6).optional(),
    progress: z.number().int().min(0).max(100).optional(),
    priority: z.string().trim().max(WBS_IMPORT_LIMITS.text).nullable().optional(),
    comment: z.string().trim().max(WBS_IMPORT_LIMITS.comment).nullable().optional(),
  })
  .strict();
export type WbsImportRow = z.infer<typeof wbsImportRowSchema>;

export const wbsImportRequestSchema = z.object({
  rows: z.array(wbsImportRowSchema).min(1).max(WBS_IMPORT_LIMITS.rows),
  dryRun: z.boolean().optional(),
  importKey: z.string().trim().regex(/^[A-Za-z0-9_-]{8,64}$/),
});

/** The numeric order of two codes: 1.2 < 1.10 < 2. */
export function compareWbsCodes(left: string, right: string) {
  const a = left.split(".").map(Number);
  const b = right.split(".").map(Number);
  for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
    const difference = (a[index] ?? -1) - (b[index] ?? -1);
    if (difference !== 0) return difference;
  }
  return 0;
}

/** What a dry run or an import reports. */
export type WbsImportChange = { field: WbsImportField; from: string; to: string };
export type WbsImportProblem = {
  code: string;
  kind:
    | "DUPLICATE_ROW"
    | "UNKNOWN_ID"
    | "CODE_TAKEN"
    | "PARENT_MISSING"
    | "TITLE_REQUIRED"
    | "PREDECESSOR_MISSING"
    | "PREDECESSOR_SELF"
    | "TYPE_KEPT"
    | "CODE_KEPT"
    | "MANAGED_BY_ISSUE";
  field?: WbsImportField;
  detail?: string;
};
export type WbsImportPlanSummary = {
  creates: Array<{ code: string; title: string; type: string; parentCode: string | null }>;
  updates: Array<{ code: string; changes: WbsImportChange[] }>;
  unchanged: number;
  /** Values that were not taken; the rest of the row is imported. */
  warnings: WbsImportProblem[];
  /** Any error stops the whole import. */
  errors: WbsImportProblem[];
};
