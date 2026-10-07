import type { PageText } from "./dataset-types.js";
import type { PageMetricGroup } from "./metrics.js";
import type { PageWidget } from "./page-schema.js";

/**
 * The "+ Widget" palette asks questions, not sources: "How much work is
 * overdue?" adds a number, "Overdue work by owner" adds bars. Each question is
 * a ready widget — a named metric with a split, a look and a size.
 */

const t = (ru: string, en: string): PageText => ({ ru, en });

/** A widget before it is placed: its title and text in both languages, the person's language is taken. */
export type PageQuestionWidget = Omit<PageWidget, "id" | "x" | "y" | "title" | "text"> & { title: PageText; text?: PageText };
export type PageQuestion = { id: string; group: PageMetricGroup | "design"; label: PageText; widget: PageQuestionWidget };

const kpi = (metric: string, title: PageText, compare = false): PageQuestionWidget => ({ type: "kpi", w: 3, h: 3, title, data: { metric, filters: [], ...(compare ? { compare: true } : {}) } });

export const PAGE_QUESTIONS: readonly PageQuestion[] = [
  { id: "q.projects.count", group: "projects", label: t("Сколько открытых проектов?", "How many open projects?"), widget: kpi("projects.count", t("Проектов", "Projects")) },
  { id: "q.projects.red", group: "projects", label: t("Сколько проектов в красной зоне?", "How many projects are red?"), widget: kpi("projects.red", t("Красных проектов", "Red projects")) },
  { id: "q.projects.shift", group: "projects", label: t("Насколько сдвинулись цели проектов?", "How far have the targets moved?"), widget: kpi("projects.targetShift", t("Сдвиг целей, дн.", "Target shift, days")) },
  { id: "q.projects.grid", group: "projects", label: t("Как дела у каждого проекта? (плитки)", "How is each project doing? (tiles)"), widget: { type: "status-grid", w: 12, h: 4, title: t("Проекты", "Projects"), data: { metric: "projects.count", filters: [], columns: ["progress", "nextCheckpoint", "overdueWork", "redRisks"] } } },
  { id: "q.projects.table", group: "projects", label: t("Таблица статусов проектов", "Project status table"), widget: { type: "table", w: 8, h: 6, title: t("Проекты", "Projects"), data: { metric: "projects.count", filters: [] } } },
  { id: "q.projects.rag", group: "projects", label: t("Проекты по светофору", "Projects by RAG"), widget: { type: "chart", chart: "donut", w: 4, h: 4, title: t("Проекты по светофору", "Projects by RAG"), data: { metric: "projects.count", filters: [], groupBy: "rag" } } },
  { id: "q.projects.progress", group: "projects", label: t("Прогресс по проектам", "Progress by project"), widget: { type: "chart", chart: "bars", w: 6, h: 5, title: t("Прогресс проектов, %", "Project progress, %"), showValues: true, data: { metric: "projects.progress", filters: [], groupBy: "project" } } },

  { id: "q.work.overdue", group: "work", label: t("Сколько работ просрочено?", "How much work is overdue?"), widget: kpi("work.overdue", t("Просрочено работ", "Overdue work")) },
  { id: "q.work.overdueByProject", group: "work", label: t("Просрочки по проектам", "Overdue work by project"), widget: { type: "chart", chart: "bars", w: 4, h: 4, title: t("Просрочки по проектам", "Overdue work by project"), showValues: true, data: { metric: "work.overdue", filters: [], groupBy: "project" } } },
  { id: "q.work.overdueByOwner", group: "work", label: t("Чьи работы просрочены?", "Whose work is overdue?"), widget: { type: "chart", chart: "bars", w: 4, h: 5, title: t("Просрочки по ответственным", "Overdue work by owner"), showValues: true, data: { metric: "work.overdue", filters: [], groupBy: "owner", limit: 10 } } },
  { id: "q.work.overdueList", group: "work", label: t("Что именно просрочено?", "What exactly is overdue?"), widget: { type: "table", w: 8, h: 5, title: t("Просроченные работы", "Overdue work"), data: { metric: "work.overdue", filters: [], columns: ["project", "code", "title", "owner", "dueDate", "overdueDays"], sort: { by: "overdueDays", dir: "desc" }, limit: 20 } } },
  { id: "q.work.dueWeek", group: "work", label: t("Что сдать в ближайшую неделю?", "What is due within a week?"), widget: { type: "list", w: 4, h: 5, title: t("Сдать за 7 дней", "Due within 7 days"), data: { metric: "work.dueWeek", filters: [], columns: ["dueDate", "owner"], sort: { by: "dueDate", dir: "asc" }, limit: 12 } } },
  { id: "q.work.doneWeekly", group: "work", label: t("Сколько работ закрывается по неделям?", "How much work is closed each week?"), widget: { type: "chart", chart: "columns", w: 6, h: 4, title: t("Закрыто работ по неделям", "Work closed by week"), data: { metric: "work.done", filters: [], groupBy: "closedAt", bucket: "week" } } },

  { id: "q.checkpoints.upcoming", group: "checkpoints", label: t("Какие вехи впереди?", "Which checkpoints are coming?"), widget: { type: "table", w: 6, h: 5, title: t("Вехи в ближайшие 4 недели", "Checkpoints within 4 weeks"), data: { metric: "checkpoints.upcoming", filters: [], columns: ["project", "title", "plannedDate", "forecastDate", "slipDays"], sort: { by: "forecastDate", dir: "asc" }, limit: 15 } } },
  { id: "q.checkpoints.slipped", group: "checkpoints", label: t("Сколько вех сдвинуто?", "How many checkpoints slipped?"), widget: kpi("checkpoints.slipped", t("Сдвинутых вех", "Slipped checkpoints")) },
  { id: "q.checkpoints.slipList", group: "checkpoints", label: t("Какие вехи сдвинулись сильнее всего?", "Which checkpoints slipped the most?"), widget: { type: "table", w: 6, h: 5, title: t("Сдвинутые вехи", "Slipped checkpoints"), data: { metric: "checkpoints.slipped", filters: [], columns: ["project", "title", "plannedDate", "forecastDate", "slipDays"], sort: { by: "slipDays", dir: "desc" }, limit: 15 } } },
  { id: "q.checkpoints.byMonth", group: "checkpoints", label: t("Сколько вех по месяцам?", "Checkpoints by month"), widget: { type: "chart", chart: "stacked", w: 6, h: 4, title: t("Вехи по месяцам", "Checkpoints by month"), data: { metric: "checkpoints.all", filters: [], groupBy: "forecastDate", bucket: "month", groupBy2: "project" } } },

  { id: "q.risks.red", group: "risks", label: t("Сколько красных рисков?", "How many red risks?"), widget: kpi("risks.red", t("Красных рисков", "Red risks")) },
  { id: "q.risks.redByProject", group: "risks", label: t("Красные риски по проектам", "Red risks by project"), widget: { type: "chart", chart: "bars", w: 4, h: 4, title: t("Красные риски по проектам", "Red risks by project"), showValues: true, data: { metric: "risks.red", filters: [], groupBy: "project" } } },
  { id: "q.risks.redList", group: "risks", label: t("Какие риски красные?", "Which risks are red?"), widget: { type: "list", w: 4, h: 5, title: t("Красные риски", "Red risks"), data: { metric: "risks.red", filters: [], columns: ["riskScore", "owner"], sort: { by: "riskScore", dir: "desc" }, limit: 10 } } },
  { id: "q.risks.byLevel", group: "risks", label: t("Риски по уровням", "Risks by level"), widget: { type: "chart", chart: "donut", w: 4, h: 4, title: t("Открытые риски по уровням", "Open risks by level"), data: { metric: "risks.open", filters: [], groupBy: "level" } } },
  { id: "q.risks.new", group: "risks", label: t("Сколько новых рисков за период?", "How many new risks in the period?"), widget: kpi("risks.new", t("Новых рисков", "New risks"), true) },

  { id: "q.decisions.waitingList", group: "decisions", label: t("Какие решения ждут ответа?", "Which decisions are waiting?"), widget: { type: "list", w: 4, h: 6, title: t("Решения ждут ответа", "Decisions waiting for an answer"), data: { metric: "decisions.waiting", filters: [], columns: ["approverName", "waitingDays"], sort: { by: "waitingDays", dir: "desc" }, limit: 10 } } },
  { id: "q.decisions.waiting", group: "decisions", label: t("Сколько решений ждут ответа?", "How many decisions are waiting?"), widget: kpi("decisions.waiting", t("Решения ждут", "Decisions waiting")) },
  { id: "q.decisions.decided", group: "decisions", label: t("Сколько решений принято за период?", "How many decisions were taken?"), widget: kpi("decisions.decided", t("Принято решений", "Decisions taken"), true) },

  { id: "q.shifts.count", group: "shifts", label: t("Сколько раз сдвигались вехи?", "How many times did checkpoints move?"), widget: kpi("shifts.count", t("Сдвигов вех", "Checkpoint shifts"), true) },
  { id: "q.shifts.weekly", group: "shifts", label: t("На сколько дней сдвигались вехи по неделям?", "How many days did checkpoints move each week?"), widget: { type: "chart", chart: "stacked", w: 4, h: 4, title: t("Сдвиги вех по неделям, дн.", "Checkpoint shifts by week, days"), data: { metric: "shifts.days", filters: [], groupBy: "createdAt", bucket: "week", groupBy2: "later" } } },
  { id: "q.shifts.weeklyCount", group: "shifts", label: t("Сколько сдвигов было по неделям?", "How many shifts were there each week?"), widget: { type: "chart", chart: "columns", w: 4, h: 4, title: t("Число сдвигов по неделям", "Number of shifts by week"), data: { metric: "shifts.count", filters: [], groupBy: "createdAt", bucket: "week" } } },
  { id: "q.shifts.reasons", group: "shifts", label: t("Почему сдвигаются вехи?", "Why do checkpoints move?"), widget: { type: "chart", chart: "donut", w: 4, h: 4, title: t("Задержка по причинам, дн.", "Delay by reason, days"), data: { metric: "shifts.delayDays", filters: [], groupBy: "reasonCategory" } } },
  { id: "q.shifts.days", group: "shifts", label: t("На сколько дней сдвинулись вехи?", "How many days did checkpoints move?"), widget: kpi("shifts.days", t("Сдвиг вех, дн.", "Shift, days"), true) },
  { id: "q.shifts.byProject", group: "shifts", label: t("Сдвиги по проектам и причинам", "Shifts by project and reason"), widget: { type: "chart", chart: "stacked", w: 6, h: 4, title: t("Сдвиги по проектам и причинам", "Shifts by project and reason"), data: { metric: "shifts.count", filters: [], groupBy: "project", groupBy2: "reasonCategory" } } },
  { id: "q.shifts.recent", group: "shifts", label: t("Последние сдвиги", "Latest shifts"), widget: { type: "table", w: 8, h: 5, title: t("Последние сдвиги", "Latest shifts"), data: { metric: "shifts.count", filters: [], columns: ["project", "checkpointTitle", "deltaDays", "reasonCategory", "createdAt"], sort: { by: "createdAt", dir: "desc" }, limit: 15 } } },

  { id: "q.projects.light", group: "projects", label: t("Светофор: сколько проектов в красной зоне", "Traffic light: red projects"), widget: { type: "traffic-light", w: 3, h: 3, title: t("Красные проекты", "Red projects"), thresholds: { amber: 1, red: 2 }, data: { metric: "projects.red", filters: [] } } },
  { id: "q.projects.progressBar", group: "projects", label: t("Средний прогресс полосой", "Average progress as a bar"), widget: { type: "progress", w: 4, h: 2, title: t("Средний прогресс", "Average progress"), target: 100, data: { metric: "projects.progress", filters: [] } } },
  { id: "q.work.overdueGrid", group: "work", label: t("Просрочки каждого проекта числами", "Overdue work of each project as figures"), widget: { type: "metric-grid", w: 6, h: 3, title: t("Просрочено по проектам", "Overdue by project"), data: { metric: "work.overdue", filters: [], groupBy: "project", limit: 12 } } },
  { id: "q.checkpoints.timeline", group: "checkpoints", label: t("Вехи на ленте времени", "Checkpoints on a timeline"), widget: { type: "timeline", w: 8, h: 5, title: t("Вехи: план и прогноз", "Checkpoints: plan and forecast"), data: { metric: "checkpoints.upcoming", filters: [], columns: ["project", "title", "plannedDate", "forecastDate"], sort: { by: "forecastDate", dir: "asc" }, limit: 12 } } },

  { id: "q.issues.open", group: "issues", label: t("Сколько вопросов открыто?", "How many issues are open?"), widget: kpi("issues.open", t("Открытых вопросов", "Open issues")) },
  { id: "q.issues.noOwner", group: "issues", label: t("Вопросы без ответственного", "Issues without an owner"), widget: kpi("issues.noOwner", t("Без ответственного", "No owner")) },
  { id: "q.issues.byOwner", group: "issues", label: t("У кого больше всего вопросов?", "Who holds the most issues?"), widget: { type: "chart", chart: "bars", w: 4, h: 5, title: t("Открытые вопросы по ответственным", "Open issues by owner"), showValues: true, data: { metric: "issues.open", filters: [], groupBy: "owner", limit: 10 } } },
  { id: "q.issues.overdueList", group: "issues", label: t("Какие вопросы просрочены?", "Which issues are overdue?"), widget: { type: "list", w: 4, h: 5, title: t("Просроченные вопросы", "Overdue issues"), data: { metric: "issues.overdue", filters: [], columns: ["owner", "overdueDays"], sort: { by: "overdueDays", dir: "desc" }, limit: 10 } } },

  { id: "q.changes.waiting", group: "changes", label: t("Какие изменения ждут решения?", "Which changes are waiting?"), widget: { type: "table", w: 6, h: 4, title: t("Изменения ждут решения", "Changes waiting"), data: { metric: "changes.waiting", filters: [], columns: ["project", "title", "type", "scheduleImpactDays"], sort: { by: "scheduleImpactDays", dir: "desc" }, limit: 10 } } },
  { id: "q.changes.impact", group: "changes", label: t("Насколько изменения сдвинут сроки?", "How far would the changes move the dates?"), widget: kpi("changes.scheduleImpact", t("Влияние изменений, дн.", "Change impact, days")) },

  { id: "q.people.overloaded", group: "people", label: t("Кто перегружен?", "Who is overloaded?"), widget: { type: "list", w: 4, h: 5, title: t("Перегружены", "Overloaded"), data: { metric: "people.overloaded", filters: [], columns: ["planned", "capacity", "department"], sort: { by: "planned", dir: "desc" }, limit: 10 } } },
  { id: "q.people.count", group: "people", label: t("Сколько людей перегружено?", "How many people are overloaded?"), widget: kpi("people.overloaded", t("Перегружено людей", "Overloaded people")) },
  { id: "q.people.onLeave", group: "people", label: t("Кто в отпуске сегодня?", "Who is on leave today?"), widget: { type: "list", w: 4, h: 4, title: t("В отпуске сегодня", "On leave today"), data: { metric: "people.onLeave", filters: [], columns: ["department", "projects"], limit: 10 } } },
  { id: "q.people.checkins", group: "people", label: t("Что мешает команде?", "What is in the team's way?"), widget: { type: "table", w: 8, h: 5, title: t("Препятствия из отметок", "Blockers from check-ins"), data: { metric: "people.blockers", filters: [], columns: ["project", "person", "title", "blocker", "weekStart"], sort: { by: "weekStart", dir: "desc" }, limit: 12 } } },

  { id: "q.jira.open", group: "jira", label: t("Сколько задач Jira открыто?", "How many Jira issues are open?"), widget: kpi("jira.open", t("Открыто в Jira", "Open in Jira")) },
  { id: "q.jira.weekly", group: "jira", label: t("Создано и решено в Jira по неделям", "Jira created by week"), widget: { type: "chart", chart: "columns", w: 6, h: 4, title: t("Создано задач Jira по неделям", "Jira issues created by week"), data: { metric: "jira.created", filters: [], groupBy: "createdAt", bucket: "week" } } },
  { id: "q.jira.categories", group: "jira", label: t("Открытые задачи по категориям статуса", "Open issues by status category"), widget: { type: "chart", chart: "donut", w: 4, h: 4, title: t("Jira по категориям", "Jira by category"), data: { metric: "jira.open", filters: [], groupBy: "statusCategory" } } },
  { id: "q.jira.critical", group: "jira", label: t("Сколько открытых Critical и Blocker?", "How many open Critical and Blocker?"), widget: kpi("jira.critical", t("Critical и Blocker", "Critical and Blocker")) },
  { id: "q.jira.byAssignee", group: "jira", label: t("У кого больше задач Jira?", "Who holds the most Jira issues?"), widget: { type: "chart", chart: "bars", w: 4, h: 5, title: t("Открытые задачи по исполнителям", "Open issues by assignee"), showValues: true, data: { metric: "jira.open", filters: [], groupBy: "assignee", limit: 10 } } },


  { id: "q.design.heading", group: "design", label: t("Заголовок раздела", "Section heading"), widget: { type: "heading", w: 12, h: 1, title: t("", ""), text: t("Раздел", "Section") } },
  { id: "q.design.text", group: "design", label: t("Текст", "Text"), widget: { type: "text", w: 4, h: 3, title: t("", ""), text: t("", "") } },
  { id: "q.design.divider", group: "design", label: t("Разделитель", "Divider"), widget: { type: "divider", w: 12, h: 1, title: t("", "") } },
  { id: "q.design.callout", group: "design", label: t("Вывод для встречи", "Takeaway for the meeting"), widget: { type: "callout", w: 6, h: 2, title: t("Вывод для встречи", "Takeaway for the meeting"), text: t("", ""), tone: "warning" } },
];
