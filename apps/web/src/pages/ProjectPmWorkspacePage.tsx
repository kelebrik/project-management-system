import { useMemo, useState } from "react";
import { signedDaysUntil } from "../app/dateUtils";
import type { Issue, RaidItem, WbsItem } from "../app/domainTypes";
import { wbsToForm, type WbsFormState } from "../app/formState";
import { createWorkSummaryData } from "../app/workSummaryModel";
import { usePageContext } from "./PageContext";
import { SegmentedFilter } from "../components/SegmentedFilter";

const DAY_MS = 86_400_000;
type TaskFilter = "all" | "week" | "owner" | "critical" | "overdue";

function openIssue(issue: Issue) {
  return issue.status !== "Closed" && issue.status !== "Resolved";
}

function activeRaid(item: RaidItem) {
  return item.status !== "CLOSED" && item.status !== "VALIDATED";
}

function parseDate(value: string | null | undefined) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function addDays(value: Date, days: number) {
  return new Date(value.getTime() + days * DAY_MS);
}

function uniqueWbsItems(items: WbsItem[]) {
  const seen = new Set<string>();
  const result: WbsItem[] = [];
  for (const item of items) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    result.push(item);
  }
  return result;
}

function wbsTone(item: WbsItem) {
  if (item.status === "BLOCKED" || item.status === "AT_RISK") return "red";
  if (item.status === "DONE") return "green";
  if (signedDaysUntil(item.dueDate) !== null && (signedDaysUntil(item.dueDate) ?? 0) < 0) {
    return "red";
  }
  if (item.status === "NOT_STARTED") return "neutral";
  return "blue";
}

function ganttPosition(item: WbsItem, rangeStart: Date, rangeEnd: Date) {
  const start =
    parseDate(item.forecastStartDate) ??
    parseDate(item.startDate) ??
    addDays(parseDate(item.forecastDueDate ?? item.dueDate) ?? rangeStart, -10);
  const end =
    parseDate(item.forecastDueDate) ??
    parseDate(item.dueDate) ??
    addDays(start, 10);
  const total = Math.max(1, rangeEnd.getTime() - rangeStart.getTime());
  const rawLeft = ((start.getTime() - rangeStart.getTime()) / total) * 100;
  const rawRight = ((end.getTime() - rangeStart.getTime()) / total) * 100;
  const left = Math.max(0, Math.min(96, rawLeft));
  const right = Math.max(left + 4, Math.min(100, rawRight));
  return {
    left,
    width: Math.max(4, right - left),
  };
}

function taskDraft(item: WbsItem, drafts: Record<string, WbsFormState>) {
  return drafts[item.id] ?? wbsToForm(item);
}

