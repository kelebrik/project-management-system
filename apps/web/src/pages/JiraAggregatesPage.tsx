import { useI18n as useInterfaceTranslation } from "../i18n/I18nProvider";
import { useI18n as useJiraTranslations } from "../i18n/I18nProvider";
import { intlLocale } from "../i18n/locale";
import { useI18n as useLocaleTranslation } from "../i18n/I18nProvider";
import { JIRA_ANALYTICS_FIELDS_BY_SOURCE, jiraAnalyticsOperatorsFor, jiraSemanticAggregateDefinitionSchema, jiraSemanticDefaultOutputField, type JiraAnalyticsEvaluationResult, type JiraAnalyticsFilter, type JiraAnalyticsFilterField, type JiraAnalyticsFilterOperator, type JiraSemanticAggregateDefinition, type JiraSemanticAggregatePublic, type JiraSemanticAggregateRowConfig, type JiraSemanticIntervalAnchor, type JiraSemanticOutputField } from "@pms/shared";
import { Archive, Database, Eye, Plus, RefreshCw, Rocket, Save, Trash2 } from "lucide-react";
import { useEffect, useEffectEvent, useMemo, useRef, useState } from "react";

import { apiClient } from "../api/client";

import { useConfirm } from "../hooks/useConfirm";
import { usePageContext } from "./PageContext";

type GoalMapping = {
  id: string;
  title: string;
  status: string;
  dueDate: string | null;
  jiraGoalLabels: string[];
};
type Catalog = {
  definitions: JiraSemanticAggregatePublic[];
  systemAggregatesSeedRequired: boolean;
  goals: GoalMapping[];
};
type PreviewResponse = {
  result: Omit<JiraAnalyticsEvaluationResult, "records"> & {
    records: Array<{
      id: string;
      issueUrl: string;
      values: Partial<Record<JiraAnalyticsFilterField, string | number | boolean | null>>;
    }>;
  };
  cost: { tickets: number; estimatedRows: number; maximumRows: number; blocked: boolean };
};

const GRAIN_LABELS = {
  issue: "Тикет",
  goalIssue: "Тикет цели",
  transitionEvent: "Переход статуса",
  developmentEvent: "Событие разработки",
  interval: "Интервал",
  gitlabCommit: "Коммит GitLab",
} as const;

const ROW_KIND_LABELS: Record<JiraSemanticAggregateRowConfig["kind"], string> = {
  issue: "Текущий или восстановленный снимок",
  goalIssue: "Связь цели и тикета по Jira-лейблу",
  transitionEvent: "Событие изменения статуса",
  developmentEvent: "Событие разработки",
  interval: "Пара контрольных точек",
  criticalSla: "SLA Critical/Blocker",
  criticalRisk: "Риск нарушения SLA Critical/Blocker",
  gitlabBranchCommit: "Коммиты выбранной ветки GitLab",
};

function uid(prefix: string) {
  return `${prefix}-${crypto.randomUUID()}`;
}

function fieldsForRowConfig(rowConfig: JiraSemanticAggregateRowConfig) {
  const source = rowConfig.kind === "issue"
    ? "issues"
    : rowConfig.kind === "goalIssue"
      ? "goalIssues"
    : rowConfig.kind === "transitionEvent"
      ? "transitions"
      : rowConfig.kind === "developmentEvent"
        ? "development"
        : rowConfig.kind === "gitlabBranchCommit"
          ? "gitlabCommits"
        : rowConfig.kind === "criticalSla" || rowConfig.kind === "criticalRisk"
          ? "criticalBugs"
          : "statusIntervals";
  return JIRA_ANALYTICS_FIELDS_BY_SOURCE[source];
}

function rowConfigFor(kind: JiraSemanticAggregateRowConfig["kind"]): JiraSemanticAggregateRowConfig {
  if (kind === "issue") return { kind };
  if (kind === "goalIssue") return { kind };
  if (kind === "transitionEvent") return { kind };
  if (kind === "developmentEvent") return { kind };
  if (kind === "gitlabBranchCommit") return {
    kind,
    projectPath: "athena/staros",
    targetBranch: "factory-1.103-cvte968",
    lookbackDays: 14,
    includeMergeCommits: false,
  };
  if (kind === "criticalSla") return {
    kind,
    issueTypes: ["Bug", "Bug Report", "Defect", "Баг", "Ошибка", "Дефект"],
    priorities: ["Critical", "Blocker"],
    startPolicy: "createdOrFirstPriorityEntry",
    endAnchor: "resolution",
    requirePriorityAtResolution: true,
    openIntervals: "include",
  };
  if (kind === "criticalRisk") return {
    kind,
    priorities: ["Critical", "Blocker"],
    bugIssueTypes: ["Bug", "Bug Report", "Defect", "Баг", "Ошибка", "Дефект"],
    bugSlaHours: 720,
    bugWarningHours: 168,
    taskIssueTypes: ["Task", "Задача"],
    taskRiskHours: 672,
  };
  return {
    kind,
    start: { type: "issueCreated", occurrence: "first" },
    end: { type: "statusEntry", statuses: [{ id: null, name: "In Progress" }], occurrence: "first" },
    pairing: "nextAfterStart",
    openIntervals: "include",
  };
}

