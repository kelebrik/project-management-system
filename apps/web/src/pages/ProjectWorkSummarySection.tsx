import { ChevronDown, ChevronRight } from "lucide-react";
import { useState } from "react";

import { usePageContext } from "./PageContext";
import type { WbsItem, WbsItemStatus } from "../app/domainTypes";
import { wbsToForm, type WbsFormState } from "../app/formState";

const DAY_MS = 86_400_000;
const WBS_STATUS_OPTIONS: WbsItemStatus[] = [
  "NOT_STARTED",
  "IN_PROGRESS",
  "IN_REVIEW",
  "AT_RISK",
  "BLOCKED",
  "DONE",
  "CANCELLED",
];

function startOfLocalDay(value: Date) {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate());
}

function parseLocalDate(value: string | null) {
  if (!value) return null;
  const dateOnlyMatch = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (dateOnlyMatch) {
    const [, year, month, day] = dateOnlyMatch;
    return new Date(Number(year), Number(month) - 1, Number(day));
  }
  const parsedDate = new Date(value);
  return Number.isNaN(parsedDate.getTime()) ? null : parsedDate;
}

function weekRange(offsetWeeks: number, today = new Date()) {
  const currentDay = startOfLocalDay(today);
  const mondayBasedDay = (currentDay.getDay() + 6) % 7;
  const start = new Date(
    currentDay.getTime() + (offsetWeeks * 7 - mondayBasedDay) * DAY_MS,
  );
  const endExclusive = new Date(start.getTime() + 7 * DAY_MS);
  const endInclusive = new Date(endExclusive.getTime() - DAY_MS);
  return { start, endExclusive, endInclusive };
}

function dateInRange(value: string | null, start: Date, endExclusive: Date) {
  const parsedDate = parseLocalDate(value);
  if (!parsedDate) return false;
  const date = startOfLocalDay(parsedDate);
  return date >= start && date < endExclusive;
}

function workTaskDateTime(value: string | null) {
  return parseLocalDate(value)?.getTime() ?? Number.POSITIVE_INFINITY;
}

function taskDraft(item: WbsItem, wbsDrafts: Record<string, WbsFormState>) {
  return wbsDrafts[item.id] ?? wbsToForm(item);
}

function compareWorkTasks(
  left: WbsItem,
  right: WbsItem,
  wbsDrafts: Record<string, WbsFormState>,
) {
  const leftDraft = taskDraft(left, wbsDrafts);
  const rightDraft = taskDraft(right, wbsDrafts);
  return (
    workTaskDateTime(leftDraft.startDate) - workTaskDateTime(rightDraft.startDate) ||
    workTaskDateTime(leftDraft.dueDate) - workTaskDateTime(rightDraft.dueDate) ||
    left.sortOrder - right.sortOrder ||
    left.code.localeCompare(right.code, "ru")
  );
}

type WorkSummaryRowsProps = {
  emptyText: string;
  items: WbsItem[];
  showStart: boolean;
};

type WorkSummaryPaneKey = "current" | "nextWeek";

