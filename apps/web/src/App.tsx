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
  status: 'DRAFT' | 'ACTIVE' | 'ON_HOLD' | 'CLOSED';
  rag: RagStatus;
  startDate: string;
  targetDate: string;
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
  milestones: Milestone[];
};

type ProjectFormState = {
  code: string;
  name: string;
  portfolio: string;
  sponsor: string;
  projectManager: string;
  status: 'DRAFT' | 'ACTIVE' | 'ON_HOLD' | 'CLOSED';
  rag: RagStatus;
  startDate: string;
  targetDate: string;
  budgetPlanned: string;
  budgetForecast: string;
  scheduleVariance: string;
  progress: string;
  summary: string;
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
  jiraLinks: JiraLinkDraft[];
};

type Milestone = {
  id: string;
  title: string;
  dueDate: string;
  status: string;
  owner: string;
  description: string | null;
};

type MilestoneFormState = {
  title: string;
  dueDate: string;
  status: string;
  owner: string;
  description: string;
};

type IssueEditDraft = {
  title: string;
  severity: Issue['severity'];
  status: string;
  owner: string;
  impact: string;
  decisionRequired: boolean;
  dueDate: string;
};

type TaskJiraDraft = {
  jiraTicketKey: string;
  jiraTicketUrl: string;
};

type IssueJiraLink = {
  id: string;
  jiraKey: string;
  jiraUrl: string;
};

