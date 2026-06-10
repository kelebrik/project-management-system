import { usePageContext } from "./PageContext";
import type { CSSProperties } from "react";

export function PortfolioPage() {
  const ctx = usePageContext();
  const {
    activeProjectTree,
    date,
    firstEnabledProjectView,
    openView,
    portfolioGoalTimeline,
    portfolioStats,
    projectRegistryDrafts,
    projects,
    projectToRegistryDraft,
    savePortfolioProjectIdentity,
    savingProjectRegistryId,
    selectProject,
    selectedProjectId,
    updateProjectRegistryDraft,
  } = ctx;

  return (
    <>
      {(
              <section className="summary-grid">
                <div className="metric">
                  <span>Активные проекты</span>
                  <strong>{portfolioStats.activeProjects}</strong>
                  <small>Всего проектов: {projects.length}</small>
                </div>
                <div className="metric">
                  <span>Прогресс портфеля</span>
                  <strong>{portfolioStats.averageProgress}%</strong>
                  <div className="progress">
                    <i
                      style={{ width: `${portfolioStats.averageProgress}%` }}
                    />
                  </div>
                </div>
                <div className="metric">
                  <span>Риск-профиль</span>
                  <strong>
                    {portfolioStats.redProjects} /{" "}
                    {portfolioStats.amberProjects}
                  </strong>
                  <small>Критичные / под риском</small>
                </div>
                <div className="metric">
                  <span>Открытые вопросы</span>
                  <strong>{portfolioStats.openIssues}</strong>
                  <small>Открытые проблемы по портфелю</small>
                </div>
              </section>
            )}
      {(
              <section className="projects-tree-section">
                <article className="panel portfolio-goal-timeline-panel">
                  <div className="panel-title">
                    <div>
                      <h2>Цели проектов</h2>
                      <p>Линейная шкала по записям ИСР с типом Цель</p>
                    </div>
                  </div>
                  {portfolioGoalTimeline.items.length > 0 ? (
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
                        {portfolioGoalTimeline.items.map((item) => (
                          <span
                            className={`portfolio-goal-dot status-${item.status.toLowerCase()}`}
                            key={item.id}
                            style={{ left: `${item.offset}%` }}
                          />
                        ))}
                      </div>
                      <div className="portfolio-goal-items">
                        {portfolioGoalTimeline.items.map((item) => (
                          <button
                            type="button"
                            className={`portfolio-goal-item status-${item.status.toLowerCase()}`}
                            key={item.id}
                            onClick={() => selectProject(item.projectId, firstEnabledProjectView)}
                          >
                            <b>{item.projectCode} · {item.goalTitle}</b>
                            <small>
                              {item.projectName} · срок {date(item.dueDate)}
                              {item.baselineDueDate
                                ? ` · базовый план ${date(item.baselineDueDate)}`
                                : ""}
                            </small>
                          </button>
                        ))}
                      </div>
                      <div className="portfolio-goal-range">
                        <span>{date(portfolioGoalTimeline.startDate)}</span>
                        <span>{date(portfolioGoalTimeline.endDate)}</span>
                      </div>
                    </div>
                  ) : (
                    <div className="empty-state">
                      На шкале -4/+8 месяцев нет целей активных проектов.
                    </div>
                  )}
                </article>
              </section>
            )}
      {(
              <section className="projects-tree-section">
                <article className="panel project-tree-panel">
                  <div className="panel-title">
                    <div>
                      <h2>Портфель проектов</h2>
                      <p>
                        Иерархия проектов, статусы и ответственные руководители
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => openView("project-create")}
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
                      <span>Прогресс</span>
                      <span>Индикатор</span>
                    </div>
                    {activeProjectTree.map((item) => {
                      const draft =
                        projectRegistryDrafts[item.id] ??
                        projectToRegistryDraft(item);
                      return (
                        <div
                          className={`project-tree-row ${item.id === selectedProjectId ? "active" : ""}`}
                          key={item.id}
                        >
                          <input
                            className="project-tree-code-input"
                            value={draft.code}
                            onChange={(event) =>
                              updateProjectRegistryDraft(item.id, {
                                code: event.target.value,
                              })
                            }
                            onBlur={() =>
                              void savePortfolioProjectIdentity(item.id)
                            }
                            onKeyDown={(event) => {
                              if (event.key === "Enter") {
                                event.currentTarget.blur();
                              }
                            }}
                            style={
                              {
                                marginLeft: `${item.level * 18}px`,
                                "--project-indent": `${item.level * 18}px`,
                              } as CSSProperties
                            }
                            aria-label={`Код проекта ${item.name}`}
                            disabled={savingProjectRegistryId === item.id}
                          />
                          <input
                            className="project-tree-name-input"
                            value={draft.name}
                            onChange={(event) =>
                              updateProjectRegistryDraft(item.id, {
                                name: event.target.value,
                              })
                            }
                            onBlur={() =>
                              void savePortfolioProjectIdentity(item.id)
                            }
                            onKeyDown={(event) => {
                              if (event.key === "Enter") {
                                event.currentTarget.blur();
                              }
                            }}
                            aria-label={`Имя проекта ${item.code}`}
                            disabled={savingProjectRegistryId === item.id}
                          />
                          <button
                            type="button"
                            className="project-tree-open"
                            onClick={() =>
                              selectProject(item.id, firstEnabledProjectView)
                            }
                          >
                            Открыть
                          </button>
                          <span>{item.projectManager}</span>
                          <span>{item.progress}%</span>
                          <span className={`rag-dot ${item.rag.toLowerCase()}`} />
                        </div>
                      );
                    })}
                    {activeProjectTree.length === 0 && (
                      <div className="empty-state">Активные проекты не найдены.</div>
                    )}
                  </div>
                </article>
              </section>
            )}
    </>
  );
}
