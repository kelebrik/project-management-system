import { z } from "zod";
import { jiraPersonalDashboardSchema } from "./jira-dashboard-layer.js";

/**
 * How one person arranges the view of a project: the Structure's columns
 * (order, hidden, widths), its sorting and hierarchy level, the Gantt panel sizes and the widths of other project tables. Kept
 * per person; nothing here changes the project for anyone else.
 */
const columnKey = z.string().trim().min(1).max(60);
const columnList = z.array(columnKey).max(60);
const widths = z.record(columnKey, z.number().finite().min(20).max(4000)).refine((value) => Object.keys(value).length <= 60);
const panelSize = z.number().finite().min(80).max(8000);

export const projectViewStateSchema = z
  .object({
    wbsColumnOrder: columnList,
    wbsHiddenColumns: columnList,
    wbsColumnWidths: widths,
    wbsSort: z.object({ columnKey, direction: z.enum(["asc", "desc"]) }).nullable(),
    wbsHierarchyLevel: z.number().int().min(1).max(20).nullable(),
    sidebarCollapsed: z.boolean(),
    ganttPanelHeight: panelSize,
    ganttPanelWidth: panelSize,
    ganttWbsWidth: panelSize,
    currentWorkColumnWidths: widths,
    openIssueColumnWidths: widths,
    openIssuesPrototypeColumnWidths: widths,
    /** The person's layer over the project's shared Jira dashboard. */
    jiraDashboard: jiraPersonalDashboardSchema,
  })
  .partial()
  .strict();

export type ProjectViewState = z.infer<typeof projectViewStateSchema>;

/** The view fields that used to live in the project's shared uiState; read once as a person's starting point. */
export const PROJECT_VIEW_STATE_KEYS = Object.keys(projectViewStateSchema.shape) as Array<keyof ProjectViewState>;

/**
 * The valid view fields of any stored object, each checked on its own: one bad
 * value (an old width out of range) drops that field, not the whole view.
 */
export function readProjectViewState(value: unknown): ProjectViewState {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const source = value as Record<string, unknown>;
  const state: Record<string, unknown> = {};
  for (const key of PROJECT_VIEW_STATE_KEYS) {
    if (!(key in source)) continue;
    const field = projectViewStateSchema.shape[key].safeParse(source[key]);
    if (field.success && field.data !== undefined) state[key] = field.data;
  }
  return state as ProjectViewState;
}
