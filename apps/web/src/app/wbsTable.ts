import type { WbsDependencyType } from "./domainTypes";

export type ProjectCalendarCode = "RU" | "CN" | "RU_CN";

export const WBS_LEVEL_MIN_WIDTH = 128;

export const WBS_TABLE_COLUMNS = [
  { key: "level", label: "Уровень", width: WBS_LEVEL_MIN_WIDTH },
  { key: "structure", label: "Структура", width: 420 },
  { key: "type", label: "Тип", width: 132 },
  { key: "status", label: "Статус", width: 136 },
  { key: "owner", label: "Исполнитель", width: 150 },
  { key: "start", label: "Старт", width: 138 },
  { key: "due", label: "Срок", width: 138 },
  { key: "workDays", label: "Раб. дни", width: 96 },
  { key: "calendarDays", label: "Кал. дни", width: 96 },
  { key: "calendar", label: "Календарь", width: 110 },
  { key: "effortPercent", label: "Трудоемк., %", width: 112 },
  { key: "progress", label: "%", width: 72 },
  { key: "jiraTicketUrl", label: "Jira URL", width: 240 },
  { key: "predecessor1", label: "Предшественник 1", width: 80 },
  { key: "predecessor2", label: "Предшественник 2", width: 80 },
  { key: "predecessor3", label: "Предшественник 3", width: 80 },
  { key: "predecessor4", label: "Предшественник 4", width: 80 },
  { key: "predecessor5", label: "Предшественник 5", width: 80 },
  { key: "predecessor6", label: "Предшественник 6", width: 80 },
  { key: "leadLag", label: "Сдвиг", width: 92 },
] as const;

export const WBS_PREDECESSOR_KEYS = [
  "predecessor1",
  "predecessor2",
  "predecessor3",
  "predecessor4",
  "predecessor5",
  "predecessor6",
] as const;

export type WbsTableColumnKey = (typeof WBS_TABLE_COLUMNS)[number]["key"];
export type WbsTableColumn = (typeof WBS_TABLE_COLUMNS)[number];
export type WbsPredecessorKey = (typeof WBS_PREDECESSOR_KEYS)[number];
export type WbsPredecessorTiming = Extract<WbsDependencyType, "FS" | "SS">;

export const WBS_PREDECESSOR_TYPE_BY_KEY = {
  predecessor1: "predecessor1Type",
  predecessor2: "predecessor2Type",
  predecessor3: "predecessor3Type",
  predecessor4: "predecessor4Type",
  predecessor5: "predecessor5Type",
  predecessor6: "predecessor6Type",
} as const;

export const WBS_PREDECESSOR_TYPE_KEYS = Object.values(
  WBS_PREDECESSOR_TYPE_BY_KEY,
);

export type WbsPredecessorTypeKey =
  (typeof WBS_PREDECESSOR_TYPE_BY_KEY)[WbsPredecessorKey];

export type WbsFormFieldKey =
  | "title"
  | "type"
  | "status"
  | "owner"
  | "startDate"
  | "dueDate"
  | "workDays"
  | "calendarDays"
  | "calendarCode"
  | "effortPercent"
  | "progress"
  | "jiraTicketUrl"
  | WbsPredecessorKey
  | WbsPredecessorTypeKey
  | "leadLagDays"
  | "wbsLevel";

export const WBS_DIRTY_FIELDS: WbsFormFieldKey[] = [
  "title",
  "type",
  "status",
  "owner",
  "startDate",
  "dueDate",
  "workDays",
  "calendarDays",
  "calendarCode",
  "effortPercent",
  "progress",
  "jiraTicketUrl",
  "predecessor1",
  "predecessor2",
  "predecessor3",
  "predecessor4",
  "predecessor5",
  "predecessor6",
  "predecessor1Type",
  "predecessor2Type",
  "predecessor3Type",
  "predecessor4Type",
  "predecessor5Type",
  "predecessor6Type",
  "leadLagDays",
  "wbsLevel",
];

export const WBS_COLUMN_FIELDS: Record<WbsTableColumnKey, WbsFormFieldKey[]> = {
  level: ["wbsLevel"],
  structure: ["title"],
  type: ["type"],
  status: ["status"],
  owner: ["owner"],
  start: ["startDate"],
  due: ["dueDate"],
  workDays: ["workDays"],
  calendarDays: ["calendarDays"],
  calendar: ["calendarCode"],
  effortPercent: ["effortPercent"],
  progress: ["progress"],
  jiraTicketUrl: ["jiraTicketUrl"],
  predecessor1: ["predecessor1", "predecessor1Type"],
  predecessor2: ["predecessor2", "predecessor2Type"],
  predecessor3: ["predecessor3", "predecessor3Type"],
  predecessor4: ["predecessor4", "predecessor4Type"],
  predecessor5: ["predecessor5", "predecessor5Type"],
  predecessor6: ["predecessor6", "predecessor6Type"],
  leadLag: ["leadLagDays"],
};

