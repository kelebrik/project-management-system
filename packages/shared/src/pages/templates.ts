import type { PageText } from "./dataset-types.js";
import { PAGE_SCHEMA_VERSION, type PageDocument, type PageFormat, type PageScope, type PageWidget } from "./page-schema.js";
import type { PageQuestionWidget } from "./questions.js";

/**
 * Ready pages for a kind of meeting. A template is a page: the same widgets,
 * named in both languages; a new page takes the person's language and scope.
 */

const t = (ru: string, en: string): PageText => ({ ru, en });

export type PageTemplateWidget = PageQuestionWidget & { id: string; x: number; y: number };
export type PageTemplate = {
  id: string;
  label: PageText;
  description: PageText;
  /** What the template is made for; any scope works. */
  scopeHint: "portfolio" | "project" | "any";
  format: PageFormat;
  periodDays: number;
  title: PageText;
  widgets: readonly PageTemplateWidget[];
};

const kpi = (id: string, x: number, metric: string, title: PageText, compare = false): PageTemplateWidget => ({
  id, type: "kpi", x, y: 0, w: 3, h: 3, title, data: { metric, filters: [], ...(compare ? { compare: true } : {}) },
});

export const PAGE_TEMPLATES: readonly PageTemplate[] = [
  {
    id: "portfolio-executive",
    label: t("Портфель для руководителя", "Executive overview"),
    description: t("Светофоры и прогресс проектов, сдвиги целей, решения ждут ответа, красные риски и причины сдвигов", "RAG and progress for every project, target slips, pending decisions, red risks and why milestones moved"),
    scopeHint: "portfolio",
    format: "wide",
    periodDays: 90,
    title: t("Портфель", "Portfolio"),
    widgets: [
      kpi("k-projects", 0, "projects.count", t("Открытых проектов", "Open projects")),
      kpi("k-red", 3, "projects.red", t("Красных проектов", "Red projects")),
      kpi("k-risks", 6, "risks.red", t("Красных рисков", "Red risks")),
      kpi("k-overdue", 9, "work.overdue", t("Просрочено работ", "Overdue work")),
      {
        id: "t-projects", type: "table", x: 0, y: 3, w: 8, h: 7, title: t("Проекты", "Projects"),
        data: { metric: "projects.count", filters: [], columns: ["project", "rag", "progress", "targetDate", "targetShiftDays", "nextCheckpoint", "nextCheckpointDate", "overdueWork", "redRisks"], sort: { by: "project", dir: "asc" }, limit: 12 },
      },
      {
        id: "l-decisions", type: "list", x: 8, y: 3, w: 4, h: 7, title: t("Решения ждут ответа", "Decisions awaiting approval"),
        data: { metric: "decisions.waiting", filters: [], columns: ["approverName", "waitingDays"], sort: { by: "waitingDays", dir: "desc" }, limit: 8 },
      },
      { id: "c-risks", type: "chart", chart: "bars", showValues: true, x: 0, y: 10, w: 4, h: 4, title: t("Красные риски по проектам", "Red risks by project"), data: { metric: "risks.red", filters: [], groupBy: "project", limit: 8 } },
      { id: "c-shifts", type: "chart", chart: "stacked", x: 4, y: 10, w: 4, h: 4, title: t("Сдвиги вех по неделям, дн.", "Milestone shifts by week, days"), data: { metric: "shifts.days", filters: [], groupBy: "createdAt", bucket: "week", groupBy2: "later" } },
      { id: "c-reasons", type: "chart", chart: "donut", x: 8, y: 10, w: 4, h: 4, title: t("Задержка по причинам, дн.", "Delay by reason, days"), data: { metric: "shifts.delayDays", filters: [], groupBy: "reasonCategory" } },
    ],
  },
  {
    id: "portfolio-roadmap",
    label: t("Дорожная карта портфеля", "Portfolio roadmap"),
    description: t("Цели каждого проекта на шкале от −4 до +8 месяцев, сдвинутые и ближайшие вехи", "Every project's goals on a −4 to +8 month timeline, plus slipped and upcoming milestones"),
    scopeHint: "portfolio",
    format: "wide",
    periodDays: 90,
    title: t("Дорожная карта портфеля", "Portfolio roadmap"),
    widgets: [
      kpi("k-projects", 0, "projects.count", t("Открытых проектов", "Open projects")),
      kpi("k-upcoming", 3, "checkpoints.upcoming", t("Вехи в ближайшие 4 недели", "Milestones due in the next 4 weeks")),
      kpi("k-slipped", 6, "checkpoints.slipped", t("Сдвинутых вех", "Slipped milestones")),
      kpi("k-red", 9, "projects.red", t("Красных проектов", "Red projects")),
      {
        id: "r-goals", type: "roadmap", x: 0, y: 3, w: 12, h: 11, title: t("Цели проектов: −4 / +8 месяцев", "Project goals: −4 / +8 months"),
        data: { metric: "checkpoints.all", filters: [{ field: "type", op: "in", value: ["GOAL"] }] }, roadmap: { before: 4, after: 8 },
      },
    ],
  },
  {
    id: "project-status",
    label: t("Статус проекта", "Project status"),
    description: t("Ближайшие вехи на ленте времени, просрочки, красные риски, Jira по неделям и вывод для встречи", "Upcoming milestones on a timeline, overdue work, red risks, weekly Jira activity and a key takeaway"),
    scopeHint: "project",
    format: "wide",
    periodDays: 90,
    title: t("Статус проекта", "Project status"),
    widgets: [
      kpi("k-overdue", 0, "work.overdue", t("Просрочено работ", "Overdue work")),
      kpi("k-slipped", 3, "checkpoints.slipped", t("Сдвинутых вех", "Slipped milestones")),
      kpi("k-risks", 6, "risks.red", t("Красных рисков", "Red risks")),
      kpi("k-jira", 9, "jira.open", t("Открыто в Jira", "Open in Jira")),
      { id: "tl-checkpoints", type: "timeline", x: 0, y: 3, w: 8, h: 5, title: t("Вехи: план и прогноз", "Milestones: planned vs forecast"), data: { metric: "checkpoints.upcoming", filters: [], columns: ["project", "title", "plannedDate", "forecastDate"], sort: { by: "forecastDate", dir: "asc" }, limit: 10 } },
      { id: "l-decisions", type: "list", x: 8, y: 3, w: 4, h: 5, title: t("Решения ждут ответа", "Decisions awaiting approval"), data: { metric: "decisions.waiting", filters: [], columns: ["approverName", "waitingDays"], sort: { by: "waitingDays", dir: "desc" }, limit: 6 } },
      { id: "c-jira", type: "chart", chart: "columns", x: 0, y: 8, w: 6, h: 4, title: t("Создано задач Jira по неделям", "Jira issues created by week"), data: { metric: "jira.created", filters: [], groupBy: "createdAt", bucket: "week" } },
      { id: "t-overdue", type: "table", x: 6, y: 8, w: 6, h: 4, title: t("Просроченные работы", "Overdue work"), data: { metric: "work.overdue", filters: [], columns: ["code", "title", "owner", "overdueDays"], sort: { by: "overdueDays", dir: "desc" }, limit: 10 } },
      { id: "n-takeaway", type: "callout", x: 0, y: 12, w: 12, h: 2, tone: "warning", title: t("Вывод для встречи", "Key takeaway"), text: t("Что главное на этой неделе и какое решение нужно.", "What matters most this week, and which decision we need.") },
    ],
  },
  {
    id: "risks-decisions",
    label: t("Риски и решения", "Risks and decisions"),
    description: t("Красные риски, проблемы, вопросы без ответственного, решения и изменения, которые ждут", "Red risks, problems, issues with no owner, pending decisions and change requests"),
    scopeHint: "any",
    format: "wide",
    periodDays: 30,
    title: t("Риски и решения", "Risks and decisions"),
    widgets: [
      kpi("k-risks", 0, "risks.red", t("Красных рисков", "Red risks")),
      kpi("k-problems", 3, "risks.problems", t("Открытых проблем", "Open problems")),
      kpi("k-owner", 6, "issues.noOwner", t("Вопросов без ответственного", "Issues with no owner")),
      kpi("k-decisions", 9, "decisions.waiting", t("Решений ждут ответа", "Pending decisions")),
      { id: "t-risks", type: "table", x: 0, y: 3, w: 7, h: 6, title: t("Красные риски", "Red risks"), data: { metric: "risks.red", filters: [], columns: ["project", "title", "owner", "riskScore", "dueDate"], sort: { by: "riskScore", dir: "desc" }, limit: 12 } },
      { id: "l-decisions", type: "list", x: 7, y: 3, w: 5, h: 6, title: t("Решения ждут ответа", "Decisions awaiting approval"), data: { metric: "decisions.waiting", filters: [], columns: ["approverName", "waitingDays"], sort: { by: "waitingDays", dir: "desc" }, limit: 8 } },
      { id: "c-levels", type: "chart", chart: "donut", x: 0, y: 9, w: 4, h: 5, title: t("Открытые риски по уровням", "Open risks by level"), data: { metric: "risks.open", filters: [], groupBy: "level" } },
      { id: "c-owners", type: "chart", chart: "bars", showValues: true, x: 4, y: 9, w: 4, h: 5, title: t("Открытые вопросы по ответственным", "Open issues by owner"), data: { metric: "issues.open", filters: [], groupBy: "owner", limit: 8 } },
      { id: "l-changes", type: "list", x: 8, y: 9, w: 4, h: 5, title: t("Изменения ждут решения", "Pending change requests"), data: { metric: "changes.waiting", filters: [], columns: ["type", "scheduleImpactDays"], sort: { by: "scheduleImpactDays", dir: "desc" }, limit: 6 } },
    ],
  },
  {
    id: "committee",
    label: t("Комитет", "Steering committee"),
    description: t("Проекты плитками, сдвиги целей и вех, причины сдвигов и изменения на решение", "Project tiles, target and milestone slips, reasons for shifts and change requests awaiting a decision"),
    scopeHint: "portfolio",
    format: "wide",
    periodDays: 90,
    title: t("Управляющий комитет", "Steering committee"),
    widgets: [
      kpi("k-notgreen", 0, "projects.notGreen", t("Не в зелёной зоне", "Amber or red")),
      kpi("k-target", 3, "projects.targetShift", t("Сдвиг целей, дн.", "Target slip, days")),
      kpi("k-shifts", 6, "shifts.days", t("Сдвиг вех за период, дн.", "Milestone shift in period, days"), true),
      kpi("k-changes", 9, "changes.waiting", t("Изменений на решение", "Change requests to decide")),
      { id: "g-projects", type: "status-grid", x: 0, y: 3, w: 12, h: 6, title: t("Проекты", "Projects"), data: { metric: "projects.count", filters: [], columns: ["progress", "targetDate", "targetShiftDays", "nextCheckpoint"], sort: { by: "project", dir: "asc" } } },
      { id: "c-reasons", type: "chart", chart: "stacked", x: 0, y: 9, w: 6, h: 5, title: t("Сдвиги по проектам и причинам", "Shifts by project and reason"), data: { metric: "shifts.count", filters: [], groupBy: "project", groupBy2: "reasonCategory", limit: 10 } },
      { id: "t-changes", type: "table", x: 6, y: 9, w: 6, h: 5, title: t("Изменения ждут решения", "Pending change requests"), data: { metric: "changes.waiting", filters: [], columns: ["project", "title", "type", "scheduleImpactDays"], sort: { by: "scheduleImpactDays", dir: "desc" }, limit: 10 } },
    ],
  },
  {
    id: "blank",
    label: t("Пустая", "Blank"),
    description: t("Чистый лист 16:9 — виджеты добавляются кнопкой «+ Виджет»", "An empty 16:9 page to fill with your own widgets"),
    scopeHint: "any",
    format: "wide",
    periodDays: 30,
    title: t("Новая страница", "New page"),
    widgets: [],
  },
];

export function pageTemplate(id: string) {
  return PAGE_TEMPLATES.find((template) => template.id === id) ?? null;
}

/** A widget in the person's language. */
export function localizePageWidget(widget: PageTemplateWidget, locale: "ru" | "en"): PageWidget {
  const { title, text, ...rest } = widget;
  return { ...rest, title: title[locale], ...(text ? { text: text[locale] } : {}) } as PageWidget;
}

/** A new page from a template, for a scope, in the person's language. */
export function pageFromTemplate(template: PageTemplate, scope: PageScope, locale: "ru" | "en"): { title: string; document: PageDocument } {
  return {
    title: template.title[locale],
    document: {
      schemaVersion: PAGE_SCHEMA_VERSION,
      format: template.format,
      theme: "light",
      scope,
      periodDays: template.periodDays,
      subtitle: "",
      widgets: template.widgets.map((widget) => localizePageWidget(widget, locale)),
    },
  };
}
