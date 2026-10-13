import { useCallback, useEffect, useRef, useState } from "react";
import type { ProjectCalendarOverride, ProjectDetails, WbsCriticalPath, WbsDependency, WbsItem } from "../app/domainTypes";
import type { WbsFormState } from "../app/formState";
import { confirmedStructure, onStructureWriteStart, structureWritesInFlight } from "../app/structureStore";
import { PREVIEW_FIELDS, previewRowEdit } from "../app/structurePreview";

/**
 * A row edit shown before the server answers: the Structure the browser
 * worked out for it, over the confirmed one it was worked out from. It is
 * only shown while the project still holds exactly those rows, and it never
 * enters the page's drafts or what is sent.
 */
export type ActiveStructurePreview = {
  projectId: string;
  operationId: number;
  /** The confirmed rows, links and calendar the preview was worked out from; other arrays mean the project moved on. */
  baseItems: WbsItem[];
  baseDependencies: WbsDependency[];
  baseCalendarOverrides: ProjectCalendarOverride[];
  items: WbsItem[];
  criticalPath: WbsCriticalPath;
  changedIds: Set<string>;
  editedItemId: string;
  /** The edited row's draft as it was sent: later typing in it is the person's, not the preview's. */
  sentDraft: WbsFormState;
};

let operations = 0;

export function useStructurePreview() {
  const [preview, setPreview] = useState<ActiveStructurePreview | null>(null);
  const previewRef = useRef<ActiveStructurePreview | null>(null);
  const show = useCallback((next: ActiveStructurePreview | null) => {
    previewRef.current = next;
    setPreview(next);
  }, []);

  // A write of any other operation leaves while a preview is shown: the preview no longer tells what the server will hold.
  useEffect(() => onStructureWriteStart((operation) => {
    if (previewRef.current && operation !== previewRef.current.operationId) show(null);
  }), [show]);

  /**
   * Works out and shows a row edit about to be sent, when nothing else is on
   * its way. Answers the operation the edit's writes must be sent under, or
   * null when there is no preview (the edit is sent as before).
   */
  const startPreview = useCallback((project: ProjectDetails, itemId: string, patch: Record<string, unknown>, sentDraft: WbsFormState, pendingSaves: number) => {
    if (pendingSaves > 0 || structureWritesInFlight() > 0) return null;
    const today = confirmedStructure(project.id)?.today;
    if (!today || !Array.isArray(project.calendarOverrides)) return null;
    try {
      const result = previewRowEdit(
        { items: project.wbsItems, dependencies: project.wbsDependencies, calendarOverrides: project.calendarOverrides, today },
        itemId,
        patch as Parameters<typeof previewRowEdit>[2],
      );
      if (!result) return null;
      operations += 1;
      show({ projectId: project.id, operationId: operations, baseItems: project.wbsItems, baseDependencies: project.wbsDependencies, baseCalendarOverrides: project.calendarOverrides, ...result, editedItemId: itemId, sentDraft });
      return operations;
    } catch (error) {
      console.debug("Structure preview skipped", error);
      return null;
    }
  }, [show]);

  /**
   * Takes the preview of an operation away: its answer arrived, or it
   * failed. With the server's rows, a preview that differs from them is
   * noted for debugging; the server's rows are what the page keeps.
   */
  const endPreview = useCallback((operationId: number | null, serverItems?: WbsItem[]) => {
    const current = previewRef.current;
    if (operationId === null || current?.operationId !== operationId) return;
    if (serverItems) {
      const serverById = new Map(serverItems.map((item) => [item.id, item]));
      const differing = current.items
        .filter((item) => PREVIEW_FIELDS.some((field) => (item[field] ?? null) !== (serverById.get(item.id)?.[field] ?? null)))
        .map((item) => item.id);
      if (differing.length > 0) {
        console.debug("Structure preview differs from the server", { operationId, projectId: current.projectId, editedItemId: current.editedItemId, today: confirmedStructure(current.projectId)?.today, version: confirmedStructure(current.projectId)?.version, differing });
      }
    }
    show(null);
  }, [show]);

  return { preview, startPreview, endPreview };
}
