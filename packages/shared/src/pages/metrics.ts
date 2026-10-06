import type { PageFieldFormat, PageFilter, PageMeasure, PageSourceKey, PageText } from "./dataset-types.js";

/**
 * Named metrics: what a widget counts, said once. "Overdue work" or "red
 * risk" mean here what they mean in the portfolio reports, and a page that
 * uses a metric follows its definition if it is ever corrected. A widget adds
 * its own split, filters and look on top.
 */

const t = (ru: string, en: string): PageText => ({ ru, en });

export type PageMetricGroup = "projects" | "work" | "checkpoints" | "risks" | "decisions" | "shifts";

export type PageMetric = {
  id: string;
  group: PageMetricGroup;
  label: PageText;
  /** In plain words, for the editor. */
  definition: PageText;
  source: PageSourceKey;
  filters: PageFilter[];
  measure: PageMeasure;
  /** The page period applies to this field. */
  periodField?: string;
  unit: PageFieldFormat;
  /** A rise is bad news (shown red). */
  higherIsWorse?: boolean;
};

export const PAGE_METRIC_GROUPS: Record<PageMetricGroup, PageText> = {
  projects: t("Проекты", "Projects"),
  work: t("Работы", "Work"),
  checkpoints: t("Вехи и цели", "Milestones and goals"),
  risks: t("Риски и проблемы", "Risks and problems"),
  decisions: t("Решения", "Decisions"),
  shifts: t("Сдвиги вех", "Milestone shifts"),
};

const count: PageMeasure = { fn: "count" };
const open: PageFilter = { field: "open", op: "isTrue" };

