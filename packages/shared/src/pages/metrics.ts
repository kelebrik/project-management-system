import type { PageFieldFormat, PageFilter, PageMeasure, PageSourceKey, PageText } from "./dataset-types.js";

/**
 * Named metrics: what a widget counts, said once. "Overdue work" or "red
 * risk" mean here what they mean in the portfolio reports, and a page that
 * uses a metric follows its definition if it is ever corrected. A widget adds
 * its own split, filters and look on top.
 */

const t = (ru: string, en: string): PageText => ({ ru, en });

export type PageMetricGroup = "projects" | "work" | "checkpoints" | "risks" | "decisions" | "shifts" | "issues" | "changes" | "people" | "jira";

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
  issues: t("Вопросы", "Issues"),
  changes: t("Изменения", "Change requests"),
  people: t("Люди", "People"),
  jira: t("Jira", "Jira"),
};

const count: PageMeasure = { fn: "count" };
const open: PageFilter = { field: "open", op: "isTrue" };

export const PAGE_METRICS: readonly PageMetric[] = [
  { id: "projects.count", group: "projects", label: t("Открытые проекты", "Open projects"), definition: t("Проекты охвата страницы, кроме закрытых", "All projects in the page scope except closed ones"), source: "projects", filters: [], measure: count, unit: "count" },
  { id: "projects.red", group: "projects", label: t("Красные проекты", "Red projects"), definition: t("Открытые проекты со светофором «красный»", "Open projects with a red RAG status"), source: "projects", filters: [{ field: "rag", op: "eq", value: "RED" }], measure: count, unit: "count", higherIsWorse: true },
  { id: "projects.notGreen", group: "projects", label: t("Проекты не в зелёной зоне", "Amber or red projects"), definition: t("Светофор жёлтый или красный", "Open projects with an amber or red RAG status"), source: "projects", filters: [{ field: "rag", op: "in", value: ["AMBER", "RED"] }], measure: count, unit: "count", higherIsWorse: true },
  { id: "projects.targetShift", group: "projects", label: t("Сдвиг целей, дн.", "Target slip, days"), definition: t("Сумма сдвигов текущих целей проектов от исходных (дата цели при создании проекта)", "Total days the current target dates have moved from their baseline (the target set when the project was created)"), source: "projects", filters: [], measure: { fn: "sum", field: "targetShiftDays" }, unit: "days", higherIsWorse: true },
  { id: "projects.progress", group: "projects", label: t("Средний прогресс", "Average progress"), definition: t("Средний прогресс открытых проектов", "Average progress across open projects"), source: "projects", filters: [], measure: { fn: "avg", field: "progress" }, unit: "percent" },

  { id: "work.open", group: "work", label: t("Работы в плане", "Open work"), definition: t("Задачи, результаты и пакеты работ без вложенных строк, не сделанные и не отменённые", "Lowest-level tasks, deliverables and work packages that are not done or cancelled"), source: "work", filters: [open], measure: count, unit: "count" },
  { id: "work.overdue", group: "work", label: t("Просроченные работы", "Overdue work"), definition: t("Работы без вложенных строк, не сделаны и не отменены, срок раньше сегодня — как в отчётах по портфелю", "Lowest-level work that is not done or cancelled and is past its due date, as in portfolio reports"), source: "work", filters: [{ field: "overdue", op: "isTrue" }], measure: count, unit: "count", higherIsWorse: true },
  { id: "work.dueWeek", group: "work", label: t("Сдать в ближайшие 7 дней", "Due in the next 7 days"), definition: t("Не сделанные работы со сроком от сегодня до семи дней вперёд", "Open work due between today and 7 days from now"), source: "work", filters: [open, { field: "dueInDays", op: "between", value: 0, value2: 7 }], measure: count, unit: "count" },
  { id: "work.done", group: "work", label: t("Сделано за период", "Completed in period"), definition: t("Работы, закрытые за период страницы", "Work completed during the page period"), source: "work", filters: [{ field: "status", op: "eq", value: "DONE" }], measure: count, periodField: "closedAt", unit: "count" },

  { id: "checkpoints.upcoming", group: "checkpoints", label: t("Вехи в ближайшие 4 недели", "Milestones due in the next 4 weeks"), definition: t("Не достигнутые вехи и цели с прогнозом от сегодня до 28 дней вперёд", "Open milestones and goals forecast within the next 28 days"), source: "checkpoints", filters: [open, { field: "inDays", op: "between", value: 0, value2: 28 }], measure: count, unit: "count" },
  { id: "checkpoints.slipped", group: "checkpoints", label: t("Сдвинутые вехи", "Slipped milestones"), definition: t("Не достигнутые вехи и цели, у которых прогноз позже плана", "Open milestones and goals forecast later than planned"), source: "checkpoints", filters: [open, { field: "slipDays", op: "gt", value: 0 }], measure: count, unit: "count", higherIsWorse: true },
  { id: "checkpoints.slipDays", group: "checkpoints", label: t("Сдвиг вех, дн.", "Milestone slip, days"), definition: t("Сумма сдвигов прогноза от плана у не достигнутых вех и целей", "Total days open milestones and goals are forecast past their planned dates"), source: "checkpoints", filters: [open], measure: { fn: "sum", field: "slipDays" }, unit: "days", higherIsWorse: true },
  { id: "checkpoints.all", group: "checkpoints", label: t("Все вехи и цели", "All milestones and goals"), definition: t("Все вехи и цели проектов, в том числе достигнутые", "All project milestones and goals, including those already reached"), source: "checkpoints", filters: [], measure: count, unit: "count" },

  { id: "risks.red", group: "risks", label: t("Красные риски", "Red risks"), definition: t("Открытые риски с оценкой 15 и выше — как в отчётах по портфелю", "Open risks with a score of 15 or higher, as in portfolio reports"), source: "risks", filters: [open, { field: "type", op: "eq", value: "RISK" }, { field: "level", op: "eq", value: "RED" }], measure: count, unit: "count", higherIsWorse: true },
  { id: "risks.open", group: "risks", label: t("Открытые риски", "Open risks"), definition: t("Риски, кроме закрытых и подтверждённых", "Risks that are not closed or validated"), source: "risks", filters: [open, { field: "type", op: "eq", value: "RISK" }], measure: count, unit: "count", higherIsWorse: true },
  { id: "risks.problems", group: "risks", label: t("Открытые проблемы", "Open problems"), definition: t("Проблемы RAID, кроме закрытых и подтверждённых", "RAID problems that are not closed or validated"), source: "risks", filters: [open, { field: "type", op: "eq", value: "DEPENDENCY" }], measure: count, unit: "count", higherIsWorse: true },
  { id: "risks.new", group: "risks", label: t("Новые риски за период", "New risks in period"), definition: t("Риски, заведённые за период страницы", "Risks logged during the page period"), source: "risks", filters: [{ field: "type", op: "eq", value: "RISK" }], measure: count, periodField: "createdAt", unit: "count", higherIsWorse: true },

  { id: "decisions.waiting", group: "decisions", label: t("Решения ждут ответа", "Decisions awaiting approval"), definition: t("Решения, отправленные согласующему и ещё без ответа", "Decisions sent to an approver that have no answer yet"), source: "decisions", filters: [{ field: "waiting", op: "isTrue" }], measure: count, unit: "count", higherIsWorse: true },
  { id: "decisions.waitingDays", group: "decisions", label: t("Сколько ждут ответа, дн.", "Average wait, days"), definition: t("Среднее число дней, которое решения ждут ответа", "Average number of days decisions have been awaiting approval"), source: "decisions", filters: [{ field: "waiting", op: "isTrue" }], measure: { fn: "avg", field: "waitingDays" }, unit: "days", higherIsWorse: true },
  { id: "decisions.decided", group: "decisions", label: t("Принято за период", "Decisions made in period"), definition: t("Решения, принятые за период страницы", "Decisions approved during the page period"), source: "decisions", filters: [{ field: "status", op: "eq", value: "APPROVED" }], measure: count, periodField: "decidedAt", unit: "count" },

  { id: "shifts.count", group: "shifts", label: t("Сдвиги вех за период", "Milestone shifts in period"), definition: t("Записи журнала сдвигов вех и целей за период страницы", "Milestone and goal shift log entries during the page period"), source: "shifts", filters: [], measure: count, periodField: "createdAt", unit: "count", higherIsWorse: true },
  { id: "shifts.days", group: "shifts", label: t("На сколько сдвинулись, дн.", "Net shift, days"), definition: t("Сумма сдвигов вех и целей за период (позже — плюс, раньше — минус)", "Net days milestones and goals moved during the period (later adds, earlier subtracts)"), source: "shifts", filters: [], measure: { fn: "sum", field: "deltaDays" }, periodField: "createdAt", unit: "days", higherIsWorse: true },
  { id: "shifts.delayDays", group: "shifts", label: t("Задержка вех, дн.", "Milestone delay, days"), definition: t("Сумма сдвигов вех и целей на более позднюю дату за период — без сдвигов раньше, которые её уменьшили бы", "Total days milestones and goals moved later during the period, not offset by moves earlier"), source: "shifts", filters: [{ field: "later", op: "isTrue" }], measure: { fn: "sum", field: "deltaDays" }, periodField: "createdAt", unit: "days", higherIsWorse: true },
  { id: "shifts.later", group: "shifts", label: t("Сдвиги позже", "Moved later"), definition: t("Сдвиги вех и целей на более позднюю дату за период", "Milestone and goal moves to a later date during the period"), source: "shifts", filters: [{ field: "later", op: "isTrue" }], measure: count, periodField: "createdAt", unit: "count", higherIsWorse: true },

  { id: "issues.open", group: "issues", label: t("Открытые вопросы", "Open issues"), definition: t("Вопросы проектов, кроме сделанных, закрытых и решённых — как на странице «Вопросы»", "Project issues that are not done, closed or resolved, as on the Issues page"), source: "issues", filters: [open], measure: count, unit: "count", higherIsWorse: true },
  { id: "issues.noOwner", group: "issues", label: t("Вопросы без ответственного", "Issues with no owner"), definition: t("Открытые вопросы, у которых не указан ответственный", "Open issues with no owner"), source: "issues", filters: [open, { field: "owner", op: "empty" }], measure: count, unit: "count", higherIsWorse: true },
  { id: "issues.overdue", group: "issues", label: t("Просроченные вопросы", "Overdue issues"), definition: t("Открытые вопросы со сроком раньше сегодня", "Open issues due before today"), source: "issues", filters: [{ field: "overdue", op: "isTrue" }], measure: count, unit: "count", higherIsWorse: true },
  { id: "issues.critical", group: "issues", label: t("Критичные вопросы", "Critical issues"), definition: t("Открытые вопросы с приоритетом «Критичный» или «Высокий»", "Open issues with critical or high priority"), source: "issues", filters: [open, { field: "severity", op: "in", value: ["CRITICAL", "HIGH"] }], measure: count, unit: "count", higherIsWorse: true },
  { id: "issues.new", group: "issues", label: t("Новые вопросы за период", "New issues in period"), definition: t("Вопросы, заведённые за период страницы", "Issues logged during the page period"), source: "issues", filters: [], measure: count, periodField: "createdAt", unit: "count", higherIsWorse: true },

  { id: "changes.waiting", group: "changes", label: t("Изменения ждут решения", "Pending change requests"), definition: t("Запросы на изменение, поданные или на рассмотрении", "Change requests that are submitted or in review"), source: "changes", filters: [{ field: "waiting", op: "isTrue" }], measure: count, unit: "count", higherIsWorse: true },
  { id: "changes.scheduleImpact", group: "changes", label: t("Влияние изменений на срок, дн.", "Schedule impact of pending changes, days"), definition: t("Сумма влияния на срок у запросов, ждущих решения", "Total schedule impact of change requests awaiting a decision"), source: "changes", filters: [{ field: "waiting", op: "isTrue" }], measure: { fn: "sum", field: "scheduleImpactDays" }, unit: "days", higherIsWorse: true },
  { id: "changes.approved", group: "changes", label: t("Одобрено изменений за период", "Change requests approved in period"), definition: t("Запросы на изменение, одобренные за период страницы", "Change requests approved during the page period"), source: "changes", filters: [], measure: count, periodField: "approvedAt", unit: "count" },

  { id: "people.overloaded", group: "people", label: t("Перегруженные люди", "Overloaded people"), definition: t("Люди проектов страницы, у которых сумма долей во всех открытых проектах больше их ёмкости — как на странице «Загрузка»", "People on the page's projects allocated above their capacity across all open projects, as on the Workload page"), source: "workload", filters: [{ field: "overloaded", op: "isTrue" }], measure: count, unit: "count", higherIsWorse: true },
  { id: "people.count", group: "people", label: t("Люди в проектах", "People on these projects"), definition: t("Люди с долей в проектах страницы на сегодня", "People allocated to the page's projects today"), source: "workload", filters: [], measure: count, unit: "count" },
  { id: "people.onLeave", group: "people", label: t("В отпуске сегодня", "On leave today"), definition: t("Люди проектов страницы, у которых сегодня отпуск", "People on the page's projects who are on leave today"), source: "workload", filters: [{ field: "onLeave", op: "isTrue" }], measure: count, unit: "count" },
  { id: "people.atRisk", group: "people", label: t("Работы под вопросом", "Work at risk"), definition: t("Отметки за период страницы: «Под вопросом» или «Не успеваю»", "Check-ins in the page period marked at risk or off track"), source: "checkins", filters: [{ field: "confidence", op: "in", value: ["AT_RISK", "OFF_TRACK"] }], measure: count, periodField: "weekStart", unit: "count", higherIsWorse: true },
  { id: "people.blockers", group: "people", label: t("Препятствия в отметках", "Blockers in check-ins"), definition: t("Отметки за период, где человек написал, что мешает", "Check-ins in the page period that report a blocker"), source: "checkins", filters: [{ field: "hasBlocker", op: "isTrue" }], measure: count, periodField: "weekStart", unit: "count", higherIsWorse: true },

  { id: "jira.open", group: "jira", label: t("Открытые задачи Jira", "Open Jira issues"), definition: t("Задачи без резолюции и не отменённые, из снимков проектов — как в виджетах Jira", "Unresolved, non-cancelled issues from project snapshots, as in the Jira widgets"), source: "jira", filters: [open], measure: count, unit: "count" },
  { id: "jira.created", group: "jira", label: t("Создано задач Jira за период", "Jira issues created in period"), definition: t("Задачи, созданные за период страницы (отменённые не считаются)", "Issues created during the page period, excluding cancelled ones"), source: "jira", filters: [], measure: count, periodField: "createdAt", unit: "count" },
  { id: "jira.resolved", group: "jira", label: t("Решено задач Jira за период", "Jira issues resolved in period"), definition: t("Задачи, решённые за период страницы по сегодняшним снимкам", "Issues resolved during the page period, based on today's snapshots"), source: "jira", filters: [], measure: count, periodField: "resolvedAt", unit: "count" },
  { id: "jira.critical", group: "jira", label: t("Открытые Critical и Blocker", "Open Critical and Blocker issues"), definition: t("Открытые задачи с приоритетом Critical или Blocker", "Open issues with Critical or Blocker priority"), source: "jira", filters: [open, { field: "critical", op: "isTrue" }], measure: count, unit: "count", higherIsWorse: true },
  { id: "jira.overdue", group: "jira", label: t("Просроченные задачи Jira", "Overdue Jira issues"), definition: t("Открытые задачи со сроком (due date) раньше сегодня", "Open issues due before today"), source: "jira", filters: [{ field: "overdue", op: "isTrue" }], measure: count, unit: "count", higherIsWorse: true },
  { id: "jira.storyPoints", group: "jira", label: t("Story points в работе", "Open story points"), definition: t("Сумма story points открытых задач", "Total story points of open issues"), source: "jira", filters: [open], measure: { fn: "sum", field: "storyPoints" }, unit: "count" },
];

const metricsById = new Map(PAGE_METRICS.map((metric) => [metric.id, metric]));

export function pageMetric(id: string) {
  return metricsById.get(id) ?? null;
}