type JiraLinkDraft = {
  jiraKey: string;
  jiraUrl: string;
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
  jiraLinks: IssueJiraLink[];
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
  generatedAt: string | null;
  publishedAt: string | null;
  executiveSummary: string;
  decisions: Array<{
    title: string;
    impactIfApproved: string;
    impactIfDelayed: string;
    deadline: string | null;
    source?: string;
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
  jiraLinks: [{ jiraKey: '', jiraUrl: '' }],
};

const emptyProjectForm: ProjectFormState = {
  code: '',
  name: '',
  portfolio: '',
  sponsor: '',
  projectManager: '',
  status: 'ACTIVE',
  rag: 'GREEN',
  startDate: '',
  targetDate: '',
  budgetPlanned: '0',
  budgetForecast: '0',
  scheduleVariance: '0',
  progress: '0',
  summary: '',
};

const emptyMilestoneForm: MilestoneFormState = {
  title: '',
  dueDate: '',
  status: 'Planned',
  owner: '',
  description: '',
};

function issueToDraft(issue: Issue): IssueEditDraft {
  return {
    title: issue.title,
    severity: issue.severity,
    status: issue.status,
    owner: issue.owner,
    impact: issue.impact,
    decisionRequired: issue.decisionRequired,
    dueDate: issue.dueDate ? issue.dueDate.slice(0, 10) : '',
  };
}

function projectToForm(project: ProjectDetails | ProjectListItem): ProjectFormState {
  return {
    code: project.code,
    name: project.name,
    portfolio: project.portfolio,
    sponsor: project.sponsor,
    projectManager: project.projectManager,
    status: project.status,
    rag: project.rag,
    startDate: 'startDate' in project ? String(project.startDate).slice(0, 10) : '',
    targetDate: 'targetDate' in project ? String(project.targetDate).slice(0, 10) : '',
    budgetPlanned: String(project.budgetPlanned),
    budgetForecast: String(project.budgetForecast),
    scheduleVariance: String(project.scheduleVariance),
    progress: String(project.progress),
    summary: project.summary,
  };
}

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
  const [generatingOverview, setGeneratingOverview] = useState(false);
  const [publishingOverview, setPublishingOverview] = useState(false);
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
  const [projectForm, setProjectForm] = useState<ProjectFormState>(emptyProjectForm);
  const [newProjectForm, setNewProjectForm] = useState<ProjectFormState>(emptyProjectForm);
  const [milestoneForm, setMilestoneForm] = useState<MilestoneFormState>(emptyMilestoneForm);
  const [taskDrafts, setTaskDrafts] = useState<Record<string, TaskJiraDraft>>({});
  const [issueLinkDrafts, setIssueLinkDrafts] = useState<Record<string, JiraLinkDraft>>({});
  const [issueEditDrafts, setIssueEditDrafts] = useState<Record<string, IssueEditDraft>>({});
  const [expandedIssueId, setExpandedIssueId] = useState<string | null>(null);

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
    setProjectForm(projectToForm(nextProject));
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
    setIssueLinkDrafts(
      Object.fromEntries(nextProject.issues.map((issue) => [issue.id, { jiraKey: '', jiraUrl: '' }])),
    );
    setIssueEditDrafts(Object.fromEntries(nextProject.issues.map((issue) => [issue.id, issueToDraft(issue)])));
    setExpandedIssueId((currentIssueId) =>
      nextProject.issues.some((issue) => issue.id === currentIssueId) ? currentIssueId : null,
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

  async function reloadProjects(selectedId?: string) {
    const response = await fetch(`${apiBase}/api/projects`);
    const data: ProjectListItem[] = await response.json();
    setProjects(data);
    if (selectedId) {
      setSelectedProjectId(selectedId);
    }
  }

  function projectPayload(form: ProjectFormState) {
    return {
      ...form,
      budgetPlanned: Number(form.budgetPlanned),
      budgetForecast: Number(form.budgetForecast),
      scheduleVariance: Number(form.scheduleVariance),
      progress: Number(form.progress),
    };
  }

  async function createProject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setNotice(null);
    try {
      const response = await fetch(`${apiBase}/api/projects`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(projectPayload(newProjectForm)),
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error?.formErrors?.join(', ') || result.error || 'Не удалось создать проект');
      }
      setNewProjectForm(emptyProjectForm);
      await reloadProjects(result.id);
      setNotice(`Проект ${result.code} создан`);
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : 'Не удалось создать проект');
    }
  }

  async function saveProjectProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!project) return;
    setError(null);
    setNotice(null);
    try {
      const response = await fetch(`${apiBase}/api/projects/${project.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(projectPayload(projectForm)),
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error?.formErrors?.join(', ') || result.error || 'Не удалось сохранить проект');
      }
      await reloadProjects(project.id);
      await refreshProject(project.id);
      setNotice('Паспорт проекта обновлен');
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Не удалось сохранить проект');
    }
  }

  async function createMilestone(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!project) return;
    setError(null);
    setNotice(null);
    try {
      const response = await fetch(`${apiBase}/api/projects/${project.id}/milestones`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(milestoneForm),
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error?.formErrors?.join(', ') || result.error || 'Не удалось создать веху');
      }
      setMilestoneForm(emptyMilestoneForm);
      await refreshProject(project.id);
      setNotice('Веха создана');
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : 'Не удалось создать веху');
    }
  }

  async function updateMilestoneStatus(milestoneId: string, status: string) {
    setError(null);
    setNotice(null);
    try {
      const response = await fetch(`${apiBase}/api/milestones/${milestoneId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error?.formErrors?.join(', ') || result.error || 'Не удалось обновить веху');
      }
      await refreshProject();
      setNotice('Статус вехи обновлен');
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Не удалось обновить веху');
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
        jiraLinks: issueForm.jiraLinks.filter((link) => link.jiraKey.trim() && link.jiraUrl.trim()),
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

  function updateIssueFormLink(index: number, patch: Partial<JiraLinkDraft>) {
    setIssueForm({
      ...issueForm,
      jiraLinks: issueForm.jiraLinks.map((link, linkIndex) =>
        linkIndex === index ? { ...link, ...patch } : link,
      ),
    });
  }

  function addIssueFormLink() {
    setIssueForm({
      ...issueForm,
      jiraLinks: [...issueForm.jiraLinks, { jiraKey: '', jiraUrl: '' }],
    });
  }

  function removeIssueFormLink(index: number) {
    setIssueForm({
      ...issueForm,
      jiraLinks:
        issueForm.jiraLinks.length === 1
          ? [{ jiraKey: '', jiraUrl: '' }]
          : issueForm.jiraLinks.filter((_, linkIndex) => linkIndex !== index),
    });
  }

  async function addIssueJiraLink(issueId: string) {
    const draft = issueLinkDrafts[issueId];
    if (!draft?.jiraKey || !draft?.jiraUrl) return;
    setError(null);
    setNotice(null);
    try {
      const response = await fetch(`${apiBase}/api/open-issues/${issueId}/jira-links`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(draft),
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error?.formErrors?.join(', ') || result.error || 'Не удалось добавить Jira ticket');
      }
      await refreshProject();
      setNotice('Jira ticket добавлен к Open Issue');
    } catch (addError) {
      setError(addError instanceof Error ? addError.message : 'Не удалось добавить Jira ticket');
    }
  }

  async function removeIssueJiraLink(issueId: string, linkId: string) {
    setError(null);
    setNotice(null);
    try {
      const response = await fetch(`${apiBase}/api/open-issues/${issueId}/jira-links/${linkId}`, {
        method: 'DELETE',
      });
      if (!response.ok) {
        const result = await response.json();
        throw new Error(result.error ?? 'Не удалось удалить Jira ticket');
      }
      await refreshProject();
      setNotice('Jira ticket удален из Open Issue');
    } catch (removeError) {
      setError(removeError instanceof Error ? removeError.message : 'Не удалось удалить Jira ticket');
    }
  }

  function updateIssueDraft(issueId: string, patch: Partial<IssueEditDraft>) {
    const current = issueEditDrafts[issueId];
    if (!current) return;
    setIssueEditDrafts({
      ...issueEditDrafts,
      [issueId]: { ...current, ...patch },
    });
  }

  async function saveOpenIssue(issueId: string) {
    const draft = issueEditDrafts[issueId];
    if (!draft) return;
    setError(null);
    setNotice(null);
    try {
      const response = await fetch(`${apiBase}/api/open-issues/${issueId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...draft,
          dueDate: draft.dueDate || null,
        }),
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error?.formErrors?.join(', ') || result.error || 'Не удалось сохранить issue');
      }
      await refreshProject();
      setNotice('Open Issue обновлен');
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Не удалось сохранить issue');
    }
  }

  async function closeOpenIssue(issueId: string) {
    const current = issueEditDrafts[issueId];
    if (!current) return;
    setIssueEditDrafts({
      ...issueEditDrafts,
      [issueId]: { ...current, status: 'Resolved', decisionRequired: false },
    });
    await saveOpenIssueWithPayload(issueId, { status: 'Resolved', decisionRequired: false });
  }

  async function saveOpenIssueWithPayload(issueId: string, payload: Partial<IssueEditDraft>) {
    setError(null);
    setNotice(null);
    try {
      const response = await fetch(`${apiBase}/api/open-issues/${issueId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error?.formErrors?.join(', ') || result.error || 'Не удалось сохранить issue');
      }
      await refreshProject();
      setNotice('Open Issue обновлен');
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Не удалось сохранить issue');
    }
  }

  async function generateOverview() {
    if (!project) return;
    setGeneratingOverview(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch(`${apiBase}/api/projects/${project.id}/executive-overviews/generate`, {
        method: 'POST',
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error ?? 'Не удалось сгенерировать overview');
      }
      await refreshProject(project.id);
      setNotice(`Executive overview v${result.version} сгенерирован`);
    } catch (generateError) {
      setError(generateError instanceof Error ? generateError.message : 'Не удалось сгенерировать overview');
    } finally {
      setGeneratingOverview(false);
    }
  }

  async function publishOverview() {
    if (!latestOverview) return;
    setPublishingOverview(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch(`${apiBase}/api/executive-overviews/${latestOverview.id}/publish`, {
        method: 'POST',
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error ?? 'Не удалось опубликовать overview');
      }
      await refreshProject();
      setNotice(`Executive overview v${result.version} опубликован`);
    } catch (publishError) {
      setError(publishError instanceof Error ? publishError.message : 'Не удалось опубликовать overview');
    } finally {
      setPublishingOverview(false);
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
                    <h2>Создать проект</h2>
                    <p>Быстрый intake нового проекта с базовыми полями PMO</p>
                  </div>
                </div>
                <form className="form-grid compact-form" onSubmit={createProject}>
                  <label>
                    Code
                    <input value={newProjectForm.code} onChange={(event) => setNewProjectForm({ ...newProjectForm, code: event.target.value })} placeholder="CRM" />
                  </label>
                  <label>
                    Name
                    <input value={newProjectForm.name} onChange={(event) => setNewProjectForm({ ...newProjectForm, name: event.target.value })} placeholder="CRM migration" />
                  </label>
                  <label>
                    Portfolio
                    <input value={newProjectForm.portfolio} onChange={(event) => setNewProjectForm({ ...newProjectForm, portfolio: event.target.value })} placeholder="Digital Transformation" />
                  </label>
                  <label>
                    PM
                    <input value={newProjectForm.projectManager} onChange={(event) => setNewProjectForm({ ...newProjectForm, projectManager: event.target.value })} placeholder="Project manager" />
                  </label>
                  <label>
                    Sponsor
                    <input value={newProjectForm.sponsor} onChange={(event) => setNewProjectForm({ ...newProjectForm, sponsor: event.target.value })} placeholder="CFO / CIO" />
                  </label>
                  <label>
                    RAG
                    <select value={newProjectForm.rag} onChange={(event) => setNewProjectForm({ ...newProjectForm, rag: event.target.value as RagStatus })}>
                      <option value="GREEN">Green</option>
                      <option value="AMBER">Amber</option>
                      <option value="RED">Red</option>
                    </select>
                  </label>
                  <label>
                    Start
                    <input type="date" value={newProjectForm.startDate} onChange={(event) => setNewProjectForm({ ...newProjectForm, startDate: event.target.value })} />
                  </label>
                  <label>
                    Target
                    <input type="date" value={newProjectForm.targetDate} onChange={(event) => setNewProjectForm({ ...newProjectForm, targetDate: event.target.value })} />
                  </label>
                  <label>
                    Budget planned
                    <input type="number" value={newProjectForm.budgetPlanned} onChange={(event) => setNewProjectForm({ ...newProjectForm, budgetPlanned: event.target.value })} />
                  </label>
                  <label>
                    Budget forecast
                    <input type="number" value={newProjectForm.budgetForecast} onChange={(event) => setNewProjectForm({ ...newProjectForm, budgetForecast: event.target.value })} />
                  </label>
                  <label>
                    Progress
                    <input type="number" min="0" max="100" value={newProjectForm.progress} onChange={(event) => setNewProjectForm({ ...newProjectForm, progress: event.target.value })} />
                  </label>
                  <label>
                    Schedule variance
                    <input type="number" value={newProjectForm.scheduleVariance} onChange={(event) => setNewProjectForm({ ...newProjectForm, scheduleVariance: event.target.value })} />
                  </label>
                  <label className="span-2">
                    Summary
                    <textarea value={newProjectForm.summary} onChange={(event) => setNewProjectForm({ ...newProjectForm, summary: event.target.value })} rows={2} />
                  </label>
                  <div className="form-actions span-2">
                    <button type="submit">Создать проект</button>
                  </div>
                </form>
              </article>

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
                    <h2>Паспорт проекта</h2>
                    <p>Управление health, сроками, бюджетом и базовой сводкой проекта</p>
                  </div>
                </div>
                <form className="form-grid compact-form" onSubmit={saveProjectProfile}>
                  <label>
                    Name
                    <input value={projectForm.name} onChange={(event) => setProjectForm({ ...projectForm, name: event.target.value })} />
                  </label>
                  <label>
                    Portfolio
                    <input value={projectForm.portfolio} onChange={(event) => setProjectForm({ ...projectForm, portfolio: event.target.value })} />
                  </label>
                  <label>
                    Sponsor
                    <input value={projectForm.sponsor} onChange={(event) => setProjectForm({ ...projectForm, sponsor: event.target.value })} />
                  </label>
                  <label>
                    PM
                    <input value={projectForm.projectManager} onChange={(event) => setProjectForm({ ...projectForm, projectManager: event.target.value })} />
                  </label>
                  <label>
                    Status
                    <select value={projectForm.status} onChange={(event) => setProjectForm({ ...projectForm, status: event.target.value as ProjectFormState['status'] })}>
                      <option value="DRAFT">Draft</option>
                      <option value="ACTIVE">Active</option>
                      <option value="ON_HOLD">On hold</option>
                      <option value="CLOSED">Closed</option>
                    </select>
                  </label>
                  <label>
                    RAG
                    <select value={projectForm.rag} onChange={(event) => setProjectForm({ ...projectForm, rag: event.target.value as RagStatus })}>
                      <option value="GREEN">Green</option>
                      <option value="AMBER">Amber</option>
                      <option value="RED">Red</option>
                    </select>
                  </label>
                  <label>
                    Start
                    <input type="date" value={projectForm.startDate} onChange={(event) => setProjectForm({ ...projectForm, startDate: event.target.value })} />
                  </label>
                  <label>
                    Target
                    <input type="date" value={projectForm.targetDate} onChange={(event) => setProjectForm({ ...projectForm, targetDate: event.target.value })} />
                  </label>
                  <label>
                    Budget planned
                    <input type="number" value={projectForm.budgetPlanned} onChange={(event) => setProjectForm({ ...projectForm, budgetPlanned: event.target.value })} />
                  </label>
                  <label>
                    Budget forecast
                    <input type="number" value={projectForm.budgetForecast} onChange={(event) => setProjectForm({ ...projectForm, budgetForecast: event.target.value })} />
                  </label>
                  <label>
                    Progress
                    <input type="number" min="0" max="100" value={projectForm.progress} onChange={(event) => setProjectForm({ ...projectForm, progress: event.target.value })} />
                  </label>
                  <label>
                    Schedule variance
                    <input type="number" value={projectForm.scheduleVariance} onChange={(event) => setProjectForm({ ...projectForm, scheduleVariance: event.target.value })} />
                  </label>
                  <label className="span-2">
                    Summary
                    <textarea value={projectForm.summary} onChange={(event) => setProjectForm({ ...projectForm, summary: event.target.value })} rows={3} />
                  </label>
                  <div className="form-actions span-2">
                    <button type="submit">Сохранить паспорт</button>
                  </div>
                </form>
              </article>

              <article className="panel project-card">
                <div className="panel-title">
                  <div>
                    <h2>Milestones</h2>
                    <p>Контроль ближайших вех проекта и их статусов для executive overview</p>
                  </div>
                </div>
                <div className="milestone-grid">
                  <div className="milestone-list">
                    {project.milestones.map((milestone) => (
                      <div className="milestone-row" key={milestone.id}>
                        <div>
                          <strong>{milestone.title}</strong>
                          <p>{date(milestone.dueDate)} / {milestone.owner}</p>
                          {milestone.description && <span>{milestone.description}</span>}
                        </div>
                        <select value={milestone.status} onChange={(event) => updateMilestoneStatus(milestone.id, event.target.value)}>
                          <option value="Planned">Planned</option>
                          <option value="In Progress">In Progress</option>
                          <option value="At Risk">At Risk</option>
                          <option value="Done">Done</option>
                          <option value="Cancelled">Cancelled</option>
                        </select>
                      </div>
                    ))}
                    {project.milestones.length === 0 && <div className="empty-state">Вехи еще не заданы.</div>}
                  </div>
                  <form className="stack-form compact-form" onSubmit={createMilestone}>
                    <label>
                      Title
                      <input value={milestoneForm.title} onChange={(event) => setMilestoneForm({ ...milestoneForm, title: event.target.value })} placeholder="UAT старт" />
                    </label>
                    <div className="two-col">
                      <label>
                        Due date
                        <input type="date" value={milestoneForm.dueDate} onChange={(event) => setMilestoneForm({ ...milestoneForm, dueDate: event.target.value })} />
                      </label>
                      <label>
                        Status
                        <select value={milestoneForm.status} onChange={(event) => setMilestoneForm({ ...milestoneForm, status: event.target.value })}>
                          <option value="Planned">Planned</option>
                          <option value="In Progress">In Progress</option>
                          <option value="At Risk">At Risk</option>
                          <option value="Done">Done</option>
                          <option value="Cancelled">Cancelled</option>
                        </select>
                      </label>
                    </div>
                    <label>
                      Owner
                      <input value={milestoneForm.owner} onChange={(event) => setMilestoneForm({ ...milestoneForm, owner: event.target.value })} placeholder="PMO / QA Lead / Sponsor" />
                    </label>
                    <label>
                      Description
                      <textarea value={milestoneForm.description} onChange={(event) => setMilestoneForm({ ...milestoneForm, description: event.target.value })} rows={3} />
                    </label>
                    <button type="submit">Добавить веху</button>
                  </form>
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

              <article className="panel overview-panel">
                <div className="panel-title">
                  <div>
                    <h2>Open Issues List</h2>
                    <p>Единый список открытых проблем из Jira и внутреннего RAID</p>
                  </div>
                </div>
                <div className="issue-list">
                  <div className="issue-list-head" aria-hidden="true">
                    <span>Наименование</span>
                    <span>Срок</span>
                    <span>Ответственный</span>
                    <span />
                  </div>
                  {project.issues.map((issue) => (
                    <div className="issue-row" key={issue.id}>
                      <button
                        type="button"
                        className="issue-summary-row"
                        aria-expanded={expandedIssueId === issue.id}
                        aria-controls={`issue-details-${issue.id}`}
                        onClick={() => setExpandedIssueId(expandedIssueId === issue.id ? null : issue.id)}
                      >
                        <span className="issue-summary-title">{issue.title}</span>
                        <span className="issue-summary-cell">{date(issue.dueDate)}</span>
                        <span className="issue-summary-cell">{issue.owner || 'не назначен'}</span>
                        <span className="issue-chevron" aria-hidden="true">
                          {expandedIssueId === issue.id ? '-' : '+'}
                        </span>
                      </button>
                      {expandedIssueId === issue.id && (
                        <div className="issue-details-panel" id={`issue-details-${issue.id}`}>
                          <div className="issue-detail-meta">
                            <span className={`severity ${issue.severity.toLowerCase()}`}>{issue.severity}</span>
                            <span>Статус: {issue.status}</span>
                            <span>Источник: {issue.source}</span>
                            {issue.decisionRequired && <b>Требует решения</b>}
                          </div>
                          <div className="issue-impact">
                            <span>Impact</span>
                            <p>{issue.impact}</p>
                          </div>
                          {issueEditDrafts[issue.id] && (
                            <div className="issue-edit-grid">
                              <input
                                value={issueEditDrafts[issue.id].title}
                                onChange={(event) => updateIssueDraft(issue.id, { title: event.target.value })}
                                placeholder="Title"
                              />
                              <select
                                value={issueEditDrafts[issue.id].severity}
                                onChange={(event) => updateIssueDraft(issue.id, { severity: event.target.value as Issue['severity'] })}
                              >
                                <option value="CRITICAL">Critical</option>
                                <option value="HIGH">High</option>
                                <option value="MEDIUM">Medium</option>
                                <option value="LOW">Low</option>
                              </select>
                              <select
                                value={issueEditDrafts[issue.id].status}
                                onChange={(event) => updateIssueDraft(issue.id, { status: event.target.value })}
                              >
                                <option value="Open">Open</option>
                                <option value="In Progress">In Progress</option>
                                <option value="Blocked">Blocked</option>
                                <option value="Resolved">Resolved</option>
                                <option value="Closed">Closed</option>
                              </select>
                              <input
                                value={issueEditDrafts[issue.id].owner}
                                onChange={(event) => updateIssueDraft(issue.id, { owner: event.target.value })}
                                placeholder="Owner"
                              />
                              <input
                                type="date"
                                value={issueEditDrafts[issue.id].dueDate}
                                onChange={(event) => updateIssueDraft(issue.id, { dueDate: event.target.value })}
                              />
                              <label className="checkbox-line compact-checkbox">
                                <input
                                  type="checkbox"
                                  checked={issueEditDrafts[issue.id].decisionRequired}
                                  onChange={(event) => updateIssueDraft(issue.id, { decisionRequired: event.target.checked })}
                                />
                                Decision
                              </label>
                              <textarea
                                className="span-2"
                                value={issueEditDrafts[issue.id].impact}
                                onChange={(event) => updateIssueDraft(issue.id, { impact: event.target.value })}
                                rows={2}
                              />
                              <div className="issue-actions">
                                <button type="button" onClick={() => saveOpenIssue(issue.id)}>Save issue</button>
                                <button type="button" onClick={() => closeOpenIssue(issue.id)}>Resolve</button>
                              </div>
                            </div>
                          )}
                          <div className="jira-link-list">
                            {issue.jiraLinks.map((link) => (
                              <span className="jira-chip" key={link.id}>
                                <a href={link.jiraUrl} target="_blank" rel="noreferrer">{link.jiraKey}</a>
                                <button type="button" onClick={() => removeIssueJiraLink(issue.id, link.id)}>x</button>
                              </span>
                            ))}
                            {issue.jiraLinks.length === 0 && <span className="muted-inline">Jira tickets not linked</span>}
                          </div>
                          <div className="issue-link-edit">
                            <input
                              value={issueLinkDrafts[issue.id]?.jiraKey ?? ''}
                              onChange={(event) =>
                                setIssueLinkDrafts({
                                  ...issueLinkDrafts,
                                  [issue.id]: {
                                    ...(issueLinkDrafts[issue.id] ?? { jiraUrl: '' }),
                                    jiraKey: event.target.value,
                                  },
                                })
                              }
                              placeholder="Jira key"
                            />
                            <input
                              value={issueLinkDrafts[issue.id]?.jiraUrl ?? ''}
                              onChange={(event) =>
                                setIssueLinkDrafts({
                                  ...issueLinkDrafts,
                                  [issue.id]: {
                                    ...(issueLinkDrafts[issue.id] ?? { jiraKey: '' }),
                                    jiraUrl: event.target.value,
                                  },
                                })
                              }
                              placeholder="Jira URL"
                            />
                            <button type="button" onClick={() => addIssueJiraLink(issue.id)}>Add</button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </article>

              <article className="panel overview-panel">
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
                  <div className="jira-links-editor">
                    <div className="subhead">Связанные Jira tickets</div>
                    {issueForm.jiraLinks.map((link, index) => (
                      <div className="issue-link-edit" key={index}>
                        <input
                          value={link.jiraKey}
                          onChange={(event) => updateIssueFormLink(index, { jiraKey: event.target.value })}
                          placeholder="ERP-1842"
                        />
                        <input
                          value={link.jiraUrl}
                          onChange={(event) => updateIssueFormLink(index, { jiraUrl: event.target.value })}
                          placeholder="https://company.atlassian.net/browse/ERP-1842"
                        />
                        <button type="button" onClick={() => removeIssueFormLink(index)}>Remove</button>
                      </div>
                    ))}
                    <button type="button" onClick={addIssueFormLink}>+ Add Jira ticket</button>
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
                    <p>Детерминированная генерация management pack из текущих данных проекта</p>
                  </div>
                  <div className="overview-actions">
                    <button type="button" onClick={generateOverview} disabled={generatingOverview}>
                      {generatingOverview ? 'Generating...' : 'Generate new version'}
                    </button>
                    <button
                      type="button"
                      onClick={publishOverview}
                      disabled={!latestOverview || latestOverview.status === 'PUBLISHED' || publishingOverview}
                    >
                      {publishingOverview ? 'Publishing...' : 'Publish'}
                    </button>
                    <span className="version">v{latestOverview?.version ?? 0}</span>
                  </div>
                </div>
                {latestOverview && (
                  <>
                    <div className="overview-status-line">
                      <span>Status: <b>{latestOverview.status}</b></span>
                      <span>Generated: {latestOverview.generatedAt ? date(latestOverview.generatedAt) : 'не задано'}</span>
                      <span>Published: {latestOverview.publishedAt ? date(latestOverview.publishedAt) : 'not published'}</span>
                    </div>
                    <p className="overview-summary">{latestOverview.executiveSummary}</p>
                    <div className="overview-columns">
                      <section>
                        <h3>Нужные решения</h3>
                        {latestOverview.decisions.length === 0 && <p>Решения руководства не требуются.</p>}
                        {latestOverview.decisions.map((decision) => (
                          <div className="decision" key={decision.title}>
                            <strong>{decision.title}</strong>
                            <span>Approve: {decision.impactIfApproved}</span>
                            <span>Delay: {decision.impactIfDelayed}</span>
                            {decision.source && <span>Source: {decision.source}</span>}
                          </div>
                        ))}
                      </section>
                      <section>
                        <h3>Evidence</h3>
                        <div className="evidence-list">
                          {latestOverview.evidence.map((item) => (
                            <span key={`${item.metric}-${item.source}`}>{item.metric}: {item.source}</span>
                          ))}
                        </div>
                      </section>
                    </div>
                  </>
                )}
                {!latestOverview && (
                  <div className="empty-state">
                    Нажмите Generate new version, чтобы собрать первый overview из health, бюджета, Jira snapshot и Open Issues List.
                  </div>
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
