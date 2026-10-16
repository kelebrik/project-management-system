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
 * The view fields a person keeps the same in every project: how the Structure
 * and its Gantt are laid out, and the sidebar. Changed in one project, they
 * apply in all. The rest (hierarchy level, other tables' widths, the Jira
 * dashboard) depends on the project and stays with it.
 */
export const GLOBAL_VIEW_STATE_KEYS = [
  "wbsColumnOrder",
  "wbsHiddenColumns",
  "wbsColumnWidths",
  "wbsSort",
  "ganttPanelHeight",
  "ganttPanelWidth",
  "ganttWbsWidth",
  "sidebarCollapsed",
] as const satisfies ReadonlyArray<keyof ProjectViewState>;

/** The part of a view that is the same in every project. */
export function globalViewFields(state: ProjectViewState): ProjectViewState {
  const fields: Record<string, unknown> = {};
  for (const key of GLOBAL_VIEW_STATE_KEYS) if (key in state) fields[key] = state[key];
  return fields as ProjectViewState;
}

/** The part of a view that belongs to one project. */
export function projectOnlyViewFields(state: ProjectViewState): ProjectViewState {
  const fields: Record<string, unknown> = { ...state };
  for (const key of GLOBAL_VIEW_STATE_KEYS) delete fields[key];
  return fields as ProjectViewState;
}

/**
 * A person's view of a project: the project's own record, with what they keep
 * the same everywhere on top (saved values, false, null and [] included).
 */
export function mergeProjectView(projectState: ProjectViewState | null, defaults: ProjectViewState | null): ProjectViewState | null {
  if (!projectState && !defaults) return null;
  return { ...(projectState ?? {}), ...globalViewFields(defaults ?? {}) };
}

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