function grainFor(rowConfig: JiraSemanticAggregateRowConfig): JiraSemanticAggregateDefinition["grain"] {
  if (rowConfig.kind === "issue") return "issue";
  if (rowConfig.kind === "goalIssue") return "goalIssue";
  if (rowConfig.kind === "transitionEvent") return "transitionEvent";
  if (rowConfig.kind === "developmentEvent") return "developmentEvent";
  if (rowConfig.kind === "gitlabBranchCommit") return "gitlabCommit";
  return "interval";
}

function defaultDefinition(): JiraSemanticAggregateDefinition {
  const rowConfig = rowConfigFor("issue");
  return {
    schemaVersion: 5,
    name: "Новый агрегат",
    description: "",
    grain: "issue",
    basePopulation: { logic: "and", filters: [] },
    rowConfig,
    rowIdentity: ["issueKey"],
    outputFields: fieldsForRowConfig(rowConfig).map(jiraSemanticDefaultOutputField),
    incompleteDataPolicy: "includeWithWarning",
    qualityRules: { minimumCoveragePercent: 95, maximumRows: 100_000, maximumRowsPerIssue: 500 },
    timeZone: "Europe/Moscow",
    asOfSupport: "supported",
  };
}

function FilterEditor({ filter, fields, disabled, onChange, onDelete }: {
  filter: JiraAnalyticsFilter;
  fields: readonly JiraAnalyticsFilterField[];
  disabled: boolean;
  onChange: (filter: JiraAnalyticsFilter) => void;
  onDelete: () => void;
}) {
  const { t: uiText } = useInterfaceTranslation();
  const { jira: { JIRA_ANALYTICS_FILTER_LABELS, JIRA_ANALYTICS_OPERATOR_LABELS } } = useJiraTranslations();
  const operators = jiraAnalyticsOperatorsFor(filter.field);
  const noValue = filter.operator === "empty" || filter.operator === "notEmpty";
  return (
    <div className="jira-widget-filter-row">
      <select value={filter.field} disabled={disabled} onChange={(event) => {
        const field = event.target.value as JiraAnalyticsFilterField;
        onChange({ ...filter, field, operator: jiraAnalyticsOperatorsFor(field)[0] ?? "equals", value: "" });
      }}>{fields.map((field) => <option key={field} value={field}>{JIRA_ANALYTICS_FILTER_LABELS[field]}</option>)}</select>
      <select value={filter.operator} disabled={disabled} onChange={(event) => {
        const operator = event.target.value as JiraAnalyticsFilterOperator;
        onChange({ ...filter, operator, value: operator === "empty" || operator === "notEmpty" ? "" : filter.value });
      }}>{operators.map((operator) => <option key={operator} value={operator}>{JIRA_ANALYTICS_OPERATOR_LABELS[operator]}</option>)}</select>
      <input value={filter.value} disabled={disabled || noValue} placeholder={noValue ? uiText("ui.jira.noValueRequired") : filter.operator === "oneOf" || filter.operator === "noneOf" ? uiText("ui.jira.commaSeparatedValues") : uiText("ui.jira.value")} onChange={(event) => onChange({ ...filter, value: event.target.value })} />
      <button type="button" className="icon-button danger" disabled={disabled} title={uiText("ui.jira.removeCondition")} onClick={onDelete}><Trash2 size={16} /></button>
    </div>
  );
}

function statusRefs(value: string) {
  return value.split(",").map((name) => name.trim()).filter(Boolean).slice(0, 20).map((name) => ({ id: null, name }));
}

