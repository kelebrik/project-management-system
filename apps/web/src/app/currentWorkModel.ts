import type { WbsItem } from "./domainTypes";
import { wbsToForm, type WbsFormState } from "./formState";

const DAY_MS = 86_400_000;
const ACTIVE_STATUSES = new Set([
  "IN_PROGRESS",
  "IN_REVIEW",
  "AT_RISK",
  "BLOCKED",
]);
const CODE_COLLATOR = new Intl.Collator("ru", {
  numeric: true,
  sensitivity: "base",
});

export type CurrentWorkRow = {
  id: string;
  code: string;
  workPackage: string;
  title: string;
  status: WbsItem["status"];
  dueDate: string | null;
  owner: string;
  comment: string;
};

function startOfLocalDay(value: Date) {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate());
}

function parseLocalDate(value: string | null) {
  if (!value) return null;
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (dateOnly) {
    return new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]));
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : startOfLocalDay(parsed);
}

function isWorkingDay(value: Date) {
  return value.getDay() !== 0 && value.getDay() !== 6;
}

function addWorkingDays(value: Date, days: number) {
  const result = startOfLocalDay(value);
  let remaining = days;
  while (remaining > 0) {
    result.setDate(result.getDate() + 1);
    if (isWorkingDay(result)) remaining -= 1;
  }
  return result;
}

export function currentWorkDateRange(today = new Date()) {
  const currentDay = startOfLocalDay(today);
  const closedSince = new Date(currentDay);
  let includedWorkingDays = isWorkingDay(closedSince) ? 1 : 0;
  while (includedWorkingDays < 5) {
    closedSince.setDate(closedSince.getDate() - 1);
    if (isWorkingDay(closedSince)) includedWorkingDays += 1;
  }

  const daysUntilMonday = ((8 - currentDay.getDay()) % 7) || 7;
  const upcomingMonday = new Date(
    currentDay.getTime() + daysUntilMonday * DAY_MS,
  );
  return {
    closedSince,
    closedThrough: currentDay,
    upcomingMonday,
    upcomingThrough: addWorkingDays(upcomingMonday, 10),
  };
}

function draftFor(
  item: WbsItem,
  drafts: Record<string, WbsFormState>,
) {
  return drafts[item.id] ?? wbsToForm(item);
}

function workPackageLabel(
  item: WbsItem,
  itemsById: Map<string, WbsItem>,
  drafts: Record<string, WbsFormState>,
) {
  const visited = new Set<string>();
  let parentId = item.parentId;
  while (parentId && !visited.has(parentId)) {
    visited.add(parentId);
    const parent = itemsById.get(parentId);
    if (!parent) break;
    const parentDraft = draftFor(parent, drafts);
    if (parentDraft.type === "WORK_PACKAGE") {
      return `${parentDraft.code} ${parentDraft.title}`.trim();
    }
    parentId = parent.parentId;
  }
  return "—";
}

export function createCurrentWorkRows(
  items: WbsItem[],
  drafts: Record<string, WbsFormState> = {},
  today = new Date(),
): CurrentWorkRow[] {
  const range = currentWorkDateRange(today);
  const itemsById = new Map(items.map((item) => [item.id, item]));

  return items
    .filter((item) => item.type === "TASK")
    .filter((item) => {
      const draft = draftFor(item, drafts);
      if (ACTIVE_STATUSES.has(draft.status)) return true;
      if (draft.status === "DONE") {
        const closedAt = parseLocalDate(item.closedAt);
        return Boolean(
          closedAt &&
            closedAt >= range.closedSince &&
            closedAt <= range.closedThrough,
        );
      }
      if (draft.status === "NOT_STARTED") {
        const dueDate = parseLocalDate(draft.dueDate || null);
        return Boolean(
          dueDate &&
            dueDate >= range.upcomingMonday &&
            dueDate <= range.upcomingThrough,
        );
      }
      return false;
    })
    .map((item) => {
      const draft = draftFor(item, drafts);
      return {
        id: item.id,
        code: draft.code,
        workPackage: workPackageLabel(item, itemsById, drafts),
        title: draft.title,
        status: draft.status,
        dueDate: draft.dueDate || null,
        owner: draft.owner,
        comment: draft.comment.trim(),
      };
    })
    .sort((left, right) => CODE_COLLATOR.compare(left.code, right.code));
}
