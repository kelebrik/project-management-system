import { type FormEvent, useEffect, useMemo, useState } from "react";
import "./App.css";

type RagStatus = "GREEN" | "AMBER" | "RED";
type WbsItemType = "PHASE" | "WORK_PACKAGE" | "DELIVERABLE" | "TASK";
type WbsItemStatus =
  | "NOT_STARTED"
  | "IN_PROGRESS"
  | "AT_RISK"
  | "BLOCKED"
  | "DONE"
  | "CANCELLED";
type AppView =
  | "portfolio"
  | "project-create"
  | "project-overview"
  | "project-passport"
  | "project-wbs"
  | "project-issues"
  | "project-artifacts"
  | "admin";

type ProjectListItem = {
  id: string;
  parentId: string | null;
  code: string;
  name: string;
  portfolio: string;
  sponsor: string;
  projectManager: string;
  status: "DRAFT" | "ACTIVE" | "ON_HOLD" | "CLOSED";
  rag: RagStatus;
  startDate: string;
  targetDate: string;
  progress: number;
  scheduleVariance: number;
  budgetPlanned: string;
  budgetForecast: string;
  summary: string;
  sortOrder: number;
  jiraIntegration: JiraIntegration | null;
  _count: {
    tasks: number;
    issues: number;
    jiraSnapshots: number;
  };
};

type ProjectTreeItem = ProjectListItem & {
  children: ProjectTreeItem[];
  level: number;
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
  wbsItems: WbsItem[];
};

type ProjectFormState = {
  parentId: string;
  code: string;
  name: string;
  portfolio: string;
  sponsor: string;
  projectManager: string;
  status: "DRAFT" | "ACTIVE" | "ON_HOLD" | "CLOSED";
  rag: RagStatus;
  startDate: string;
  targetDate: string;
  budgetPlanned: string;
  budgetForecast: string;
  scheduleVariance: string;
  progress: string;
  summary: string;
  sortOrder: string;
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

type WbsItem = {
  id: string;
  parentId: string | null;
  code: string;
  title: string;
  type: WbsItemType;
  status: WbsItemStatus;
  owner: string;
  startDate: string | null;
  dueDate: string | null;
  plannedCost: string;
  forecastCost: string;
  progress: number;
  jiraTicketKey: string | null;
  jiraTicketUrl: string | null;
  description: string | null;
  sortOrder: number;
};

type WbsTreeItem = WbsItem & {
  children: WbsTreeItem[];
  level: number;
};

type WbsFormState = {
  parentId: string;
  code: string;
  title: string;
  type: WbsItemType;
  status: WbsItemStatus;
  owner: string;
  startDate: string;
  dueDate: string;
  plannedCost: string;
  forecastCost: string;
  progress: string;
  jiraTicketKey: string;
  jiraTicketUrl: string;
  description: string;
  sortOrder: string;
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
  severity: Issue["severity"];
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
  severity: Issue["severity"];
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
  source: "INTERNAL" | "JIRA";
  title: string;
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
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

const apiBase = import.meta.env.VITE_API_BASE_URL ?? "";

const emptyIssueForm: IssueFormState = {
  title: "",
  severity: "HIGH",
  owner: "",
  impact: "",
  decisionRequired: false,
  dueDate: "",
  jiraLinks: [{ jiraKey: "", jiraUrl: "" }],
};

const emptyProjectForm: ProjectFormState = {
  parentId: "",
  code: "",
  name: "",
  portfolio: "",
  sponsor: "",
  projectManager: "",
  status: "ACTIVE",
  rag: "GREEN",
  startDate: "",
  targetDate: "",
  budgetPlanned: "0",
  budgetForecast: "0",
  scheduleVariance: "0",
  progress: "0",
  summary: "",
  sortOrder: "0",
};

const emptyMilestoneForm: MilestoneFormState = {
  title: "",
  dueDate: "",
  status: "Planned",
  owner: "",
  description: "",
};

const emptyWbsForm: WbsFormState = {
  parentId: "",
  code: "",
  title: "",
  type: "TASK",
  status: "NOT_STARTED",
  owner: "",
  startDate: "",
  dueDate: "",
  plannedCost: "0",
  forecastCost: "0",
  progress: "0",
  jiraTicketKey: "",
  jiraTicketUrl: "",
  description: "",
  sortOrder: "0",
};

function issueToDraft(issue: Issue): IssueEditDraft {
  return {
    title: issue.title,
    severity: issue.severity,
    status: issue.status,
    owner: issue.owner,
    impact: issue.impact,
    decisionRequired: issue.decisionRequired,
    dueDate: issue.dueDate ? issue.dueDate.slice(0, 10) : "",
  };
}

function wbsToForm(item: WbsItem): WbsFormState {
  return {
    parentId: item.parentId ?? "",
    code: item.code,
    title: item.title,
    type: item.type,
    status: item.status,
    owner: item.owner,
    startDate: item.startDate ? item.startDate.slice(0, 10) : "",
    dueDate: item.dueDate ? item.dueDate.slice(0, 10) : "",
    plannedCost: String(item.plannedCost),
    forecastCost: String(item.forecastCost),
    progress: String(item.progress),
    jiraTicketKey: item.jiraTicketKey ?? "",
    jiraTicketUrl: item.jiraTicketUrl ?? "",
    description: item.description ?? "",
    sortOrder: String(item.sortOrder),
  };
}

function projectToForm(
  project: ProjectDetails | ProjectListItem,
): ProjectFormState {
  return {
    parentId: project.parentId ?? "",
    code: project.code,
    name: project.name,
    portfolio: project.portfolio,
    sponsor: project.sponsor,
    projectManager: project.projectManager,
    status: project.status,
    rag: project.rag,
    startDate:
      "startDate" in project ? String(project.startDate).slice(0, 10) : "",
    targetDate:
      "targetDate" in project ? String(project.targetDate).slice(0, 10) : "",
    budgetPlanned: String(project.budgetPlanned),
    budgetForecast: String(project.budgetForecast),
    scheduleVariance: String(project.scheduleVariance),
    progress: String(project.progress),
    summary: project.summary,
    sortOrder: String(project.sortOrder),
  };
}

function currency(value: string) {
  return new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency: "RUB",
    maximumFractionDigits: 0,
  }).format(Number(value));
}

function date(value: string | null) {
  if (!value) return "не задано";
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(value));
}

function daysBetween(start: Date, end: Date) {
  return Math.max(
    0,
    Math.round((end.getTime() - start.getTime()) / 86_400_000),
  );
}

function projectOptionLabel(project: ProjectListItem) {
  return `${project.code} - ${project.name}`;
}

function ragLabel(rag: RagStatus) {
  return rag === "GREEN"
    ? "On Track"
    : rag === "AMBER"
      ? "At Risk"
      : "Critical";
}

function wbsStatusLabel(status: WbsItemStatus) {
  const labels: Record<WbsItemStatus, string> = {
    NOT_STARTED: "Not started",
    IN_PROGRESS: "In progress",
    AT_RISK: "At risk",
    BLOCKED: "Blocked",
    DONE: "Done",
    CANCELLED: "Cancelled",
  };
  return labels[status];
}

function wbsTypeLabel(type: WbsItemType) {
  const labels: Record<WbsItemType, string> = {
    PHASE: "Phase",
    WORK_PACKAGE: "Work package",
    DELIVERABLE: "Deliverable",
    TASK: "Task",
  };
  return labels[type];
}

function buildWbsTree(items: WbsItem[]) {
  const byId = new Map<string, WbsTreeItem>();
  const roots: WbsTreeItem[] = [];

  items.forEach((item) => {
    byId.set(item.id, { ...item, children: [], level: 0 });
  });

  items.forEach((item) => {
    const treeItem = byId.get(item.id);
    if (!treeItem) return;
    const parent = item.parentId ? byId.get(item.parentId) : null;
    if (parent) {
      parent.children.push(treeItem);
    } else {
      roots.push(treeItem);
    }
  });

  const flatten = (nodes: WbsTreeItem[], level = 0): WbsTreeItem[] =>
    nodes.flatMap((node) => {
      node.level = level;
      return [node, ...flatten(node.children, level + 1)];
    });

  return flatten(roots);
}

function buildProjectTree(items: ProjectListItem[]) {
  const byId = new Map<string, ProjectTreeItem>();
  const roots: ProjectTreeItem[] = [];

  items.forEach((item) => {
    byId.set(item.id, { ...item, children: [], level: 0 });
  });

  items.forEach((item) => {
    const treeItem = byId.get(item.id);
    if (!treeItem) return;
    const parent = item.parentId ? byId.get(item.parentId) : null;
    if (parent) {
      parent.children.push(treeItem);
    } else {
      roots.push(treeItem);
    }
  });

  const flatten = (nodes: ProjectTreeItem[], level = 0): ProjectTreeItem[] =>
    nodes.flatMap((node) => {
      node.level = level;
      return [node, ...flatten(node.children, level + 1)];
    });

  return flatten(roots);
}

