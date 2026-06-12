import type { CSSProperties } from "react";
import { signedDaysUntil } from "../app/dateUtils";
import type { PortfolioRedRaidItem, PortfolioRedRaidProject } from "../app/portfolioModels";
import { usePageContext } from "./PageContext";

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
    activeProjectTree,
    date,
    firstEnabledProjectView,
    isReadOnly,
    openRaidItemFromOverview,
    openView,
    portfolioGoalTimeline,
    selectProject,
    selectedProjectId,
    visiblePortfolioProblemProjects,
    visiblePortfolioRiskProjects,
  } = ctx;
  const visibleProjects = activeProjectTree;
  const visibleGoals = portfolioGoalTimeline.items;
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
              <h2>Цели проектов</h2>
              <p>Линейная шкала по записям ИСР с типом Цель</p>
            </div>
          </div>
          {visibleGoals.length > 0 ? (
            <div className="portfolio-goal-timeline">
              <div className="portfolio-goal-axis" aria-hidden="true">
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
                {visibleGoals.map((item, index) => (
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
                {visibleGoals.map((item, index) => (
                  <button
                    type="button"
                    className={`portfolio-goal-item status-${item.status.toLowerCase()}`}
                    key={item.id}
                    onClick={() =>
                      selectProject(item.projectId, firstEnabledProjectView)
                    }
                  >
                    <span className="portfolio-goal-item-index">{index + 1}</span>
                    <span>
                      <b>
                        {item.projectName} · {item.goalTitle}
                      </b>
                      <small className="portfolio-goal-meta">
                        {item.baselineDueDate && (
                          <span>базовый план {date(item.baselineDueDate)}</span>
                        )}
                        <span>прогноз {date(item.dueDate)}</span>
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
                <span>{date(portfolioGoalTimeline.startDate)}</span>
                <span>{date(portfolioGoalTimeline.endDate)}</span>
              </div>
            </div>
          ) : (
            <div className="empty-state compact">
              Целей на шкале нет.
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
              <h2>Проекты портфеля</h2>
              <p>Иерархия проектов, статусы и ответственные руководители</p>
            </div>
            <button
              type="button"
              disabled={isReadOnly}
              onClick={() => openView("project-create")}
              title={isReadOnly ? "Войдите для создания проекта" : undefined}
            >
              Создать проект
            </button>
          </div>
          <div className="project-tree-list">
            <div className="project-tree-head">
              <span>Код проекта</span>
              <span>Имя проекта</span>
              <span />
              <span>РП</span>
              <span>Индикатор</span>
            </div>
            {visibleProjects.map((item) => (
              <div
                className={`project-tree-row ${item.id === selectedProjectId ? "active" : ""}`}
                key={item.id}
              >
                <span
                  className="project-tree-code-static"
                  style={
                    {
                      marginLeft: `${item.level * 18}px`,
                      "--project-indent": `${item.level * 18}px`,
                    } as CSSProperties
                  }
                >
                  {item.code}
                </span>
                <span className="project-tree-name-static">{item.name}</span>
                <button
                  type="button"
                  className="project-tree-open"
                  onClick={() => selectProject(item.id, firstEnabledProjectView)}
                >
                  Открыть
                </button>
                <span>{item.projectManager}</span>
                <span className={`rag-dot ${item.rag.toLowerCase()}`} />
              </div>
            ))}
            {visibleProjects.length === 0 && (
              <div className="empty-state">Проекты по текущему фильтру не найдены.</div>
            )}
          </div>
        </article>
      </section>
    </>
  );
}