function AnchorEditor({ title, anchor, disabled, allowAll = true, onChange }: {
  title: string;
  anchor: JiraSemanticIntervalAnchor;
  disabled: boolean;
  allowAll?: boolean;
  onChange: (anchor: JiraSemanticIntervalAnchor) => void;
}) {
  const { t: uiText } = useInterfaceTranslation();
  return (
    <fieldset className="jira-aggregate-fieldset">
      <legend>{title}</legend>
      <label>{uiText("ui.jira.checkpoint")}<select value={anchor.type} disabled={disabled} onChange={(event) => {
        const type = event.target.value as JiraSemanticIntervalAnchor["type"];
        if (type === "issueCreated") onChange({ type, occurrence: "first" });
        else if (type === "resolution") onChange({ type, occurrence: "first" });
        else if (type === "priorityEntry") onChange({ type, priorities: ["Critical", "Blocker"], occurrence: "first" });
        else onChange({ type, statuses: [{ id: null, name: type === "statusEntry" ? "In Progress" : "Resolved" }], occurrence: "first" });
      }}><option value="issueCreated">{uiText("ui.jira.ticketCreation")}</option><option value="statusEntry">{uiText("ui.jira.statusEntry")}</option><option value="statusExit">{uiText("ui.jira.statusExit")}</option><option value="priorityEntry">{uiText("ui.jira.priorityEscalation")}</option><option value="resolution">Resolution</option></select></label>
      {"statuses" in anchor ? <label>{uiText("ui.jira.statuses")}<input disabled={disabled} value={anchor.statuses.map((status) => status.name).join(", ")} onChange={(event) => onChange({ ...anchor, statuses: statusRefs(event.target.value) })} /><small>{uiText("ui.jira.normalizedNameMatchingNote")}</small></label> : null}
      {"priorities" in anchor ? <label>{uiText("ui.jira.priorities")}<input disabled value={anchor.priorities.join(", ")} /><small>{uiText("ui.jira.dataLakeEscalationDateNote")}</small></label> : null}
      {anchor.type !== "issueCreated" ? <label>{uiText("ui.jira.occurrence")}<select disabled={disabled || anchor.type === "priorityEntry"} value={anchor.occurrence} onChange={(event) => onChange({ ...anchor, occurrence: event.target.value as "first" | "last" | "all" })}><option value="first">{uiText("ui.jira.first")}</option>{anchor.type !== "priorityEntry" ? <><option value="last">{uiText("ui.jira.last")}</option>{allowAll ? <option value="all">{uiText("ui.jira.allOccurrences")}</option> : null}</> : null}</select></label> : null}
    </fieldset>
  );
}

function RowRuleEditor({ definition, disabled, onChange }: {
  definition: JiraSemanticAggregateDefinition;
  disabled: boolean;
  onChange: (definition: JiraSemanticAggregateDefinition) => void;
}) {
  const { t: uiText } = useInterfaceTranslation();
  const config = definition.rowConfig;
  if (config.kind === "interval") {
    return <fieldset className="jira-aggregate-fieldset jira-status-interval-config"><legend>{uiText("ui.jira.intervalCheckpoints")}</legend>
      <AnchorEditor title={uiText("ui.jira.start")} anchor={config.start} disabled={disabled} onChange={(start) => onChange({ ...definition, rowConfig: { ...config, start } })} />
      <AnchorEditor title={uiText("ui.jira.finish")} anchor={config.end} disabled={disabled} allowAll={false} onChange={(end) => onChange({ ...definition, rowConfig: { ...config, end } })} />
      <label>{uiText("ui.jira.unfinishedInterval")}<select disabled={disabled} value={config.openIntervals} onChange={(event) => onChange({ ...definition, rowConfig: { ...config, openIntervals: event.target.value as "include" | "exclude" } })}><option value="include">{uiText("ui.jira.includeCountToNow")}</option><option value="exclude">{uiText("ui.jira.exclude")}</option></select></label>
      <p className="jira-aggregate-help">{uiText("ui.jira.intervalPairingNote")}</p>
    </fieldset>;
  }
  if (config.kind === "criticalSla") {
    return <fieldset className="jira-aggregate-fieldset"><legend>{uiText("ui.jira.slaRule")}</legend>
      <label>{uiText("ui.jira.ticketTypes")}<input disabled={disabled} value={config.issueTypes.join(", ")} onChange={(event) => onChange({ ...definition, rowConfig: { ...config, issueTypes: event.target.value.split(",").map((value) => value.trim()).filter(Boolean) } })} /></label>
      <label>{uiText("ui.jira.monitoredPriorities")}<input disabled value={config.priorities.join(", ")} /><small>{uiText("ui.jira.criticalBlockerTypedOperatorNote")}</small></label>
      <label className="jira-aggregate-field-option"><input type="checkbox" disabled={disabled} checked={config.requirePriorityAtResolution} onChange={(event) => onChange({ ...definition, rowConfig: { ...config, requirePriorityAtResolution: event.target.checked } })} />{uiText("ui.jira.checkCriticalBlockerAtResolution")}</label>
      <label>{uiText("ui.jira.unresolvedTickets")}<select disabled={disabled} value={config.openIntervals} onChange={(event) => onChange({ ...definition, rowConfig: { ...config, openIntervals: event.target.value as "include" | "exclude" } })}><option value="include">{uiText("ui.jira.include")}</option><option value="exclude">{uiText("ui.jira.exclude")}</option></select></label>
    </fieldset>;
  }
  if (config.kind === "criticalRisk") {
    const values = (value: string) => value.split(",").map((item) => item.trim()).filter(Boolean);
    return <fieldset className="jira-aggregate-fieldset"><legend>{uiText("ui.jira.atRiskRule")}</legend>
      <label>{uiText("ui.jira.monitoredPriorities")}<input disabled value={config.priorities.join(", ")} /><small>{uiText("ui.jira.atRiskCountdownStartNote")}</small></label>
      <label>{uiText("ui.jira.bugTypes")}<input disabled={disabled} value={config.bugIssueTypes.join(", ")} onChange={(event) => onChange({ ...definition, rowConfig: { ...config, bugIssueTypes: values(event.target.value) } })} /></label>
      <div className="jira-aggregate-control-row"><label>{uiText("ui.jira.bugSlaHours")}<input type="number" min="1" disabled={disabled} value={config.bugSlaHours} onChange={(event) => onChange({ ...definition, rowConfig: { ...config, bugSlaHours: Number(event.target.value) } })} /></label><label>{uiText("ui.jira.riskWindowHours")}<input type="number" min="1" disabled={disabled} value={config.bugWarningHours} onChange={(event) => onChange({ ...definition, rowConfig: { ...config, bugWarningHours: Number(event.target.value) } })} /></label></div>
      <label>{uiText("ui.jira.taskTypes")}<input disabled={disabled} value={config.taskIssueTypes.join(", ")} onChange={(event) => onChange({ ...definition, rowConfig: { ...config, taskIssueTypes: values(event.target.value) } })} /></label>
      <label>{uiText("ui.jira.taskAtRiskAfterHours")}<input type="number" min="1" disabled={disabled} value={config.taskRiskHours} onChange={(event) => onChange({ ...definition, rowConfig: { ...config, taskRiskHours: Number(event.target.value) } })} /></label>
      <p className="jira-aggregate-help">{uiText("ui.jira.aggregateOnlyCurrentCriticalBlocker")}</p>
    </fieldset>;
  }
  if (config.kind === "gitlabBranchCommit") {
    return <fieldset className="jira-aggregate-fieldset"><legend>{uiText("ui.jira.gitlabBranch")}</legend>
      <label>{uiText("ui.jira.gitlabProject")}<input disabled={disabled} value={config.projectPath} placeholder="athena/staros" onChange={(event) => onChange({ ...definition, rowConfig: { ...config, projectPath: event.target.value } })} /><small>{uiText("ui.jira.gitlabProjectPathNote")}</small></label>
      <label>{uiText("ui.jira.targetBranch")}<input disabled={disabled} value={config.targetBranch} placeholder="factory-1.103-cvte968" onChange={(event) => onChange({ ...definition, rowConfig: { ...config, targetBranch: event.target.value } })} /></label>
      <label>{uiText("ui.jira.syncPeriodDays")}<input type="number" min="1" max="365" disabled={disabled} value={config.lookbackDays} onChange={(event) => onChange({ ...definition, rowConfig: { ...config, lookbackDays: Number(event.target.value) } })} /></label>
      <label className="jira-aggregate-field-option"><input type="checkbox" disabled={disabled} checked={config.includeMergeCommits} onChange={(event) => onChange({ ...definition, rowConfig: { ...config, includeMergeCommits: event.target.checked } })} />{uiText("ui.jira.includeMergeCommits")}</label>
      <p className="jira-aggregate-help">{uiText("ui.jira.gitlabCommitAggregateNote")}</p>
    </fieldset>;
  }
  return <div className="jira-aggregate-help">{ROW_KIND_LABELS[config.kind]}{uiText("ui.jira.noAdditionalRulesForGranularity")}</div>;
}