function App() {
  const [projects, setProjects] = useState<ProjectListItem[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(
    null,
  );
  const [project, setProject] = useState<ProjectDetails | null>(null);
  const [activeView, setActiveView] = useState<AppView>("portfolio");
  const [projectSearch, setProjectSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [savingJira, setSavingJira] = useState(false);
  const [creatingIssue, setCreatingIssue] = useState(false);
  const [generatingOverview, setGeneratingOverview] = useState(false);
  const [publishingOverview, setPublishingOverview] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [jiraForm, setJiraForm] = useState<JiraFormState>({
    baseUrl: "",
    boardUrl: "",
    projectKey: "",
    issuesJql: "",
    openIssuesJql: "",
  });
  const [issueForm, setIssueForm] = useState<IssueFormState>(emptyIssueForm);
  const [projectForm, setProjectForm] =
    useState<ProjectFormState>(emptyProjectForm);
  const [newProjectForm, setNewProjectForm] =
    useState<ProjectFormState>(emptyProjectForm);
  const [milestoneForm, setMilestoneForm] =
    useState<MilestoneFormState>(emptyMilestoneForm);
  const [wbsForm, setWbsForm] = useState<WbsFormState>(emptyWbsForm);
  const [wbsDrafts, setWbsDrafts] = useState<Record<string, WbsFormState>>({});
  const [expandedWbsId, setExpandedWbsId] = useState<string | null>(null);
  const [taskDrafts, setTaskDrafts] = useState<Record<string, TaskJiraDraft>>(
    {},
  );
  const [issueLinkDrafts, setIssueLinkDrafts] = useState<
    Record<string, JiraLinkDraft>
  >({});
  const [issueEditDrafts, setIssueEditDrafts] = useState<
    Record<string, IssueEditDraft>
  >({});
  const [expandedIssueId, setExpandedIssueId] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${apiBase}/api/projects`)
      .then((response) => response.json())
      .then((data: ProjectListItem[]) => {
        const firstProject = data[0];
        setProjects(data);
        setSelectedProjectId(firstProject?.id ?? null);
        setProjectSearch(firstProject ? projectOptionLabel(firstProject) : "");
      })
      .catch(() => setError("Не удалось загрузить список проектов"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!selectedProjectId) return;
    fetch(`${apiBase}/api/projects/${selectedProjectId}/overview`)
      .then((response) => response.json())
      .then((data: ProjectDetails) => applyProject(data))
      .catch(() => setError("Не удалось загрузить проект"));
  }, [selectedProjectId]);

  const latestOverview = project?.overviews[0];
  const projectTree = useMemo(() => buildProjectTree(projects), [projects]);
  const selectedProjectListItem = useMemo(
    () => projects.find((item) => item.id === selectedProjectId) ?? null,
    [projects, selectedProjectId],
  );
  const portfolioStats = useMemo(() => {
    const activeProjects = projects.filter(
      (item) => item.status === "ACTIVE",
    ).length;
    const redProjects = projects.filter((item) => item.rag === "RED").length;
    const amberProjects = projects.filter(
      (item) => item.rag === "AMBER",
    ).length;
    const openIssues = projects.reduce(
      (sum, item) => sum + item._count.issues,
      0,
    );
    const averageProgress =
      projects.length === 0
        ? 0
        : Math.round(
            projects.reduce((sum, item) => sum + item.progress, 0) /
              projects.length,
          );

    return {
      activeProjects,
      redProjects,
      amberProjects,
      openIssues,
      averageProgress,
    };
  }, [projects]);
  const budgetVariance = useMemo(() => {
    if (!project) return 0;
    return (
      (Number(project.budgetForecast) / Number(project.budgetPlanned) - 1) * 100
    );
  }, [project]);
  const wbsTree = useMemo(
    () => buildWbsTree(project?.wbsItems ?? []),
    [project?.wbsItems],
  );
  const wbsSummary = useMemo(() => {
    const items = project?.wbsItems ?? [];
    const planned = items.reduce(
      (sum, item) => sum + Number(item.plannedCost),
      0,
    );
    const forecast = items.reduce(
      (sum, item) => sum + Number(item.forecastCost),
      0,
    );
    const completed = items.filter((item) => item.status === "DONE").length;
    const atRisk = items.filter(
      (item) => item.status === "AT_RISK" || item.status === "BLOCKED",
    ).length;
    return { planned, forecast, completed, atRisk };
  }, [project?.wbsItems]);
  const wbsGantt = useMemo(() => {
    const datedItems = wbsTree
      .map((item) => {
        const start = item.startDate ? new Date(item.startDate) : null;
        const end = item.dueDate ? new Date(item.dueDate) : null;
        if (
          !start ||
          !end ||
          Number.isNaN(start.getTime()) ||
          Number.isNaN(end.getTime())
        ) {
          return null;
        }
        return { item, start, end };
      })
      .filter(
        (item): item is { item: WbsTreeItem; start: Date; end: Date } =>
          item !== null,
      );

    if (datedItems.length === 0) {
      return {
        start: null as Date | null,
        end: null as Date | null,
        items: [],
      };
    }

    const start = new Date(
      Math.min(...datedItems.map((item) => item.start.getTime())),
    );
    const end = new Date(
      Math.max(...datedItems.map((item) => item.end.getTime())),
    );
    const totalDays = Math.max(1, daysBetween(start, end) + 1);

    return {
      start,
      end,
      items: datedItems.map(({ item, start: itemStart, end: itemEnd }) => ({
        item,
        offset: (daysBetween(start, itemStart) / totalDays) * 100,
        width: Math.max(
          3,
          ((daysBetween(itemStart, itemEnd) + 1) / totalDays) * 100,
        ),
      })),
    };
  }, [wbsTree]);
  const projectArtifacts = useMemo(() => {
    if (!project) return [];
    return [
      {
        title: "Паспорт проекта",
        type: "Project charter",
        owner: project.projectManager,
        status: project.summary ? "Ready" : "Draft",
        source: project.code,
        action: "project-passport" as AppView,
      },
      {
        title: "WBS baseline",
        type: "Planning baseline",
        owner: "PMO",
        status: project.wbsItems.length > 0 ? "Ready" : "Draft",
        source: `${project.wbsItems.length} WBS items`,
        action: "project-wbs" as AppView,
      },
      {
        title: "Open Issues List",
        type: "RAID log",
        owner: project.projectManager,
        status: project.issues.length > 0 ? "Active" : "Empty",
        source: `${project.issues.length} open issues`,
        action: "project-issues" as AppView,
      },
      {
        title: "Executive Overview",
        type: "Management pack",
        owner: "PMO",
        status: latestOverview ? latestOverview.status : "Not generated",
        source: latestOverview ? `v${latestOverview.version}` : "no version",
        action: "project-overview" as AppView,
      },
      {
        title: "Jira board snapshot",
        type: "Integration evidence",
        owner: "Admin Back",
        status: project.jiraIntegration?.syncStatus ?? "Not configured",
        source: `${project.jiraSnapshots.length} Jira issues`,
        action: "admin" as AppView,
      },
    ];
  }, [latestOverview, project]);

  async function syncJira() {
    if (!project) return;
    setSyncing(true);
    setError(null);
    try {
      const response = await fetch(
        `${apiBase}/api/projects/${project.id}/jira/sync`,
        {
          method: "POST",
        },
      );
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error ?? "Jira sync failed");
      }
      const refreshed = await fetch(
        `${apiBase}/api/projects/${project.id}/overview`,
      );
      applyProject(await refreshed.json());
    } catch (syncError) {
      setError(
        syncError instanceof Error ? syncError.message : "Jira sync failed",
      );
    } finally {
      setSyncing(false);
    }
  }

  function applyProject(nextProject: ProjectDetails) {
    setProject(nextProject);
    setProjectForm(projectToForm(nextProject));
    setJiraForm({
      baseUrl: nextProject.jiraIntegration?.baseUrl ?? "",
      boardUrl: nextProject.jiraIntegration?.boardUrl ?? "",
      projectKey: nextProject.jiraIntegration?.projectKey ?? "",
      issuesJql: nextProject.jiraIntegration?.issuesJql ?? "",
      openIssuesJql: nextProject.jiraIntegration?.openIssuesJql ?? "",
    });
    setTaskDrafts(
      Object.fromEntries(
        nextProject.tasks.map((task) => [
          task.id,
          {
            jiraTicketKey: task.jiraTicketKey ?? "",
            jiraTicketUrl: task.jiraTicketUrl ?? "",
          },
        ]),
      ),
    );
    setIssueLinkDrafts(
      Object.fromEntries(
        nextProject.issues.map((issue) => [
          issue.id,
          { jiraKey: "", jiraUrl: "" },
        ]),
      ),
    );
    setIssueEditDrafts(
      Object.fromEntries(
        nextProject.issues.map((issue) => [issue.id, issueToDraft(issue)]),
      ),
    );
    setExpandedIssueId((currentIssueId) =>
      nextProject.issues.some((issue) => issue.id === currentIssueId)
        ? currentIssueId
        : null,
    );
    setWbsDrafts(
      Object.fromEntries(
        nextProject.wbsItems.map((item) => [item.id, wbsToForm(item)]),
      ),
    );
    setExpandedWbsId((currentItemId) =>
      nextProject.wbsItems.some((item) => item.id === currentItemId)
        ? currentItemId
        : null,
    );
  }

  async function refreshProject(projectId = project?.id) {
    if (!projectId) return;
    const refreshed = await fetch(
      `${apiBase}/api/projects/${projectId}/overview`,
    );
    applyProject(await refreshed.json());
  }

  async function saveJiraIntegration(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!project) return;
    setSavingJira(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch(
        `${apiBase}/api/projects/${project.id}/jira-integration`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(jiraForm),
        },
      );
      const result = await response.json();
      if (!response.ok) {
        throw new Error(
          result.error?.formErrors?.join(", ") ||
            result.error ||
            "Не удалось сохранить Jira",
        );
      }
      await refreshProject(project.id);
      setNotice("Jira-настройки сохранены");
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Не удалось сохранить Jira",
      );
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
      const selected = data.find((item) => item.id === selectedId);
      setProjectSearch(selected ? projectOptionLabel(selected) : "");
    }
  }

  function projectPayload(form: ProjectFormState) {
    return {
      ...form,
      parentId: form.parentId || null,
      budgetPlanned: Number(form.budgetPlanned),
      budgetForecast: Number(form.budgetForecast),
      scheduleVariance: Number(form.scheduleVariance),
      progress: Number(form.progress),
      sortOrder: Number(form.sortOrder),
    };
  }

  async function createProject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setNotice(null);
    try {
      const response = await fetch(`${apiBase}/api/projects`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(projectPayload(newProjectForm)),
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(
          result.error?.formErrors?.join(", ") ||
            result.error ||
            "Не удалось создать проект",
        );
      }
      setNewProjectForm(emptyProjectForm);
      await reloadProjects(result.id);
      setNotice(`Проект ${result.code} создан`);
    } catch (createError) {
      setError(
        createError instanceof Error
          ? createError.message
          : "Не удалось создать проект",
      );
    }
  }

  async function saveProjectProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!project) return;
    setError(null);
    setNotice(null);
    try {
      const response = await fetch(`${apiBase}/api/projects/${project.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(projectPayload(projectForm)),
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(
          result.error?.formErrors?.join(", ") ||
            result.error ||
            "Не удалось сохранить проект",
        );
      }
      await reloadProjects(project.id);
      await refreshProject(project.id);
      setNotice("Паспорт проекта обновлен");
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Не удалось сохранить проект",
      );
    }
  }

  async function createMilestone(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!project) return;
    setError(null);
    setNotice(null);
    try {
      const response = await fetch(
        `${apiBase}/api/projects/${project.id}/milestones`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(milestoneForm),
        },
      );
      const result = await response.json();
      if (!response.ok) {
        throw new Error(
          result.error?.formErrors?.join(", ") ||
            result.error ||
            "Не удалось создать веху",
        );
      }
      setMilestoneForm(emptyMilestoneForm);
      await refreshProject(project.id);
      setNotice("Веха создана");
    } catch (createError) {
      setError(
        createError instanceof Error
          ? createError.message
          : "Не удалось создать веху",
      );
    }
  }

  async function updateMilestoneStatus(milestoneId: string, status: string) {
    setError(null);
    setNotice(null);
    try {
      const response = await fetch(`${apiBase}/api/milestones/${milestoneId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(
          result.error?.formErrors?.join(", ") ||
            result.error ||
            "Не удалось обновить веху",
        );
      }
      await refreshProject();
      setNotice("Статус вехи обновлен");
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Не удалось обновить веху",
      );
    }
  }

  function wbsPayload(form: WbsFormState) {
    return {
      ...form,
      parentId: form.parentId || null,
      startDate: form.startDate || null,
      dueDate: form.dueDate || null,
      plannedCost: Number(form.plannedCost),
      forecastCost: Number(form.forecastCost),
      progress: Number(form.progress),
      jiraTicketKey: form.jiraTicketKey || null,
      jiraTicketUrl: form.jiraTicketUrl || null,
      description: form.description || null,
      sortOrder: Number(form.sortOrder),
    };
  }

  function updateWbsDraft(itemId: string, patch: Partial<WbsFormState>) {
    const current = wbsDrafts[itemId];
    if (!current) return;
    setWbsDrafts({
      ...wbsDrafts,
      [itemId]: { ...current, ...patch },
    });
  }

  async function createWbsItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!project) return;
    setError(null);
    setNotice(null);
    try {
      const response = await fetch(
        `${apiBase}/api/projects/${project.id}/wbs-items`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(wbsPayload(wbsForm)),
        },
      );
      const result = await response.json();
      if (!response.ok) {
        throw new Error(
          result.error?.formErrors?.join(", ") ||
            result.error ||
            "Не удалось создать WBS элемент",
        );
      }
      setWbsForm({ ...emptyWbsForm, parentId: wbsForm.parentId });
      await refreshProject(project.id);
      setExpandedWbsId(result.id);
      setNotice("WBS элемент создан");
    } catch (createError) {
      setError(
        createError instanceof Error
          ? createError.message
          : "Не удалось создать WBS элемент",
      );
    }
  }

  async function saveWbsItem(itemId: string) {
    const draft = wbsDrafts[itemId];
    if (!draft) return;
    setError(null);
    setNotice(null);
    try {
      const response = await fetch(`${apiBase}/api/wbs-items/${itemId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(wbsPayload(draft)),
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(
          result.error?.formErrors?.join(", ") ||
            result.error ||
            "Не удалось сохранить WBS элемент",
        );
      }
      await refreshProject();
      setNotice("WBS элемент обновлен");
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Не удалось сохранить WBS элемент",
      );
    }
  }

  async function deleteWbsItem(itemId: string) {
    if (!window.confirm("Удалить WBS элемент и все дочерние элементы?")) return;
    setError(null);
    setNotice(null);
    try {
      const response = await fetch(`${apiBase}/api/wbs-items/${itemId}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        const result = await response.json();
        throw new Error(result.error ?? "Не удалось удалить WBS элемент");
      }
      await refreshProject();
      setNotice("WBS элемент удален");
    } catch (deleteError) {
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : "Не удалось удалить WBS элемент",
      );
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
        jiraLinks: issueForm.jiraLinks.filter(
          (link) => link.jiraKey.trim() && link.jiraUrl.trim(),
        ),
      };
      const response = await fetch(
        `${apiBase}/api/projects/${project.id}/open-issues`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      const result = await response.json();
      if (!response.ok) {
        throw new Error(
          result.error?.formErrors?.join(", ") ||
            result.error ||
            "Не удалось создать issue",
        );
      }
      setIssueForm(emptyIssueForm);
      await refreshProject(project.id);
      setNotice("Open issue создан");
    } catch (createError) {
      setError(
        createError instanceof Error
          ? createError.message
          : "Не удалось создать issue",
      );
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
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jiraTicketKey: draft.jiraTicketKey || null,
          jiraTicketUrl: draft.jiraTicketUrl || null,
        }),
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(
          result.error?.formErrors?.join(", ") ||
            result.error ||
            "Не удалось сохранить ссылку",
        );
      }
      await refreshProject();
      setNotice("Jira-ссылка задачи сохранена");
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Не удалось сохранить ссылку",
      );
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
      jiraLinks: [...issueForm.jiraLinks, { jiraKey: "", jiraUrl: "" }],
    });
  }

  function removeIssueFormLink(index: number) {
    setIssueForm({
      ...issueForm,
      jiraLinks:
        issueForm.jiraLinks.length === 1
          ? [{ jiraKey: "", jiraUrl: "" }]
          : issueForm.jiraLinks.filter((_, linkIndex) => linkIndex !== index),
    });
  }

  async function addIssueJiraLink(issueId: string) {
    const draft = issueLinkDrafts[issueId];
    if (!draft?.jiraKey || !draft?.jiraUrl) return;
    setError(null);
    setNotice(null);
    try {
      const response = await fetch(
        `${apiBase}/api/open-issues/${issueId}/jira-links`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(draft),
        },
      );
      const result = await response.json();
      if (!response.ok) {
        throw new Error(
          result.error?.formErrors?.join(", ") ||
            result.error ||
            "Не удалось добавить Jira ticket",
        );
      }
      await refreshProject();
      setNotice("Jira ticket добавлен к Open Issue");
    } catch (addError) {
      setError(
        addError instanceof Error
          ? addError.message
          : "Не удалось добавить Jira ticket",
      );
    }
  }

  async function removeIssueJiraLink(issueId: string, linkId: string) {
    setError(null);
    setNotice(null);
    try {
      const response = await fetch(
        `${apiBase}/api/open-issues/${issueId}/jira-links/${linkId}`,
        {
          method: "DELETE",
        },
      );
      if (!response.ok) {
        const result = await response.json();
        throw new Error(result.error ?? "Не удалось удалить Jira ticket");
      }
      await refreshProject();
      setNotice("Jira ticket удален из Open Issue");
    } catch (removeError) {
      setError(
        removeError instanceof Error
          ? removeError.message
          : "Не удалось удалить Jira ticket",
      );
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
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...draft,
          dueDate: draft.dueDate || null,
        }),
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(
          result.error?.formErrors?.join(", ") ||
            result.error ||
            "Не удалось сохранить issue",
        );
      }
      await refreshProject();
      setNotice("Open Issue обновлен");
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Не удалось сохранить issue",
      );
    }
  }

  async function closeOpenIssue(issueId: string) {
    const current = issueEditDrafts[issueId];
    if (!current) return;
    setIssueEditDrafts({
      ...issueEditDrafts,
      [issueId]: { ...current, status: "Resolved", decisionRequired: false },
    });
    await saveOpenIssueWithPayload(issueId, {
      status: "Resolved",
      decisionRequired: false,
    });
  }

  async function saveOpenIssueWithPayload(
    issueId: string,
    payload: Partial<IssueEditDraft>,
  ) {
    setError(null);
    setNotice(null);
    try {
      const response = await fetch(`${apiBase}/api/open-issues/${issueId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(
          result.error?.formErrors?.join(", ") ||
            result.error ||
            "Не удалось сохранить issue",
        );
      }
      await refreshProject();
      setNotice("Open Issue обновлен");
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Не удалось сохранить issue",
      );
    }
  }

  async function generateOverview() {
    if (!project) return;
    setGeneratingOverview(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch(
        `${apiBase}/api/projects/${project.id}/executive-overviews/generate`,
        {
          method: "POST",
        },
      );
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error ?? "Не удалось сгенерировать overview");
      }
      await refreshProject(project.id);
      setNotice(`Executive overview v${result.version} сгенерирован`);
    } catch (generateError) {
      setError(
        generateError instanceof Error
          ? generateError.message
          : "Не удалось сгенерировать overview",
      );
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
      const response = await fetch(
        `${apiBase}/api/executive-overviews/${latestOverview.id}/publish`,
        {
          method: "POST",
        },
      );
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error ?? "Не удалось опубликовать overview");
      }
      await refreshProject();
      setNotice(`Executive overview v${result.version} опубликован`);
    } catch (publishError) {
      setError(
        publishError instanceof Error
          ? publishError.message
          : "Не удалось опубликовать overview",
      );
    } finally {
      setPublishingOverview(false);
    }
  }

  function selectProject(projectId: string, nextView: AppView = activeView) {
    const selected = projects.find((item) => item.id === projectId);
    setSelectedProjectId(projectId);
    setProjectSearch(selected ? projectOptionLabel(selected) : "");
    setActiveView(
      nextView === "portfolio" || nextView === "project-create"
        ? "project-overview"
        : nextView,
    );
  }

  function selectProjectFromSearch(value: string) {
    setProjectSearch(value);
    const query = value.trim().toLowerCase();
    const match = projects.find((item) => {
      const label = projectOptionLabel(item).toLowerCase();
      return (
        label === query ||
        item.name.toLowerCase() === query ||
        item.code.toLowerCase() === query
      );
    });
    if (match) {
      selectProject(match.id, "project-overview");
    }
  }

  const viewTitle: Record<AppView, string> = {
    portfolio: "Портфель проектов",
    "project-create": "Создать новый проект",
    "project-overview": project
      ? `${project.code} - Overview и вехи`
      : "Overview и вехи",
    "project-passport": project
      ? `${project.code} - Паспорт проекта`
      : "Паспорт проекта",
    "project-wbs": project ? `${project.code} - WBS и Гантт` : "WBS и Гантт",
    "project-issues": project ? `${project.code} - Open Issues` : "Open Issues",
    "project-artifacts": project
      ? `${project.code} - Артефакты проекта`
      : "Артефакты проекта",
    admin: "Admin Back",
  };

  const viewEyebrow =
    activeView === "admin"
      ? "Web UI Back для администратора системы"
      : activeView === "portfolio"
        ? "Web UI Front / портфель"
        : "Web UI Front / проект";

  if (loading) {
    return (
      <main className="loading">Загрузка системы управления проектами...</main>
    );
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">PM</span>
          <span>
            <b>PM System</b>
            <small>Контур управления</small>
          </span>
        </div>
        <nav>
          <button
            type="button"
            className={activeView === "portfolio" ? "active" : ""}
            onClick={() => setActiveView("portfolio")}
          >
            Портфель проектов
          </button>
          <div className="sidebar-group">
            <div className="sidebar-group-title">Проекты</div>
            <button
              type="button"
              className={
                activeView === "project-create" ? "active nested" : "nested"
              }
              onClick={() => setActiveView("project-create")}
            >
              Создать новый проект
            </button>
            <label className="project-picker">
              <span>Проект</span>
              <input
                list="project-options"
                value={projectSearch}
                onChange={(event) =>
                  selectProjectFromSearch(event.target.value)
                }
                placeholder="Поиск по наименованию"
              />
              <datalist id="project-options">
                {projects.map((item) => (
                  <option key={item.id} value={projectOptionLabel(item)} />
                ))}
              </datalist>
            </label>
            {selectedProjectListItem && (
              <div className="project-menu">
                <div className="project-current">
                  <small>Выбранный проект</small>
                  <span
                    className={`rag-dot ${selectedProjectListItem.rag.toLowerCase()}`}
                  />
                  <b>{selectedProjectListItem.code}</b>
                  <span>{selectedProjectListItem.name}</span>
                </div>
                <button
                  type="button"
                  className={
                    activeView === "project-overview"
                      ? "active nested child"
                      : "nested child"
                  }
                  onClick={() => setActiveView("project-overview")}
                >
                  Overview и вехи
                </button>
                <button
                  type="button"
                  className={
                    activeView === "project-passport"
                      ? "active nested child"
                      : "nested child"
                  }
                  onClick={() => setActiveView("project-passport")}
                >
                  Паспорт проекта
                </button>
                <button
                  type="button"
                  className={
                    activeView === "project-wbs"
                      ? "active nested child"
                      : "nested child"
                  }
                  onClick={() => setActiveView("project-wbs")}
                >
                  WBS и Гантт
                </button>
                <button
                  type="button"
                  className={
                    activeView === "project-issues"
                      ? "active nested child"
                      : "nested child"
                  }
                  onClick={() => setActiveView("project-issues")}
                >
                  Open Issues
                </button>
                <button
                  type="button"
                  className={
                    activeView === "project-artifacts"
                      ? "active nested child"
                      : "nested child"
                  }
                  onClick={() => setActiveView("project-artifacts")}
                >
                  Артефакты проекта
                </button>
              </div>
            )}
          </div>
          <button
            type="button"
            className={activeView === "admin" ? "active" : ""}
            onClick={() => setActiveView("admin")}
          >
            Admin Back
          </button>
        </nav>
      </aside>

      <main className="workspace">
        <header className="topbar">
          <div>
            <p className="eyebrow">{viewEyebrow}</p>
            <h1>{viewTitle[activeView]}</h1>
          </div>
          {project && activeView !== "portfolio" && (
            <div className="topbar-project">
              <span>{project.status}</span>
              <b className={`rag ${project.rag.toLowerCase()}`}>
                {ragLabel(project.rag)}
              </b>
            </div>
          )}
        </header>

        {error && <div className="alert">{error}</div>}
        {notice && <div className="notice">{notice}</div>}

        {(project ||
          activeView === "portfolio" ||
          activeView === "project-create") && (
          <>
            {activeView === "portfolio" && (
              <section className="summary-grid">
                <div className="metric">
                  <span>Active Projects</span>
                  <strong>{portfolioStats.activeProjects}</strong>
                  <small>Всего проектов: {projects.length}</small>
                </div>
                <div className="metric">
                  <span>Portfolio Progress</span>
                  <strong>{portfolioStats.averageProgress}%</strong>
                  <div className="progress">
                    <i
                      style={{ width: `${portfolioStats.averageProgress}%` }}
                    />
                  </div>
                </div>
                <div className="metric">
                  <span>Risk Profile</span>
                  <strong>
                    {portfolioStats.redProjects} /{" "}
                    {portfolioStats.amberProjects}
                  </strong>
                  <small>Red / Amber проекты</small>
                </div>
                <div className="metric">
                  <span>Open Issues</span>
                  <strong>{portfolioStats.openIssues}</strong>
                  <small>Открытые проблемы по портфелю</small>
                </div>
              </section>
            )}

            {project &&
              activeView !== "portfolio" &&
              activeView !== "project-create" && (
                <section className="summary-grid">
                  <div className="metric">
                    <span>Project Health</span>
                    <strong className={`rag ${project.rag.toLowerCase()}`}>
                      {ragLabel(project.rag)}
                    </strong>
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
                    <strong>
                      {project.scheduleVariance > 0 ? "+" : ""}
                      {project.scheduleVariance} дней
                    </strong>
                    <small>Относительно baseline</small>
                  </div>
                  <div className="metric">
                    <span>Budget Forecast</span>
                    <strong>
                      {budgetVariance > 0 ? "+" : ""}
                      {budgetVariance.toFixed(1)}%
                    </strong>
                    <small>{currency(project.budgetForecast)}</small>
                  </div>
                </section>
              )}

            {activeView === "portfolio" && (
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
                      onClick={() => setActiveView("project-create")}
                    >
                      Создать проект
                    </button>
                  </div>
                  <div className="project-tree-list">
                    <div className="project-tree-head">
                      <span>Проект</span>
                      <span>PM</span>
                      <span>Прогресс</span>
                      <span>RAG</span>
                    </div>
                    {projectTree.map((item) => (
                      <button
                        type="button"
                        className={`project-tree-row ${item.id === selectedProjectId ? "active" : ""}`}
                        key={item.id}
                        onClick={() =>
                          selectProject(item.id, "project-overview")
                        }
                      >
                        <span
                          className="project-tree-title"
                          style={{ paddingLeft: `${item.level * 18}px` }}
                        >
                          <b>{item.code}</b>
                          {item.name}
                        </span>
                        <span>{item.projectManager}</span>
                        <span>{item.progress}%</span>
                        <span className={`rag-dot ${item.rag.toLowerCase()}`} />
                      </button>
                    ))}
                    {projects.length === 0 && (
                      <div className="empty-state">Проекты еще не созданы.</div>
                    )}
                  </div>
                </article>
              </section>
            )}

            <section className="content-grid">
              {activeView === "project-create" && (
                <article className="panel project-card">
                  <div className="panel-title">
                    <div>
                      <h2>Создать проект</h2>
                      <p>Быстрый intake нового проекта с базовыми полями PMO</p>
                    </div>
                  </div>
                  <form
                    className="form-grid compact-form"
                    onSubmit={createProject}
                  >
                    <label>
                      Code
                      <input
                        value={newProjectForm.code}
                        onChange={(event) =>
                          setNewProjectForm({
                            ...newProjectForm,
                            code: event.target.value,
                          })
                        }
                        placeholder="CRM"
                      />
                    </label>
                    <label>
                      Name
                      <input
                        value={newProjectForm.name}
                        onChange={(event) =>
                          setNewProjectForm({
                            ...newProjectForm,
                            name: event.target.value,
                          })
                        }
                        placeholder="CRM migration"
                      />
                    </label>
                    <label>
                      Parent
                      <select
                        value={newProjectForm.parentId}
                        onChange={(event) =>
                          setNewProjectForm({
                            ...newProjectForm,
                            parentId: event.target.value,
                          })
                        }
                      >
                        <option value="">Root</option>
                        {projectTree.map((item) => (
                          <option key={item.id} value={item.id}>
                            {"- ".repeat(item.level)}
                            {item.code} - {item.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Sort
                      <input
                        type="number"
                        value={newProjectForm.sortOrder}
                        onChange={(event) =>
                          setNewProjectForm({
                            ...newProjectForm,
                            sortOrder: event.target.value,
                          })
                        }
                      />
                    </label>
                    <label>
                      Portfolio
                      <input
                        value={newProjectForm.portfolio}
                        onChange={(event) =>
                          setNewProjectForm({
                            ...newProjectForm,
                            portfolio: event.target.value,
                          })
                        }
                        placeholder="Digital Transformation"
                      />
                    </label>
                    <label>
                      PM
                      <input
                        value={newProjectForm.projectManager}
                        onChange={(event) =>
                          setNewProjectForm({
                            ...newProjectForm,
                            projectManager: event.target.value,
                          })
                        }
                        placeholder="Project manager"
                      />
                    </label>
                    <label>
                      Sponsor
                      <input
                        value={newProjectForm.sponsor}
                        onChange={(event) =>
                          setNewProjectForm({
                            ...newProjectForm,
                            sponsor: event.target.value,
                          })
                        }
                        placeholder="CFO / CIO"
                      />
                    </label>
                    <label>
                      RAG
                      <select
                        value={newProjectForm.rag}
                        onChange={(event) =>
                          setNewProjectForm({
                            ...newProjectForm,
                            rag: event.target.value as RagStatus,
                          })
                        }
                      >
                        <option value="GREEN">Green</option>
                        <option value="AMBER">Amber</option>
                        <option value="RED">Red</option>
                      </select>
                    </label>
                    <label>
                      Start
                      <input
                        type="date"
                        value={newProjectForm.startDate}
                        onChange={(event) =>
                          setNewProjectForm({
                            ...newProjectForm,
                            startDate: event.target.value,
                          })
                        }
                      />
                    </label>
                    <label>
                      Target
                      <input
                        type="date"
                        value={newProjectForm.targetDate}
                        onChange={(event) =>
                          setNewProjectForm({
                            ...newProjectForm,
                            targetDate: event.target.value,
                          })
                        }
                      />
                    </label>
                    <label>
                      Budget planned
                      <input
                        type="number"
                        value={newProjectForm.budgetPlanned}
                        onChange={(event) =>
                          setNewProjectForm({
                            ...newProjectForm,
                            budgetPlanned: event.target.value,
                          })
                        }
                      />
                    </label>
                    <label>
                      Budget forecast
                      <input
                        type="number"
                        value={newProjectForm.budgetForecast}
                        onChange={(event) =>
                          setNewProjectForm({
                            ...newProjectForm,
                            budgetForecast: event.target.value,
                          })
                        }
                      />
                    </label>
                    <label>
                      Progress
                      <input
                        type="number"
                        min="0"
                        max="100"
                        value={newProjectForm.progress}
                        onChange={(event) =>
                          setNewProjectForm({
                            ...newProjectForm,
                            progress: event.target.value,
                          })
                        }
                      />
                    </label>
                    <label>
                      Schedule variance
                      <input
                        type="number"
                        value={newProjectForm.scheduleVariance}
                        onChange={(event) =>
                          setNewProjectForm({
                            ...newProjectForm,
                            scheduleVariance: event.target.value,
                          })
                        }
                      />
                    </label>
                    <label className="span-2">
                      Summary
                      <textarea
                        value={newProjectForm.summary}
                        onChange={(event) =>
                          setNewProjectForm({
                            ...newProjectForm,
                            summary: event.target.value,
                          })
                        }
                        rows={2}
                      />
                    </label>
                    <div className="form-actions span-2">
                      <button type="submit">Создать проект</button>
                    </div>
                  </form>
                </article>
              )}

              {project && activeView === "project-overview" && (
                <article className="panel project-card">
                  <div className="panel-title">
                    <div>
                      <h2>{project.name}</h2>
                      <p>
                        {project.portfolio} / Sponsor: {project.sponsor}
                      </p>
                    </div>
                    {project.jiraIntegration && (
                      <a
                        className="button"
                        href={project.jiraIntegration.boardUrl}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Открыть доску Jira
                      </a>
                    )}
                  </div>
                  <dl className="details">
                    <div>
                      <dt>PM</dt>
                      <dd>{project.projectManager}</dd>
                    </div>
                    <div>
                      <dt>Бюджет</dt>
                      <dd>{currency(project.budgetPlanned)}</dd>
                    </div>
                    <div>
                      <dt>Старт</dt>
                      <dd>{date(project.startDate)}</dd>
                    </div>
                    <div>
                      <dt>Цель</dt>
                      <dd>{date(project.targetDate)}</dd>
                    </div>
                  </dl>
                  <div className="jql">
                    <span>Executive summary source</span>
                    <code>{project.summary}</code>
                  </div>
                </article>
              )}

              {project && activeView === "project-passport" && (
                <article className="panel project-card">
                  <div className="panel-title">
                    <div>
                      <h2>Паспорт проекта</h2>
                      <p>
                        Управление health, сроками, бюджетом и базовой сводкой
                        проекта
                      </p>
                    </div>
                  </div>
                  <form
                    className="form-grid compact-form"
                    onSubmit={saveProjectProfile}
                  >
                    <label>
                      Name
                      <input
                        value={projectForm.name}
                        onChange={(event) =>
                          setProjectForm({
                            ...projectForm,
                            name: event.target.value,
                          })
                        }
                      />
                    </label>
                    <label>
                      Portfolio
                      <input
                        value={projectForm.portfolio}
                        onChange={(event) =>
                          setProjectForm({
                            ...projectForm,
                            portfolio: event.target.value,
                          })
                        }
                      />
                    </label>
                    <label>
                      Sponsor
                      <input
                        value={projectForm.sponsor}
                        onChange={(event) =>
                          setProjectForm({
                            ...projectForm,
                            sponsor: event.target.value,
                          })
                        }
                      />
                    </label>
                    <label>
                      PM
                      <input
                        value={projectForm.projectManager}
                        onChange={(event) =>
                          setProjectForm({
                            ...projectForm,
                            projectManager: event.target.value,
                          })
                        }
                      />
                    </label>
                    <label>
                      Parent
                      <select
                        value={projectForm.parentId}
                        onChange={(event) =>
                          setProjectForm({
                            ...projectForm,
                            parentId: event.target.value,
                          })
                        }
                      >
                        <option value="">Root</option>
                        {projectTree
                          .filter((item) => item.id !== project.id)
                          .map((item) => (
                            <option key={item.id} value={item.id}>
                              {"- ".repeat(item.level)}
                              {item.code} - {item.name}
                            </option>
                          ))}
                      </select>
                    </label>
                    <label>
                      Sort
                      <input
                        type="number"
                        value={projectForm.sortOrder}
                        onChange={(event) =>
                          setProjectForm({
                            ...projectForm,
                            sortOrder: event.target.value,
                          })
                        }
                      />
                    </label>
                    <label>
                      Status
                      <select
                        value={projectForm.status}
                        onChange={(event) =>
                          setProjectForm({
                            ...projectForm,
                            status: event.target
                              .value as ProjectFormState["status"],
                          })
                        }
                      >
                        <option value="DRAFT">Draft</option>
                        <option value="ACTIVE">Active</option>
                        <option value="ON_HOLD">On hold</option>
                        <option value="CLOSED">Closed</option>
                      </select>
                    </label>
                    <label>
                      RAG
                      <select
                        value={projectForm.rag}
                        onChange={(event) =>
                          setProjectForm({
                            ...projectForm,
                            rag: event.target.value as RagStatus,
                          })
                        }
                      >
                        <option value="GREEN">Green</option>
                        <option value="AMBER">Amber</option>
                        <option value="RED">Red</option>
                      </select>
                    </label>
                    <label>
                      Start
                      <input
                        type="date"
                        value={projectForm.startDate}
                        onChange={(event) =>
                          setProjectForm({
                            ...projectForm,
                            startDate: event.target.value,
                          })
                        }
                      />
                    </label>
                    <label>
                      Target
                      <input
                        type="date"
                        value={projectForm.targetDate}
                        onChange={(event) =>
                          setProjectForm({
                            ...projectForm,
                            targetDate: event.target.value,
                          })
                        }
                      />
                    </label>
                    <label>
                      Budget planned
                      <input
                        type="number"
                        value={projectForm.budgetPlanned}
                        onChange={(event) =>
                          setProjectForm({
                            ...projectForm,
                            budgetPlanned: event.target.value,
                          })
                        }
                      />
                    </label>
                    <label>
                      Budget forecast
                      <input
                        type="number"
                        value={projectForm.budgetForecast}
                        onChange={(event) =>
                          setProjectForm({
                            ...projectForm,
                            budgetForecast: event.target.value,
                          })
                        }
                      />
                    </label>
                    <label>
                      Progress
                      <input
                        type="number"
                        min="0"
                        max="100"
                        value={projectForm.progress}
                        onChange={(event) =>
                          setProjectForm({
                            ...projectForm,
                            progress: event.target.value,
                          })
                        }
                      />
                    </label>
                    <label>
                      Schedule variance
                      <input
                        type="number"
                        value={projectForm.scheduleVariance}
                        onChange={(event) =>
                          setProjectForm({
                            ...projectForm,
                            scheduleVariance: event.target.value,
                          })
                        }
                      />
                    </label>
                    <label className="span-2">
                      Summary
                      <textarea
                        value={projectForm.summary}
                        onChange={(event) =>
                          setProjectForm({
                            ...projectForm,
                            summary: event.target.value,
                          })
                        }
                        rows={3}
                      />
                    </label>
                    <div className="form-actions span-2">
                      <button type="submit">Сохранить паспорт</button>
                    </div>
                  </form>
                </article>
              )}

              {project && activeView === "project-overview" && (
                <article className="panel project-card">
                  <div className="panel-title">
                    <div>
                      <h2>Milestones</h2>
                      <p>
                        Контроль ближайших вех проекта и их статусов для
                        executive overview
                      </p>
                    </div>
                  </div>
                  <div className="milestone-grid">
                    <div className="milestone-list">
                      {project.milestones.map((milestone) => (
                        <div className="milestone-row" key={milestone.id}>
                          <div>
                            <strong>{milestone.title}</strong>
                            <p>
                              {date(milestone.dueDate)} / {milestone.owner}
                            </p>
                            {milestone.description && (
                              <span>{milestone.description}</span>
                            )}
                          </div>
                          <select
                            value={milestone.status}
                            onChange={(event) =>
                              updateMilestoneStatus(
                                milestone.id,
                                event.target.value,
                              )
                            }
                          >
                            <option value="Planned">Planned</option>
                            <option value="In Progress">In Progress</option>
                            <option value="At Risk">At Risk</option>
                            <option value="Done">Done</option>
                            <option value="Cancelled">Cancelled</option>
                          </select>
                        </div>
                      ))}
                      {project.milestones.length === 0 && (
                        <div className="empty-state">Вехи еще не заданы.</div>
                      )}
                    </div>
                    <form
                      className="stack-form compact-form"
                      onSubmit={createMilestone}
                    >
                      <label>
                        Title
                        <input
                          value={milestoneForm.title}
                          onChange={(event) =>
                            setMilestoneForm({
                              ...milestoneForm,
                              title: event.target.value,
                            })
                          }
                          placeholder="UAT старт"
                        />
                      </label>
                      <div className="two-col">
                        <label>
                          Due date
                          <input
                            type="date"
                            value={milestoneForm.dueDate}
                            onChange={(event) =>
                              setMilestoneForm({
                                ...milestoneForm,
                                dueDate: event.target.value,
                              })
                            }
                          />
                        </label>
                        <label>
                          Status
                          <select
                            value={milestoneForm.status}
                            onChange={(event) =>
                              setMilestoneForm({
                                ...milestoneForm,
                                status: event.target.value,
                              })
                            }
                          >
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
                        <input
                          value={milestoneForm.owner}
                          onChange={(event) =>
                            setMilestoneForm({
                              ...milestoneForm,
                              owner: event.target.value,
                            })
                          }
                          placeholder="PMO / QA Lead / Sponsor"
                        />
                      </label>
                      <label>
                        Description
                        <textarea
                          value={milestoneForm.description}
                          onChange={(event) =>
                            setMilestoneForm({
                              ...milestoneForm,
                              description: event.target.value,
                            })
                          }
                          rows={3}
                        />
                      </label>
                      <button type="submit">Добавить веху</button>
                    </form>
                  </div>
                </article>
              )}

              {project && activeView === "project-wbs" && (
                <article className="panel project-card">
                  <div className="panel-title">
                    <div>
                      <h2>WBS и Гантт</h2>
                      <p>
                        Иерархия работ проекта: фазы, work packages,
                        deliverables и задачи со связью на Jira
                      </p>
                    </div>
                  </div>
                  <div className="wbs-kpis">
                    <div>
                      <span>Items</span>
                      <strong>{project.wbsItems.length}</strong>
                    </div>
                    <div>
                      <span>Done</span>
                      <strong>{wbsSummary.completed}</strong>
                    </div>
                    <div>
                      <span>At risk / blocked</span>
                      <strong>{wbsSummary.atRisk}</strong>
                    </div>
                    <div>
                      <span>Forecast</span>
                      <strong>{currency(String(wbsSummary.forecast))}</strong>
                      <small>
                        Plan: {currency(String(wbsSummary.planned))}
                      </small>
                    </div>
                  </div>
                  <div className="gantt-panel">
                    <div className="gantt-scale">
                      <span>
                        {wbsGantt.start
                          ? date(wbsGantt.start.toISOString())
                          : "Start"}
                      </span>
                      <span>
                        {wbsGantt.end
                          ? date(wbsGantt.end.toISOString())
                          : "Finish"}
                      </span>
                    </div>
                    <div className="gantt-list">
                      {wbsGantt.items.map(({ item, offset, width }) => (
                        <div className="gantt-row" key={item.id}>
                          <span
                            className="gantt-label"
                            style={{ paddingLeft: `${item.level * 14}px` }}
                          >
                            {item.code} {item.title}
                          </span>
                          <span className="gantt-track">
                            <i
                              className={`gantt-bar ${item.status.toLowerCase().replaceAll("_", "-")}`}
                              style={{ left: `${offset}%`, width: `${width}%` }}
                            />
                          </span>
                        </div>
                      ))}
                      {wbsGantt.items.length === 0 && (
                        <div className="empty-state">
                          Для Гантта нужны start и due даты WBS элементов.
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="wbs-layout">
                    <div className="wbs-list">
                      <div className="wbs-head">
                        <span>WBS / Work</span>
                        <span>Due</span>
                        <span>Owner</span>
                        <span />
                      </div>
                      {wbsTree.map((item) => (
                        <div className="wbs-item" key={item.id}>
                          <button
                            type="button"
                            className="wbs-row"
                            aria-expanded={expandedWbsId === item.id}
                            aria-controls={`wbs-details-${item.id}`}
                            onClick={() =>
                              setExpandedWbsId(
                                expandedWbsId === item.id ? null : item.id,
                              )
                            }
                          >
                            <span
                              className="wbs-title"
                              style={{ paddingLeft: `${item.level * 18}px` }}
                            >
                              <b>{item.code}</b>
                              {item.title}
                            </span>
                            <span>{date(item.dueDate)}</span>
                            <span>{item.owner}</span>
                            <span className="issue-chevron" aria-hidden="true">
                              {expandedWbsId === item.id ? "-" : "+"}
                            </span>
                          </button>
                          {expandedWbsId === item.id && (
                            <div
                              className="wbs-details"
                              id={`wbs-details-${item.id}`}
                            >
                              <div className="wbs-detail-summary">
                                <span>{wbsTypeLabel(item.type)}</span>
                                <span
                                  className={`wbs-status ${item.status.toLowerCase().replaceAll("_", "-")}`}
                                >
                                  {wbsStatusLabel(item.status)}
                                </span>
                                <span>Progress: {item.progress}%</span>
                                <span>Start: {date(item.startDate)}</span>
                                <span>
                                  Planned: {currency(item.plannedCost)}
                                </span>
                                <span>
                                  Forecast: {currency(item.forecastCost)}
                                </span>
                                {item.jiraTicketUrl ? (
                                  <a
                                    href={item.jiraTicketUrl}
                                    target="_blank"
                                    rel="noreferrer"
                                  >
                                    {item.jiraTicketKey || "Jira"}
                                  </a>
                                ) : (
                                  <span>No Jira link</span>
                                )}
                              </div>
                              {item.description && (
                                <p className="wbs-description">
                                  {item.description}
                                </p>
                              )}
                              {wbsDrafts[item.id] && (
                                <div className="wbs-edit-grid">
                                  <label>
                                    Parent
                                    <select
                                      value={wbsDrafts[item.id].parentId}
                                      onChange={(event) =>
                                        updateWbsDraft(item.id, {
                                          parentId: event.target.value,
                                        })
                                      }
                                    >
                                      <option value="">Root</option>
                                      {project.wbsItems
                                        .filter(
                                          (candidate) =>
                                            candidate.id !== item.id,
                                        )
                                        .map((candidate) => (
                                          <option
                                            key={candidate.id}
                                            value={candidate.id}
                                          >
                                            {candidate.code} - {candidate.title}
                                          </option>
                                        ))}
                                    </select>
                                  </label>
                                  <label>
                                    Code
                                    <input
                                      value={wbsDrafts[item.id].code}
                                      onChange={(event) =>
                                        updateWbsDraft(item.id, {
                                          code: event.target.value,
                                        })
                                      }
                                    />
                                  </label>
                                  <label>
                                    Title
                                    <input
                                      value={wbsDrafts[item.id].title}
                                      onChange={(event) =>
                                        updateWbsDraft(item.id, {
                                          title: event.target.value,
                                        })
                                      }
                                    />
                                  </label>
                                  <label>
                                    Type
                                    <select
                                      value={wbsDrafts[item.id].type}
                                      onChange={(event) =>
                                        updateWbsDraft(item.id, {
                                          type: event.target
                                            .value as WbsItemType,
                                        })
                                      }
                                    >
                                      <option value="PHASE">Phase</option>
                                      <option value="WORK_PACKAGE">
                                        Work package
                                      </option>
                                      <option value="DELIVERABLE">
                                        Deliverable
                                      </option>
                                      <option value="TASK">Task</option>
                                    </select>
                                  </label>
                                  <label>
                                    Status
                                    <select
                                      value={wbsDrafts[item.id].status}
                                      onChange={(event) =>
                                        updateWbsDraft(item.id, {
                                          status: event.target
                                            .value as WbsItemStatus,
                                        })
                                      }
                                    >
                                      <option value="NOT_STARTED">
                                        Not started
                                      </option>
                                      <option value="IN_PROGRESS">
                                        In progress
                                      </option>
                                      <option value="AT_RISK">At risk</option>
                                      <option value="BLOCKED">Blocked</option>
                                      <option value="DONE">Done</option>
                                      <option value="CANCELLED">
                                        Cancelled
                                      </option>
                                    </select>
                                  </label>
                                  <label>
                                    Owner
                                    <input
                                      value={wbsDrafts[item.id].owner}
                                      onChange={(event) =>
                                        updateWbsDraft(item.id, {
                                          owner: event.target.value,
                                        })
                                      }
                                    />
                                  </label>
                                  <label>
                                    Start
                                    <input
                                      type="date"
                                      value={wbsDrafts[item.id].startDate}
                                      onChange={(event) =>
                                        updateWbsDraft(item.id, {
                                          startDate: event.target.value,
                                        })
                                      }
                                    />
                                  </label>
                                  <label>
                                    Due
                                    <input
                                      type="date"
                                      value={wbsDrafts[item.id].dueDate}
                                      onChange={(event) =>
                                        updateWbsDraft(item.id, {
                                          dueDate: event.target.value,
                                        })
                                      }
                                    />
                                  </label>
                                  <label>
                                    Planned cost
                                    <input
                                      type="number"
                                      value={wbsDrafts[item.id].plannedCost}
                                      onChange={(event) =>
                                        updateWbsDraft(item.id, {
                                          plannedCost: event.target.value,
                                        })
                                      }
                                    />
                                  </label>
                                  <label>
                                    Forecast cost
                                    <input
                                      type="number"
                                      value={wbsDrafts[item.id].forecastCost}
                                      onChange={(event) =>
                                        updateWbsDraft(item.id, {
                                          forecastCost: event.target.value,
                                        })
                                      }
                                    />
                                  </label>
                                  <label>
                                    Progress
                                    <input
                                      type="number"
                                      min="0"
                                      max="100"
                                      value={wbsDrafts[item.id].progress}
                                      onChange={(event) =>
                                        updateWbsDraft(item.id, {
                                          progress: event.target.value,
                                        })
                                      }
                                    />
                                  </label>
                                  <label>
                                    Sort
                                    <input
                                      type="number"
                                      value={wbsDrafts[item.id].sortOrder}
                                      onChange={(event) =>
                                        updateWbsDraft(item.id, {
                                          sortOrder: event.target.value,
                                        })
                                      }
                                    />
                                  </label>
                                  <label>
                                    Jira key
                                    <input
                                      value={wbsDrafts[item.id].jiraTicketKey}
                                      onChange={(event) =>
                                        updateWbsDraft(item.id, {
                                          jiraTicketKey: event.target.value,
                                        })
                                      }
                                    />
                                  </label>
                                  <label>
                                    Jira URL
                                    <input
                                      value={wbsDrafts[item.id].jiraTicketUrl}
                                      onChange={(event) =>
                                        updateWbsDraft(item.id, {
                                          jiraTicketUrl: event.target.value,
                                        })
                                      }
                                    />
                                  </label>
                                  <label className="span-2">
                                    Description
                                    <textarea
                                      value={wbsDrafts[item.id].description}
                                      onChange={(event) =>
                                        updateWbsDraft(item.id, {
                                          description: event.target.value,
                                        })
                                      }
                                      rows={2}
                                    />
                                  </label>
                                  <div className="wbs-actions span-2">
                                    <button
                                      type="button"
                                      onClick={() => saveWbsItem(item.id)}
                                    >
                                      Save WBS item
                                    </button>
                                    <button
                                      type="button"
                                      className="danger-button"
                                      onClick={() => deleteWbsItem(item.id)}
                                    >
                                      Delete
                                    </button>
                                  </div>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      ))}
                      {project.wbsItems.length === 0 && (
                        <div className="empty-state">WBS еще не создан.</div>
                      )}
                    </div>
                    <form
                      className="stack-form compact-form wbs-form"
                      onSubmit={createWbsItem}
                    >
                      <label>
                        Parent
                        <select
                          value={wbsForm.parentId}
                          onChange={(event) =>
                            setWbsForm({
                              ...wbsForm,
                              parentId: event.target.value,
                            })
                          }
                        >
                          <option value="">Root</option>
                          {wbsTree.map((item) => (
                            <option key={item.id} value={item.id}>
                              {"- ".repeat(item.level)}
                              {item.code} - {item.title}
                            </option>
                          ))}
                        </select>
                      </label>
                      <div className="two-col">
                        <label>
                          Code
                          <input
                            value={wbsForm.code}
                            onChange={(event) =>
                              setWbsForm({
                                ...wbsForm,
                                code: event.target.value,
                              })
                            }
                            placeholder="2.1"
                          />
                        </label>
                        <label>
                          Sort
                          <input
                            type="number"
                            value={wbsForm.sortOrder}
                            onChange={(event) =>
                              setWbsForm({
                                ...wbsForm,
                                sortOrder: event.target.value,
                              })
                            }
                          />
                        </label>
                      </div>
                      <label>
                        Title
                        <input
                          value={wbsForm.title}
                          onChange={(event) =>
                            setWbsForm({
                              ...wbsForm,
                              title: event.target.value,
                            })
                          }
                          placeholder="Integration package"
                        />
                      </label>
                      <div className="two-col">
                        <label>
                          Type
                          <select
                            value={wbsForm.type}
                            onChange={(event) =>
                              setWbsForm({
                                ...wbsForm,
                                type: event.target.value as WbsItemType,
                              })
                            }
                          >
                            <option value="PHASE">Phase</option>
                            <option value="WORK_PACKAGE">Work package</option>
                            <option value="DELIVERABLE">Deliverable</option>
                            <option value="TASK">Task</option>
                          </select>
                        </label>
                        <label>
                          Status
                          <select
                            value={wbsForm.status}
                            onChange={(event) =>
                              setWbsForm({
                                ...wbsForm,
                                status: event.target.value as WbsItemStatus,
                              })
                            }
                          >
                            <option value="NOT_STARTED">Not started</option>
                            <option value="IN_PROGRESS">In progress</option>
                            <option value="AT_RISK">At risk</option>
                            <option value="BLOCKED">Blocked</option>
                            <option value="DONE">Done</option>
                            <option value="CANCELLED">Cancelled</option>
                          </select>
                        </label>
                      </div>
                      <label>
                        Owner
                        <input
                          value={wbsForm.owner}
                          onChange={(event) =>
                            setWbsForm({
                              ...wbsForm,
                              owner: event.target.value,
                            })
                          }
                          placeholder="Delivery Lead"
                        />
                      </label>
                      <div className="two-col">
                        <label>
                          Start
                          <input
                            type="date"
                            value={wbsForm.startDate}
                            onChange={(event) =>
                              setWbsForm({
                                ...wbsForm,
                                startDate: event.target.value,
                              })
                            }
                          />
                        </label>
                        <label>
                          Due
                          <input
                            type="date"
                            value={wbsForm.dueDate}
                            onChange={(event) =>
                              setWbsForm({
                                ...wbsForm,
                                dueDate: event.target.value,
                              })
                            }
                          />
                        </label>
                      </div>
                      <div className="two-col">
                        <label>
                          Planned cost
                          <input
                            type="number"
                            value={wbsForm.plannedCost}
                            onChange={(event) =>
                              setWbsForm({
                                ...wbsForm,
                                plannedCost: event.target.value,
                              })
                            }
                          />
                        </label>
                        <label>
                          Forecast cost
                          <input
                            type="number"
                            value={wbsForm.forecastCost}
                            onChange={(event) =>
                              setWbsForm({
                                ...wbsForm,
                                forecastCost: event.target.value,
                              })
                            }
                          />
                        </label>
                      </div>
                      <label>
                        Progress
                        <input
                          type="number"
                          min="0"
                          max="100"
                          value={wbsForm.progress}
                          onChange={(event) =>
                            setWbsForm({
                              ...wbsForm,
                              progress: event.target.value,
                            })
                          }
                        />
                      </label>
                      <div className="two-col">
                        <label>
                          Jira key
                          <input
                            value={wbsForm.jiraTicketKey}
                            onChange={(event) =>
                              setWbsForm({
                                ...wbsForm,
                                jiraTicketKey: event.target.value,
                              })
                            }
                            placeholder="ERP-1842"
                          />
                        </label>
                        <label>
                          Jira URL
                          <input
                            value={wbsForm.jiraTicketUrl}
                            onChange={(event) =>
                              setWbsForm({
                                ...wbsForm,
                                jiraTicketUrl: event.target.value,
                              })
                            }
                            placeholder="https://company.atlassian.net/browse/ERP-1842"
                          />
                        </label>
                      </div>
                      <label>
                        Description
                        <textarea
                          value={wbsForm.description}
                          onChange={(event) =>
                            setWbsForm({
                              ...wbsForm,
                              description: event.target.value,
                            })
                          }
                          rows={3}
                        />
                      </label>
                      <button type="submit">Добавить WBS элемент</button>
                    </form>
                  </div>
                </article>
              )}

              {project && activeView === "admin" && (
                <article className="panel project-card">
                  <div className="panel-title">
                    <div>
                      <h2>Admin Back: Jira connector</h2>
                      <p>
                        Настройки проекта для deep links, snapshots и Open
                        Issues JQL
                      </p>
                    </div>
                  </div>
                  <form className="form-grid" onSubmit={saveJiraIntegration}>
                    <label>
                      Jira base URL
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
                      Jira board URL
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
                      Project key
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
                      Issues JQL
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
                      Open issues JQL
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

              {project && activeView === "project-issues" && (
                <article className="panel overview-panel">
                  <div className="panel-title">
                    <div>
                      <h2>Open Issues List</h2>
                      <p>
                        Единый список открытых проблем из Jira и внутреннего
                        RAID
                      </p>
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
                          onClick={() =>
                            setExpandedIssueId(
                              expandedIssueId === issue.id ? null : issue.id,
                            )
                          }
                        >
                          <span className="issue-summary-title">
                            {issue.title}
                          </span>
                          <span className="issue-summary-cell">
                            {date(issue.dueDate)}
                          </span>
                          <span className="issue-summary-cell">
                            {issue.owner || "не назначен"}
                          </span>
                          <span className="issue-chevron" aria-hidden="true">
                            {expandedIssueId === issue.id ? "-" : "+"}
                          </span>
                        </button>
                        {expandedIssueId === issue.id && (
                          <div
                            className="issue-details-panel"
                            id={`issue-details-${issue.id}`}
                          >
                            <div className="issue-detail-meta">
                              <span
                                className={`severity ${issue.severity.toLowerCase()}`}
                              >
                                {issue.severity}
                              </span>
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
                                  onChange={(event) =>
                                    updateIssueDraft(issue.id, {
                                      title: event.target.value,
                                    })
                                  }
                                  placeholder="Title"
                                />
                                <select
                                  value={issueEditDrafts[issue.id].severity}
                                  onChange={(event) =>
                                    updateIssueDraft(issue.id, {
                                      severity: event.target
                                        .value as Issue["severity"],
                                    })
                                  }
                                >
                                  <option value="CRITICAL">Critical</option>
                                  <option value="HIGH">High</option>
                                  <option value="MEDIUM">Medium</option>
                                  <option value="LOW">Low</option>
                                </select>
                                <select
                                  value={issueEditDrafts[issue.id].status}
                                  onChange={(event) =>
                                    updateIssueDraft(issue.id, {
                                      status: event.target.value,
                                    })
                                  }
                                >
                                  <option value="Open">Open</option>
                                  <option value="In Progress">
                                    In Progress
                                  </option>
                                  <option value="Blocked">Blocked</option>
                                  <option value="Resolved">Resolved</option>
                                  <option value="Closed">Closed</option>
                                </select>
                                <input
                                  value={issueEditDrafts[issue.id].owner}
                                  onChange={(event) =>
                                    updateIssueDraft(issue.id, {
                                      owner: event.target.value,
                                    })
                                  }
                                  placeholder="Owner"
                                />
                                <input
                                  type="date"
                                  value={issueEditDrafts[issue.id].dueDate}
                                  onChange={(event) =>
                                    updateIssueDraft(issue.id, {
                                      dueDate: event.target.value,
                                    })
                                  }
                                />
                                <label className="checkbox-line compact-checkbox">
                                  <input
                                    type="checkbox"
                                    checked={
                                      issueEditDrafts[issue.id].decisionRequired
                                    }
                                    onChange={(event) =>
                                      updateIssueDraft(issue.id, {
                                        decisionRequired: event.target.checked,
                                      })
                                    }
                                  />
                                  Decision
                                </label>
                                <textarea
                                  className="span-2"
                                  value={issueEditDrafts[issue.id].impact}
                                  onChange={(event) =>
                                    updateIssueDraft(issue.id, {
                                      impact: event.target.value,
                                    })
                                  }
                                  rows={2}
                                />
                                <div className="issue-actions">
                                  <button
                                    type="button"
                                    onClick={() => saveOpenIssue(issue.id)}
                                  >
                                    Save issue
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => closeOpenIssue(issue.id)}
                                  >
                                    Resolve
                                  </button>
                                </div>
                              </div>
                            )}
                            <div className="jira-link-list">
                              {issue.jiraLinks.map((link) => (
                                <span className="jira-chip" key={link.id}>
                                  <a
                                    href={link.jiraUrl}
                                    target="_blank"
                                    rel="noreferrer"
                                  >
                                    {link.jiraKey}
                                  </a>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      removeIssueJiraLink(issue.id, link.id)
                                    }
                                  >
                                    x
                                  </button>
                                </span>
                              ))}
                              {issue.jiraLinks.length === 0 && (
                                <span className="muted-inline">
                                  Jira tickets not linked
                                </span>
                              )}
                            </div>
                            <div className="issue-link-edit">
                              <input
                                value={issueLinkDrafts[issue.id]?.jiraKey ?? ""}
                                onChange={(event) =>
                                  setIssueLinkDrafts({
                                    ...issueLinkDrafts,
                                    [issue.id]: {
                                      ...(issueLinkDrafts[issue.id] ?? {
                                        jiraUrl: "",
                                      }),
                                      jiraKey: event.target.value,
                                    },
                                  })
                                }
                                placeholder="Jira key"
                              />
                              <input
                                value={issueLinkDrafts[issue.id]?.jiraUrl ?? ""}
                                onChange={(event) =>
                                  setIssueLinkDrafts({
                                    ...issueLinkDrafts,
                                    [issue.id]: {
                                      ...(issueLinkDrafts[issue.id] ?? {
                                        jiraKey: "",
                                      }),
                                      jiraUrl: event.target.value,
                                    },
                                  })
                                }
                                placeholder="Jira URL"
                              />
                              <button
                                type="button"
                                onClick={() => addIssueJiraLink(issue.id)}
                              >
                                Add
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </article>
              )}

              {project && activeView === "project-issues" && (
                <article className="panel overview-panel">
                  <div className="panel-title">
                    <div>
                      <h2>Создать Open Issue</h2>
                      <p>
                        Внутренний RAID issue или управленческая проблема со
                        ссылкой на Jira
                      </p>
                    </div>
                  </div>
                  <form className="stack-form" onSubmit={createOpenIssue}>
                    <label>
                      Заголовок
                      <input
                        value={issueForm.title}
                        onChange={(event) =>
                          setIssueForm({
                            ...issueForm,
                            title: event.target.value,
                          })
                        }
                        placeholder="Например: поставщик не подтвердил SLA"
                      />
                    </label>
                    <div className="two-col">
                      <label>
                        Severity
                        <select
                          value={issueForm.severity}
                          onChange={(event) =>
                            setIssueForm({
                              ...issueForm,
                              severity: event.target.value as Issue["severity"],
                            })
                          }
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
                          onChange={(event) =>
                            setIssueForm({
                              ...issueForm,
                              owner: event.target.value,
                            })
                          }
                          placeholder="PM / Vendor / IT Ops"
                        />
                      </label>
                    </div>
                    <label>
                      Impact
                      <textarea
                        value={issueForm.impact}
                        onChange={(event) =>
                          setIssueForm({
                            ...issueForm,
                            impact: event.target.value,
                          })
                        }
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
                          onChange={(event) =>
                            setIssueForm({
                              ...issueForm,
                              dueDate: event.target.value,
                            })
                          }
                        />
                      </label>
                      <label className="checkbox-line">
                        <input
                          type="checkbox"
                          checked={issueForm.decisionRequired}
                          onChange={(event) =>
                            setIssueForm({
                              ...issueForm,
                              decisionRequired: event.target.checked,
                            })
                          }
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
                            onChange={(event) =>
                              updateIssueFormLink(index, {
                                jiraKey: event.target.value,
                              })
                            }
                            placeholder="ERP-1842"
                          />
                          <input
                            value={link.jiraUrl}
                            onChange={(event) =>
                              updateIssueFormLink(index, {
                                jiraUrl: event.target.value,
                              })
                            }
                            placeholder="https://company.atlassian.net/browse/ERP-1842"
                          />
                          <button
                            type="button"
                            onClick={() => removeIssueFormLink(index)}
                          >
                            Remove
                          </button>
                        </div>
                      ))}
                      <button type="button" onClick={addIssueFormLink}>
                        + Add Jira ticket
                      </button>
                    </div>
                    <button type="submit" disabled={creatingIssue}>
                      {creatingIssue ? "Создаю..." : "Создать issue"}
                    </button>
                  </form>
                </article>
              )}

              {project && activeView === "admin" && (
                <article className="panel">
                  <div className="panel-title">
                    <div>
                      <h2>Jira Issues Snapshot</h2>
                      <p>
                        Для отчетности и executive overview, не замена Jira
                        Kanban
                      </p>
                    </div>
                    <button
                      className="button"
                      type="button"
                      onClick={syncJira}
                      disabled={syncing}
                    >
                      {syncing ? "Sync..." : "Sync now"}
                    </button>
                  </div>
                  <div className="table">
                    <div className="table-head">
                      <span>Key</span>
                      <span>Status</span>
                      <span>Priority</span>
                      <span>Assignee</span>
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
                        <span>{issue.assignee ?? "unassigned"}</span>
                      </a>
                    ))}
                  </div>
                </article>
              )}

              {project && activeView === "admin" && (
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
                          <p>
                            {task.owner} / {task.status} / due{" "}
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
                              placeholder="Jira key"
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
                              Save
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
                          <span className="ticket empty">no Jira link</span>
                        )}
                      </div>
                    ))}
                  </div>
                </article>
              )}

              {project && activeView === "project-artifacts" && (
                <article className="panel project-card">
                  <div className="panel-title">
                    <div>
                      <h2>Артефакты проекта</h2>
                      <p>
                        Рабочие управленческие артефакты, собранные из данных
                        проекта
                      </p>
                    </div>
                  </div>
                  <div className="artifact-list">
                    <div className="artifact-head">
                      <span>Артефакт</span>
                      <span>Тип</span>
                      <span>Владелец</span>
                      <span>Статус</span>
                      <span>Источник</span>
                    </div>
                    {projectArtifacts.map((artifact) => (
                      <button
                        type="button"
                        className="artifact-row"
                        key={artifact.title}
                        onClick={() => setActiveView(artifact.action)}
                      >
                        <span>{artifact.title}</span>
                        <span>{artifact.type}</span>
                        <span>{artifact.owner}</span>
                        <span>{artifact.status}</span>
                        <span>{artifact.source}</span>
                      </button>
                    ))}
                  </div>
                </article>
              )}

              {project && activeView === "project-overview" && (
                <article className="panel overview-panel">
                  <div className="panel-title">
                    <div>
                      <h2>Executive Overview</h2>
                      <p>
                        Детерминированная генерация management pack из текущих
                        данных проекта
                      </p>
                    </div>
                    <div className="overview-actions">
                      <button
                        type="button"
                        onClick={generateOverview}
                        disabled={generatingOverview}
                      >
                        {generatingOverview
                          ? "Generating..."
                          : "Generate new version"}
                      </button>
                      <button
                        type="button"
                        onClick={publishOverview}
                        disabled={
                          !latestOverview ||
                          latestOverview.status === "PUBLISHED" ||
                          publishingOverview
                        }
                      >
                        {publishingOverview ? "Publishing..." : "Publish"}
                      </button>
                      <span className="version">
                        v{latestOverview?.version ?? 0}
                      </span>
                    </div>
                  </div>
                  {latestOverview && (
                    <>
                      <div className="overview-status-line">
                        <span>
                          Status: <b>{latestOverview.status}</b>
                        </span>
                        <span>
                          Generated:{" "}
                          {latestOverview.generatedAt
                            ? date(latestOverview.generatedAt)
                            : "не задано"}
                        </span>
                        <span>
                          Published:{" "}
                          {latestOverview.publishedAt
                            ? date(latestOverview.publishedAt)
                            : "not published"}
                        </span>
                      </div>
                      <p className="overview-summary">
                        {latestOverview.executiveSummary}
                      </p>
                      <div className="overview-columns">
                        <section>
                          <h3>Нужные решения</h3>
                          {latestOverview.decisions.length === 0 && (
                            <p>Решения руководства не требуются.</p>
                          )}
                          {latestOverview.decisions.map((decision) => (
                            <div className="decision" key={decision.title}>
                              <strong>{decision.title}</strong>
                              <span>Approve: {decision.impactIfApproved}</span>
                              <span>Delay: {decision.impactIfDelayed}</span>
                              {decision.source && (
                                <span>Source: {decision.source}</span>
                              )}
                            </div>
                          ))}
                        </section>
                        <section>
                          <h3>Evidence</h3>
                          <div className="evidence-list">
                            {latestOverview.evidence.map((item) => (
                              <span key={`${item.metric}-${item.source}`}>
                                {item.metric}: {item.source}
                              </span>
                            ))}
                          </div>
                        </section>
                      </div>
                    </>
                  )}
                  {!latestOverview && (
                    <div className="empty-state">
                      Нажмите Generate new version, чтобы собрать первый
                      overview из health, бюджета, Jira snapshot и Open Issues
                      List.
                    </div>
                  )}
                </article>
              )}
            </section>
          </>
        )}
      </main>
    </div>
  );
}

export default App;
