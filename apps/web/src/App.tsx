import { type FormEvent, useEffect, useMemo, useState } from 'react';
import './App.css';

type RagStatus = 'GREEN' | 'AMBER' | 'RED';

type ProjectListItem = {
  id: string;
  code: string;
  name: string;
  portfolio: string;
  sponsor: string;
  projectManager: string;
  rag: RagStatus;
  progress: number;
  scheduleVariance: number;
  budgetPlanned: string;
  budgetForecast: string;
  summary: string;
  jiraIntegration: JiraIntegration | null;
  _count: {
    tasks: number;
    issues: number;
    jiraSnapshots: number;
  };
};

type JiraIntegration = {
  baseUrl: string;
  boardUrl: string;
  projectKey: string;
  issuesJql: string;
  openIssuesJql: string;
  syncStatus: string;
  lastSyncedAt: string | null;
};

type ProjectDetails = ProjectListItem & {
  tasks: Task[];
  issues: Issue[];
  jiraSnapshots: JiraIssueSnapshot[];
  overviews: ExecutiveOverview[];
};

type Task = {
  id: string;
  title: string;
  owner: string;
  status: string;
  priority: string;
  dueDate: string | null;
  jiraTicketKey: string | null;
  jiraTicketUrl: string | null;
  jiraStatus: string | null;
};

type JiraFormState = {
  baseUrl: string;
  boardUrl: string;
  projectKey: string;
  issuesJql: string;
  openIssuesJql: string;
};

type IssueFormState = {
  title: string;
  severity: Issue['severity'];
  owner: string;
  impact: string;
  decisionRequired: boolean;
  dueDate: string;
  jiraTicketKey: string;
  jiraTicketUrl: string;
};

type TaskJiraDraft = {
  jiraTicketKey: string;
  jiraTicketUrl: string;
};

type Issue = {
  id: string;
  source: 'INTERNAL' | 'JIRA';
  title: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  status: string;
  owner: string;
  impact: string;
  decisionRequired: boolean;
  dueDate: string | null;
  jiraTicketUrl: string | null;
};

type JiraIssueSnapshot = {
  id: string;
  issueKey: string;
  issueUrl: string;
  summary: string;
  status: string;
  priority: string;
  assignee: string | null;
  issueType: string;
  updatedAt: string;
  syncedAt: string;
};

type ExecutiveOverview = {
  id: string;
  version: number;
  status: string;
  executiveSummary: string;
  decisions: Array<{
    title: string;
    impactIfApproved: string;
    impactIfDelayed: string;
    deadline: string;
  }>;
  evidence: Array<{
    metric: string;
    source: string;
  }>;
};

const apiBase = import.meta.env.VITE_API_BASE_URL ?? '';

const emptyIssueForm: IssueFormState = {
  title: '',
  severity: 'HIGH',
  owner: '',
  impact: '',
  decisionRequired: false,
  dueDate: '',
  jiraTicketKey: '',
  jiraTicketUrl: '',
};

function currency(value: string) {
  return new Intl.NumberFormat('ru-RU', {
    style: 'currency',
    currency: 'RUB',
    maximumFractionDigits: 0,
  }).format(Number(value));
}

function date(value: string | null) {
  if (!value) return 'не задано';
  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date(value));
}

function ragLabel(rag: RagStatus) {
  return rag === 'GREEN' ? 'On Track' : rag === 'AMBER' ? 'At Risk' : 'Critical';
}

