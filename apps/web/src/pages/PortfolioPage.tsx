import { signedDaysUntil } from "../app/dateUtils";
import type { ProjectListItem } from "../app/domainTypes";
import type { PortfolioRedRaidItem, PortfolioRedRaidProject } from "../app/portfolioModels";
import { usePageContext } from "./PageContext";
import { ProjectsOverview } from "./ProjectsOverview";

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
  const timelineRows = portfolioGoalTimeline.projectRows;
  const visibleProblemProjects = visiblePortfolioProblemProjects;
  const visibleRiskProjects = visiblePortfolioRiskProjects;

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
          <section className="portfolio-raid-project" key={project.projectId}>
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
                        {item.owner || "не назначен"}
                        {item.dueDate ? ` · срок ${date(item.dueDate)}` : ""}
                        {item.jiraTicketKey ? ` · ${item.jiraTicketKey}` : ""}
                      </small>
                    </span>
                    <span className={`portfolio-raid-due ${dueTone}`}>
                      {relativeDueDate ?? "срок не задан"}
                    </span>
                    {item.scheduleImpactDays > 0 && (
                      <span className="portfolio-raid-impact">
                        +{item.scheduleImpactDays} дн.
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
              <h2>Временные линии проектов</h2>
              <p>Отдельная шкала целей ИСР для каждого активного проекта</p>
            </div>
          </div>
          {timelineRows.length > 0 ? (
            <div className="portfolio-goal-timeline">
              <div className="portfolio-goal-axis portfolio-goal-axis-shared">
                <span className="portfolio-goal-axis-line" />
                <span
                  className="portfolio-goal-today"
                  style={{ left: `${portfolioGoalTimeline.todayOffset}%` }}
                >
                  сегодня
                </span>
                {portfolioGoalTimeline.monthTicks.map((tick) => (
                  <span
                    className="portfolio-goal-month-tick"
                    key={tick.key}
                    style={{ left: `${tick.offset}%` }}
                  >
                    {tick.label}
                  </span>
                ))}
              </div>
              <div className="portfolio-project-timelines">
                {timelineRows.map((row) => (
                  <section
                    className="portfolio-project-timeline-row"
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
                        <small>
                          {row.projectCode} · {row.portfolio}
                        </small>
                      </span>
                      <strong>{row.items.length}</strong>
                    </button>
                    <div
                      className="portfolio-project-timeline-track"
                      aria-label={`Временная линия проекта ${row.projectName}`}
                    >
                      <span className="portfolio-goal-axis-line" />
                      <span
                        className="portfolio-goal-today-line"
                        style={{ left: `${portfolioGoalTimeline.todayOffset}%` }}
                      />
                      {row.items.map((item, index) => (
                        <span
                          className={`portfolio-goal-dot status-${item.status.toLowerCase()}`}
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
                            className={`portfolio-goal-item status-${item.status.toLowerCase()}`}
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
                                  базовый план {date(item.baselineDueDate)}
                                </span>
                                <span>актуальный прогноз {date(item.dueDate)}</span>
                                {item.delayDays !== null && item.delayDays > 0 && (
                                  <span className="portfolio-goal-delay">
                                    отставание +{item.delayDays} дн.
                                  </span>
                                )}
                              </small>
                            </span>
                          </button>
                        ))
                      ) : (
                        <div className="portfolio-goal-row-empty">
                          Целей в диапазоне шкалы нет.
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
              Активных проектов нет.
            </div>
          )}
        </article>
      </section>

      <section className="projects-tree-section portfolio-raid-grid">
        <article className="panel portfolio-blockers-panel">
          <div className="panel-title">
            <div>
              <h2>Блокирующие проблемы</h2>
              <p>Проблемы в красной зоне по проектам</p>
            </div>
          </div>
          {renderRaidProjects(
            visibleProblemProjects,
            "Блокирующих проблем нет.",
          )}
        </article>

        <article className="panel portfolio-blockers-panel">
          <div className="panel-title">
            <div>
              <h2>Ключевые риски</h2>
              <p>Риски в красной зоне по проектам</p>
            </div>
          </div>
          {renderRaidProjects(
            visibleRiskProjects,
            "Ключевых рисков нет.",
          )}
        </article>
      </section>

      <section className="projects-tree-section">
        <article className="panel project-tree-panel">
          <div className="panel-title">
            <div>
              <h2>Проекты</h2>
              <p>Компактная сводка по паспортам всех проектов</p>
            </div>
          </div>
          <ProjectsOverview
            date={date}
            projects={projects as ProjectListItem[]}
            selectProject={selectProject}
          />
        </article>
      </section>
    </>
  );
}
