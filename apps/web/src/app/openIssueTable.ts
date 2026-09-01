export const OPEN_ISSUE_COLUMNS = [
  { key: "number", label: "№", width: 44, min: 40, max: 48 },
  { key: "task", label: "Задача", width: 346, min: 220, max: 560 },
  { key: "link", label: "Ссылка", width: 200, min: 160, max: 360 },
  { key: "status", label: "Статус", width: 400, min: 280, max: 680 },
  { key: "owner", label: "Отв.", width: 128, min: 108, max: 180 },
  { key: "risk", label: "Риски", width: 92, min: 84, max: 112 },
  { key: "readiness", label: "Готовность", width: 120, min: 108, max: 180 },
  { key: "parameters", label: "Параметры", width: 274, min: 210, max: 380 },
] as const;

export type OpenIssueColumnKey = (typeof OPEN_ISSUE_COLUMNS)[number]["key"];

export type OpenIssueColumnWidths = Record<OpenIssueColumnKey, number>;

export function normalizeOpenIssueColumnWidths(
  value?: Partial<Record<OpenIssueColumnKey, number>>,
): OpenIssueColumnWidths {
  return Object.fromEntries(OPEN_ISSUE_COLUMNS.map((column) => [
    column.key,
    Math.min(column.max, Math.max(column.min, Number(value?.[column.key]) || column.width)),
  ])) as OpenIssueColumnWidths;
}

export function openIssueTableWidth(widths: OpenIssueColumnWidths) {
  return OPEN_ISSUE_COLUMNS.reduce((total, column) => total + widths[column.key], 0);
}