function App() {
  const [projects, setProjects] = useState<ProjectListItem[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [project, setProject] = useState<ProjectDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [savingJira, setSavingJira] = useState(false);
  const [creatingIssue, setCreatingIssue] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [jiraForm, setJiraForm] = useState<JiraFormState>({
    baseUrl: '',
    boardUrl: '',
    projectKey: '',
    issuesJql: '',
    openIssuesJql: '',
  });
  const [issueForm, setIssueForm] = useState<IssueFormState>(emptyIssueForm);
  const [taskDrafts, setTaskDrafts] = useState<Record<string, TaskJiraDraft>>({});

  useEffect(() => {
    fetch(`${apiBase}/api/projects`)
      .then((response) => response.json())
      .then((data: ProjectListItem[]) => {
        setProjects(data);
        setSelectedProjectId(data[0]?.id ?? null);
      })
      .catch(() => setError('Не удалось загрузить список проектов'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!selectedProjectId) return;
    fetch(`${apiBase}/api/projects/${selectedProjectId}/overview`)
      .then((response) => response.json())
      .then((data: ProjectDetails) => applyProject(data))
      .catch(() => setError('Не удалось загрузить проект'));
  }, [selectedProjectId]);

  const latestOverview = project?.overviews[0];
  const budgetVariance = useMemo(() => {
    if (!project) return 0;
    return (Number(project.budgetForecast) / Number(project.budgetPlanned) - 1) * 100;
  }, [project]);

  async function syncJira() {
    if (!project) return;
    setSyncing(true);
    setError(null);
    try {
      const response = await fetch(`${apiBase}/api/projects/${project.id}/jira/sync`, {
        method: 'POST',
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error ?? 'Jira sync failed');
      }
      const refreshed = await fetch(`${apiBase}/api/projects/${project.id}/overview`);
      applyProject(await refreshed.json());
    } catch (syncError) {
      setError(syncError instanceof Error ? syncError.message : 'Jira sync failed');
    } finally {
      setSyncing(false);
    }
  }

  function applyProject(nextProject: ProjectDetails) {
    setProject(nextProject);
    setJiraForm({
      baseUrl: nextProject.jiraIntegration?.baseUrl ?? '',
      boardUrl: nextProject.jiraIntegration?.boardUrl ?? '',
      projectKey: nextProject.jiraIntegration?.projectKey ?? '',
      issuesJql: nextProject.jiraIntegration?.issuesJql ?? '',
      openIssuesJql: nextProject.jiraIntegration?.openIssuesJql ?? '',
    });
    setTaskDrafts(
      Object.fromEntries(
        nextProject.tasks.map((task) => [
          task.id,
          {
            jiraTicketKey: task.jiraTicketKey ?? '',
            jiraTicketUrl: task.jiraTicketUrl ?? '',
          },
        ]),
      ),
    );
  }

  async function refreshProject(projectId = project?.id) {
    if (!projectId) return;
    const refreshed = await fetch(`${apiBase}/api/projects/${projectId}/overview`);
    applyProject(await refreshed.json());
  }

  async function saveJiraIntegration(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!project) return;
    setSavingJira(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch(`${apiBase}/api/projects/${project.id}/jira-integration`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(jiraForm),
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error?.formErrors?.join(', ') || result.error || 'Не удалось сохранить Jira');
      }
      await refreshProject(project.id);
      setNotice('Jira-настройки сохранены');
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Не удалось сохранить Jira');
    } finally {
      setSavingJira(false);
    }
  }

  async function createOpenIssue(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!project) return;
    setCreatingIssue(true);
    setError(null);
    setNotice(null);
    try {
      const payload = {
        ...issueForm,
        dueDate: issueForm.dueDate || null,
        jiraTicketKey: issueForm.jiraTicketKey || null,
        jiraTicketUrl: issueForm.jiraTicketUrl || null,
      };
      const response = await fetch(`${apiBase}/api/projects/${project.id}/open-issues`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error?.formErrors?.join(', ') || result.error || 'Не удалось создать issue');
      }
      setIssueForm(emptyIssueForm);
      await refreshProject(project.id);
      setNotice('Open issue создан');
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : 'Не удалось создать issue');
    } finally {
      setCreatingIssue(false);
    }
  }

  async function saveTaskJiraLink(taskId: string) {
    const draft = taskDrafts[taskId];
    if (!draft) return;
    setError(null);
    setNotice(null);
    try {
      const response = await fetch(`${apiBase}/api/tasks/${taskId}/jira-link`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jiraTicketKey: draft.jiraTicketKey || null,
          jiraTicketUrl: draft.jiraTicketUrl || null,
        }),
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error?.formErrors?.join(', ') || result.error || 'Не удалось сохранить ссылку');
      }
      await refreshProject();
      setNotice('Jira-ссылка задачи сохранена');
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Не удалось сохранить ссылку');
    }
  }

  if (loading) {
    return <main className="loading">Загрузка системы управления проектами...</main>;
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">PM System</div>
        <nav>
          <a className="active">Портфель</a>
          <a>Проекты</a>
          <a>Open Issues</a>
          <a>Ресурсы</a>
          <a>Финансы</a>
          <a>Executive Overview</a>
          <a>Admin Back</a>
        </nav>
      </aside>

      <main className="workspace">
        <header className="topbar">
          <div>
            <p className="eyebrow">Web UI Front для проектных менеджеров</p>
            <h1>Портфель проектов</h1>
          </div>
          <select
            value={selectedProjectId ?? ''}
            onChange={(event) => setSelectedProjectId(event.target.value)}
          >
            {projects.map((item) => (
              <option key={item.id} value={item.id}>
                {item.code} - {item.name}
              </option>
            ))}
          </select>
        </header>

        {error && <div className="alert">{error}</div>}
        {notice && <div className="notice">{notice}</div>}

        {project && (
          <>
            <section className="summary-grid">
              <div className="metric">
                <span>Project Health</span>
                <strong className={`rag ${project.rag.toLowerCase()}`}>{ragLabel(project.rag)}</strong>
                <small>{project.summary}</small>
              </div>
              <div className="metric">
                <span>Progress</span>
                <strong>{project.progress}%</strong>
                <div className="progress">
                  <i style={{ width: `${project.progress}%` }} />
                </div>
              </div>
              <div className="metric">
                <span>Schedule Variance</span>
                <strong>{project.scheduleVariance > 0 ? '+' : ''}{project.scheduleVariance} дней</strong>
                <small>Относительно baseline</small>
              </div>
              <div className="metric">
                <span>Budget Forecast</span>
                <strong>{budgetVariance > 0 ? '+' : ''}{budgetVariance.toFixed(1)}%</strong>
                <small>{currency(project.budgetForecast)}</small>
              </div>
            </section>

            <section className="content-grid">
              <article className="panel project-card">
                <div className="panel-title">
                  <div>
                    <h2>{project.name}</h2>
                    <p>{project.portfolio} / Sponsor: {project.sponsor}</p>
                  </div>
                  {project.jiraIntegration && (
                    <a className="button" href={project.jiraIntegration.boardUrl} target="_blank" rel="noreferrer">
                      Открыть доску Jira
                    </a>
                  )}
                </div>
                <dl className="details">
                  <div><dt>PM</dt><dd>{project.projectManager}</dd></div>
                  <div><dt>Бюджет</dt><dd>{currency(project.budgetPlanned)}</dd></div>
                  <div><dt>Jira key</dt><dd>{project.jiraIntegration?.projectKey ?? 'не настроено'}</dd></div>
                  <div><dt>Jira sync</dt><dd>{project.jiraIntegration?.syncStatus ?? 'off'}</dd></div>
                </dl>
                <div className="jql">
                  <span>Open issues JQL</span>
                  <code>{project.jiraIntegration?.openIssuesJql ?? 'Jira connector не настроен'}</code>
                </div>
              </article>

              <article className="panel project-card">
                <div className="panel-title">
                  <div>
                    <h2>Admin Back: Jira connector</h2>
                    <p>Настройки проекта для deep links, snapshots и Open Issues JQL</p>
                  </div>
                </div>
                <form className="form-grid" onSubmit={saveJiraIntegration}>
                  <label>
                    Jira base URL
                    <input
                      value={jiraForm.baseUrl}
                      onChange={(event) => setJiraForm({ ...jiraForm, baseUrl: event.target.value })}
                      placeholder="https://company.atlassian.net"
                    />
                  </label>
                  <label>
                    Jira board URL
                    <input
                      value={jiraForm.boardUrl}
                      onChange={(event) => setJiraForm({ ...jiraForm, boardUrl: event.target.value })}
                      placeholder="https://company.atlassian.net/jira/software/projects/ERP/boards/12"
                    />
                  </label>
                  <label>
                    Project key
                    <input
                      value={jiraForm.projectKey}
                      onChange={(event) => setJiraForm({ ...jiraForm, projectKey: event.target.value })}
                      placeholder="ERP"
                    />
                  </label>
                  <label>
                    Issues JQL
                    <textarea
                      value={jiraForm.issuesJql}
                      onChange={(event) => setJiraForm({ ...jiraForm, issuesJql: event.target.value })}
                      rows={2}
                    />
                  </label>
                  <label className="span-2">
                    Open issues JQL
                    <textarea
                      value={jiraForm.openIssuesJql}
                      onChange={(event) => setJiraForm({ ...jiraForm, openIssuesJql: event.target.value })}
                      rows={2}
                    />
                  </label>
                  <div className="form-actions span-2">
                    <button type="submit" disabled={savingJira}>{savingJira ? 'Сохраняю...' : 'Сохранить Jira настройки'}</button>
                  </div>
                </form>
              </article>

              <article className="panel">
                <div className="panel-title">
                  <div>
                    <h2>Open Issues List</h2>
                    <p>Единый список открытых проблем из Jira и внутреннего RAID</p>
                  </div>
                </div>
                <div className="issue-list">
                  {project.issues.map((issue) => (
                    <div className="issue-row" key={issue.id}>
                      <div>
                        <span className={`severity ${issue.severity.toLowerCase()}`}>{issue.severity}</span>
                        <h3>{issue.jiraTicketUrl ? <a href={issue.jiraTicketUrl} target="_blank" rel="noreferrer">{issue.title}</a> : issue.title}</h3>
                        <p>{issue.impact}</p>
                      </div>
                      <div className="issue-meta">
                        <strong>{issue.source}</strong>
                        <span>{issue.owner}</span>
                        <span>{date(issue.dueDate)}</span>
                        {issue.decisionRequired && <b>Decision</b>}
                      </div>
                    </div>
                  ))}
                </div>
              </article>

              <article className="panel">
                <div className="panel-title">
                  <div>
                    <h2>Создать Open Issue</h2>
                    <p>Внутренний RAID issue или управленческая проблема со ссылкой на Jira</p>
                  </div>
                </div>
                <form className="stack-form" onSubmit={createOpenIssue}>
                  <label>
                    Заголовок
                    <input
                      value={issueForm.title}
                      onChange={(event) => setIssueForm({ ...issueForm, title: event.target.value })}
                      placeholder="Например: поставщик не подтвердил SLA"
                    />
                  </label>
                  <div className="two-col">
                    <label>
                      Severity
                      <select
                        value={issueForm.severity}
                        onChange={(event) => setIssueForm({ ...issueForm, severity: event.target.value as Issue['severity'] })}
                      >
                        <option value="CRITICAL">Critical</option>
                        <option value="HIGH">High</option>
                        <option value="MEDIUM">Medium</option>
                        <option value="LOW">Low</option>
                      </select>
                    </label>
                    <label>
                      Owner
                      <input
                        value={issueForm.owner}
                        onChange={(event) => setIssueForm({ ...issueForm, owner: event.target.value })}
                        placeholder="PM / Vendor / IT Ops"
                      />
                    </label>
                  </div>
                  <label>
                    Impact
                    <textarea
                      value={issueForm.impact}
                      onChange={(event) => setIssueForm({ ...issueForm, impact: event.target.value })}
                      rows={3}
                      placeholder="Влияние на сроки, бюджет, scope или решение руководства"
                    />
                  </label>
                  <div className="two-col">
                    <label>
                      Due date
                      <input
                        type="date"
                        value={issueForm.dueDate}
                        onChange={(event) => setIssueForm({ ...issueForm, dueDate: event.target.value })}
                      />
                    </label>
                    <label className="checkbox-line">
                      <input
                        type="checkbox"
                        checked={issueForm.decisionRequired}
                        onChange={(event) => setIssueForm({ ...issueForm, decisionRequired: event.target.checked })}
                      />
                      Требует решения
                    </label>
                  </div>
                  <div className="two-col">
                    <label>
                      Jira key
                      <input
                        value={issueForm.jiraTicketKey}
                        onChange={(event) => setIssueForm({ ...issueForm, jiraTicketKey: event.target.value })}
                        placeholder="ERP-1842"
                      />
                    </label>
                    <label>
                      Jira URL
                      <input
                        value={issueForm.jiraTicketUrl}
                        onChange={(event) => setIssueForm({ ...issueForm, jiraTicketUrl: event.target.value })}
                        placeholder="https://company.atlassian.net/browse/ERP-1842"
                      />
                    </label>
                  </div>
                  <button type="submit" disabled={creatingIssue}>{creatingIssue ? 'Создаю...' : 'Создать issue'}</button>
                </form>
              </article>

              <article className="panel">
                <div className="panel-title">
                  <div>
                    <h2>Jira Issues Snapshot</h2>
                    <p>Для отчетности и executive overview, не замена Jira Kanban</p>
                  </div>
                  <button className="button" type="button" onClick={syncJira} disabled={syncing}>
                    {syncing ? 'Sync...' : 'Sync now'}
                  </button>
                </div>
                <div className="table">
                  <div className="table-head">
                    <span>Key</span><span>Status</span><span>Priority</span><span>Assignee</span>
                  </div>
                  {project.jiraSnapshots.map((issue) => (
                    <a className="table-row" key={issue.id} href={issue.issueUrl} target="_blank" rel="noreferrer">
                      <span>{issue.issueKey}</span>
                      <span>{issue.status}</span>
                      <span>{issue.priority}</span>
                      <span>{issue.assignee ?? 'unassigned'}</span>
                    </a>
                  ))}
                </div>
              </article>

              <article className="panel">
                <div className="panel-title">
                  <div>
                    <h2>Управленческие задачи</h2>
                    <p>Каждая задача может ссылаться на Jira ticket</p>
                  </div>
                </div>
                <div className="task-list">
                  {project.tasks.map((task) => (
                    <div className="task-row" key={task.id}>
                      <div>
                        <h3>{task.title}</h3>
                        <p>{task.owner} / {task.status} / due {date(task.dueDate)}</p>
                        <div className="task-edit">
                          <input
                            value={taskDrafts[task.id]?.jiraTicketKey ?? ''}
                            onChange={(event) =>
                              setTaskDrafts({
                                ...taskDrafts,
                                [task.id]: {
                                  ...(taskDrafts[task.id] ?? { jiraTicketUrl: '' }),
                                  jiraTicketKey: event.target.value,
                                },
                              })
                            }
                            placeholder="Jira key"
                          />
                          <input
                            value={taskDrafts[task.id]?.jiraTicketUrl ?? ''}
                            onChange={(event) =>
                              setTaskDrafts({
                                ...taskDrafts,
                                [task.id]: {
                                  ...(taskDrafts[task.id] ?? { jiraTicketKey: '' }),
                                  jiraTicketUrl: event.target.value,
                                },
                              })
                            }
                            placeholder="Jira URL"
                          />
                          <button type="button" onClick={() => saveTaskJiraLink(task.id)}>Save</button>
                        </div>
                      </div>
                      {task.jiraTicketUrl ? (
                        <a className="ticket" href={task.jiraTicketUrl} target="_blank" rel="noreferrer">
                          {task.jiraTicketKey}
                        </a>
                      ) : (
                        <span className="ticket empty">no Jira link</span>
                      )}
                    </div>
                  ))}
                </div>
              </article>

              <article className="panel overview-panel">
                <div className="panel-title">
                  <div>
                    <h2>Executive Overview</h2>
                    <p>Черновик management pack для топ-менеджмента</p>
                  </div>
                  <span className="version">v{latestOverview?.version ?? 0}</span>
                </div>
                {latestOverview && (
                  <>
                    <p className="overview-summary">{latestOverview.executiveSummary}</p>
                    <h3>Нужные решения</h3>
                    {latestOverview.decisions.map((decision) => (
                      <div className="decision" key={decision.title}>
                        <strong>{decision.title}</strong>
                        <span>Approve: {decision.impactIfApproved}</span>
                        <span>Delay: {decision.impactIfDelayed}</span>
                      </div>
                    ))}
                    <h3>Evidence</h3>
                    <div className="evidence-list">
                      {latestOverview.evidence.map((item) => (
                        <span key={`${item.metric}-${item.source}`}>{item.metric}: {item.source}</span>
                      ))}
                    </div>
                  </>
                )}
              </article>
            </section>
          </>
        )}
      </main>
    </div>
  );
}

export default App;