function Preview({ value, fields }: { value: PreviewResponse | null; fields: JiraSemanticOutputField[] }) {
  const { t: uiText } = useInterfaceTranslation();
  const { locale: uiLocale } = useLocaleTranslation();
  if (!value) return <div className="jira-aggregate-preview-empty">{uiText("ui.jira.clickShowData")}</div>;
  return <div className="jira-aggregate-preview">
    <div className="jira-aggregate-preview-number"><strong>{value.result.totalRecords.toLocaleString(intlLocale(uiLocale))}</strong><span>{uiText("ui.jira.rowsInAggregate")}</span></div>
    <div className={`jira-aggregate-quality ${value.result.quality.status.toLocaleLowerCase()}`}><header><strong>{uiText("ui.jira.qualityLabel")} {value.result.quality.status}</strong><span>{uiText("ui.jira.coverage")} {value.result.quality.coveragePercent ?? 0}%</span></header><p>{uiText("ui.jira.estimateLabel")} {value.cost.estimatedRows.toLocaleString(intlLocale(uiLocale))}{uiText("ui.jira.limitSuffix")} {value.cost.maximumRows.toLocaleString(intlLocale(uiLocale))}</p>{value.result.quality.warnings.length ? <ul>{value.result.quality.warnings.map((warning) => <li key={warning.code}>{warning.code}: {warning.count}</li>)}</ul> : null}</div>
    <div className="jira-aggregate-preview-records"><table><thead><tr>{fields.map((field) => <th key={field.key}>{field.label}</th>)}</tr></thead><tbody>{value.result.records.map((record) => <tr key={record.id}>{fields.map((field) => { const cell = record.values[field.key]; const text = typeof cell === "boolean" ? cell ? "Да" : "Нет" : cell ?? "-"; return <td key={field.key}>{field.key === "issueKey" || field.key === "commitSha" || field.key === "commitShortSha" ? <a href={record.issueUrl} target="_blank" rel="noreferrer">{String(text)}</a> : String(text)}</td>; })}</tr>)}</tbody></table></div>
  </div>;
}