export const PAGE_METRICS: readonly PageMetric[] = [
  { id: "projects.count", group: "projects", label: t("Открытые проекты", "Open projects"), definition: t("Проекты охвата страницы, кроме закрытых", "Projects of the page's scope, except closed ones"), source: "projects", filters: [], measure: count, unit: "count" },
  { id: "projects.red", group: "projects", label: t("Красные проекты", "Red projects"), definition: t("Открытые проекты со светофором «красный»", "Open projects whose RAG is red"), source: "projects", filters: [{ field: "rag", op: "eq", value: "RED" }], measure: count, unit: "count", higherIsWorse: true },
  { id: "projects.notGreen", group: "projects", label: t("Проекты не в зелёной зоне", "Projects not green"), definition: t("Светофор жёлтый или красный", "RAG amber or red"), source: "projects", filters: [{ field: "rag", op: "in", value: ["AMBER", "RED"] }], measure: count, unit: "count", higherIsWorse: true },
  { id: "projects.targetShift", group: "projects", label: t("Сдвиг целей, дн.", "Target shift, days"), definition: t("Сумма сдвигов текущих целей проектов от исходных (дата цели при создании проекта)", "Sum of how far the projects' targets moved from the starting ones (the target when the project was created)"), source: "projects", filters: [], measure: { fn: "sum", field: "targetShiftDays" }, unit: "days", higherIsWorse: true },
  { id: "projects.progress", group: "projects", label: t("Средний прогресс", "Average progress"), definition: t("Средний прогресс открытых проектов", "Average progress of the open projects"), source: "projects", filters: [], measure: { fn: "avg", field: "progress" }, unit: "percent" },

  { id: "work.open", group: "work", label: t("Работы в плане", "Work to do"), definition: t("Задачи, результаты и пакеты работ без вложенных строк, не сделанные и не отменённые", "Tasks, deliverables and work packages without child rows, not done or cancelled"), source: "work", filters: [open], measure: count, unit: "count" },
  { id: "work.overdue", group: "work", label: t("Просроченные работы", "Overdue work"), definition: t("Работы без вложенных строк, не сделаны и не отменены, срок раньше сегодня — как в отчётах по портфелю", "Work without child rows, not done or cancelled, due before today — as in the portfolio reports"), source: "work", filters: [{ field: "overdue", op: "isTrue" }], measure: count, unit: "count", higherIsWorse: true },
  { id: "work.dueWeek", group: "work", label: t("Сдать в ближайшие 7 дней", "Due within 7 days"), definition: t("Не сделанные работы со сроком от сегодня до семи дней вперёд", "Work not done that is due from today to seven days ahead"), source: "work", filters: [open, { field: "dueInDays", op: "between", value: 0, value2: 7 }], measure: count, unit: "count" },
  { id: "work.done", group: "work", label: t("Сделано за период", "Done in the period"), definition: t("Работы, закрытые за период страницы", "Work closed in the page's period"), source: "work", filters: [{ field: "status", op: "eq", value: "DONE" }], measure: count, periodField: "closedAt", unit: "count" },

  { id: "checkpoints.upcoming", group: "checkpoints", label: t("Вехи в ближайшие 4 недели", "Checkpoints within 4 weeks"), definition: t("Не достигнутые вехи и цели с прогнозом от сегодня до 28 дней вперёд", "Milestones and goals not reached, forecast from today to 28 days ahead"), source: "checkpoints", filters: [open, { field: "inDays", op: "between", value: 0, value2: 28 }], measure: count, unit: "count" },
  { id: "checkpoints.slipped", group: "checkpoints", label: t("Сдвинутые вехи", "Slipped checkpoints"), definition: t("Не достигнутые вехи и цели, у которых прогноз позже плана", "Milestones and goals not reached whose forecast is later than planned"), source: "checkpoints", filters: [open, { field: "slipDays", op: "gt", value: 0 }], measure: count, unit: "count", higherIsWorse: true },
  { id: "checkpoints.slipDays", group: "checkpoints", label: t("Сдвиг вех, дн.", "Checkpoint slip, days"), definition: t("Сумма сдвигов прогноза от плана у не достигнутых вех и целей", "Sum of how far forecasts are past the plan for milestones and goals not reached"), source: "checkpoints", filters: [open], measure: { fn: "sum", field: "slipDays" }, unit: "days", higherIsWorse: true },
  { id: "checkpoints.all", group: "checkpoints", label: t("Все вехи и цели", "All milestones and goals"), definition: t("Все вехи и цели проектов, в том числе достигнутые", "All milestones and goals, reached ones too"), source: "checkpoints", filters: [], measure: count, unit: "count" },

  { id: "risks.red", group: "risks", label: t("Красные риски", "Red risks"), definition: t("Открытые риски с оценкой 15 и выше — как в отчётах по портфелю", "Open risks scored 15 or more — as in the portfolio reports"), source: "risks", filters: [open, { field: "type", op: "eq", value: "RISK" }, { field: "level", op: "eq", value: "RED" }], measure: count, unit: "count", higherIsWorse: true },
  { id: "risks.open", group: "risks", label: t("Открытые риски", "Open risks"), definition: t("Риски, кроме закрытых и подтверждённых", "Risks except closed and validated ones"), source: "risks", filters: [open, { field: "type", op: "eq", value: "RISK" }], measure: count, unit: "count", higherIsWorse: true },
  { id: "risks.problems", group: "risks", label: t("Открытые проблемы", "Open problems"), definition: t("Проблемы RAID, кроме закрытых и подтверждённых", "RAID problems except closed and validated ones"), source: "risks", filters: [open, { field: "type", op: "eq", value: "DEPENDENCY" }], measure: count, unit: "count", higherIsWorse: true },
  { id: "risks.new", group: "risks", label: t("Новые риски за период", "New risks in the period"), definition: t("Риски, заведённые за период страницы", "Risks recorded in the page's period"), source: "risks", filters: [{ field: "type", op: "eq", value: "RISK" }], measure: count, periodField: "createdAt", unit: "count", higherIsWorse: true },

  { id: "decisions.waiting", group: "decisions", label: t("Решения ждут ответа", "Decisions waiting"), definition: t("Решения, отправленные согласующему и ещё без ответа", "Decisions sent to an approver and not yet answered"), source: "decisions", filters: [{ field: "waiting", op: "isTrue" }], measure: count, unit: "count", higherIsWorse: true },
  { id: "decisions.waitingDays", group: "decisions", label: t("Сколько ждут ответа, дн.", "Days waiting"), definition: t("Среднее число дней, которое решения ждут ответа", "Average days decisions have been waiting for an answer"), source: "decisions", filters: [{ field: "waiting", op: "isTrue" }], measure: { fn: "avg", field: "waitingDays" }, unit: "days", higherIsWorse: true },
  { id: "decisions.decided", group: "decisions", label: t("Принято за период", "Decided in the period"), definition: t("Решения, принятые за период страницы", "Decisions taken in the page's period"), source: "decisions", filters: [{ field: "status", op: "eq", value: "APPROVED" }], measure: count, periodField: "decidedAt", unit: "count" },

  { id: "shifts.count", group: "shifts", label: t("Сдвиги вех за период", "Shifts in the period"), definition: t("Записи журнала сдвигов вех и целей за период страницы", "Records of the milestone shift journal in the page's period"), source: "shifts", filters: [], measure: count, periodField: "createdAt", unit: "count", higherIsWorse: true },
  { id: "shifts.days", group: "shifts", label: t("На сколько сдвинулись, дн.", "Days shifted"), definition: t("Сумма сдвигов вех и целей за период (позже — плюс, раньше — минус)", "Sum of the shifts in the period (later is plus, earlier is minus)"), source: "shifts", filters: [], measure: { fn: "sum", field: "deltaDays" }, periodField: "createdAt", unit: "days", higherIsWorse: true },
  { id: "shifts.later", group: "shifts", label: t("Сдвиги позже", "Shifts later"), definition: t("Сдвиги вех и целей на более позднюю дату за период", "Shifts of milestones and goals to a later date in the period"), source: "shifts", filters: [{ field: "later", op: "isTrue" }], measure: count, periodField: "createdAt", unit: "count", higherIsWorse: true },
];

const metricsById = new Map(PAGE_METRICS.map((metric) => [metric.id, metric]));

export function pageMetric(id: string) {
  return metricsById.get(id) ?? null;
}
