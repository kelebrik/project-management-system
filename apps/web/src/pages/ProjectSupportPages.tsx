import {
  BriefcaseBusiness,
} from "lucide-react";

import { usePageContext } from "./PageContext";
import { ListToolbar } from "../components/ListToolbar";
import { usePersistedViewState } from "../app/usePersistedViewState";

export function ProjectChangesPage() {
  const { overviewDashboard, project } = usePageContext();
  const [query, setQuery] = usePersistedViewState(`pms:changes:${project.id}:query`, "");
  const normalizedQuery = query.trim().toLowerCase();
  const changes = overviewDashboard.scheduleDeltaItems.filter(({ item }) => !normalizedQuery || [item.code, item.title, item.owner].some((value) => String(value ?? "").toLowerCase().includes(normalizedQuery)));
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
                  <ListToolbar label="Поиск изменений" query={query} onQueryChange={setQuery} />
                  <div className="module-table">
                    <div className="module-table-head">
                      <span>Объект</span>
                      <span>Тип изменения</span>
                      <span>Влияние</span>
                      <span>Ответственный</span>
                    </div>
                    {changes.map(({ item, delay }) => (
                      <div className="module-table-row" key={item.id}>
                        <b>
                          {item.code} {item.title}
                        </b>
                        <span>Сдвиг срока</span>
                        <span>+{delay} кал. дн.</span>
                        <span>{item.owner || "не назначен"}</span>
                      </div>
                    ))}
                    {changes.length === 0 && (
                      <div className="empty-state"><strong>{normalizedQuery ? "Изменения не найдены" : "Изменения сроков не найдены"}</strong><span>{normalizedQuery ? "Измените запрос или очистите поиск." : "Отклонения появятся, когда прогнозная дата отойдёт от базового плана."}</span>{normalizedQuery && <button type="button" onClick={() => setQuery("")}>Очистить поиск</button>}</div>
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
