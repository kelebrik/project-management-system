import type { Dispatch, MutableRefObject, SetStateAction } from "react";

import type {
  WbsDependency,
  WbsItemStatus,
  WbsItemType,
  WbsTreeItem,
} from "../app/domainTypes";
import type { WbsFormState } from "../app/formState";
import { wbsStatusLabel, wbsTypeLabel } from "../app/labels";
import type {
  ProjectCalendarCode,
  WbsSortState,
  WbsTableColumn,
} from "../app/wbsTable";
import type { WbsScheduleDriver } from "../wbsScheduleDriver";

type SaveWbsItem = (
  itemId: string,
  options?: {
    silent?: boolean;
    draftOverride?: WbsFormState;
    scheduleDriver?: WbsScheduleDriver;
  },
) => Promise<void>;

type SaveWbsDraftPatch = (
  itemId: string,
  patch: Partial<WbsFormState>,
  options?: { silent?: boolean; scheduleDriver?: WbsScheduleDriver },
) => void;

type SaveWbsTypePatch = (
  itemId: string,
  nextType: WbsItemType,
  options?: { silent?: boolean },
) => void;

export type UseWbsStructureTableControllerOptions = {
  activeWbsItemId: string | null;
  collapsedWbsIds: Set<string>;
  deleteWbsItem: (itemId: string) => Promise<void>;
  draftWbsCodes: Map<string, string>;
  insertWbsRow: (afterIndex: number, sourceRows?: WbsTreeItem[]) => Promise<void>;
  isReadOnly: boolean;
  orderedWbsColumns: WbsTableColumn[];
  saveWbsDraftPatch: SaveWbsDraftPatch;
  saveWbsTypePatch: SaveWbsTypePatch;
  saveWbsItem: SaveWbsItem;
  selectedWbsIds: Set<string>;
  setDraggedWbsItemId: Dispatch<SetStateAction<string | null>>;
  setError: Dispatch<SetStateAction<string | null>>;
  setNotice: Dispatch<SetStateAction<string | null>>;
  setSelectedWbsIds: Dispatch<SetStateAction<Set<string>>>;
  setWbsDrafts: Dispatch<SetStateAction<Record<string, WbsFormState>>>;
  setWbsDropTargetId: Dispatch<SetStateAction<string | null>>;
  toggleWbsCollapse: (itemId: string) => void;
  updateWbsDraft: (itemId: string, patch: Partial<WbsFormState>) => void;
  visibleStructureWbsTree: WbsTreeItem[];
  wbsDependencies: WbsDependency[];
  wbsDrafts: Record<string, WbsFormState>;
  wbsDraftsRef: MutableRefObject<Record<string, WbsFormState>>;
  wbsSort: WbsSortState | null;
  wbsTree: WbsTreeItem[];
};

export function normalizeWbsPasteValue(
  field: keyof WbsFormState,
  value: string,
): string | ProjectCalendarCode | WbsItemType | WbsItemStatus {
  const trimmedValue = value.trim();
  if (field === "type") {
    const matchedType = ([
      "PHASE",
      "WORK_PACKAGE",
      "DELIVERABLE",
      "MILESTONE",
      "GOAL",
      "TASK",
    ] as WbsItemType[]).find(
      (type) =>
        type.toLowerCase() === trimmedValue.toLowerCase() ||
        wbsTypeLabel(type).toLowerCase() === trimmedValue.toLowerCase(),
    );
    return matchedType ?? "TASK";
  }
  if (field === "status") {
    const matchedStatus = ([
      "NOT_STARTED",
      "IN_PROGRESS",
      "IN_REVIEW",
      "AT_RISK",
      "BLOCKED",
      "DONE",
      "CANCELLED",
    ] as WbsItemStatus[]).find(
      (status) =>
        status.toLowerCase() === trimmedValue.toLowerCase() ||
        wbsStatusLabel(status).toLowerCase() === trimmedValue.toLowerCase(),
    );
    return matchedStatus ?? "NOT_STARTED";
  }
  if (field === "calendarCode") {
    const calendarCode = trimmedValue.toUpperCase().replace("+", "_");
    return calendarCode === "CN" || calendarCode === "RU_CN"
      ? calendarCode
      : "RU";
  }
  return trimmedValue;
}

export function emptyReadonlyValue(
  value: string | number | null | undefined,
) {
  return value === null || value === undefined || value === ""
    ? "—"
    : String(value);
}

export function formatReadonlyPercent(
  value: string | number | null | undefined,
) {
  const normalizedValue = emptyReadonlyValue(value);
  return normalizedValue === "—" ? normalizedValue : `${normalizedValue}%`;
}