export function ProjectWorkSummarySection() {
  const {
    date,
    project,
    saveWbsDraftPatch,
    saveWbsItem,
    setActiveWbsItemId,
    updateWbsDraft,
    wbsDrafts,
    wbsStatusLabel,
  } = usePageContext();
  const [collapsedPanes, setCollapsedPanes] = useState<
    Record<WorkSummaryPaneKey, boolean>
  >({
    current: false,
    nextWeek: false,
  });
  const currentWeek = weekRange(0);
  const nextWeek = weekRange(1);
  const allTasks = (project.wbsItems as WbsItem[])
    .filter((item) => item.type === "TASK")
    .sort((left, right) => compareWorkTasks(left, right, wbsDrafts));
  const currentTasks = allTasks.filter((item) => {
    const draft = taskDraft(item, wbsDrafts);
    return (
      draft.status === "IN_PROGRESS" ||
      draft.status === "IN_REVIEW" ||
      (draft.status === "NOT_STARTED" &&
        dateInRange(
          draft.startDate,
          currentWeek.start,
          currentWeek.endExclusive,
        ))
    );
  });
  const tasksStartingNextWeek = allTasks.filter((item) => {
    const draft = taskDraft(item, wbsDrafts);
    return (
      draft.status !== "DONE" &&
      draft.status !== "CANCELLED" &&
      dateInRange(draft.startDate, nextWeek.start, nextWeek.endExclusive)
    );
  });

  const saveTaskTitle = (itemId: string) => {
    void saveWbsItem(itemId, { silent: true });
  };
  const saveTaskStatus = (itemId: string, status: WbsItemStatus) => {
    saveWbsDraftPatch(itemId, { status }, { silent: true });
  };
  const saveTaskStart = (itemId: string, startDate: string) => {
    saveWbsDraftPatch(
      itemId,
      {
        startDate,
        forecastStartDate: startDate,
        excelStartDate: startDate,
      },
      { silent: true, scheduleDriver: "dates" },
    );
  };
  const saveTaskDue = (itemId: string, dueDate: string) => {
    saveWbsDraftPatch(
      itemId,
      {
        dueDate,
        forecastDueDate: dueDate,
        excelEndDate: dueDate,
      },
      { silent: true, scheduleDriver: "dates" },
    );
  };
  const togglePane = (pane: WorkSummaryPaneKey) => {
    setCollapsedPanes((current) => ({
      ...current,
      [pane]: !current[pane],
    }));
  };

  const renderWorkSummaryRows = ({
    emptyText,
    items,
    showStart,
  }: WorkSummaryRowsProps) => {
    if (items.length === 0) {
      return <div className="work-summary-empty">{emptyText}</div>;
    }
    return (
      <div className="work-summary-table">
        <div
          className={`work-summary-head ${
            showStart ? "with-start" : "without-start"
          }`}
        >
          <span>Код</span>
          <span>Наименование</span>
          <span>Статус</span>
          {showStart && <span>Старт</span>}
          <span>Срок</span>
        </div>
        {items.map((item) => {
          const draft = taskDraft(item, wbsDrafts);
          return (
            <div
              className={`work-summary-row ${
                showStart ? "with-start" : "without-start"
              }`}
              key={item.id}
              onFocus={() => setActiveWbsItemId(item.id)}
            >
              <button
                type="button"
                className="work-summary-code"
                onClick={() => setActiveWbsItemId(item.id)}
                title="Выделить задачу в Структуре"
              >
                {item.code}
              </button>
              <input
                value={draft.title}
                onChange={(event) =>
                  updateWbsDraft(item.id, { title: event.target.value })
                }
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.currentTarget.blur();
                  }
                }}
                onBlur={() => saveTaskTitle(item.id)}
              />
              <select
                value={draft.status}
                onChange={(event) =>
                  saveTaskStatus(item.id, event.target.value as WbsItemStatus)
                }
              >
                {WBS_STATUS_OPTIONS.map((status) => (
                  <option key={status} value={status}>
                    {wbsStatusLabel(status)}
                  </option>
                ))}
              </select>
              {showStart && (
                <input
                  type="date"
                  value={draft.startDate}
                  onChange={(event) =>
                    saveTaskStart(item.id, event.target.value)
                  }
                />
              )}
              <input
                type="date"
                value={draft.dueDate}
                onChange={(event) => saveTaskDue(item.id, event.target.value)}
              />
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <section className="panel project-card work-summary-section">
      <div className="panel-title">
        <div>
          <h2>Сводка по работам</h2>
          <p>Текущие задачи и задачи со стартом на следующей неделе</p>
        </div>
      </div>
      <div className="work-summary-grid">
        <article
          className={`work-summary-pane ${
            collapsedPanes.current ? "collapsed" : ""
          }`}
        >
          <div className="work-summary-pane-title">
            <button
              type="button"
              className="work-summary-pane-toggle"
              onClick={() => togglePane("current")}
              aria-expanded={!collapsedPanes.current}
              aria-label={
                collapsedPanes.current
                  ? "Развернуть текущие задачи"
                  : "Свернуть текущие задачи"
              }
            >
              {collapsedPanes.current ? (
                <ChevronRight size={17} />
              ) : (
                <ChevronDown size={17} />
              )}
              <h3>Текущие задачи</h3>
            </button>
            <span>{currentTasks.length}</span>
          </div>
          {!collapsedPanes.current &&
            renderWorkSummaryRows({
              emptyText: "Текущих задач нет.",
              items: currentTasks,
              showStart: false,
            })}
        </article>
        <article
          className={`work-summary-pane ${
            collapsedPanes.nextWeek ? "collapsed" : ""
          }`}
        >
          <div className="work-summary-pane-title">
            <button
              type="button"
              className="work-summary-pane-toggle"
              onClick={() => togglePane("nextWeek")}
              aria-expanded={!collapsedPanes.nextWeek}
              aria-label={
                collapsedPanes.nextWeek
                  ? "Развернуть задачи на следующей неделе"
                  : "Свернуть задачи на следующей неделе"
              }
            >
              {collapsedPanes.nextWeek ? (
                <ChevronRight size={17} />
              ) : (
                <ChevronDown size={17} />
              )}
              <h3>Старт на следующей неделе</h3>
            </button>
            <span>
              {date(nextWeek.start)} - {date(nextWeek.endInclusive)}
            </span>
          </div>
          {!collapsedPanes.nextWeek &&
            renderWorkSummaryRows({
              emptyText: "Задач со стартом на следующей неделе нет.",
              items: tasksStartingNextWeek,
              showStart: true,
            })}
        </article>
      </div>
    </section>
  );
}