export function ProjectPmWorkspacePage() {
  const ctx = usePageContext();
  const {
    date,
    overviewDashboard,
    openRaidItemFromOverview,
    project,
    raidStatusLabel,
    raidTypeLabel,
    setActiveWbsItemId,
    wbsDrafts,
    wbsStatusLabel,
  } = ctx;
  const draftMap = useMemo(
    () => (wbsDrafts ?? {}) as Record<string, WbsFormState>,
    [wbsDrafts],
  );
  const [taskFilter, setTaskFilter] = useState<TaskFilter>("week");
  const workSummary = useMemo(
    () => createWorkSummaryData(project.wbsItems as WbsItem[], draftMap),
    [draftMap, project.wbsItems],
  );
  const openDecisions = (project.issues as Issue[])
    .filter((issue) => openIssue(issue) && issue.decisionRequired)
    .sort(
      (left, right) =>
        (signedDaysUntil(left.dueDate) ?? Number.POSITIVE_INFINITY) -
        (signedDaysUntil(right.dueDate) ?? Number.POSITIVE_INFINITY),
    );
  const redRaid = (overviewDashboard.redZoneRisks as RaidItem[]).filter(activeRaid);
  const delayedTasks = overviewDashboard.scheduleDelayItems.map(
    ({ item }: { item: WbsItem }) => item,
  );
  const workspaceTaskSource = uniqueWbsItems([
    ...delayedTasks,
    ...(overviewDashboard.overdueItems as WbsItem[]),
    ...workSummary.currentTasks,
    ...workSummary.tasksStartingNextWeek,
  ]);
  const criticalIds = new Set(project.criticalPath?.criticalItemIds ?? []);
  const workspaceTasks = workspaceTaskSource
    .filter((item) => {
      const days = signedDaysUntil(item.dueDate);
      if (taskFilter === "owner") return item.owner === project.projectManager;
      if (taskFilter === "critical") return criticalIds.has(item.id);
      if (taskFilter === "overdue") return days !== null && days < 0;
      if (taskFilter === "week") return days !== null && days >= -7 && days <= 7;
      return true;
    })
    .slice(0, 7);
  const selectedRaid = redRaid[0] ?? (project.raidItems as RaidItem[]).find(activeRaid) ?? null;
  const selectedIssue = openDecisions[0] ?? null;
  const rangeStart = addDays(new Date(), -14);
  const rangeEnd = addDays(new Date(), 90);

  const focusTask = (item: WbsItem) => {
    setActiveWbsItemId(item.id);
  };

  return (
    <section className="v2-page pm-workspace-page">
      <div className="v2-compact-header pm-workspace-header">
        <div>
          <h2>Рабочий стол PM</h2>
          <span>{project.name}</span>
        </div>
        <div className="v2-compact-actions">
          <button type="button" onClick={() => selectedRaid && openRaidItemFromOverview(selectedRaid.id, selectedRaid.type)}>
            Открыть главный риск
          </button>
        </div>
      </div>

      <div className="v2-attention-strip pm-health-strip v2-summary-line">
        <div className="v2-attention-chip blue">
          <strong>{project.progress}%</strong>
          <span>прогресс</span>
        </div>
        <div className="v2-attention-chip green">
          <strong>{overviewDashboard.scheduleVarianceFromStructure <= 0 ? "OK" : `+${overviewDashboard.scheduleVarianceFromStructure}`}</strong>
          <span>сроки</span>
        </div>
        <div className="v2-attention-chip amber">
          <strong>{openDecisions.length}</strong>
          <span>решений</span>
        </div>
        <div className="v2-attention-chip red">
          <strong>{redRaid.length}</strong>
          <span>RAID красной зоны</span>
        </div>
      </div>

      <div className="pm-priority-line">
        {delayedTasks[0] && (
          <button type="button" className="pm-priority-item red" onClick={() => focusTask(delayedTasks[0])}>
            <span>Просрочено</span><b>{delayedTasks[0].title}</b><small>{date(delayedTasks[0].dueDate)}</small>
          </button>
        )}
        {selectedIssue && (
          <button type="button" className="pm-priority-item amber">
            <span>Нужно решение</span><b>{selectedIssue.title}</b><small>{date(selectedIssue.dueDate)}</small>
          </button>
        )}
        {selectedRaid && (
          <button type="button" className="pm-priority-item red" onClick={() => openRaidItemFromOverview(selectedRaid.id, selectedRaid.type)}>
            <span>{raidTypeLabel(selectedRaid.type)} · {selectedRaid.riskScore}</span><b>{selectedRaid.title}</b><small>{raidStatusLabel(selectedRaid.status)}</small>
          </button>
        )}
      </div>

      <div className="pm-workspace-grid">
        <article className="v2-card pm-wbs-card">
          <div className="v2-card-title">
            <div>
              <h3>WBS spreadsheet</h3>
            </div>
          </div>
          <div className="pm-toolbar">
            <SegmentedFilter<TaskFilter>
              ariaLabel="Фильтр задач рабочего стола"
              value={taskFilter}
              onChange={setTaskFilter}
              options={[
                { value: "all", label: "Все" },
                { value: "week", label: "Неделя" },
                { value: "critical", label: "Критический" },
                { value: "overdue", label: "Просрочено" },
              ]}
            />
          </div>
          <div className="pm-wbs-table">
            <div className="pm-wbs-head">
              <span>Код</span>
              <span>Наименование</span>
              <span>Статус</span>
              <span>Срок</span>
              <span>Owner</span>
            </div>
            {workspaceTasks.map((item) => {
              const draft = taskDraft(item, draftMap);
              return (
                <button
                  type="button"
                  className={`pm-wbs-row ${wbsTone(item)}`}
                  key={item.id}
                  onClick={() => focusTask(item)}
                >
                  <span className="pm-wbs-code">{item.code}</span>
                  <b>{draft.title}</b>
                  <span>{wbsStatusLabel(draft.status)}</span>
                  <span>{date(draft.dueDate)}</span>
                  <span>{draft.owner || "не задан"}</span>
                </button>
              );
            })}
            {workspaceTasks.length === 0 && (
              <div className="v2-empty">Активных задач для рабочего стола нет.</div>
            )}
          </div>
        </article>

        <article className="v2-card pm-gantt-card">
          <div className="v2-card-title">
            <div>
              <h3>Gantt focused range</h3>
            </div>
          </div>
          <div className="pm-gantt">
            <div className="pm-gantt-labels">
              <span>Структура</span>
              {workspaceTasks.slice(0, 5).map((item) => (
                <button type="button" key={item.id} onClick={() => focusTask(item)}>
                  {item.code} {item.title}
                </button>
              ))}
            </div>
            <div className="pm-gantt-canvas">
              <div className="pm-gantt-months">
                <span>июль</span>
                <span>август</span>
                <span>сентябрь</span>
              </div>
              <span className="pm-gantt-today" />
              {workspaceTasks.slice(0, 5).map((item) => {
                const position = ganttPosition(item, rangeStart, rangeEnd);
                return (
                  <button
                    type="button"
                    className={`pm-gantt-bar ${wbsTone(item)}`}
                    key={item.id}
                    style={{
                      left: `${position.left}%`,
                      width: `${position.width}%`,
                    }}
                    onClick={() => focusTask(item)}
                    title={`${item.code} ${item.title}`}
                  />
                );
              })}
            </div>
          </div>
        </article>
      </div>
    </section>
  );
}
