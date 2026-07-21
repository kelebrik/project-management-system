export const CURRENT_WORK_COLUMNS = [
  { key: "number", label: "Номер", width: 76 },
  { key: "workPackage", label: "Пакет работ", width: 180 },
  { key: "title", label: "Наименование", width: 220, flexible: true },
  { key: "status", label: "Статус", width: 150 },
  { key: "dueDate", label: "Срок", width: 140 },
  { key: "owner", label: "Исполнитель", width: 150 },
  { key: "comment", label: "Комментарий", width: 220, flexible: true },
  { key: "jira", label: "Jira", width: 88 },
  { key: "mattermost", label: "MM", width: 76 },
] as const;

export type CurrentWorkColumnKey = (typeof CURRENT_WORK_COLUMNS)[number]["key"];
export type CurrentWorkColumnWidths = Record<CurrentWorkColumnKey, number>;

const MIN_COLUMN_WIDTH = 56;
const MAX_COLUMN_WIDTH = 760;

export function normalizeCurrentWorkColumnWidths(
  widths?: Partial<Record<CurrentWorkColumnKey, number>>,
): CurrentWorkColumnWidths {
  return Object.fromEntries(
    CURRENT_WORK_COLUMNS.map((column) => {
      const savedWidth = widths?.[column.key];
      const width =
        typeof savedWidth === "number" && Number.isFinite(savedWidth)
          ? savedWidth
          : column.width;
      return [
        column.key,
        Math.min(MAX_COLUMN_WIDTH, Math.max(MIN_COLUMN_WIDTH, width)),
      ];
    }),
  ) as CurrentWorkColumnWidths;
}

export function currentWorkGridTemplate(widths: CurrentWorkColumnWidths) {
  return CURRENT_WORK_COLUMNS.map((column) => {
    const width = `${widths[column.key]}px`;
    return "flexible" in column && column.flexible
      ? `minmax(${width}, 1fr)`
      : width;
  }).join(" ");
}

export function currentWorkTableMinWidth(widths: CurrentWorkColumnWidths) {
  return Object.values(widths).reduce((sum, width) => sum + width, 0);
}
