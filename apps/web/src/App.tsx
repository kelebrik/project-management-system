import { useEffect, useMemo, useState } from 'react';
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
  const [error, setError] = useState<string | null>(null);

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
      .then((data: ProjectDetails) => setProject(data))
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
      setProject(await refreshed.json());
    } catch (syncError) {
      setError(syncError instanceof Error ? syncError.message : 'Jira sync failed');
    } finally {
      setSyncing(false);
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
