import { useI18n as useInterfaceTranslation } from "../i18n/I18nProvider";
import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { AlertTriangle, ChevronDown } from "lucide-react";
import { signedDaysUntil } from "../app/dateUtils";
import type { ProjectListItem } from "../app/domainTypes";
import { PageSkeleton } from "../components/Skeleton";
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
import { ProjectsOverview } from "./ProjectsOverview";
import { goalScheduleHealth } from "../app/goalScheduleHealth";

const PortfolioRoadmapV2 = lazy(() =>
  import("./PortfolioV2Page").then((module) => ({
    default: module.PortfolioRoadmapV2,
  })),
);

function dueDateTone(dueDate: string | null) {
  const days = signedDaysUntil(dueDate);
  if (days === null) return "neutral";
  if (days < 0) return "overdue";
  if (days <= 14) return "soon";
  return "normal";
}

function dueDateLabel(dueDate: string | null) {
  const days = signedDaysUntil(dueDate);
  if (days === null) return null;
  if (days < 0) return `просрочено ${Math.abs(days)} дн.`;
  if (days === 0) return "сегодня";
  return `через ${days} дн.`;
}

export function PortfolioPage() {
  const { t: uiText } = useInterfaceTranslation();
  const [excludedProjectIds, setExcludedProjectIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [shouldLoadRoadmap, setShouldLoadRoadmap] = useState(false);
  const roadmapSectionRef = useRef<HTMLElement>(null);
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

  const scrollToRoadmapHash = useCallback(() => {
    if (window.location.hash !== "#roadmap-v2") return;
    roadmapSectionRef.current?.scrollIntoView();
  }, []);

  useEffect(() => {
    scrollToRoadmapHash();
  }, [scrollToRoadmapHash]);

  useEffect(() => {
    const section = roadmapSectionRef.current;
    if (!section) return;
    if (typeof IntersectionObserver === "undefined") {
      const timeoutId = setTimeout(() => setShouldLoadRoadmap(true), 0);
      return () => clearTimeout(timeoutId);
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        setShouldLoadRoadmap(true);
        observer.disconnect();
      },
      { rootMargin: "320px 0px" },
    );
    observer.observe(section);
    return () => observer.disconnect();
  }, []);
  const projectFilterOptions = useMemo(
    () => createPortfolioProjectFilterOptions(projects as ProjectListItem[]),
    [projects],
  );
  const selectedProjectIds = useMemo(
    () => selectedPortfolioProjectIds(projectFilterOptions, excludedProjectIds),
    [excludedProjectIds, projectFilterOptions],
  );
  const timelineRows = filterPortfolioRowsByProject<PortfolioGoalTimelineProjectRow>(
    portfolioGoalTimeline.projectRows,
    selectedProjectIds,
  );
  const visibleProblemProjects = filterPortfolioRowsByProject<PortfolioRedRaidProject>(
    visiblePortfolioProblemProjects,
    selectedProjectIds,
  );
  const visibleRiskProjects = filterPortfolioRowsByProject<PortfolioRedRaidProject>(
    visiblePortfolioRiskProjects,
    selectedProjectIds,
  );
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
    ? "Нет проектов"
    : isProjectFilterActive
      ? `${selectedProjectCount} из ${projectCount}`
      : `Все ${projectCount}`;

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
                const relativeDueDate = dueDateLabel(item.dueDate);
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
                        {item.dueDate ? ` · срок ${date(item.dueDate)}` : ""}
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
              <p>{uiText("ui.portfolio.wbsGoalScalePerProject")}</p>
            </div>
            <details
              className={`portfolio-project-filter ${
                isProjectFilterActive ? "is-filtered" : ""
              }`}
              data-testid="portfolio-project-filter"
            >
              <summary
                aria-label={`Проекты для отображения: показано ${selectedProjectCount} из ${projectCount}`}
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
          ) : timelineRows.length > 0 ? (
            <div className="portfolio-goal-timeline">
              <div className="portfolio-project-timelines">
                {timelineRows.map((row) => (
                  <section
                    className="portfolio-project-timeline-row"
                    data-project-id={row.projectId}
                    key={row.projectId}
                  >
                    <button
                      type="button"
                      className="portfolio-project-timeline-title"
                      onClick={() =>
                        selectProject(row.projectId, firstEnabledProjectView)
                      }
                    >
                      <span>
                        <b>{row.projectName}</b>
                        <small>{row.projectCode}</small>
                      </span>
                      <strong>{row.items.length}</strong>
                    </button>
                    <div
                      className="portfolio-project-timeline-track"
                      aria-label={`Цели проекта ${row.projectName}`}
                    >
                      <span className="portfolio-goal-axis-line" />
                      {portfolioGoalTimeline.monthTicks.map((tick, index) => (
                        <span
                          className={`portfolio-goal-track-month-tick ${
                            index % 2 === 0 ? "major" : "minor"
                          } ${
                            index === 0 ? "edge-start" : ""
                          } ${
                            index === portfolioGoalTimeline.monthTicks.length - 1
                              ? "edge-end"
                              : ""
                          }`}
                          data-label={index % 2 === 0 ? tick.label : ""}
                          key={tick.key}
                          style={{ left: `${tick.offset}%` }}
                          title={tick.label}
                        />
                      ))}
                      <span
                        className="portfolio-goal-today-line"
                        style={{ left: `${portfolioGoalTimeline.todayOffset}%` }}
                      />
                      {row.items.map((item, index) => (
                        <span
                          className={`portfolio-goal-dot goal-health-${goalScheduleHealth(item)}`}
                          key={item.id}
                          style={{ left: `${item.offset}%` }}
                          title={`${item.goalTitle}: ${date(item.dueDate)}`}
                        >
                          {index + 1}
                        </span>
                      ))}
                    </div>
                    <div className="portfolio-goal-items">
                      {row.items.length > 0 ? (
                        row.items.map((item, index) => (
                          <button
                            type="button"
                            className={`portfolio-goal-item goal-health-${goalScheduleHealth(item)}`}
                            key={item.id}
                            onClick={() =>
                              selectProject(item.projectId, firstEnabledProjectView)
                            }
                          >
                            <span className="portfolio-goal-item-index">
                              {index + 1}
                            </span>
                            <span className="portfolio-goal-inline">
                              <b>
                                {item.projectName} · {item.goalTitle}
                              </b>
                              <small className="portfolio-goal-meta">
                                <span>
                                  {uiText("ui.portfolio.baselineLowercase")} {date(item.baselineDueDate)}
                                </span>
                                <span>{uiText("ui.portfolio.currentForecastLowercase")} {date(item.dueDate)}</span>
                                {item.delayDays !== null && item.delayDays > 0 && (
                                  <span className="portfolio-goal-delay">
                                    {uiText("ui.portfolio.delayPrefixPlus")}{item.delayDays} {uiText("ui.portfolio.daysAbbrev")}
                                  </span>
                                )}
                              </small>
                            </span>
                          </button>
                        ))
                      ) : (
                        <div className="portfolio-goal-row-empty">
                          {uiText("ui.portfolio.portfolioNoGoalsInRange")}
                        </div>
                      )}
                    </div>
                  </section>
                ))}
              </div>
              <div className="portfolio-goal-range">
                <span>{date(portfolioGoalTimeline.startDate)}</span>
                <span>{date(portfolioGoalTimeline.endDate)}</span>
              </div>
            </div>
          ) : (
            <div className="empty-state compact">
              {uiText("ui.portfolio.portfolioNoActiveProjectsWithPendingGoals")}
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
          {renderRaidProjects(
            visibleRiskProjects,
            noProjectsSelected
              ? uiText("ui.portfolio.portfolioNoProjectsSelected")
              : uiText("ui.portfolio.portfolioNoKeyRisks"),
          )}
        </article>
      </section>

      <section className="projects-tree-section">
        <article className="panel project-tree-panel">
          <div className="panel-title">
            <div>
              <h2>{uiText("ui.admin.projects")}</h2>
              <p>{uiText("ui.portfolio.portfolioPassportsSummarySubtitle")}</p>
            </div>
          </div>
          <ProjectsOverview
            date={date}
            projects={projects as ProjectListItem[]}
            selectProject={selectProject}
          />
        </article>
      </section>

      <section
        aria-labelledby="portfolio-roadmap-v2-title"
        className="projects-tree-section portfolio-roadmap-section"
        id="roadmap-v2"
        ref={roadmapSectionRef}
      >
        <article className="panel portfolio-roadmap-panel">
          <div className="panel-title">
            <div>
              <h2 id="portfolio-roadmap-v2-title">{uiText("ui.portfolio.roadmapV2Title")}</h2>
            </div>
          </div>
          {shouldLoadRoadmap ? (
            <Suspense fallback={<PageSkeleton label={uiText("ui.portfolio.roadmapLoadingRegion")} />}>
              <PortfolioRoadmapV2 onContentReady={scrollToRoadmapHash} />
            </Suspense>
          ) : (
            <PageSkeleton label={uiText("ui.portfolio.roadmapLoadingRegion")} />
          )}
        </article>
      </section>
    </>
  );
}
