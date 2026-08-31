export const OPEN_ISSUE_COLUMNS = [
  { key: "number", label: "№", width: 52, min: 44, max: 84 },
  { key: "task", label: "Задача", width: 250, min: 170, max: 520 },
  { key: "link", label: "Ссылка", width: 210, min: 150, max: 420 },
  { key: "status", label: "Статус", width: 350, min: 230, max: 680 },
  { key: "owner", label: "Ответственный", width: 210, min: 150, max: 420 },
  { key: "risk", label: "Риски", width: 230, min: 160, max: 520 },
  { key: "readiness", label: "Готовность", width: 132, min: 104, max: 220 },
  { key: "parameters", label: "Параметры", width: 220, min: 180, max: 420 },
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
