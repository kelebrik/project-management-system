import { useEffect, useMemo } from "react";
import { usePageContext } from "./PageContext";
import {
  date as formatDate,
  signedDaysBetween,
  startOfDay,
} from "../app/dateUtils";
import type { WbsItem } from "../app/domainTypes";

const GOAL_RANGE_PADDING_DAYS = 14;
const DAY_MS = 86_400_000;

type ProjectGoalTimelineItem = {
  id: string;
  goalTitle: string;
  status: WbsItem["status"];
  dueDate: string;
  baselineDueDate: string | null;
  delayDays: number | null;
  offset: number;
};

type ProjectGoalTimelineModel = {
  items: ProjectGoalTimelineItem[];
  startDate: Date;
  endDate: Date;
  todayOffset: number;
  monthTicks: Array<{
    key: string;
    label: string;
    offset: number;
  }>;
};

function currentHashId() {
  if (typeof window === "undefined") return "";
  try {
    return decodeURIComponent(window.location.hash.replace(/^#/, ""));
  } catch {
    return window.location.hash.replace(/^#/, "");
  }
}

function scrollToHashSection(sectionId: string) {
  if (typeof window === "undefined") return;
  window.requestAnimationFrame(() => {
    document.getElementById(sectionId)?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  });
}

function parseGoalDate(value: string | null | undefined) {
  if (!value) return null;
  const dateOnlyMatch = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const parsed = dateOnlyMatch
    ? new Date(
        Number(dateOnlyMatch[1]),
        Number(dateOnlyMatch[2]) - 1,
        Number(dateOnlyMatch[3]),
      )
    : new Date(value);
  const day = startOfDay(parsed);
  return Number.isNaN(day.getTime()) ? null : day;
}

function monthTickLabel(value: Date) {
  return new Intl.DateTimeFormat("ru-RU", {
    month: "short",
    year: "2-digit",
  }).format(value);
}

function createProjectGoalTimeline(
  items: WbsItem[],
  today = new Date(),
): ProjectGoalTimelineModel | null {
  const rawItems = items
    .filter((item) => item.type === "GOAL" && item.status !== "CANCELLED")
    .map((item) => {
      const dueDateSource = item.dueDate ?? item.forecastDueDate;
      const dueDate = parseGoalDate(dueDateSource);
      if (!dueDate || !dueDateSource) return null;
      const baselineDueDate = parseGoalDate(item.baselineDueDate);
      return {
        id: item.id,
        goalTitle: item.title,
        status: item.status,
        dueDate,
        dueDateSource,
        baselineDueDate: item.baselineDueDate,
        baselineDueDateValue: baselineDueDate,
      };
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item))
    .sort(
      (left, right) =>
        left.dueDate.getTime() - right.dueDate.getTime() ||
        left.goalTitle.localeCompare(right.goalTitle, "ru"),
    );

  if (rawItems.length === 0) return null;

  const firstGoalDate = rawItems[0].dueDate;
  const lastGoalDate = rawItems[rawItems.length - 1].dueDate;
  const startDate = new Date(
    firstGoalDate.getTime() - GOAL_RANGE_PADDING_DAYS * DAY_MS,
  );
  const endDate = new Date(
    lastGoalDate.getTime() + GOAL_RANGE_PADDING_DAYS * DAY_MS,
  );
  const totalMs = Math.max(1, endDate.getTime() - startDate.getTime());
  const offsetForDate = (value: Date) =>
    Math.min(
      100,
      Math.max(
        0,
        ((value.getTime() - startDate.getTime()) / totalMs) * 100,
      ),
    );
  const monthTicks: ProjectGoalTimelineModel["monthTicks"] = [];
  for (
    let cursor = new Date(startDate.getFullYear(), startDate.getMonth(), 1);
    cursor <= endDate;
    cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1)
  ) {
    monthTicks.push({
      key: `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}`,
      label: monthTickLabel(cursor),
      offset: offsetForDate(cursor),
    });
  }

  return {
    startDate,
    endDate,
    todayOffset: offsetForDate(startOfDay(today)),
    monthTicks,
    items: rawItems.map((item) => ({
      id: item.id,
      goalTitle: item.goalTitle,
      status: item.status,
      dueDate: item.dueDateSource,
      baselineDueDate: item.baselineDueDate,
      delayDays: item.baselineDueDateValue
        ? signedDaysBetween(item.baselineDueDateValue, item.dueDate)
        : null,
      offset: offsetForDate(item.dueDate),
    })),
  };
}

export function ProjectOverviewMilestonesPage() {
  const ctx = usePageContext();
  const {
    activeMilestoneLabelDrag,
    fullscreenWorkspaceView,
    milestoneLabelOffsets,
    milestoneTimeline,
    MilestoneTimelineSection,
    openView,
    printSectionAsPdf,
    project,
    setActiveWbsItemId,
    startMilestoneLabelDrag,
    toggleWorkspaceFullscreen,
  } = ctx;
  const projectGoalTimeline = useMemo(
    () => createProjectGoalTimeline(project.wbsItems as WbsItem[]),
    [project.wbsItems],
  );

  useEffect(() => {
    const syncHashSection = () => {
      const hashId = currentHashId();
      if (hashId === "milestones-by-phase") {
        scrollToHashSection(hashId);
      }
    };

    syncHashSection();
    window.addEventListener("hashchange", syncHashSection);
    return () => window.removeEventListener("hashchange", syncHashSection);
  }, []);

  return (
    <>
      <article className="panel project-card portfolio-goal-timeline-panel">
        <div className="panel-title">
          <div>
            <h2>Цели проекта</h2>
          </div>
        </div>
        {projectGoalTimeline ? (
          <div className="portfolio-goal-timeline">
            <div className="portfolio-goal-axis" aria-hidden="true">
              <span className="portfolio-goal-axis-line" />
              <span
                className="portfolio-goal-today"
                style={{ left: `${projectGoalTimeline.todayOffset}%` }}
              >
                сегодня
              </span>
              {projectGoalTimeline.monthTicks.map((tick) => (
                <span
                  className="portfolio-goal-month-tick"
                  key={tick.key}
                  style={{ left: `${tick.offset}%` }}
                >
                  {tick.label}
                </span>
              ))}
              {projectGoalTimeline.items.map((item, index) => (
                <span
                  className={`portfolio-goal-dot status-${item.status.toLowerCase()}`}
                  key={item.id}
                  style={{ left: `${item.offset}%` }}
                >
                  {index + 1}
                </span>
              ))}
            </div>
            <div className="portfolio-goal-items">
              {projectGoalTimeline.items.map((item, index) => (
                <button
                  type="button"
                  className={`portfolio-goal-item status-${item.status.toLowerCase()}`}
                  key={item.id}
                  onClick={() => {
                    setActiveWbsItemId(item.id);
                    openView("project-structure");
                  }}
                >
                  <span className="portfolio-goal-item-index">{index + 1}</span>
                  <span>
                    <b>{item.goalTitle}</b>
                    <small className="portfolio-goal-meta">
                      {item.baselineDueDate && (
                        <span>
                          базовый план {formatDate(item.baselineDueDate)}
                        </span>
                      )}
                      <span>прогноз {formatDate(item.dueDate)}</span>
                      {item.delayDays !== null && item.delayDays > 0 && (
                        <span className="portfolio-goal-delay">
                          отставание +{item.delayDays} дн.
                        </span>
                      )}
                    </small>
                  </span>
                </button>
              ))}
            </div>
            <div className="portfolio-goal-range">
              <span>{formatDate(projectGoalTimeline.startDate)}</span>
              <span>{formatDate(projectGoalTimeline.endDate)}</span>
            </div>
          </div>
        ) : (
          <div className="empty-state compact">Целей на шкале нет.</div>
        )}
      </article>

      <article
        className={`panel project-card workspace-focus-panel workspace-focus-milestones ${
          fullscreenWorkspaceView === "overview-milestones-by-phase"
            ? "workspace-focus-panel-fullscreen"
            : ""
        }`}
      >
        <div className="panel-title">
          <div>
            <h2>Вехи</h2>
          </div>
          <div className="panel-title-actions">
            {project.jiraIntegration && (
              <a
                className="button"
                href={project.jiraIntegration.boardUrl}
                target="_blank"
                rel="noreferrer"
              >
                Открыть доску Jira
              </a>
            )}
          </div>
        </div>
        <div className="milestone-sections">
          <MilestoneTimelineSection
            sectionId="milestones-by-phase"
            title="Вехи по фазам"
            timeline={milestoneTimeline.byPhase}
            activeLabelDrag={activeMilestoneLabelDrag}
            labelOffsets={milestoneLabelOffsets}
            isFullscreen={
              fullscreenWorkspaceView === "overview-milestones-by-phase"
            }
            onToggleFullscreen={() =>
              toggleWorkspaceFullscreen("overview-milestones-by-phase")
            }
            onOpenStructure={() => openView("project-structure")}
            onLabelPointerDown={startMilestoneLabelDrag}
            onPrint={() =>
              printSectionAsPdf(
                "milestones-by-phase",
                `${project.code} - вехи по фазам`,
              )
            }
          />
        </div>
      </article>
    </>
  );
}