export const PROJECT_CALENDAR_LABELS: Record<ProjectCalendarCode, string> = {
  RU: "RU календарь",
  CN: "CN календарь",
  RU_CN: "RU+CN календарь",
};

export type WbsSortDirection = "asc" | "desc";

export type WbsSortState = {
  columnKey: WbsTableColumnKey;
  direction: WbsSortDirection;
};

export type WbsTableDraft = Partial<Record<WbsFormFieldKey, string>>;

export type SortableWbsTreeItem = {
  id: string;
  parentId: string | null;
  code: string;
  title: string;
  type: string;
  status: string;
  owner: string | null;
  startDate: string | null;
  dueDate: string | null;
  wbsLevel: number | null;
  predecessor1: string | null;
  predecessor2: string | null;
  predecessor3: string | null;
  predecessor4: string | null;
  predecessor5: string | null;
  predecessor6: string | null;
  leadLagDays: number | null;
  workDays: number | null;
  calendarDays: number | null;
  calendarCode: ProjectCalendarCode;
  effortPercent: number;
  progress: number;
  jiraTicketKey: string | null;
  jiraTicketUrl: string | null;
  sortOrder: number;
  level: number;
  children: SortableWbsTreeItem[];
};

export type WbsSortLabels = {
  typeLabel?: (type: string) => string;
  statusLabel?: (status: string) => string;
};

const WBS_SORT_COLLATOR = new Intl.Collator("ru", {
  numeric: true,
  sensitivity: "base",
});

export function normalizeWbsSort(sort?: unknown): WbsSortState | null {
  if (!sort || typeof sort !== "object") return null;
  const candidate = sort as Partial<WbsSortState>;
  const knownKeys = new Set(WBS_TABLE_COLUMNS.map((column) => column.key));
  if (
    !candidate.columnKey ||
    !knownKeys.has(candidate.columnKey) ||
    (candidate.direction !== "asc" && candidate.direction !== "desc")
  ) {
    return null;
  }
  return {
    columnKey: candidate.columnKey,
    direction: candidate.direction,
  };
}

export function normalizeWbsColumnOrder(
  order?: readonly WbsTableColumnKey[],
) {
  const knownKeys = new Set(WBS_TABLE_COLUMNS.map((column) => column.key));
  const orderedKeys = order?.length
    ? order.filter((key) => knownKeys.has(key))
    : WBS_TABLE_COLUMNS.map((column) => column.key);
  const fixedKeys: WbsTableColumnKey[] = ["level", "structure"];
  const movableKeys = orderedKeys.filter(
    (key) => key !== "level" && key !== "structure",
  );
  const missingKeys = WBS_TABLE_COLUMNS.map((column) => column.key).filter(
    (key) =>
      key !== "level" &&
      key !== "structure" &&
      !movableKeys.includes(key),
  );

  return [...fixedKeys, ...movableKeys, ...missingKeys];
}

export function normalizeWbsHiddenColumns(
  hidden?: readonly WbsTableColumnKey[],
) {
  const knownKeys = new Set(WBS_TABLE_COLUMNS.map((column) => column.key));
  return [
    ...new Set(
      (hidden ?? []).filter(
        (key) =>
          knownKeys.has(key) && key !== "level" && key !== "structure",
      ),
    ),
  ];
}

export function normalizeWbsColumnWidths(
  widths?: Partial<Record<WbsTableColumnKey, number>>,
) {
  const defaultWidths = Object.fromEntries(
    WBS_TABLE_COLUMNS.map((column) => [column.key, column.width]),
  ) as Record<WbsTableColumnKey, number>;

  return {
    ...defaultWidths,
    ...widths,
    level: Math.max(
      WBS_LEVEL_MIN_WIDTH,
      widths?.level ?? defaultWidths.level,
    ),
  };
}

