import type {
  DictionaryItemDraft,
  SystemSettingsDraft,
  UserFormState,
} from "./adminTypes";
import type {
  ArtifactStatus,
  Issue,
  PassportRow,
  ProjectArtifact,
  ProjectDetails,
  ProjectListItem,
  RagStatus,
  RaidItem,
  RaidItemStatus,
  RaidItemType,
  WbsItem,
  WbsDependency,
  WbsItemStatus,
  WbsItemType,
} from "./domainTypes";
import { addMonths, date, isoDate } from "./dateUtils";
import { projectHealthLabel, projectStatusLabel } from "./labels";
import type { ProjectCalendarCode, WbsPredecessorTiming } from "./wbsTable";

export type ProjectFormState = {
  parentId: string;
  businessUnitId: string;
  copyCurrentStructureFrom: Array<{
    projectId: string;
    phaseIds: string[] | null;
  }>;
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

export type ProjectRegistryDraft = {
  parentId: string;
  code: string;
  name: string;
  portfolio: string;
  projectManager: string;
  status: ProjectListItem["status"];
  rag: RagStatus;
  sortOrder: string;
};

export type WbsFormState = {
  parentId: string;
  code: string;
  title: string;
  type: WbsItemType;
  status: WbsItemStatus;
  owner: string;
  startDate: string;
  dueDate: string;
  baselineStartDate: string;
  baselineDueDate: string;
  forecastStartDate: string;
  forecastDueDate: string;
  wbsLevel: string;
  predecessor1: string;
  predecessor2: string;
  predecessor3: string;
  predecessor4: string;
  predecessor5: string;
  predecessor6: string;
  predecessor1Type: WbsPredecessorTiming;
  predecessor2Type: WbsPredecessorTiming;
  predecessor3Type: WbsPredecessorTiming;
  predecessor4Type: WbsPredecessorTiming;
  predecessor5Type: WbsPredecessorTiming;
  predecessor6Type: WbsPredecessorTiming;
  leadLagDays: string;
  workDays: string;
  calendarDays: string;
  calendarCode: ProjectCalendarCode;
  excelStartDate: string;
  excelEndDate: string;
  planWorkDays: string;
  planCalendarDays: string;
  templateColor: string;
  priority: string;
  effortPercent: string;
  plannedCost: string;
  forecastCost: string;
  progress: string;
  jiraTicketKey: string;
  jiraTicketUrl: string;
  mattermostUrl: string;
  description: string;
  comment: string;
  sortOrder: string;
};

export type JiraFormState = {
  baseUrl: string;
  boardUrl: string;
  projectKey: string;
  issuesJql: string;
  openIssuesJql: string;
};

export type JiraWorkSectionDraft = {
  id: string | null;
  sortOrder: number;
  title: string;
  jql: string;
  filterUrl: string;
};

export type IssueFormState = {
  phaseId: string;
  riskId: string;
  category: string;
  title: string;
  referenceLabel: string;
  referenceUrl: string;
  severity: Issue["severity"];
  readiness: RagStatus;
  owner: string;
  impact: string;
  decisionRequired: boolean;
  dueDate: string;
  jiraTicketKey: string;
  jiraLinks: JiraLinkDraft[];
};

export type RaidFormState = {
  type: RaidItemType;
  title: string;
  description: string;
  owner: string;
  status: RaidItemStatus;
  probability: string;
  impact: string;
  mitigationPlan: string;
  contingencyPlan: string;
  dueDate: string;
  residualRisk: string;
  validationDate: string;
  linkedRiskId: string;
  dependencyType: string;
  predecessor: string;
  successor: string;
  supplier: string;
  jiraTicketKey: string;
  jiraTicketUrl: string;
  decisionRequired: boolean;
  escalationLevel: string;
  scheduleImpactDays: string;
  budgetImpact: string;
};

export type ArtifactFormState = {
  title: string;
  type: string;
  owner: string;
  status: ArtifactStatus;
  url: string;
  description: string;
  sortOrder: string;
};

export type IssueEditDraft = {
  phaseId: string;
  riskId: string;
  category: string;
  title: string;
  referenceLabel: string;
  referenceUrl: string;
  severity: Issue["severity"];
  readiness: RagStatus;
  status: string;
  owner: string;
  impact: string;
  decisionRequired: boolean;
  dueDate: string;
};

export type TaskJiraDraft = {
  jiraTicketKey: string;
  jiraTicketUrl: string;
};

export type JiraLinkDraft = {
  jiraKey: string;
};

export const emptyUserForm: UserFormState = {
  email: "",
  name: "",
  role: "EXECUTIVE_VIEWER",
  isActive: true,
};

export const emptyDictionaryDraft: DictionaryItemDraft = {
  dictionary: "wbs_type",
  code: "",
  label: "",
  description: "",
  sortOrder: "0",
  isActive: true,
};

export const emptySystemSettingsDraft: SystemSettingsDraft = {
  gitlabEnabled: false,
  gitlabBaseUrl: "",
  gitlabToken: "",
  githubEnabled: false,
  githubBaseUrl: "https://api.github.com",
  githubToken: "",
  azureDevOpsEnabled: false,
  azureDevOpsOrganizationUrl: "",
  azureDevOpsToken: "",
  biEnabled: false,
  biExportUrl: "",
  ragGreenFormula: "",
  ragAmberFormula: "",
  ragRedFormula: "",
  overviewWorkflow: "",
  baselineWorkflow: "",
  projectCloseWorkflow: "",
  wbsTemplates: "",
};

export const emptyIssueForm: IssueFormState = {
  phaseId: "",
  riskId: "",
  category: "Без раздела",
  title: "",
  referenceLabel: "",
  referenceUrl: "",
  severity: "HIGH",
  readiness: "RED",
  owner: "",
  impact: "",
  decisionRequired: false,
  dueDate: "",
  jiraTicketKey: "",
  jiraLinks: [{ jiraKey: "" }],
};

const emptyProjectForm: ProjectFormState = {
  parentId: "",
  businessUnitId: "",
  copyCurrentStructureFrom: [],
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

export function newProjectFormDefaults(): ProjectFormState {
  const startDate = new Date();
  const targetDate = addMonths(startDate, 1);
  const suffix = String(Date.now()).slice(-5);
  return {
    ...emptyProjectForm,
    code: `PRJ-${suffix}`,
    name: "Новый проект",
    portfolio: "Портфель",
    sponsor: "Спонсор",
    projectManager: "Руководитель проекта",
    startDate: isoDate(startDate),
    targetDate: isoDate(targetDate),
    budgetPlanned: "0",
    budgetForecast: "0",
    summary: "Новый проект",
  };
}

export const emptyArtifactForm: ArtifactFormState = {
  title: "",
  type: "Документ",
  owner: "",
  status: "Draft",
  url: "",
  description: "",
  sortOrder: "0",
};

export const emptyRaidForm: RaidFormState = {
  type: "RISK",
  title: "",
  description: "",
  owner: "",
  status: "OPEN",
  probability: "3",
  impact: "3",
  mitigationPlan: "",
  contingencyPlan: "",
  dueDate: "",
  residualRisk: "0",
  validationDate: "",
  linkedRiskId: "",
  dependencyType: "",
  predecessor: "",
  successor: "",
  supplier: "",
  jiraTicketKey: "",
  jiraTicketUrl: "",
  decisionRequired: false,
  escalationLevel: "Проект",
  scheduleImpactDays: "0",
  budgetImpact: "0",
};

export function artifactToForm(artifact: ProjectArtifact): ArtifactFormState {
  return {
    title: artifact.title,
    type: artifact.type,
    owner: artifact.owner,
    status: artifact.status,
    url: artifact.url ?? "",
    description: artifact.description ?? "",
    sortOrder: String(artifact.sortOrder),
  };
}

function defaultPassportRows(project: ProjectDetails): PassportRow[] {
  return [
    { id: "sponsor", field: "Спонсор", description: project.sponsor },
    { id: "projectManager", field: "РП", description: project.projectManager },
    { id: "status", field: "Статус", description: projectStatusLabel(project.status) },
    { id: "rag", field: "Индикатор", description: projectHealthLabel(project.rag) },
    { id: "startDate", field: "Старт", description: date(project.startDate) },
  ];
}

export function normalizePassportRows(project: ProjectDetails | null): PassportRow[] {
  if (!project) return [];
  const rows = project.uiState?.passportRows;
  if (!Array.isArray(rows) || rows.length === 0) {
    return defaultPassportRows(project);
  }
  return rows
    .filter((row) => row.id !== "targetDate" && row.id !== "portfolio")
    .map((row, index) => ({
      id: row.id || `passport-row-${index + 1}`,
      field: row.field ?? "",
      description: row.description ?? "",
    }));
}

export function raidToForm(item: RaidItem): RaidFormState {
  return {
    type: item.type,
    title: item.title,
    description: item.description,
    owner: item.owner,
    status: item.status,
    probability: String(item.probability),
    impact: String(item.impact),
    mitigationPlan: item.mitigationPlan ?? "",
    contingencyPlan: item.contingencyPlan ?? "",
    dueDate: item.dueDate ? item.dueDate.slice(0, 10) : "",
    residualRisk: String(item.residualRisk),
    validationDate: item.validationDate ? item.validationDate.slice(0, 10) : "",
    linkedRiskId: item.linkedRiskId ?? "",
    dependencyType: item.dependencyType ?? "",
    predecessor: item.predecessor ?? "",
    successor: item.successor ?? "",
    supplier: item.supplier ?? "",
    jiraTicketKey: item.jiraTicketKey ?? "",
    jiraTicketUrl: item.jiraTicketUrl ?? "",
    decisionRequired: item.decisionRequired,
    escalationLevel: item.escalationLevel,
    scheduleImpactDays: String(item.scheduleImpactDays),
    budgetImpact: String(item.budgetImpact),
  };
}

export function issueToDraft(issue: Issue): IssueEditDraft {
  return {
    phaseId: issue.phaseId ?? "",
    riskId: issue.riskId ?? "",
    category: issue.category || "Без раздела",
    title: issue.title,
    referenceLabel: issue.referenceLabel || "",
    referenceUrl: issue.referenceUrl ?? "",
    severity: issue.severity,
    readiness: issue.readiness || "RED",
    status: issue.status,
    owner: issue.owner,
    impact: issue.impact,
    decisionRequired: issue.decisionRequired,
    dueDate: issue.dueDate ? issue.dueDate.slice(0, 10) : "",
  };
}

function predecessorTiming(
  item: WbsItem,
  predecessorCode: string | null,
  dependencies: WbsDependency[],
): WbsPredecessorTiming {
  if (!predecessorCode) return "FS";
  const dependency = dependencies.find(
    (candidate) =>
      candidate.successorId === item.id &&
      candidate.predecessor.code === predecessorCode,
  );
  return dependency?.type === "SS" ? "SS" : "FS";
}

export function wbsToForm(
  item: WbsItem,
  dependencies: WbsDependency[] = [],
): WbsFormState {
  return {
    parentId: item.parentId ?? "",
    code: item.code,
    title: item.title,
    type: item.type,
    status: item.status,
    owner: item.owner,
    startDate: item.startDate ? item.startDate.slice(0, 10) : "",
    dueDate: item.dueDate ? item.dueDate.slice(0, 10) : "",
    baselineStartDate: item.baselineStartDate ? item.baselineStartDate.slice(0, 10) : "",
    baselineDueDate: item.baselineDueDate ? item.baselineDueDate.slice(0, 10) : "",
    forecastStartDate: item.forecastStartDate ? item.forecastStartDate.slice(0, 10) : "",
    forecastDueDate: item.forecastDueDate ? item.forecastDueDate.slice(0, 10) : "",
    wbsLevel: item.wbsLevel === null ? "" : String(item.wbsLevel),
    predecessor1: item.predecessor1 ?? "",
    predecessor2: item.predecessor2 ?? "",
    predecessor3: item.predecessor3 ?? "",
    predecessor4: item.predecessor4 ?? "",
    predecessor5: item.predecessor5 ?? "",
    predecessor6: item.predecessor6 ?? "",
    predecessor1Type: predecessorTiming(item, item.predecessor1, dependencies),
    predecessor2Type: predecessorTiming(item, item.predecessor2, dependencies),
    predecessor3Type: predecessorTiming(item, item.predecessor3, dependencies),
    predecessor4Type: predecessorTiming(item, item.predecessor4, dependencies),
    predecessor5Type: predecessorTiming(item, item.predecessor5, dependencies),
    predecessor6Type: predecessorTiming(item, item.predecessor6, dependencies),
    leadLagDays: String(item.leadLagDays),
    workDays: item.workDays === null ? "" : String(item.workDays),
    calendarDays: item.calendarDays === null ? "" : String(item.calendarDays),
    excelStartDate: item.excelStartDate ? item.excelStartDate.slice(0, 10) : "",
    excelEndDate: item.excelEndDate ? item.excelEndDate.slice(0, 10) : "",
    planWorkDays: item.planWorkDays === null ? "" : String(item.planWorkDays),
    planCalendarDays:
      item.planCalendarDays === null ? "" : String(item.planCalendarDays),
    calendarCode: item.calendarCode ?? "RU",
    templateColor: item.templateColor ?? "",
    priority: item.priority ?? "",
    effortPercent: String(item.effortPercent ?? 0),
    plannedCost: String(item.plannedCost),
    forecastCost: String(item.forecastCost),
    progress: String(item.progress),
    jiraTicketKey: item.jiraTicketKey ?? "",
    jiraTicketUrl: item.jiraTicketUrl ?? "",
    mattermostUrl: item.mattermostUrl ?? "",
    description: item.description ?? "",
    comment: item.comment ?? "",
    sortOrder: String(item.sortOrder),
  };
}

export function projectToRegistryDraft(project: ProjectListItem): ProjectRegistryDraft {
  return {
    parentId: project.parentId ?? "",
    code: project.code,
    name: project.name,
    portfolio: project.portfolio,
    projectManager: project.projectManager,
    status: project.status,
    rag: project.rag,
    sortOrder: String(project.sortOrder),
  };
}

export function projectsToRegistryDrafts(projects: ProjectListItem[]) {
  return Object.fromEntries(
    projects.map((project) => [project.id, projectToRegistryDraft(project)]),
  );
}
