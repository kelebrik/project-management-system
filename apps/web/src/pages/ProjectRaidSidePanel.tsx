import { usePageContext } from "./PageContext";
import type { RaidItemType } from "../app/domainTypes";

export function ProjectRaidSidePanel() {
  const {
    createRaidItem,
    raidForm,
    raidTypeLabel,
    riskMatrix,
    riskTone,
    setRaidForm,
  } = usePageContext();

  return <div className="raid-side-column">
                      <section className="risk-matrix-card">
                        <div className="subhead">Матрица рисков</div>
                        <div className="risk-matrix" aria-label="Матрица рисков">
                          {[5, 4, 3, 2, 1].map((impact) =>
                            [1, 2, 3, 4, 5].map((probability) => {
                              const count =
                                riskMatrix.get(`${probability}:${impact}`) ?? 0;
                              const score = probability * impact;
                              return (
                                <span
                                  className={`risk-matrix-cell ${riskTone(score)}`}
                                  key={`${probability}-${impact}`}
                                  title={`Вероятность ${probability}, влияние ${impact}`}
                                >
                                  {count > 0 ? count : ""}
                                </span>
                              );
                            }),
                          )}
                        </div>
                      </section>
                        <form className="raid-form stack-form" onSubmit={createRaidItem}>
                          <h3>Новая запись</h3>
                        <div className="form-section-title">Основное</div>
                        <div className="two-col">
                        <label>
                          Тип
                          <select
                            value={raidForm.type}
                            onChange={(event) =>
                              setRaidForm({
                                ...raidForm,
                                type: event.target.value as RaidItemType,
                              })
                            }
                          >
                            <option value="RISK">{raidTypeLabel("RISK")}</option>
                            <option value="ASSUMPTION">
                              {raidTypeLabel("ASSUMPTION")}
                            </option>
                            <option value="DEPENDENCY">
                              {raidTypeLabel("DEPENDENCY")}
                            </option>
                          </select>
                        </label>
                        <label>
                          Ответственный
                          <input
                            value={raidForm.owner}
                            onChange={(event) =>
                              setRaidForm({
                                ...raidForm,
                                owner: event.target.value,
                              })
                            }
                            placeholder="Ответственный"
                          />
                        </label>
                      </div>
                      <div className="two-col">
                        <label>
                          Ключ Jira
                          <input
                            value={raidForm.jiraTicketKey}
                            onChange={(event) =>
                              setRaidForm({
                                ...raidForm,
                                jiraTicketKey: event.target.value,
                              })
                            }
                            placeholder="ERP-1842"
                          />
                        </label>
                        <label>
                          Jira URL
                          <input
                            value={raidForm.jiraTicketUrl}
                            onChange={(event) =>
                              setRaidForm({
                                ...raidForm,
                                jiraTicketUrl: event.target.value,
                              })
                            }
                            placeholder="https://jira.company.ru/browse/ERP-1842"
                          />
                        </label>
                      </div>
                      <label>
                        Наименование
                        <input
                          value={raidForm.title}
                          onChange={(event) =>
                            setRaidForm({
                              ...raidForm,
                              title: event.target.value,
                            })
                          }
                          placeholder="Поставщик может не подтвердить SLA"
                        />
                      </label>
                      <label>
                        Описание
                        <textarea
                          value={raidForm.description}
                          onChange={(event) =>
                            setRaidForm({
                              ...raidForm,
                              description: event.target.value,
                            })
                          }
                            rows={3}
                          />
                        </label>
                        <div className="form-section-title">Оценка и влияние</div>
                        <div className="two-col">
                        <label>
                          Вероятность
                          <input
                            type="number"
                            min="0"
                            max="5"
                            value={raidForm.probability}
                            onChange={(event) =>
                              setRaidForm({
                                ...raidForm,
                                probability: event.target.value,
                              })
                            }
                          />
                        </label>
                        <label>
                          Влияние
                          <input
                            type="number"
                            min="0"
                            max="5"
                            value={raidForm.impact}
                            onChange={(event) =>
                              setRaidForm({
                                ...raidForm,
                                impact: event.target.value,
                              })
                            }
                          />
                        </label>
                      </div>
                      <div className="two-col">
                        <label>
                          Срок
                          <input
                            type="date"
                            value={raidForm.dueDate}
                            onChange={(event) =>
                              setRaidForm({
                                ...raidForm,
                                dueDate: event.target.value,
                              })
                            }
                          />
                        </label>
                          </div>
                        <div className="form-section-title">План действий</div>
                        <label>
                          План действий
                        <textarea
                          value={raidForm.mitigationPlan}
                          onChange={(event) =>
                            setRaidForm({
                              ...raidForm,
                              mitigationPlan: event.target.value,
                            })
                          }
                          rows={2}
                        />
                      </label>
                      <label className="checkbox-line">
                        <input
                          type="checkbox"
                          checked={raidForm.decisionRequired}
                          onChange={(event) =>
                            setRaidForm({
                              ...raidForm,
                              decisionRequired: event.target.checked,
                            })
                          }
                        />
                        Требует решения
                      </label>
                      <button type="submit">Создать запись</button>
                    </form>
                    </div>;
}
