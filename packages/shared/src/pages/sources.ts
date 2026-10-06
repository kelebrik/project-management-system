import type { PageFieldDef, PageSourceDef, PageSourceKey, PageText } from "./dataset-types.js";

/**
 * The sources a widget may read and the fields of their rows. The server's
 * adapters fill exactly these fields; the editor offers them for splitting,
 * filtering and table columns. Words that mean something specific (overdue,
 * red risk, waiting decision) are computed once, by the adapter, the same way
 * the portfolio reports compute them.
 */

const t = (ru: string, en: string): PageText => ({ ru, en });

export const PAGE_RAG_VALUES = { GREEN: t("Зелёный", "Green"), AMBER: t("Жёлтый", "Amber"), RED: t("Красный", "Red") } as const;
const projectStatusValues = { DRAFT: t("Черновик", "Draft"), ACTIVE: t("Активен", "Active"), ON_HOLD: t("На паузе", "On hold") };
const wbsTypeValues = { PHASE: t("Фаза", "Phase"), WORK_PACKAGE: t("Пакет работ", "Work package"), DELIVERABLE: t("Результат", "Deliverable"), MILESTONE: t("Веха", "Milestone"), GOAL: t("Цель", "Goal"), TASK: t("Задача", "Task") };
const wbsStatusValues = {
  NOT_STARTED: t("Не начата", "Not started"), IN_PROGRESS: t("В работе", "In progress"), IN_REVIEW: t("На проверке", "In review"), AT_RISK: t("Под риском", "At risk"),
  BLOCKED: t("Провалено", "Failed"), DONE: t("Сделано", "Done"), CANCELLED: t("Отменено", "Cancelled"),
};
const raidTypeValues = { RISK: t("Риск", "Risk"), ASSUMPTION: t("Допущение", "Assumption"), DEPENDENCY: t("Проблема", "Problem") };
const raidStatusValues = {
  OPEN: t("Открыто", "Open"), IN_PROGRESS: t("В работе", "In progress"), MITIGATED: t("Смягчено", "Mitigated"), VALIDATED: t("Подтверждено", "Validated"), BREACHED: t("Нарушено", "Breached"), CLOSED: t("Закрыто", "Closed"),
};
export const PAGE_SHIFT_REASON_VALUES = {
  CUSTOMER: t("Заказчик", "Customer"), SUPPLIER: t("Поставщик", "Supplier"), RESOURCES: t("Ресурсы, отпуска", "People or leave"), ESTIMATE: t("Переоценка трудоемкости", "Re-estimate"),
  TECHNICAL: t("Технический риск", "Technical risk"), EXTERNAL: t("Внешнее", "External"), OTHER: t("Другое", "Other"),
};
const decisionStatusValues = {
  PROPOSED: t("Предложено", "Proposed"), PENDING_APPROVAL: t("На согласовании", "Awaiting approval"), APPROVED: t("Принято", "Approved"), REJECTED: t("Отклонено", "Rejected"), SUPERSEDED: t("Заменено", "Superseded"),
};
const issueSeverityValues = { LOW: t("Низкий", "Low"), MEDIUM: t("Средний", "Medium"), HIGH: t("Высокий", "High"), CRITICAL: t("Критичный", "Critical") };
const issueStatusValues = { Open: t("Открыто", "Open"), "In Progress": t("В работе", "In progress"), Blocked: t("Заблокировано", "Blocked"), Resolved: t("Решено", "Resolved"), Closed: t("Закрыто", "Closed"), Done: t("Сделано", "Done") };
const changeTypeValues = { SCOPE: t("Содержание", "Scope"), BUDGET: t("Бюджет", "Budget"), SCHEDULE: t("Сроки", "Schedule"), RESOURCE: t("Ресурсы", "Resources") };
const changeStatusValues = {
  DRAFT: t("Черновик", "Draft"), SUBMITTED: t("Подан", "Submitted"), IN_REVIEW: t("На рассмотрении", "In review"), APPROVED: t("Одобрен", "Approved"), REJECTED: t("Отклонён", "Rejected"), IMPLEMENTED: t("Внедрён", "Implemented"),
};
const lessonSourceValues = { MANUAL: t("Вручную", "By hand"), SHIFT: t("Сдвиг графика", "Schedule shift"), RISK: t("Риск или проблема", "Risk or problem"), ISSUE: t("Вопрос", "Issue"), DECISION: t("Решение", "Decision") };
const confidenceValues = { ON_TRACK: t("В срок", "On track"), AT_RISK: t("Под вопросом", "At risk"), OFF_TRACK: t("Не успеваю", "Off track") };
const jiraCategoryValues = { new: t("К выполнению", "To do"), indeterminate: t("В работе", "In progress"), done: t("Готово", "Done") };
const levelValues = { RED: t("Красный", "Red"), AMBER: t("Жёлтый", "Amber"), GREEN: t("Зелёный", "Green") };

