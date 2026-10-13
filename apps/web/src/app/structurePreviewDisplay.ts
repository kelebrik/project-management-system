import type { ProjectDetails, WbsCriticalPath, WbsItem } from "./domainTypes";
import { savedWbsForm, wbsToForm, type WbsFormState } from "./formState";
import { PREVIEW_FIELDS, type PreviewField } from "./structurePreview";
import type { WbsTableColumnKey } from "./wbsTable";

type Preview = {
  projectId: string;
  baseItems: WbsItem[];
  baseDependencies: unknown[];
  baseCalendarOverrides: unknown[];
  items: WbsItem[];
  criticalPath: WbsCriticalPath;
  changedIds: Set<string>;
  editedItemId: string;
  sentDraft: WbsFormState;
};

export type PreviewDisplay = {
  /** The rows and the critical path to draw: the preview's while it applies, otherwise the project's. */
  items: WbsItem[];
  criticalPath: WbsCriticalPath | null;
  /** The drafts to show in the table: the preview's values where the person has not typed over them. */
  drafts: Record<string, WbsFormState>;
  /** The fields of each row whose shown value is the preview's own, not yet confirmed. */
  preliminary: Map<string, Set<PreviewField>>;
  active: boolean;
};

/** Which table column shows a preview field. */
export const PREVIEW_COLUMN: Partial<Record<WbsTableColumnKey, PreviewField>> = {
  start: "startDate",
  due: "dueDate",
  workDays: "workDays",
  calendarDays: "calendarDays",
  status: "status",
};

/**
 * What the Structure shows while a row edit waits for the server. The
 * preview applies only to the very rows, links and calendar it was worked
 * out from; for each changed row a field shows the preview's value unless the
 * person typed over it (in the edited row, since it was sent; elsewhere,
 * against the confirmed row). The page's own drafts are left as they are.
 */
export function previewDisplay(preview: Preview | null, project: ProjectDetails | null, drafts: Record<string, WbsFormState>): PreviewDisplay {
  const idle = { items: project?.wbsItems ?? [], criticalPath: project?.criticalPath ?? null, drafts, preliminary: new Map(), active: false };
  if (
    !preview ||
    !project ||
    preview.projectId !== project.id ||
    preview.baseItems !== project.wbsItems ||
    preview.baseDependencies !== project.wbsDependencies ||
    preview.baseCalendarOverrides !== project.calendarOverrides
  ) {
    return idle;
  }
  const confirmedById = new Map(project.wbsItems.map((item) => [item.id, item]));
  const shown = { ...drafts };
  const preliminary = new Map<string, Set<PreviewField>>();
  for (const item of preview.items) {
    if (!preview.changedIds.has(item.id)) continue;
    const draft = drafts[item.id];
    const confirmed = confirmedById.get(item.id);
    if (!draft || !confirmed) continue;
    const untouched = item.id === preview.editedItemId ? preview.sentDraft : savedWbsForm(confirmed, project.wbsDependencies);
    const previewed = wbsToForm(item, project.wbsDependencies);
    const fields = new Set<PreviewField>();
    const next = { ...draft };
    for (const field of PREVIEW_FIELDS) {
      if (draft[field] !== untouched[field] || previewed[field] === draft[field]) continue;
      (next as Record<string, unknown>)[field] = previewed[field];
      fields.add(field);
    }
    if (fields.size === 0) continue;
    shown[item.id] = next;
    preliminary.set(item.id, fields);
  }
  return { items: preview.items, criticalPath: preview.criticalPath, drafts: shown, preliminary, active: true };
}
