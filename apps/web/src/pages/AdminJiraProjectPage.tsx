import { usePageContext } from "./PageContext";

export function AdminJiraProjectPage() {
  const ctx = usePageContext();
  const {
    date,
    jiraForm,
    project,
    saveJiraIntegration,
    saveTaskJiraLink,
    savingJira,
    setJiraForm,
    setTaskDrafts,
    syncing,
    syncJira,
    taskDrafts,
  } = ctx;

  return (
    <>
      {(
                <article className="panel project-card">
                  <div className="panel-title">
                    <div>
                      <h2>Администрирование: подключение Jira</h2>
                      <p>
                        Настройки проекта для ссылок, снимков и JQL открытых
                        вопросов
                      </p>
                    </div>
                  </div>
                  <form className="form-grid" onSubmit={saveJiraIntegration}>
                    <label>
                      Базовый URL Jira
                      <input
                        value={jiraForm.baseUrl}
                        onChange={(event) =>
                          setJiraForm({
                            ...jiraForm,
                            baseUrl: event.target.value,
                          })
                        }
                        placeholder="https://company.atlassian.net"
                      />
                    </label>
                    <label>
                      URL доски Jira
                      <input
                        value={jiraForm.boardUrl}
                        onChange={(event) =>
                          setJiraForm({
                            ...jiraForm,
                            boardUrl: event.target.value,
                          })
                        }
                        placeholder="https://company.atlassian.net/jira/software/projects/ERP/boards/12"
                      />
                    </label>
                    <label>
                      Ключ проекта
                      <input
                        value={jiraForm.projectKey}
                        onChange={(event) =>
                          setJiraForm({
                            ...jiraForm,
                            projectKey: event.target.value,
                          })
                        }
                        placeholder="ERP"
                      />
                    </label>
                    <label>
                      JQL задач
                      <textarea
                        value={jiraForm.issuesJql}
                        onChange={(event) =>
                          setJiraForm({
                            ...jiraForm,
                            issuesJql: event.target.value,
                          })
                        }
                        rows={2}
                      />
                    </label>
                    <label className="span-2">
                      JQL открытых вопросов
                      <textarea
                        value={jiraForm.openIssuesJql}
                        onChange={(event) =>
                          setJiraForm({
                            ...jiraForm,
                            openIssuesJql: event.target.value,
                          })
                        }
                        rows={2}
                      />
                    </label>
                    <div className="form-actions span-2">
                      <button type="submit" disabled={savingJira}>
                        {savingJira
                          ? "Сохраняю..."
                          : "Сохранить Jira настройки"}
                      </button>
                    </div>
                  </form>
                </article>
              )}
      {(
                <article className="panel">
                  <div className="panel-title">
                    <div>
                      <h2>Снимок задач Jira</h2>
                      <p>
                        Для отчетности и обзора для руководства, не замена Jira
                        канбан
                      </p>
                    </div>
                    <button
                      className="button"
                      type="button"
                      onClick={syncJira}
                      disabled={syncing}
                    >
                      {syncing ? "Синхронизирую..." : "Синхронизировать"}
                    </button>
                  </div>
                  <div className="table">
                    <div className="table-head">
                      <span>Ключ</span>
                      <span>Статус</span>
                      <span>Приоритет</span>
                      <span>Исполнитель</span>
                    </div>
                    {project.jiraSnapshots.map((issue) => (
                      <a
                        className="table-row"
                        key={issue.id}
                        href={issue.issueUrl}
                        target="_blank"
                        rel="noreferrer"
                      >
                        <span>{issue.issueKey}</span>
                        <span>{issue.status}</span>
                        <span>{issue.priority}</span>
                        <span>{issue.assignee ?? "не назначен"}</span>
                      </a>
                    ))}
                  </div>
                </article>
              )}
      {(
                <article className="panel">
                  <div className="panel-title">
                    <div>
                      <h2>Управленческие задачи</h2>
                      <p>Каждая задача может ссылаться на задачу Jira</p>
                    </div>
                  </div>
                  <div className="task-list">
                    {project.tasks.map((task) => (
                      <div className="task-row" key={task.id}>
                        <div>
                          <h3>{task.title}</h3>
                          <p>
                            {task.owner} / {task.status} / срок{" "}
                            {date(task.dueDate)}
                          </p>
                          <div className="task-edit">
                            <input
                              value={taskDrafts[task.id]?.jiraTicketKey ?? ""}
                              onChange={(event) =>
                                setTaskDrafts({
                                  ...taskDrafts,
                                  [task.id]: {
                                    ...(taskDrafts[task.id] ?? {
                                      jiraTicketUrl: "",
                                    }),
                                    jiraTicketKey: event.target.value,
                                  },
                                })
                              }
                              placeholder="Ключ Jira"
                            />
                            <input
                              value={taskDrafts[task.id]?.jiraTicketUrl ?? ""}
                              onChange={(event) =>
                                setTaskDrafts({
                                  ...taskDrafts,
                                  [task.id]: {
                                    ...(taskDrafts[task.id] ?? {
                                      jiraTicketKey: "",
                                    }),
                                    jiraTicketUrl: event.target.value,
                                  },
                                })
                              }
                              placeholder="Jira URL"
                            />
                            <button
                              type="button"
                              onClick={() => saveTaskJiraLink(task.id)}
                            >
                              Сохранить
                            </button>
                          </div>
                        </div>
                        {task.jiraTicketUrl ? (
                          <a
                            className="ticket"
                            href={task.jiraTicketUrl}
                            target="_blank"
                            rel="noreferrer"
                          >
                            {task.jiraTicketKey}
                          </a>
                        ) : (
                          <span className="ticket empty">нет связи с Jira</span>
                        )}
                      </div>
                    ))}
                  </div>
                </article>
              )}
    </>
  );
}
