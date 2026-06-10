import { usePageContext } from "./PageContext";
import type { CSSProperties } from "react";

export function PortfolioPage() {
  const ctx = usePageContext();
  const {
    activeProjectTree,
    date,
    firstEnabledProjectView,
    openView,
    portfolioBlockingProblemGroups,
    portfolioGoalTimeline,
    projectRegistryDrafts,
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
                        {portfolioGoalTimeline.items.map((item, index) => (
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
                        {portfolioGoalTimeline.items.map((item, index) => (
                          <button
                            type="button"
                            className={`portfolio-goal-item status-${item.status.toLowerCase()}`}
                            key={item.id}
                            onClick={() => selectProject(item.projectId, firstEnabledProjectView)}
                          >
                            <span className="portfolio-goal-item-index">{index + 1}</span>
                            <span>
                              <b>{item.projectName} · {item.goalTitle}</b>
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
                    <div className="empty-state">
                      На шкале -4/+8 месяцев нет целей активных проектов.
                    </div>
                  )}
                </article>
              </section>
            )}
      {(
              <section className="projects-tree-section">
                <article className="panel portfolio-blockers-panel">
                  <div className="panel-title">
                    <div>
                      <h2>Блокирующие проблемы</h2>
                      <p>Проблемы в красной зоне по портфелям</p>
                    </div>
                  </div>
                  <div className="portfolio-blocker-groups">
                    {portfolioBlockingProblemGroups.map((group) => (
                      <section className="portfolio-blocker-group" key={group.portfolio}>
                        <div className="portfolio-blocker-group-title">
                          <h3>{group.portfolio}</h3>
                          <span>{group.projectCount} проект(ов)</span>
                        </div>
                        <div className="portfolio-blocker-projects">
                          {group.projects.map((projectGroup) => (
                            <div
                              className="portfolio-blocker-project"
                              key={projectGroup.projectId}
                            >
                              <div className="portfolio-blocker-project-title">
                                <b>{projectGroup.projectName}</b>
                              </div>
                              {projectGroup.problems.length > 0 ? (
                                <div className="portfolio-blocker-list">
                                  {projectGroup.problems.map((problem) => (
                                    <button
                                      type="button"
                                      className="portfolio-blocker-item"
                                      key={problem.id}
                                      onClick={() =>
                                        selectProject(
                                          problem.projectId,
                                          firstEnabledProjectView,
                                        )
                                      }
                                    >
                                      <span className="portfolio-blocker-score">
                                        {problem.riskScore}
                                      </span>
                                      <span>
                                        <b>{problem.title}</b>
                                        <small>
                                          {problem.owner || "не назначен"}
                                          {problem.dueDate
                                            ? ` · срок ${date(problem.dueDate)}`
                                            : ""}
                                          {problem.scheduleImpactDays > 0
                                            ? ` · влияние +${problem.scheduleImpactDays} дн.`
                                            : ""}
                                          {problem.jiraTicketKey
                                            ? ` · ${problem.jiraTicketKey}`
                                            : ""}
                                        </small>
                                      </span>
                                    </button>
                                  ))}
                                </div>
                              ) : (
                                <p className="portfolio-blocker-empty">
                                  У проекта блокирующих проблем нет.
                                </p>
                              )}
                            </div>
                          ))}
                        </div>
                      </section>
                    ))}
                    {portfolioBlockingProblemGroups.length === 0 && (
                      <div className="empty-state">Активные портфели не найдены.</div>
                    )}
                  </div>
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
