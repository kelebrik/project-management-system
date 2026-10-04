import { normalizePersonName } from "@pms/shared";
import type { WbsItem } from "./domainTypes";
import { wbsToForm, type WbsFormState } from "./formState";

const DAY_MS = 86_400_000;
const ACTIVE_STATUSES = new Set([
  "IN_PROGRESS",
  "IN_REVIEW",
  "AT_RISK",
]);
const CURRENT_WORK_TYPES = new Set(["TASK", "DELIVERABLE"]);
const EXCLUDED_STATUSES = new Set(["DONE", "CANCELLED"]);
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
  jiraTicketUrl: string;
  mattermostUrl: string;
};

export type CurrentWorkFilter = "all" | "active" | "blocked" | "overdue" | "dueSoon";

/** Who and how soon: owners as normalized names ("" stands for rows without an owner). */
export type CurrentWorkOptions = { owners?: string[]; dueSoonDays?: number };

/** The owner key a row is filtered by: the normalized name, or "" when nobody is set. */
export function currentWorkOwnerKey(owner: string) {
  return owner.trim() ? normalizePersonName(owner) : "";
}

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
  const daysUntilMonday = ((8 - currentDay.getDay()) % 7) || 7;
  const upcomingMonday = new Date(
    currentDay.getTime() + daysUntilMonday * DAY_MS,
  );
  return {
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
  filter: CurrentWorkFilter = "all",
  options: CurrentWorkOptions = {},
): CurrentWorkRow[] {
  const range = currentWorkDateRange(today);
  const itemsById = new Map(items.map((item) => [item.id, item]));
  const todayStart = startOfLocalDay(today);
  const dueSoonThrough = new Date(todayStart.getTime() + (options.dueSoonDays ?? 7) * DAY_MS);
  const owners = options.owners && options.owners.length > 0 ? new Set(options.owners) : null;

  return items
    .filter((item) => {
      const draft = draftFor(item, drafts);
      if (!CURRENT_WORK_TYPES.has(draft.type)) return false;
      if (EXCLUDED_STATUSES.has(draft.status)) return false;
      if (owners && !owners.has(currentWorkOwnerKey(draft.owner))) return false;
      const dueDate = parseLocalDate(draft.dueDate || null);
      const overdue = Boolean(dueDate && dueDate < todayStart);
      // Due within the next N days, whatever the status; overdue rows have their own filter.
      if (filter === "dueSoon") return Boolean(dueDate && dueDate >= todayStart && dueDate <= dueSoonThrough);
      if (filter === "blocked") return draft.status === "BLOCKED";
      if (filter === "overdue") return overdue;
      if (filter === "all" && (overdue || draft.status === "BLOCKED")) return true;
      if (filter === "active" && draft.status === "BLOCKED") return false;
      if (ACTIVE_STATUSES.has(draft.status)) return true;
      // Not started yet but due by the end of the next two working weeks, this week included.
      if (draft.status === "NOT_STARTED") {
        return Boolean(dueDate && dueDate >= todayStart && dueDate <= range.upcomingThrough);
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
        comment: draft.comment,
        jiraTicketUrl: draft.jiraTicketUrl,
        mattermostUrl: draft.mattermostUrl,
      };
    })
    .sort((left, right) => CODE_COLLATOR.compare(left.code, right.code));
}
