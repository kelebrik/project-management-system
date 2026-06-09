import { BriefcaseBusiness } from "lucide-react";

import { usePageContext } from "./PageContext";

export function ProjectChangesPage() {
  const { overviewDashboard, project } = usePageContext();
  return (
                <article className="panel project-card project-module-page">
                  <div className="panel-title">
                    <div>
                      <h2>Управление изменениями</h2>
                      <p>
                        Запросы на изменение состава работ, сроков и
                        управленческих решений проекта.
                      </p>
                    </div>
                  </div>
                  <div className="module-summary-grid">
                    <div className="metric-card">
                      <span>Запросы на изменение</span>
                      <b>{project.changeRequests.length}</b>
                      <small>Подготовлено для будущего workflow согласований</small>
                    </div>
                    <div className="metric-card">
                      <span>Открытые решения</span>
                      <b>
                        {
                          project.issues.filter(
                            (issue) =>
                              issue.decisionRequired && issue.status !== "Closed",
                          ).length
                        }
                      </b>
                      <small>Открытые вопросы, влияющие на изменения</small>
                    </div>
                    <div className="metric-card">
                      <span>Отклонения от базового плана</span>
                      <b>{overviewDashboard.scheduleDeltaItems.length}</b>
                      <small>Первичные источники сдвига сроков</small>
                    </div>
                  </div>
                  <div className="module-table">
                    <div className="module-table-head">
                      <span>Объект</span>
                      <span>Тип изменения</span>
                      <span>Влияние</span>
                      <span>Ответственный</span>
                    </div>
                    {overviewDashboard.scheduleDeltaItems.map(({ item, delay }) => (
                      <div className="module-table-row" key={item.id}>
                        <b>
                          {item.code} {item.title}
                        </b>
                        <span>Сдвиг срока</span>
                        <span>+{delay} кал. дн.</span>
                        <span>{item.owner || "не назначен"}</span>
                      </div>
                    ))}
                    {overviewDashboard.scheduleDeltaItems.length === 0 && (
                      <div className="empty-state">
                        Изменения сроков относительно базового плана не найдены.
                      </div>
                    )}
                  </div>
                </article>
              );
}

export function ProjectResourcesPage() {
  const { resourceSummaryRows } = usePageContext();
  return (
                <article className="panel project-card project-module-page">
                  <div className="panel-title">
                    <div>
                      <h2>Управление ресурсами</h2>
                      <p>
                        Сводка по исполнителям, назначенным работам и просроченным
                        задачам.
                      </p>
                    </div>
                  </div>
                  <div className="module-summary-grid">
                    <div className="metric-card">
                      <span>Исполнители</span>
                      <b>{resourceSummaryRows.length}</b>
                      <small>По полю Исполнитель в Структуре</small>
                    </div>
                    <div className="metric-card">
                      <span>Работы в процессе</span>
                      <b>
                        {resourceSummaryRows.reduce(
                          (sum, row) => sum + row.inProgress,
                          0,
                        )}
                      </b>
                      <small>Задачи и результаты со статусом В работе</small>
                    </div>
                    <div className="metric-card">
                      <span>Просроченные</span>
                      <b>
                        {resourceSummaryRows.reduce(
                          (sum, row) => sum + row.overdue,
                          0,
                        )}
                      </b>
                      <small>Не завершены и срок уже прошел</small>
                    </div>
                  </div>
                  <div className="module-table resources-table">
                    <div className="module-table-head">
                      <span>Исполнитель</span>
                      <span>Всего</span>
                      <span>В работе</span>
                      <span>Сделано</span>
                      <span>Просрочено</span>
                    </div>
                    {resourceSummaryRows.map((row) => (
                      <div className="module-table-row" key={row.owner}>
                        <b>{row.owner}</b>
                        <span>{row.total}</span>
                        <span>{row.inProgress}</span>
                        <span>{row.done}</span>
                        <span>{row.overdue}</span>
                      </div>
                    ))}
                    {resourceSummaryRows.length === 0 && (
                      <div className="empty-state">
                        В Структуре пока нет задач с назначенными исполнителями.
                      </div>
                    )}
                  </div>
                </article>
              );
}

export function ProjectBudgetPage() {
  return (
                <article className="panel project-card project-module-page">
                  <div className="panel-title">
                    <div>
                      <h2>Управление бюджетом</h2>
                      <p>
                        Контур бюджетного планирования выделен в отдельную
                        страницу и будет наполнен после согласования модели
                        финансовых данных.
                      </p>
                    </div>
                  </div>
                  <div className="budget-placeholder">
                    <BriefcaseBusiness size={34} />
                    <div>
                      <b>Бюджетный модуль подготовлен</b>
                      <span>
                        Сейчас страница не считает финансы и не влияет на
                        проектные показатели. После согласования состава полей
                        сюда можно вынести план, факт, прогноз, лимиты и
                        отклонения.
                      </span>
                    </div>
                  </div>
                </article>
              );
}
