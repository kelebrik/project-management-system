import { useI18n as useInterfaceTranslation } from "../i18n/I18nProvider";
import {
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { Options } from "highcharts";
import { useAppChartColors } from "../app/charts/appChartTheme";
import { PROGRESS_ROW, PROGRESS_TOP, drawableProgressProjects, portfolioGoalsOption, portfolioProgressOption, portfolioRaidBubbleOption, type PortfolioChartText, type PortfolioProgressProject } from "../app/charts/portfolioOptions";
import { compactPassportRows } from "../app/projectPassportRows";
import { createProjectWorkProgress } from "../app/projectWorkProgress";
import { HighchartsLabChart } from "../components/charts/HighchartsLabChart";
import { useHighchartsExtras } from "../components/charts/useHighchartsExtras";
import { AlertTriangle, ChevronDown } from "lucide-react";
import { signedDaysUntil } from "../app/dateUtils";
import type { ProjectListItem } from "../app/domainTypes";
import type {
  PortfolioGoalTimelineProjectRow,
  PortfolioRedRaidItem,
  PortfolioRedRaidProject,
} from "../app/portfolioModels";
import {
  createPortfolioProjectFilterOptions,
  filterPortfolioRowsByProject,
  selectedPortfolioProjectIds,
} from "../app/portfolioProjectFilter";
import { usePageContext } from "./PageContext";
import type { Translator } from "../i18n/types";

/** A callback that always calls the latest one, though the charts using it are not drawn anew for it. */
function useLatest<T extends (...args: never[]) => void>(callback: T) {
  const current = useRef(callback);
  useLayoutEffect(() => {
    current.current = callback;
  });
  return useCallback((...args: Parameters<T>) => current.current(...args), []);
}

function PortfolioChart({ options, label }: { options: Options | null; label: string }) {
  return options ? <div className="portfolio-chart"><HighchartsLabChart label={label} options={options} /></div> : null;
}


function dueDateTone(dueDate: string | null) {
  const days = signedDaysUntil(dueDate);
  if (days === null) return "neutral";
  if (days < 0) return "overdue";
  if (days <= 14) return "soon";
  return "normal";
}

function dueDateLabel(dueDate: string | null, uiText: Translator) {
  const days = signedDaysUntil(dueDate);
  if (days === null) return null;
  if (days < 0) return uiText("ui.portfolio.overdueDays", { days: Math.abs(days) });
  if (days === 0) return uiText("ui.portfolio.todayLowercase");
  return uiText("ui.portfolio.dueInDays", { days });
}

export function PortfolioPage() {
  const { t: uiText, locale, formatters, labels } = useInterfaceTranslation();
  const colors = useAppChartColors();
  const chartsReady = useHighchartsExtras(locale);
  const [excludedProjectIds, setExcludedProjectIds] = useState<Set<string>>(
    () => new Set(),
  );
  const ctx = usePageContext();
  const {
    date,
    firstEnabledProjectView,
    openRaidItemFromOverview,
    portfolioGoalTimeline,
    projects,
    selectProject,
    visiblePortfolioProblemProjects,
    visiblePortfolioRiskProjects,
  } = ctx;

  const projectFilterOptions = useMemo(
    () => createPortfolioProjectFilterOptions(projects as ProjectListItem[]),
    [projects],
  );
  const selectedProjectIds = useMemo(
    () => selectedPortfolioProjectIds(projectFilterOptions, excludedProjectIds),
    [excludedProjectIds, projectFilterOptions],
  );
  const timelineRows = useMemo(
    () => filterPortfolioRowsByProject<PortfolioGoalTimelineProjectRow>(portfolioGoalTimeline.projectRows, selectedProjectIds),
    [portfolioGoalTimeline, selectedProjectIds],
  );
  const visibleProblemProjects = useMemo(
    () => filterPortfolioRowsByProject<PortfolioRedRaidProject>(visiblePortfolioProblemProjects, selectedProjectIds),
    [selectedProjectIds, visiblePortfolioProblemProjects],
  );
  const visibleRiskProjects = useMemo(
    () => filterPortfolioRowsByProject<PortfolioRedRaidProject>(visiblePortfolioRiskProjects, selectedProjectIds),
    [selectedProjectIds, visiblePortfolioRiskProjects],
  );
  // The projects of the filter from their start to their target, with the share of work done (none without work).
  const progressProjects = useMemo<PortfolioProgressProject[]>(
    () =>
      (projects as ProjectListItem[])
        .filter((project) => project.status !== "CLOSED" && selectedProjectIds.has(project.id))
        .map((project) => {
          const progress = createProjectWorkProgress(project.wbsItems ?? []);
          return { id: project.id, code: project.code, name: project.name, rag: project.rag, startDate: project.startDate, targetDate: project.targetDate, completedPercent: progress.totalDays > 0 ? progress.completedPercent : null };
        }),
    [projects, selectedProjectIds],
  );
  // Next to each bar of the progress chart, the project's passport fields, row for row.
  const progressPassports = useMemo(() => {
    const byId = new Map((projects as ProjectListItem[]).map((project) => [project.id, project]));
    return drawableProgressProjects(progressProjects).map((entry) => ({ entry, fields: compactPassportRows(byId.get(entry.id)!, uiText, labels) }));
  }, [labels, progressProjects, projects, uiText]);
  const openProject = useLatest((projectId: string) => selectProject(projectId, firstEnabledProjectView));
  const openRaid = useLatest((item: PortfolioRedRaidItem) => openRaidItemFromOverview(item.id, item.type, item.projectId));
  const chartText = useMemo<PortfolioChartText>(
    () => ({
      today: uiText("ui.portfolio.chart.today"),
      baseline: uiText("ui.portfolio.chart.baseline"),
      forecast: uiText("ui.portfolio.chart.forecast"),
      noBaseline: uiText("ui.portfolio.chart.noBaseline"),
      daysLater: (count) => uiText("ui.portfolio.chart.daysLater", { count }),
      daysEarlier: (count) => uiText("ui.portfolio.chart.daysEarlier", { count }),
      onTime: uiText("ui.portfolio.chart.onTime"),
      start: uiText("ui.portfolio.chart.start"),
      target: uiText("ui.portfolio.chart.target"),
      done: (percent) => uiText("ui.portfolio.chart.done", { percent }),
      noWork: uiText("ui.portfolio.chart.noWork"),
      overdue: uiText("ui.portfolio.chart.overdue"),
      daysUntil: uiText("ui.portfolio.chart.daysUntil"),
      score: uiText("ui.portfolio.chart.score"),
      impact: (days) => uiText("ui.portfolio.chart.impact", { days }),
      owner: uiText("ui.portfolio.chart.owner"),
      dueDate: uiText("ui.portfolio.chart.dueDate"),
      date: (day) => formatters.date(day),
      titles: { goals: uiText("ui.portfolio.projectGoals"), progress: uiText("ui.portfolio.progressTitle"), problems: uiText("ui.portfolio.portfolioBlockingIssuesTitle"), risks: uiText("ui.portfolio.portfolioKeyRisksTitle") },
    }),
    [formatters, uiText],
  );
  const today = new Date().toISOString().slice(0, 10);
  // A colour per project from the list of all projects, so filtering never recolours the others.
  const projectColor = useCallback(
    (projectId: string) => {
      const index = projectFilterOptions.findIndex((option) => option.id === projectId);
      return colors.series[Math.max(0, index) % colors.series.length];
    },
    [colors, projectFilterOptions],
  );
  const charts = useMemo(() => {
    if (!chartsReady) return null;
    return {
      goals: portfolioGoalsOption({ rows: timelineRows, from: portfolioGoalTimeline.startDate.toISOString(), to: portfolioGoalTimeline.endDate.toISOString(), today, colors, text: chartText, onPick: openProject }),
      progress: portfolioProgressOption({ projects: progressProjects, today, colors, text: chartText, onPick: openProject }),
      problems: portfolioRaidBubbleOption({ projects: visibleProblemProjects, title: chartText.titles.problems, today, colors, text: chartText, projectColor, onPick: openRaid }),
      risks: portfolioRaidBubbleOption({ projects: visibleRiskProjects, title: chartText.titles.risks, today, colors, text: chartText, projectColor, onPick: openRaid }),
    };
  }, [chartText, chartsReady, colors, openProject, openRaid, portfolioGoalTimeline, progressProjects, projectColor, timelineRows, today, visibleProblemProjects, visibleRiskProjects]);
  const projectCount = projectFilterOptions.length;
  const selectedProjectCount = selectedProjectIds.size;
  const isProjectFilterActive = selectedProjectCount < projectCount;
  const noProjectsSelected = projectCount > 0 && selectedProjectCount === 0;

  const toggleProject = (projectId: string, checked: boolean) => {
    setExcludedProjectIds((current) => {
      const next = new Set(current);
      if (checked) next.delete(projectId);
      else next.add(projectId);
      return next;
    });
  };

  const projectFilterStatus = projectCount === 0
    ? uiText("ui.portfolio.noProjects")
    : isProjectFilterActive
      ? uiText("ui.portfolio.selectedProjectsCount", { selected: selectedProjectCount, total: projectCount })
      : uiText("ui.portfolio.allProjectsCount", { total: projectCount });

  const openRaidItem = (item: PortfolioRedRaidItem) => {
    openRaidItemFromOverview(item.id, item.type, item.projectId);
  };

  const renderRaidProjects = (
    projects: PortfolioRedRaidProject[],
    emptyText: string,
  ) => {
    if (projects.length === 0) {
      return <div className="empty-state compact">{emptyText}</div>;
    }
    return (
      <div className="portfolio-raid-projects">
        {projects.map((project) => (
          <section
            className="portfolio-raid-project"
            data-project-id={project.projectId}
            key={project.projectId}
          >
            <div className="portfolio-raid-project-title">
              <b>{project.projectName}</b>
              <span>{project.items.length}</span>
            </div>
            <div className="portfolio-raid-list">
              {project.items.map((item) => {
                const dueTone = dueDateTone(item.dueDate);
                const relativeDueDate = dueDateLabel(item.dueDate, uiText);
                return (
                  <button
                    type="button"
                    className="portfolio-raid-item"
                    key={item.id}
                    onClick={() => openRaidItem(item)}
                  >
                    <span className="portfolio-blocker-score">
                      {item.riskScore}
                    </span>
                    <span className="portfolio-raid-item-main">
                      <b>{item.title}</b>
                      <small>
                        {item.owner || uiText("ui.projects.notAssignedLowercase")}
                        {item.dueDate ? uiText("ui.portfolio.dueDateInline", { date: date(item.dueDate) }) : ""}
                        {item.jiraTicketKey ? ` · ${item.jiraTicketKey}` : ""}
                      </small>
                    </span>
                    <span className={`portfolio-raid-due ${dueTone}`}>
                      {relativeDueDate ?? uiText("ui.portfolio.noDueDateSet")}
                    </span>
                    {item.scheduleImpactDays > 0 && (
                      <span className="portfolio-raid-impact">
                        +{item.scheduleImpactDays} {uiText("ui.portfolio.daysAbbrev")}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    );
  };

  return (
    <>
      <section className="projects-tree-section portfolio-goals-section">
        <article className="panel portfolio-goal-timeline-panel">
          <div className="panel-title">
            <div>
              <h2>{uiText("ui.portfolio.projectGoals")}</h2>
              <p>{uiText("ui.portfolio.goalsChartSubtitle")}</p>
            </div>
            <details
              className={`portfolio-project-filter ${
                isProjectFilterActive ? "is-filtered" : ""
              }`}
              data-testid="portfolio-project-filter"
            >
              <summary
                aria-label={uiText("ui.portfolio.projectsToDisplayStatus", { selected: selectedProjectCount, total: projectCount })}
              >
                {isProjectFilterActive && (
                  <AlertTriangle aria-hidden="true" size={15} />
                )}
                <span>{uiText("ui.portfolio.projectsToDisplay")}</span>
                <strong>{projectFilterStatus}</strong>
                <ChevronDown
                  aria-hidden="true"
                  className="portfolio-project-filter-chevron"
                  size={15}
                />
              </summary>
              <div className="portfolio-project-filter-popover">
                <div className="portfolio-project-filter-actions">
                  <button
                    type="button"
                    disabled={selectedProjectCount === projectCount}
                    onClick={() => setExcludedProjectIds(new Set())}
                  >
                    {uiText("ui.portfolio.selectAll")}
                  </button>
                  <button
                    type="button"
                    disabled={selectedProjectCount === 0 || projectCount === 0}
                    onClick={() =>
                      setExcludedProjectIds(
                        new Set(projectFilterOptions.map(({ id }) => id)),
                      )
                    }
                  >
                    {uiText("ui.portfolio.clearAll")}
                  </button>
                </div>
                <div
                  className="portfolio-project-filter-list"
                  role="group"
                  aria-label={uiText("ui.portfolio.portfolioProjects")}
                >
                  {projectFilterOptions.map((project) => (
                    <label key={project.id}>
                      <input
                        type="checkbox"
                        checked={selectedProjectIds.has(project.id)}
                        onChange={(event) =>
                          toggleProject(project.id, event.currentTarget.checked)
                        }
                      />
                      <span>
                        <b>{project.code}</b>
                        <small>{project.name}</small>
                      </span>
                    </label>
                  ))}
                  {projectFilterOptions.length === 0 && (
                    <p>{uiText("ui.portfolio.noActiveProjects")}</p>
                  )}
                </div>
                <div
                  className="portfolio-project-filter-status"
                  role="status"
                  aria-live="polite"
                >
                  {uiText("ui.portfolio.portfolioShowingLabel")} {selectedProjectCount} {uiText("ui.portfolio.countRangeOf")} {projectCount}
                </div>
              </div>
            </details>
          </div>
          {noProjectsSelected ? (
            <div className="empty-state compact">
              {uiText("ui.portfolio.portfolioNoProjectsSelected")}
            </div>
          ) : timelineRows.some((row) => row.items.length > 0) ? (
            <PortfolioChart label={uiText("ui.portfolio.projectGoals")} options={charts?.goals ?? null} />
          ) : (
            <div className="empty-state compact">
              {uiText("ui.portfolio.portfolioNoActiveProjectsWithPendingGoals")}
            </div>
          )}
        </article>
      </section>

      <section className="projects-tree-section">
        <article className="panel portfolio-progress-panel">
          <div className="panel-title">
            <div>
              <h2>{uiText("ui.portfolio.progressTitle")}</h2>
              <p>{uiText("ui.portfolio.progressSubtitle")}</p>
            </div>
          </div>
          {noProjectsSelected ? (
            <div className="empty-state compact">{uiText("ui.portfolio.portfolioNoProjectsSelected")}</div>
          ) : (
            <div className="portfolio-progress-layout">
              <PortfolioChart label={uiText("ui.portfolio.progressTitle")} options={charts?.progress ?? null} />
              {charts?.progress && (
                <div className="portfolio-progress-passports" style={{ paddingTop: PROGRESS_TOP }}>
                  {progressPassports.map(({ entry, fields }) => (
                    <button
                      aria-label={uiText("ui.portfolio.openPassport", { project: `${entry.code} · ${entry.name}` })}
                      className="portfolio-progress-passport"
                      key={entry.id}
                      onClick={() => selectProject(entry.id, "project-passport")}
                      style={{ height: PROGRESS_ROW }}
                      type="button"
                    >
                      <b className="portfolio-progress-code">{entry.code}</b>
                      {fields.map((field) => (
                        <span key={field.id}>
                          <em title={field.field}>{field.field}</em>
                          <strong>{field.description}</strong>
                        </span>
                      ))}
                      {fields.length === 0 && (
                        <span>
                          <em>{uiText("registry.charter")}</em>
                          <strong>{uiText("registry.noCharter")}</strong>
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </article>
      </section>

      <section className="projects-tree-section portfolio-raid-grid">
        <article className="panel portfolio-blockers-panel">
          <div className="panel-title">
            <div>
              <h2>{uiText("ui.portfolio.portfolioBlockingIssuesTitle")}</h2>
              <p>{uiText("ui.portfolio.portfolioBlockingIssuesSubtitle")}</p>
            </div>
          </div>
          {charts?.problems && <p className="portfolio-chart-hint">{uiText("ui.portfolio.raidChartHint")}</p>}
          <PortfolioChart label={uiText("ui.portfolio.portfolioBlockingIssuesTitle")} options={charts?.problems ?? null} />
          {renderRaidProjects(
            visibleProblemProjects,
            noProjectsSelected
              ? uiText("ui.portfolio.portfolioNoProjectsSelected")
              : uiText("ui.portfolio.portfolioNoBlockingIssues"),
          )}
        </article>

        <article className="panel portfolio-blockers-panel">
          <div className="panel-title">
            <div>
              <h2>{uiText("ui.portfolio.portfolioKeyRisksTitle")}</h2>
              <p>{uiText("ui.portfolio.portfolioKeyRisksSubtitle")}</p>
            </div>
          </div>
          {charts?.risks && <p className="portfolio-chart-hint">{uiText("ui.portfolio.raidChartHint")}</p>}
          <PortfolioChart label={uiText("ui.portfolio.portfolioKeyRisksTitle")} options={charts?.risks ?? null} />
          {renderRaidProjects(
            visibleRiskProjects,
            noProjectsSelected
              ? uiText("ui.portfolio.portfolioNoProjectsSelected")
              : uiText("ui.portfolio.portfolioNoKeyRisks"),
          )}
        </article>
      </section>



    </>
  );
}
