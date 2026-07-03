import { ChevronDown, ChevronRight } from "lucide-react";
import { useMemo, useState } from "react";

import { usePageContext } from "./PageContext";
import type { WbsItem, WbsItemStatus } from "../app/domainTypes";
import { wbsToForm, type WbsFormState } from "../app/formState";
import {
  compareWorkTasks,
  createWorkSummaryData,
} from "../app/workSummaryModel";

const ALL_PHASES_FILTER = "__all_phases__";
const WBS_STATUS_OPTIONS: WbsItemStatus[] = [
  "NOT_STARTED",
  "IN_PROGRESS",
  "IN_REVIEW",
  "AT_RISK",
  "BLOCKED",
  "DONE",
  "CANCELLED",
];

function taskDraft(item: WbsItem, wbsDrafts: Record<string, WbsFormState>) {
  return wbsDrafts[item.id] ?? wbsToForm(item);
}

function phaseIdForItem(item: WbsItem, itemById: Map<string, WbsItem>) {
  let current: WbsItem | undefined = item;
  while (current) {
    if (current.type === "PHASE") return current.id;
    current = current.parentId ? itemById.get(current.parentId) : undefined;
  }
  return null;
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
  const [currentTasksPhaseId, setCurrentTasksPhaseId] =
    useState(ALL_PHASES_FILTER);
  const projectWbsItems = project.wbsItems as WbsItem[];
  const { currentTasks, nextWeek, tasksStartingNextWeek } = createWorkSummaryData(
    projectWbsItems,
    wbsDrafts,
  );
  const phaseOptions = useMemo(
    () =>
      projectWbsItems
        .filter((item) => item.type === "PHASE")
        .sort(compareWorkTasks),
    [projectWbsItems],
  );
  const taskPhaseById = useMemo(() => {
    const itemById = new Map(projectWbsItems.map((item) => [item.id, item]));
    return new Map(
      projectWbsItems
        .filter((item) => item.type === "TASK")
        .map((item) => [item.id, phaseIdForItem(item, itemById)]),
    );
  }, [projectWbsItems]);
  const filteredCurrentTasks =
    currentTasksPhaseId === ALL_PHASES_FILTER
      ? currentTasks
      : currentTasks.filter(
          (item) => taskPhaseById.get(item.id) === currentTasksPhaseId,
        );

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
            <div className="work-summary-pane-title-main">
              <h3>
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
                  Текущие задачи
                </button>
              </h3>
              <select
                className="work-summary-phase-filter"
                value={currentTasksPhaseId}
                onChange={(event) => setCurrentTasksPhaseId(event.target.value)}
                aria-label="Фильтр текущих задач по фазе"
              >
                <option value={ALL_PHASES_FILTER}>Все фазы</option>
                {phaseOptions.map((phase) => (
                  <option key={phase.id} value={phase.id}>
                    {phase.code} {phase.title}
                  </option>
                ))}
              </select>
            </div>
            <span>{filteredCurrentTasks.length}</span>
          </div>
          {!collapsedPanes.current &&
            renderWorkSummaryRows({
              emptyText: "Текущих задач нет.",
              items: filteredCurrentTasks,
              showStart: false,
            })}
        </article>
        <article
          className={`work-summary-pane ${
            collapsedPanes.nextWeek ? "collapsed" : ""
          }`}
        >
          <div className="work-summary-pane-title">
            <h3>
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
                Старт на следующей неделе
              </button>
            </h3>
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