function sortableNumberValue(value: number | string | null | undefined) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function sortableDateValue(value: string | null | undefined) {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function sortableTextValue(value: string | null | undefined) {
  const trimmed = (value ?? "").trim();
  return trimmed.length > 0 ? trimmed : null;
}

function compareWbsSortValues(
  left: string | number | null,
  right: string | number | null,
) {
  const leftEmpty = left === null || left === "";
  const rightEmpty = right === null || right === "";
  if (leftEmpty && rightEmpty) return 0;
  if (leftEmpty) return 1;
  if (rightEmpty) return -1;
  if (typeof left === "number" && typeof right === "number") {
    return left - right;
  }
  return WBS_SORT_COLLATOR.compare(String(left), String(right));
}

function wbsSortValue(
  columnKey: WbsTableColumnKey,
  item: SortableWbsTreeItem,
  draft?: WbsTableDraft,
  labels: WbsSortLabels = {},
): string | number | null {
  switch (columnKey) {
    case "level":
      return sortableNumberValue(draft?.wbsLevel ?? item.wbsLevel ?? item.level + 1);
    case "structure":
      return sortableTextValue(draft?.title ?? item.title);
    case "type":
      return sortableTextValue(labels.typeLabel?.(draft?.type ?? item.type) ?? draft?.type ?? item.type);
    case "status":
      return sortableTextValue(labels.statusLabel?.(draft?.status ?? item.status) ?? draft?.status ?? item.status);
    case "owner":
      return sortableTextValue(draft?.owner ?? item.owner);
    case "start":
      return sortableDateValue(draft?.startDate ?? item.startDate);
    case "due":
      return sortableDateValue(draft?.dueDate ?? item.dueDate);
    case "workDays":
      return sortableNumberValue(draft?.workDays ?? item.workDays);
    case "calendarDays":
      return sortableNumberValue(draft?.calendarDays ?? item.calendarDays);
    case "calendar":
      return sortableTextValue(draft?.calendarCode ?? item.calendarCode);
    case "effortPercent":
      return sortableNumberValue(draft?.effortPercent ?? item.effortPercent);
    case "progress":
      return sortableNumberValue(draft?.progress ?? item.progress);
    case "jiraTicketUrl":
      return sortableTextValue(draft?.jiraTicketUrl ?? item.jiraTicketUrl ?? item.jiraTicketKey);
    case "predecessor1":
      return sortableTextValue(draft?.predecessor1 ?? item.predecessor1);
    case "predecessor2":
      return sortableTextValue(draft?.predecessor2 ?? item.predecessor2);
    case "predecessor3":
      return sortableTextValue(draft?.predecessor3 ?? item.predecessor3);
    case "predecessor4":
      return sortableTextValue(draft?.predecessor4 ?? item.predecessor4);
    case "predecessor5":
      return sortableTextValue(draft?.predecessor5 ?? item.predecessor5);
    case "predecessor6":
      return sortableTextValue(draft?.predecessor6 ?? item.predecessor6);
    case "leadLag":
      return sortableNumberValue(draft?.leadLagDays ?? item.leadLagDays);
    default:
      return null;
  }
}

function compareWbsItemsForSort<TItem extends SortableWbsTreeItem>(
  left: TItem,
  right: TItem,
  drafts: Record<string, WbsTableDraft>,
  sort: WbsSortState,
  labels: WbsSortLabels,
) {
  const sorted =
    compareWbsSortValues(
      wbsSortValue(sort.columnKey, left, drafts[left.id], labels),
      wbsSortValue(sort.columnKey, right, drafts[right.id], labels),
    ) * (sort.direction === "asc" ? 1 : -1);
  if (sorted !== 0) return sorted;
  const orderDiff = left.sortOrder - right.sortOrder;
  if (orderDiff !== 0) return orderDiff;
  return WBS_SORT_COLLATOR.compare(left.code, right.code);
}

export function sortWbsTreeForDisplay<TItem extends SortableWbsTreeItem>(
  items: TItem[],
  drafts: Record<string, WbsTableDraft>,
  sort: WbsSortState | null,
  labels: WbsSortLabels = {},
) {
  if (!sort) return items;
  const byId = new Map(items.map((item) => [item.id, item]));
  const roots = items.filter(
    (item) => !item.parentId || !byId.has(item.parentId),
  );

  const flattenSorted = (nodes: TItem[], level = 0): TItem[] =>
    [...nodes]
      .sort((left, right) => compareWbsItemsForSort(left, right, drafts, sort, labels))
      .flatMap((node) => {
        const sortedChildren = flattenSorted(node.children as TItem[], level + 1);
        const directChildren = sortedChildren.filter(
          (child) => child.parentId === node.id,
        );
        return [
          {
            ...node,
            level,
            children: directChildren,
          } as TItem,
          ...sortedChildren,
        ];
      });

  return flattenSorted(roots);
}
