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
    label: t("Портфель для руководителя", "Portfolio for an executive"),
    description: t("Светофоры и прогресс проектов, сдвиги целей, решения ждут ответа, красные риски и причины сдвигов", "Project RAG and progress, target shifts, decisions waiting, red risks and reasons for shifts"),
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
        id: "l-decisions", type: "list", x: 8, y: 3, w: 4, h: 7, title: t("Решения ждут ответа", "Decisions waiting for an answer"),
        data: { metric: "decisions.waiting", filters: [], columns: ["approverName", "waitingDays"], sort: { by: "waitingDays", dir: "desc" }, limit: 8 },
      },
      { id: "c-risks", type: "chart", chart: "bars", showValues: true, x: 0, y: 10, w: 4, h: 4, title: t("Красные риски по проектам", "Red risks by project"), data: { metric: "risks.red", filters: [], groupBy: "project", limit: 8 } },
      { id: "c-shifts", type: "chart", chart: "columns", x: 4, y: 10, w: 4, h: 4, title: t("Сдвиги вех по неделям", "Checkpoint shifts by week"), data: { metric: "shifts.count", filters: [], groupBy: "createdAt", bucket: "week" } },
      { id: "c-reasons", type: "chart", chart: "donut", x: 8, y: 10, w: 4, h: 4, title: t("Причины сдвигов", "Reasons for shifts"), data: { metric: "shifts.count", filters: [], groupBy: "reasonCategory" } },
    ],
  },
  {
    id: "blank",
    label: t("Пустая", "Blank"),
    description: t("Чистый лист 16:9 — виджеты добавляются кнопкой «+ Виджет»", "A clean 16:9 sheet — add widgets with “+ Widget”"),
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
