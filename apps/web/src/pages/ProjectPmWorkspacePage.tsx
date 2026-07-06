import { useMemo } from "react";
import { signedDaysUntil } from "../app/dateUtils";
import type { Issue, RaidItem, WbsItem } from "../app/domainTypes";
import { wbsToForm, type WbsFormState } from "../app/formState";
import { createWorkSummaryData } from "../app/workSummaryModel";
import { usePageContext } from "./PageContext";

const DAY_MS = 86_400_000;

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
  const workspaceTasks = uniqueWbsItems([
    ...delayedTasks,
    ...(overviewDashboard.overdueItems as WbsItem[]),
    ...workSummary.currentTasks,
    ...workSummary.tasksStartingNextWeek,
  ]).slice(0, 7);
  const selectedRaid = redRaid[0] ?? (project.raidItems as RaidItem[]).find(activeRaid) ?? null;
  const selectedIssue = openDecisions[0] ?? null;
  const rangeStart = addDays(new Date(), -14);
  const rangeEnd = addDays(new Date(), 90);

  const focusTask = (item: WbsItem) => {
    setActiveWbsItemId(item.id);
  };

  return (
    <section className="v2-page pm-workspace-page">
      <div className="v2-hero pm-workspace-hero">
        <div>
          <span className="v2-eyebrow">Project workspace</span>
          <h2>Рабочий стол PM</h2>
          <p>Единый экран для WBS, ближайших задач, критических рисков и решений.</p>
        </div>
        <div className="pm-workspace-actions">
          <button type="button" onClick={() => selectedRaid && openRaidItemFromOverview(selectedRaid.id, selectedRaid.type)}>
            Открыть главный риск
          </button>
        </div>
      </div>

      <div className="v2-attention-strip pm-health-strip">
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
        <div className="v2-next-focus">
          <span>Ближайшая цель</span>
          <b>{date(project.targetDate)} · {project.projectManager}</b>
        </div>
      </div>

      <div className="pm-workspace-grid">
        <aside className="v2-card pm-work-queue">
          <div className="v2-card-title">
            <div>
              <h3>Work queue</h3>
              <p>Сегодня и ближайшая неделя</p>
            </div>
          </div>
          <div className="pm-queue-list">
            {delayedTasks[0] && (
              <button type="button" className="pm-queue-card red" onClick={() => focusTask(delayedTasks[0])}>
                <span>Просрочено</span>
                <b>{delayedTasks[0].title}</b>
                <small>{delayedTasks[0].owner || "исполнитель не задан"} · {date(delayedTasks[0].dueDate)}</small>
              </button>
            )}
            {selectedIssue && (
              <button type="button" className="pm-queue-card amber">
                <span>Решение</span>
                <b>{selectedIssue.title}</b>
                <small>{selectedIssue.owner || "ответственный не задан"} · {date(selectedIssue.dueDate)}</small>
              </button>
            )}
            {workSummary.tasksStartingNextWeek[0] && (
              <button
                type="button"
                className="pm-queue-card blue"
                onClick={() => focusTask(workSummary.tasksStartingNextWeek[0])}
              >
                <span>Старт на неделе</span>
                <b>{workSummary.tasksStartingNextWeek[0].title}</b>
                <small>{date(workSummary.tasksStartingNextWeek[0].startDate)} · {workSummary.tasksStartingNextWeek[0].owner}</small>
              </button>
            )}
          </div>
          <div className="pm-filter-set">
            <span>Фильтры</span>
            <button type="button" className="active">Неделя</button>
            <button type="button">Owner</button>
            <button type="button">Критический</button>
            <button type="button">Просрочено</button>
          </div>
        </aside>

        <article className="v2-card pm-wbs-card">
          <div className="v2-card-title">
            <div>
              <h3>WBS spreadsheet</h3>
              <p>Sticky код/название, активные фазы раскрыты по умолчанию</p>
            </div>
          </div>
          <div className="pm-toolbar">
            <button type="button" className="active">Сейчас</button>
            <button type="button">Неделя</button>
            <button type="button">Критический</button>
            <button type="button">Колонки</button>
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

        <aside className="v2-card pm-selected-card">
          <div className="v2-card-title">
            <div>
              <h3>Selected item</h3>
              <p>Drawer вместо постоянной формы</p>
            </div>
          </div>
          {selectedRaid ? (
            <>
              <button
                type="button"
                className="pm-selected-alert"
                onClick={() => openRaidItemFromOverview(selectedRaid.id, selectedRaid.type)}
              >
                <span>{raidTypeLabel(selectedRaid.type)} · риск {selectedRaid.riskScore}</span>
                <b>{selectedRaid.title}</b>
                <small>
                  {raidStatusLabel(selectedRaid.status)} · {date(selectedRaid.dueDate)}
                </small>
              </button>
              <div className="pm-selected-plan">
                <span>План действий</span>
                <p>{selectedRaid.mitigationPlan || selectedRaid.contingencyPlan || "План действий пока не заполнен."}</p>
              </div>
              <div className="pm-selected-links">
                <span>Связи</span>
                <b>{selectedIssue ? selectedIssue.title : "Связанные вопросы не выбраны"}</b>
              </div>
            </>
          ) : (
            <div className="v2-empty">Нет выбранного риска.</div>
          )}
        </aside>

        <article className="v2-card pm-gantt-card">
          <div className="v2-card-title">
            <div>
              <h3>Gantt focused range</h3>
              <p>90 дней, активные задачи и критический путь поверх графика</p>
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