export function JiraAggregatesPage() {
  const { t: uiText } = useInterfaceTranslation();
  const { jira: { JIRA_SEMANTIC_FIELD_LABELS } } = useJiraTranslations();
  const { locale: uiLocale } = useLocaleTranslation();
  const { currentUser, isClosedProject, project, setError, setNotice } = usePageContext();
  const confirm = useConfirm();
  const canEdit = currentUser?.role === "ADMIN" && !isClosedProject;
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<JiraSemanticAggregateDefinition>(defaultDefinition());
  const [newKey, setNewKey] = useState("new-aggregate");
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [goalLabels, setGoalLabels] = useState<Record<string, string>>({});
  const requestRef = useRef(0);

  const load = async (preferredId?: string | null) => {
    const request = ++requestRef.current;
    let response = await apiClient.get<Catalog>(`/api/projects/${project.id}/jira/semantic-aggregates`, "Не удалось загрузить агрегаты");
    if (canEdit && response.systemAggregatesSeedRequired) {
      await apiClient.post(`/api/projects/${project.id}/jira/semantic-aggregates/bootstrap-missing`, {}, "Не удалось создать недостающие системные агрегаты");
      response = await apiClient.get<Catalog>(`/api/projects/${project.id}/jira/semantic-aggregates`, "Не удалось загрузить системные агрегаты");
    }
    if (request !== requestRef.current) return;
    setCatalog(response);
    setGoalLabels(Object.fromEntries(response.goals.map((goal) => [goal.id, goal.jiraGoalLabels.join(", ")])));
    const id = preferredId === null ? null : preferredId ?? response.definitions[0]?.id ?? null;
    setSelectedId(id);
    const selected = response.definitions.find((definition) => definition.id === id);
    setDraft(selected ? structuredClone(selected.draft) : defaultDefinition());
    setPreview(null);
  };

  const loadInitial = useEffectEvent(() => load().catch((error) => {
    setError(error instanceof Error ? error.message : "Не удалось загрузить агрегаты");
  }));

  useEffect(() => { void loadInitial(); }, [project.id]);

  const selected = catalog?.definitions.find((definition) => definition.id === selectedId) ?? null;
  const availableFields = useMemo(() => fieldsForRowConfig(draft.rowConfig), [draft.rowConfig]);
  const identityFields = useMemo<JiraSemanticAggregateDefinition["rowIdentity"]>(
    () => ["rowId", ...draft.outputFields.map((field) => field.key)],
    [draft.outputFields],
  );
  const validation = jiraSemanticAggregateDefinitionSchema.safeParse(draft);

  const choose = (definition: JiraSemanticAggregatePublic) => {
    setSelectedId(definition.id);
    setDraft(structuredClone(definition.draft));
    setPreview(null);
  };

  const updateRowKind = (kind: JiraSemanticAggregateRowConfig["kind"]) => {
    const rowConfig = rowConfigFor(kind);
    const grain = grainFor(rowConfig);
    setDraft((current) => ({ ...current, grain, rowConfig,
      rowIdentity: grain === "issue" ? ["issueKey"] : grain === "goalIssue" ? ["goalId", "issueKey"] : grain === "gitlabCommit" ? ["gitlabProjectPath", "gitlabTargetBranch", "commitSha"] : ["rowId"],
      outputFields: fieldsForRowConfig(rowConfig).map(jiraSemanticDefaultOutputField),
      incompleteDataPolicy: grain === "issue" || grain === "goalIssue" ? "includeWithWarning" : "exclude",
      asOfSupport: grain === "issue" || grain === "goalIssue" || kind === "criticalSla" ? "supported" : "none",
    }));
  };

  const save = async () => {
    if (!canEdit || !validation.success) return;
    setBusy(true);
    setError(null);
    try {
      if (selected) {
        await apiClient.patch(`/api/projects/${project.id}/jira/semantic-aggregates/${selected.id}`, { definition: draft, expectedVersion: selected.version }, "Не удалось сохранить черновик агрегата");
        setNotice("Черновая ревизия агрегата сохранена");
        await load(selected.id);
      } else {
        const result = await apiClient.post<{ id: string }>(`/api/projects/${project.id}/jira/semantic-aggregates`, { key: newKey, definition: draft }, "Не удалось создать агрегат");
        setNotice("Агрегат создан как черновик");
        await load(result.id);
      }
    } catch (error) { setError(error instanceof Error ? error.message : "Не удалось сохранить агрегат"); }
    finally { setBusy(false); }
  };

  const publish = async () => {
    if (!canEdit || !selected || !validation.success) return;
    const approved = await confirm({ title: "Опубликовать агрегат?", message: selected.revisions[0]?.changeKind === "breaking" ? "Ревизия несовместима с предыдущей. Закреплённые виджеты останутся на старой версии." : "После проверки качества ревизия станет доступна виджетам.", confirmLabel: "Опубликовать" });
    if (!approved) return;
    setBusy(true);
    try {
      await apiClient.post(`/api/projects/${project.id}/jira/semantic-aggregates/${selected.id}/publish`, { expectedVersion: selected.version }, "Не удалось опубликовать агрегат");
      setNotice("Ревизия агрегата опубликована");
      await load(selected.id);
    } catch (error) { setError(error instanceof Error ? error.message : "Не удалось опубликовать агрегат"); }
    finally { setBusy(false); }
  };

  const archive = async () => {
    if (!canEdit || !selected || selected.system) return;
    const approved = await confirm({ title: "Архивировать агрегат?", message: "Новые виджеты не смогут его выбрать.", confirmLabel: "Архивировать", tone: "danger" });
    if (!approved) return;
    setBusy(true);
    try {
      await apiClient.delete(`/api/projects/${project.id}/jira/semantic-aggregates/${selected.id}?expectedVersion=${selected.version}`, "Не удалось архивировать агрегат");
      setNotice("Агрегат отправлен в архив");
      await load();
    } catch (error) { setError(error instanceof Error ? error.message : "Не удалось архивировать агрегат"); }
    finally { setBusy(false); }
  };

  const runPreview = async () => {
    if (!canEdit || !validation.success) return;
    setBusy(true);
    try { setPreview(await apiClient.post<PreviewResponse>(`/api/projects/${project.id}/jira/semantic-aggregates/preview`, { definition: draft }, "Не удалось построить предпросмотр")); }
    catch (error) { setError(error instanceof Error ? error.message : "Не удалось построить предпросмотр"); }
    finally { setBusy(false); }
  };

  const syncGitlab = async () => {
    if (!canEdit || !selected || selected.publishedVersion == null || draft.rowConfig.kind !== "gitlabBranchCommit") return;
    setBusy(true);
    setError(null);
    try {
      const result = await apiClient.post<{ commitCount: number; linkedCount: number; unlinkedCount: number; undeterminedCount: number }>(`/api/projects/${project.id}/jira/semantic-aggregates/${selected.id}/sync-gitlab`, { aggregateVersion: selected.publishedVersion }, "Не удалось синхронизировать ветку GitLab");
      setNotice(`GitLab: ${result.commitCount} коммитов, без упоминания Jira: ${result.unlinkedCount}, связано: ${result.linkedCount}, не определено: ${result.undeterminedCount}`);
      await runPreview();
    } catch (error) { setError(error instanceof Error ? error.message : "Не удалось синхронизировать ветку GitLab"); }
    finally { setBusy(false); }
  };

  const saveGoalLabels = async () => {
    if (!canEdit || !catalog) return;
    setBusy(true);
    try {
      await apiClient.patch(`/api/projects/${project.id}/jira/goal-labels`, {
        goals: catalog.goals.map((goal) => ({
          goalId: goal.id,
          labels: (goalLabels[goal.id] ?? "").split(",").map((value) => value.trim()).filter(Boolean),
        })),
      }, "Не удалось сохранить связи целей с Jira");
      setNotice("Связи целей с Jira сохранены");
      await load(selectedId);
    } catch (error) { setError(error instanceof Error ? error.message : "Не удалось сохранить связи целей с Jira"); }
    finally { setBusy(false); }
  };

  if (!catalog) return <div className="jira-aggregate-preview-empty">{uiText("ui.jira.loadingAggregates")}</div>;
  return <div className="jira-aggregates-page">
    <section className="jira-goal-mappings">
      <header><div><h3>{uiText("ui.jira.goalJiraMapping")}</h3><p>{uiText("ui.jira.goalLabelMatchNote")}</p></div>{canEdit ? <button type="button" className="secondary-button" disabled={busy} onClick={() => void saveGoalLabels()}><Save size={18} />{uiText("ui.jira.saveMappings")}</button> : null}</header>
      {catalog.goals.length === 0 ? <p className="jira-aggregate-help">{uiText("ui.jira.noGoalsInStructure")}</p> : <div className="jira-goal-mapping-list">{catalog.goals.map((goal) => <div className="jira-goal-mapping-row" key={goal.id}><div><strong>{goal.title}</strong><span>{goal.dueDate ? new Date(goal.dueDate).toLocaleDateString(intlLocale(uiLocale)) : uiText("ui.jira.noDateSpecified")} · {goal.status}</span></div><label>{uiText("ui.jira.jiraLabels")}<input disabled={!canEdit} value={goalLabels[goal.id] ?? ""} placeholder={uiText("ui.jira.jiraLabelsPlaceholder")} onChange={(event) => setGoalLabels((current) => ({ ...current, [goal.id]: event.target.value }))} /></label></div>)}</div>}
    </section>
    <div className="jira-aggregate-builder">
    <aside className="jira-aggregate-catalog"><header><div><Database size={24} /><h3>{uiText("ui.jira.aggregates")}</h3></div>{canEdit ? <button type="button" className="icon-button" title={uiText("ui.jira.createAggregate")} onClick={() => { setSelectedId(null); setDraft(defaultDefinition()); setNewKey("new-aggregate"); setPreview(null); }}><Plus size={22} /></button> : null}</header><div className="jira-aggregate-catalog-list">{catalog.definitions.map((definition) => <button type="button" key={definition.id} className={selectedId === definition.id ? "active" : ""} onClick={() => choose(definition)}><strong>{definition.draft.name}</strong><span>{GRAIN_LABELS[definition.draft.grain]} · v{definition.version}{definition.publishedVersion ? ` / опубликована v${definition.publishedVersion}` : uiText("ui.jira.draftSuffix")}</span></button>)}</div></aside>
    <main className="jira-aggregate-editor"><header><div><h3>{draft.name}</h3><span>{selected?.system ? uiText("ui.jira.systemAggregate") : selected ? uiText("ui.jira.customAggregate") : uiText("ui.jira.newAggregate")}</span></div><div className="jira-aggregate-actions">{draft.rowConfig.kind === "gitlabBranchCommit" ? <button type="button" className="secondary-button" disabled={!canEdit || busy || !selected?.publishedVersion} onClick={() => void syncGitlab()}><RefreshCw size={18} />{uiText("ui.jira.syncGitlab")}</button> : null}<button type="button" className="secondary-button" disabled={!canEdit || busy || !validation.success} onClick={() => void runPreview()}><Eye size={18} />{uiText("ui.jira.showData")}</button>{selected && !selected.system ? <button type="button" className="icon-button danger" disabled={!canEdit || busy} onClick={() => void archive()} title={uiText("ui.jira.archive")}><Archive size={18} /></button> : null}<button type="button" className="secondary-button" disabled={!canEdit || busy || !validation.success} onClick={() => void save()}><Save size={18} />{uiText("ui.jira.saveDraft")}</button>{selected ? <button type="button" className="primary-button" disabled={!canEdit || busy || !validation.success || selected.publishedVersion === selected.version} onClick={() => void publish()}><Rocket size={18} />{uiText("ui.jira.publish")}</button> : null}</div></header>
      <div className="jira-aggregate-editor-grid"><section className="jira-aggregate-controls">
        <fieldset className="jira-aggregate-fieldset"><legend>{uiText("ui.jira.descriptionAndRevision")}</legend>{!selected ? <label>{uiText("ui.jira.aggregateCode")}<input disabled={!canEdit} value={newKey} onChange={(event) => setNewKey(event.target.value)} /></label> : null}<label>{uiText("ui.admin.name")}<input disabled={!canEdit} value={draft.name} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} /></label><label>{uiText("ui.jira.description")}<textarea disabled={!canEdit} value={draft.description} onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))} /></label><label>{uiText("ui.jira.rowGenerationRule")}<select disabled={!canEdit || selected?.publishedVersion != null} value={draft.rowConfig.kind} onChange={(event) => updateRowKind(event.target.value as JiraSemanticAggregateRowConfig["kind"])}>{Object.entries(ROW_KIND_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select><small>{uiText("ui.jira.rowTypeFixedAfterPublishNote")}</small></label><label>{uiText("ui.jira.granularity")}<input disabled value={GRAIN_LABELS[draft.grain]} /></label></fieldset>
        <RowRuleEditor definition={draft} disabled={!canEdit} onChange={setDraft} />
        <fieldset className="jira-aggregate-fieldset"><legend>{uiText("ui.jira.basePopulation")}</legend><p>{uiText("ui.jira.baseConditionsNote")}</p><div className="jira-widget-segments"><button type="button" className={draft.basePopulation.logic === "and" ? "active" : ""} disabled={!canEdit} onClick={() => setDraft((current) => ({ ...current, basePopulation: { ...current.basePopulation, logic: "and" } }))}>{uiText("ui.jira.andOperator")}</button><button type="button" className={draft.basePopulation.logic === "or" ? "active" : ""} disabled={!canEdit} onClick={() => setDraft((current) => ({ ...current, basePopulation: { ...current.basePopulation, logic: "or" } }))}>{uiText("ui.jira.orOperator")}</button></div>{draft.basePopulation.filters.map((filter, index) => <FilterEditor key={filter.id} filter={filter} fields={availableFields} disabled={!canEdit} onChange={(next) => setDraft((current) => ({ ...current, basePopulation: { ...current.basePopulation, filters: current.basePopulation.filters.map((item, itemIndex) => itemIndex === index ? next : item) } }))} onDelete={() => setDraft((current) => ({ ...current, basePopulation: { ...current.basePopulation, filters: current.basePopulation.filters.filter((_, itemIndex) => itemIndex !== index) } }))} />)}<button type="button" className="secondary-button" disabled={!canEdit} onClick={() => setDraft((current) => ({ ...current, basePopulation: { ...current.basePopulation, filters: [...current.basePopulation.filters, { id: uid("base"), field: availableFields[0] ?? "issueKey", operator: "equals", value: "" }] } }))}><Plus size={16} />{uiText("ui.jira.condition")}</button></fieldset>
        <fieldset className="jira-aggregate-fieldset"><legend>{uiText("ui.jira.identityAndOutputFields")}</legend><p>{uiText("ui.jira.rowKeyNote")}</p><strong>{uiText("ui.jira.rowKey")}</strong><div className="jira-aggregate-field-grid">{identityFields.map((field) => <label key={field} className="jira-aggregate-field-option"><input type="checkbox" disabled={!canEdit || (draft.rowIdentity.length === 1 && draft.rowIdentity[0] === field)} checked={draft.rowIdentity.includes(field)} onChange={(event) => setDraft((current) => ({ ...current, rowIdentity: event.target.checked ? [...current.rowIdentity, field] : current.rowIdentity.filter((item) => item !== field) }))} /><span>{field === "rowId" ? uiText("ui.jira.internalRowId") : JIRA_SEMANTIC_FIELD_LABELS[field]}</span></label>)}</div><strong>{uiText("ui.jira.fieldsAvailableToWidgets")}</strong><div className="jira-aggregate-field-grid">{availableFields.map((field) => <label key={field} className="jira-aggregate-field-option"><input type="checkbox" disabled={!canEdit || draft.rowIdentity.includes(field) || (draft.outputFields.length === 1 && draft.outputFields[0]?.key === field)} checked={draft.outputFields.some((item) => item.key === field)} onChange={(event) => setDraft((current) => ({ ...current, outputFields: event.target.checked ? [...current.outputFields, jiraSemanticDefaultOutputField(field)] : current.outputFields.filter((item) => item.key !== field) }))} /><span>{JIRA_SEMANTIC_FIELD_LABELS[field]}</span></label>)}</div></fieldset>
        <fieldset className="jira-aggregate-fieldset"><legend>{uiText("ui.jira.completenessAndCost")}</legend><label>{uiText("ui.jira.incompleteData")}<select disabled value={draft.incompleteDataPolicy}><option value="exclude">{uiText("ui.jira.excludeRow")}</option><option value="includeWithWarning">{uiText("ui.jira.includeWithWarning")}</option></select><small>{uiText("ui.jira.policyDeterminedByGranularity")}</small></label><div className="jira-aggregate-control-row"><label>{uiText("ui.jira.minimumCoveragePercent")}<input type="number" min="0" max="100" disabled={!canEdit} value={draft.qualityRules.minimumCoveragePercent} onChange={(event) => setDraft((current) => ({ ...current, qualityRules: { ...current.qualityRules, minimumCoveragePercent: Number(event.target.value) } }))} /></label><label>{uiText("ui.jira.maximumRows")}<input type="number" min="1" disabled={!canEdit} value={draft.qualityRules.maximumRows} onChange={(event) => setDraft((current) => ({ ...current, qualityRules: { ...current.qualityRules, maximumRows: Number(event.target.value) } }))} /></label><label>{uiText("ui.jira.estimatedRowsPerTicket")}<input type="number" min="1" disabled={!canEdit} value={draft.qualityRules.maximumRowsPerIssue} onChange={(event) => setDraft((current) => ({ ...current, qualityRules: { ...current.qualityRules, maximumRowsPerIssue: Number(event.target.value) } }))} /></label></div><label>{uiText("ui.jira.stateAsOfDate")}<select disabled={!canEdit || (draft.rowConfig.kind !== "issue" && draft.rowConfig.kind !== "goalIssue" && draft.rowConfig.kind !== "criticalSla")} value={draft.asOfSupport} onChange={(event) => setDraft((current) => ({ ...current, asOfSupport: event.target.value as "none" | "supported" }))}><option value="none">{uiText("ui.jira.notSupported")}</option><option value="supported">{uiText("ui.jira.supported")}</option></select></label></fieldset>
        {!validation.success ? <div className="jira-aggregate-validation">{validation.error.issues[0]?.message}</div> : null}
        {selected ? <fieldset className="jira-aggregate-fieldset"><legend>{uiText("ui.jira.versionHistory")}</legend><div className="jira-aggregate-revision-list">{selected.revisions.map((revision) => <div key={revision.version}><strong>v{revision.version}</strong><span>{revision.status} · {revision.changeKind}</span><small>{new Date(revision.createdAt).toLocaleString(intlLocale(uiLocale))}</small></div>)}</div></fieldset> : null}
      </section><section className="jira-aggregate-preview-panel"><header><h4>{uiText("ui.jira.actualAggregateRows")}</h4><span>{uiText("ui.jira.previewFromCurrentProjectDataLake")}</span></header><Preview value={preview} fields={draft.outputFields} /></section></div>
    </main>
  </div></div>;
}