const project: PageFieldDef[] = [
  { key: "project", label: t("Проект", "Project"), kind: "text", format: "code", groupable: true },
  { key: "projectName", label: t("Название проекта", "Project name"), kind: "text" },
  { key: "portfolio", label: t("Портфель", "Portfolio"), kind: "text", groupable: true },
];

export const PAGE_SOURCES: Record<PageSourceKey, PageSourceDef> = {
  projects: {
    key: "projects",
    label: t("Проекты", "Projects"),
    rowLabel: t("открытый проект", "an open project"),
    titleField: "project",
    periodFields: [],
    defaultColumns: ["project", "rag", "progress", "targetDate", "targetShiftDays", "nextCheckpoint", "nextCheckpointDate", "overdueWork", "redRisks"],
    fields: [
      ...project,
      { key: "businessUnit", label: t("Бизнес-юнит", "Business unit"), kind: "text", groupable: true },
      { key: "projectManager", label: t("Руководитель проекта", "Project manager"), kind: "text", groupable: true },
      { key: "status", label: t("Статус", "Status"), kind: "enum", values: projectStatusValues, groupable: true },
      { key: "rag", label: t("Светофор", "RAG"), kind: "enum", format: "rag", values: PAGE_RAG_VALUES, groupable: true },
      { key: "progress", label: t("Прогресс", "Progress"), kind: "number", format: "percent" },
      { key: "startDate", label: t("Начало", "Start"), kind: "date", format: "date" },
      { key: "targetDate", label: t("Цель", "Target"), kind: "date", format: "date" },
      { key: "startTargetDate", label: t("Исходная цель", "Starting target"), kind: "date", format: "date" },
      { key: "targetShiftDays", label: t("Сдвиг цели, дн.", "Target shift, days"), kind: "number", format: "days" },
      { key: "nextCheckpoint", label: t("Ближайшая веха", "Next checkpoint"), kind: "text" },
      { key: "nextCheckpointDate", label: t("Срок вехи", "Checkpoint date"), kind: "date", format: "date" },
      { key: "nextCheckpointSlipDays", label: t("Сдвиг вехи, дн.", "Checkpoint slip, days"), kind: "number", format: "days" },
      { key: "overdueWork", label: t("Просрочено работ", "Overdue work"), kind: "number", format: "count" },
      { key: "redRisks", label: t("Красные риски", "Red risks"), kind: "number", format: "count" },
      { key: "openRisks", label: t("Открытые риски", "Open risks"), kind: "number", format: "count" },
      { key: "waitingDecisions", label: t("Решения ждут", "Decisions waiting"), kind: "number", format: "count" },
      { key: "lastShiftDays", label: t("Последний сдвиг, дн.", "Last shift, days"), kind: "number", format: "days" },
      { key: "lastShiftReason", label: t("Причина последнего сдвига", "Reason of the last shift"), kind: "enum", values: PAGE_SHIFT_REASON_VALUES, groupable: true },
    ],
  },
  work: {
    key: "work",
    label: t("Работы", "Work"),
    rowLabel: t("задача, результат или пакет работ без вложенных строк", "a task, deliverable or work package without child rows"),
    titleField: "title",
    periodFields: ["closedAt"],
    defaultColumns: ["project", "code", "title", "owner", "dueDate", "status"],
    fields: [
      ...project,
      { key: "code", label: t("Код", "Code"), kind: "text", format: "code" },
      { key: "title", label: t("Название", "Title"), kind: "text" },
      { key: "type", label: t("Тип", "Type"), kind: "enum", values: wbsTypeValues, groupable: true },
      { key: "status", label: t("Статус", "Status"), kind: "enum", values: wbsStatusValues, groupable: true },
      { key: "phase", label: t("Фаза", "Phase"), kind: "text", groupable: true, emptyLabel: t("Вне фаз", "Outside phases") },
      { key: "owner", label: t("Ответственный", "Owner"), kind: "text", groupable: true, emptyLabel: t("Без ответственного", "No owner") },
      { key: "startDate", label: t("Начало", "Start"), kind: "date", format: "date", groupable: true },
      { key: "dueDate", label: t("Срок", "Due"), kind: "date", format: "date", groupable: true },
      { key: "closedAt", label: t("Закрыто", "Closed"), kind: "date", format: "date", groupable: true },
      { key: "progress", label: t("Прогресс", "Progress"), kind: "number", format: "percent" },
      { key: "open", label: t("Не сделано", "Not done"), kind: "boolean", groupable: true },
      { key: "overdue", label: t("Просрочено", "Overdue"), kind: "boolean", groupable: true },
      { key: "dueInDays", label: t("До срока, дн.", "Days to due"), kind: "number", format: "days" },
      { key: "overdueDays", label: t("Просрочка, дн.", "Days overdue"), kind: "number", format: "days" },
    ],
  },
  checkpoints: {
    key: "checkpoints",
    label: t("Вехи и цели", "Milestones and goals"),
    rowLabel: t("веха или цель", "a milestone or goal"),
    titleField: "title",
    periodFields: [],
    defaultColumns: ["project", "title", "plannedDate", "forecastDate", "slipDays", "status"],
    fields: [
      ...project,
      { key: "code", label: t("Код", "Code"), kind: "text", format: "code" },
      { key: "title", label: t("Название", "Title"), kind: "text" },
      { key: "type", label: t("Тип", "Type"), kind: "enum", values: { MILESTONE: wbsTypeValues.MILESTONE, GOAL: wbsTypeValues.GOAL }, groupable: true },
      { key: "status", label: t("Статус", "Status"), kind: "enum", values: wbsStatusValues, groupable: true },
      { key: "owner", label: t("Ответственный", "Owner"), kind: "text", groupable: true, emptyLabel: t("Без ответственного", "No owner") },
      { key: "plannedDate", label: t("По плану", "Planned"), kind: "date", format: "date", groupable: true },
      { key: "forecastDate", label: t("Прогноз", "Forecast"), kind: "date", format: "date", groupable: true },
      { key: "slipDays", label: t("Сдвиг, дн.", "Slip, days"), kind: "number", format: "days" },
      { key: "inDays", label: t("Через, дн.", "In days"), kind: "number", format: "days" },
      { key: "open", label: t("Не достигнута", "Not reached"), kind: "boolean", groupable: true },
      { key: "shiftCount", label: t("Сдвигов в журнале", "Shifts in the journal"), kind: "number", format: "count" },
    ],
  },
  risks: {
    key: "risks",
    label: t("Риски и проблемы", "Risks and problems"),
    rowLabel: t("запись RAID: риск, допущение или проблема", "a RAID record: risk, assumption or problem"),
    titleField: "title",
    periodFields: ["createdAt"],
    defaultColumns: ["project", "title", "owner", "riskScore", "status", "dueDate"],
    fields: [
      ...project,
      { key: "title", label: t("Название", "Title"), kind: "text" },
      { key: "type", label: t("Тип", "Type"), kind: "enum", values: raidTypeValues, groupable: true },
      { key: "status", label: t("Статус", "Status"), kind: "enum", values: raidStatusValues, groupable: true },
      { key: "owner", label: t("Владелец", "Owner"), kind: "text", groupable: true },
      { key: "riskScore", label: t("Оценка", "Score"), kind: "number", format: "score" },
      { key: "level", label: t("Уровень", "Level"), kind: "enum", format: "rag", values: levelValues, groupable: true },
      { key: "open", label: t("Открыт", "Open"), kind: "boolean", groupable: true },
      { key: "decisionRequired", label: t("Нужно решение", "Decision needed"), kind: "boolean", groupable: true },
      { key: "scheduleImpactDays", label: t("Влияние на срок, дн.", "Schedule impact, days"), kind: "number", format: "days" },
      { key: "dueDate", label: t("Срок", "Due"), kind: "date", format: "date", groupable: true },
      { key: "createdAt", label: t("Создан", "Created"), kind: "date", format: "date", groupable: true },
    ],
  },
  decisions: {
    key: "decisions",
    label: t("Решения", "Decisions"),
    rowLabel: t("решение проекта", "a decision of a project"),
    titleField: "title",
    periodFields: ["requestedAt", "decidedAt", "createdAt"],
    defaultColumns: ["project", "title", "approverName", "waitingDays"],
    fields: [
      ...project,
      { key: "title", label: t("Решение", "Decision"), kind: "text" },
      { key: "status", label: t("Статус", "Status"), kind: "enum", values: decisionStatusValues, groupable: true },
      { key: "approverName", label: t("Согласующий", "Approver"), kind: "text", groupable: true, emptyLabel: t("Без согласующего", "No approver") },
      { key: "waiting", label: t("Ждёт ответа", "Waiting for an answer"), kind: "boolean", groupable: true },
      { key: "waitingDays", label: t("Ждёт, дн.", "Waiting, days"), kind: "number", format: "days" },
      { key: "requestedAt", label: t("Отправлено", "Sent"), kind: "date", format: "date", groupable: true },
      { key: "decidedAt", label: t("Принято", "Decided"), kind: "date", format: "date", groupable: true },
      { key: "createdAt", label: t("Создано", "Created"), kind: "date", format: "date", groupable: true },
    ],
  },
  shifts: {
    key: "shifts",
    label: t("Сдвиги вех", "Milestone shifts"),
    rowLabel: t("сдвиг вехи или цели из журнала", "a shift of a milestone or goal from the journal"),
    titleField: "checkpointTitle",
    periodFields: ["createdAt"],
    defaultColumns: ["project", "checkpointTitle", "deltaDays", "reasonCategory", "createdAt"],
    fields: [
      ...project,
      { key: "checkpointTitle", label: t("Веха", "Checkpoint"), kind: "text", groupable: true },
      { key: "checkpointType", label: t("Тип", "Type"), kind: "enum", values: { MILESTONE: wbsTypeValues.MILESTONE, GOAL: wbsTypeValues.GOAL }, groupable: true },
      { key: "deltaDays", label: t("Сдвиг, дн.", "Shift, days"), kind: "number", format: "days" },
      { key: "later", label: t("Направление", "Direction"), kind: "boolean", groupable: true, values: { true: t("Позже", "Later"), false: t("Раньше", "Earlier") } },
      { key: "reasonCategory", label: t("Причина", "Reason"), kind: "enum", values: PAGE_SHIFT_REASON_VALUES, groupable: true, emptyLabel: t("Причина не указана", "No reason given") },
      { key: "reasonText", label: t("Пояснение", "Explanation"), kind: "text" },
      { key: "actorName", label: t("Кто сдвинул", "Moved by"), kind: "text", groupable: true },
      { key: "createdAt", label: t("Когда", "When"), kind: "date", format: "date", groupable: true },
    ],
  },
  issues: {
    key: "issues",
    label: t("Вопросы", "Issues"),
    rowLabel: t("вопрос проекта (открытый или закрытый)", "an issue of a project, open or closed"),
    titleField: "title",
    periodFields: ["createdAt"],
    defaultColumns: ["project", "title", "owner", "severity", "dueDate", "status"],
    fields: [
      ...project,
      { key: "title", label: t("Вопрос", "Issue"), kind: "text" },
      { key: "category", label: t("Раздел", "Section"), kind: "text", groupable: true },
      { key: "severity", label: t("Приоритет", "Priority"), kind: "enum", values: issueSeverityValues, groupable: true },
      { key: "readiness", label: t("Готовность", "Readiness"), kind: "enum", format: "rag", values: PAGE_RAG_VALUES, groupable: true },
      { key: "status", label: t("Статус", "Status"), kind: "enum", values: issueStatusValues, groupable: true },
      { key: "owner", label: t("Ответственный", "Owner"), kind: "text", groupable: true, emptyLabel: t("Без ответственного", "No owner") },
      { key: "phase", label: t("Фаза", "Phase"), kind: "text", groupable: true, emptyLabel: t("Вне фаз", "Outside phases") },
      { key: "open", label: t("Открыт", "Open"), kind: "boolean", groupable: true },
      { key: "decisionRequired", label: t("Нужно решение", "Decision needed"), kind: "boolean", groupable: true },
      { key: "overdue", label: t("Просрочен", "Overdue"), kind: "boolean", groupable: true },
      { key: "overdueDays", label: t("Просрочка, дн.", "Days overdue"), kind: "number", format: "days" },
      { key: "dueDate", label: t("Срок", "Due"), kind: "date", format: "date", groupable: true },
      { key: "createdAt", label: t("Создан", "Created"), kind: "date", format: "date", groupable: true },
    ],
  },
  changes: {
    key: "changes",
    label: t("Запросы на изменение", "Change requests"),
    rowLabel: t("запрос на изменение", "a change request"),
    titleField: "title",
    periodFields: ["createdAt", "approvedAt"],
    defaultColumns: ["project", "title", "type", "status", "scheduleImpactDays"],
    fields: [
      ...project,
      { key: "title", label: t("Изменение", "Change"), kind: "text" },
      { key: "type", label: t("Тип", "Type"), kind: "enum", values: changeTypeValues, groupable: true },
      { key: "status", label: t("Статус", "Status"), kind: "enum", values: changeStatusValues, groupable: true },
      { key: "owner", label: t("Инициатор", "Owner"), kind: "text", groupable: true, emptyLabel: t("Без инициатора", "No owner") },
      { key: "waiting", label: t("Ждёт решения", "Waiting for a decision"), kind: "boolean", groupable: true },
      { key: "scheduleImpactDays", label: t("Влияние на срок, дн.", "Schedule impact, days"), kind: "number", format: "days" },
      { key: "budgetImpact", label: t("Влияние на бюджет", "Budget impact"), kind: "number" },
      { key: "dueDate", label: t("Срок решения", "Decision due"), kind: "date", format: "date", groupable: true },
      { key: "createdAt", label: t("Создан", "Created"), kind: "date", format: "date", groupable: true },
      { key: "approvedAt", label: t("Одобрен", "Approved"), kind: "date", format: "date", groupable: true },
    ],
  },
  lessons: {
    key: "lessons",
    label: t("Уроки", "Lessons"),
    rowLabel: t("урок проекта", "a lesson of a project"),
    titleField: "title",
    periodFields: ["createdAt"],
    defaultColumns: ["project", "title", "category", "createdAt"],
    fields: [
      ...project,
      { key: "title", label: t("Урок", "Lesson"), kind: "text" },
      { key: "category", label: t("Категория", "Category"), kind: "text", groupable: true },
      { key: "sourceKind", label: t("Откуда", "Source"), kind: "enum", values: lessonSourceValues, groupable: true },
      { key: "recommendation", label: t("Что делать в следующий раз", "Next time"), kind: "text" },
      { key: "author", label: t("Автор", "Author"), kind: "text", groupable: true },
      { key: "createdAt", label: t("Записан", "Recorded"), kind: "date", format: "date", groupable: true },
    ],
  },
  workload: {
    key: "workload",
    label: t("Загрузка людей", "People's workload"),
    rowLabel: t("человек с долей в проектах охвата на сегодня", "a person with a share in the scope's projects today"),
    titleField: "person",
    periodFields: [],
    defaultColumns: ["person", "department", "capacity", "planned", "free"],
    fields: [
      { key: "project", label: t("Проект", "Project"), kind: "text", format: "code" },
      { key: "person", label: t("Человек", "Person"), kind: "text" },
      { key: "department", label: t("Подразделение", "Department"), kind: "text", groupable: true, emptyLabel: t("Без подразделения", "No department") },
      { key: "capacity", label: t("Ёмкость, %", "Capacity, %"), kind: "number", format: "percent" },
      { key: "planned", label: t("Запланировано, %", "Planned, %"), kind: "number", format: "percent" },
      { key: "inScope", label: t("В проектах страницы, %", "In the page's projects, %"), kind: "number", format: "percent" },
      { key: "free", label: t("Свободно, %", "Free, %"), kind: "number", format: "percent" },
      { key: "overloaded", label: t("Перегружен", "Overloaded"), kind: "boolean", groupable: true },
      { key: "onLeave", label: t("В отпуске сегодня", "On leave today"), kind: "boolean", groupable: true },
      { key: "projects", label: t("Проекты", "Projects"), kind: "list", groupable: true },
    ],
  },
  checkins: {
    key: "checkins",
    label: t("Отметки недели", "Weekly check-ins"),
    rowLabel: t("отметка человека о своей работе за неделю", "a person's weekly word on their work"),
    titleField: "title",
    periodFields: ["weekStart"],
    defaultColumns: ["project", "person", "title", "confidence", "blocker"],
    fields: [
      ...project,
      { key: "title", label: t("Работа", "Work"), kind: "text" },
      { key: "person", label: t("Человек", "Person"), kind: "text", groupable: true },
      { key: "confidence", label: t("Уверенность", "Confidence"), kind: "enum", values: confidenceValues, groupable: true },
      { key: "done", label: t("Что сделано", "Done"), kind: "text" },
      { key: "blocker", label: t("Что мешает", "In the way"), kind: "text" },
      { key: "hasBlocker", label: t("Есть препятствие", "Has a blocker"), kind: "boolean", groupable: true },
      { key: "weekStart", label: t("Неделя", "Week"), kind: "date", format: "date", groupable: true },
    ],
  },
  jira: {
    key: "jira",
    label: t("Задачи Jira", "Jira issues"),
    rowLabel: t("задача Jira из снимков проекта (отменённые не считаются)", "a Jira issue from the project's snapshots (cancelled ones do not count)"),
    titleField: "summary",
    periodFields: ["createdAt", "resolvedAt"],
    defaultColumns: ["project", "issueKey", "summary", "status", "assignee", "priority"],
    fields: [
      ...project,
      { key: "issueKey", label: t("Ключ", "Key"), kind: "text", format: "code" },
      { key: "summary", label: t("Задача", "Issue"), kind: "text" },
      { key: "status", label: t("Статус", "Status"), kind: "text", groupable: true },
      { key: "statusCategory", label: t("Категория статуса", "Status category"), kind: "enum", values: jiraCategoryValues, groupable: true, emptyLabel: t("Без категории", "No category") },
      { key: "issueType", label: t("Тип", "Type"), kind: "text", groupable: true },
      { key: "priority", label: t("Приоритет", "Priority"), kind: "text", groupable: true },
      { key: "assignee", label: t("Исполнитель", "Assignee"), kind: "text", groupable: true, emptyLabel: t("Не назначен", "Unassigned") },
      { key: "sprint", label: t("Спринт", "Sprint"), kind: "text", groupable: true, emptyLabel: t("Без спринта", "No sprint") },
      { key: "labels", label: t("Лейблы", "Labels"), kind: "list", groupable: true },
      { key: "components", label: t("Компоненты", "Components"), kind: "list", groupable: true, emptyLabel: t("Без компонента", "No component") },
      { key: "epic", label: t("Эпик", "Epic"), kind: "text", groupable: true, emptyLabel: t("Без эпика", "No epic") },
      { key: "open", label: t("Открыта", "Open"), kind: "boolean", groupable: true },
      { key: "critical", label: t("Critical или Blocker", "Critical or Blocker"), kind: "boolean", groupable: true },
      { key: "overdue", label: t("Просрочена", "Overdue"), kind: "boolean", groupable: true },
      { key: "storyPoints", label: t("Story points", "Story points"), kind: "number" },
      { key: "ageDays", label: t("Возраст, дн.", "Age, days"), kind: "number", format: "days" },
      { key: "dueDate", label: t("Срок", "Due"), kind: "date", format: "date", groupable: true },
      { key: "createdAt", label: t("Создана", "Created"), kind: "date", format: "date", groupable: true },
      { key: "resolvedAt", label: t("Решена", "Resolved"), kind: "date", format: "date", groupable: true },
    ],
  },
};

export function pageField(source: PageSourceKey, key: string) {
  return PAGE_SOURCES[source].fields.find((field) => field.key === key) ?? null;
}

/** The name of a value: an enum's known name, else the value itself. */
export function pageValueLabel(field: PageFieldDef | null, value: string, locale: "ru" | "en") {
  return field?.values?.[value]?.[locale] ?? value;
}
