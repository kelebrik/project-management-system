import {
  JIRA_ANALYTICS_FIELDS_BY_SOURCE,
  JIRA_SEMANTIC_FIELD_LABELS,
  jiraAnalyticsOperatorsFor,
  jiraSemanticAggregateDefinitionSchema,
  jiraSemanticDefaultOutputField,
  type JiraAnalyticsEvaluationResult,
  type JiraAnalyticsFilter,
  type JiraAnalyticsFilterField,
  type JiraAnalyticsFilterOperator,
  type JiraSemanticAggregateDefinition,
  type JiraSemanticAggregatePublic,
  type JiraSemanticAggregateRowConfig,
  type JiraSemanticIntervalAnchor,
  type JiraSemanticOutputField,
} from "@pms/shared";
import { Archive, Database, Eye, Plus, Rocket, Save, Trash2 } from "lucide-react";
import { useEffect, useEffectEvent, useMemo, useRef, useState } from "react";

import { apiClient } from "../api/client";
import { JIRA_ANALYTICS_FILTER_LABELS, JIRA_ANALYTICS_OPERATOR_LABELS } from "../app/jiraAnalytics";
import { useConfirm } from "../hooks/useConfirm";
import { usePageContext } from "./PageContext";

type GoalMapping = {
  id: string;
  title: string;
  status: string;
  dueDate: string | null;
  jiraGoalLabels: string[];
};
type Catalog = { definitions: JiraSemanticAggregatePublic[]; goals: GoalMapping[] };
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
} as const;

const ROW_KIND_LABELS: Record<JiraSemanticAggregateRowConfig["kind"], string> = {
  issue: "Текущий или восстановленный снимок",
  goalIssue: "Связь цели и тикета по Jira-лейблу",
  transitionEvent: "Событие изменения статуса",
  developmentEvent: "Событие разработки",
  interval: "Пара контрольных точек",
  criticalSla: "SLA Critical/Blocker",
  criticalRisk: "Риск нарушения SLA Critical/Blocker",
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
      <input value={filter.value} disabled={disabled || noValue} placeholder={noValue ? "Значение не требуется" : filter.operator === "oneOf" || filter.operator === "noneOf" ? "Значения через запятую" : "Значение"} onChange={(event) => onChange({ ...filter, value: event.target.value })} />
      <button type="button" className="icon-button danger" disabled={disabled} title="Удалить условие" onClick={onDelete}><Trash2 size={16} /></button>
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
  return (
    <fieldset className="jira-aggregate-fieldset">
      <legend>{title}</legend>
      <label>Контрольная точка<select value={anchor.type} disabled={disabled} onChange={(event) => {
        const type = event.target.value as JiraSemanticIntervalAnchor["type"];
        if (type === "issueCreated") onChange({ type, occurrence: "first" });
        else if (type === "resolution") onChange({ type, occurrence: "first" });
        else if (type === "priorityEntry") onChange({ type, priorities: ["Critical", "Blocker"], occurrence: "first" });
        else onChange({ type, statuses: [{ id: null, name: type === "statusEntry" ? "In Progress" : "Resolved" }], occurrence: "first" });
      }}><option value="issueCreated">Создание тикета</option><option value="statusEntry">Вход в статус</option><option value="statusExit">Выход из статуса</option><option value="priorityEntry">Повышение приоритета</option><option value="resolution">Resolution</option></select></label>
      {"statuses" in anchor ? <label>Статусы<input disabled={disabled} value={anchor.statuses.map((status) => status.name).join(", ")} onChange={(event) => onChange({ ...anchor, statuses: statusRefs(event.target.value) })} /><small>Совпадение выполняется по нормализованному названию и отмечается предупреждением качества.</small></label> : null}
      {"priorities" in anchor ? <label>Приоритеты<input disabled value={anchor.priorities.join(", ")} /><small>Даталейк хранит типизированную дату первого повышения только до Critical/Blocker.</small></label> : null}
      {anchor.type !== "issueCreated" ? <label>Повторение<select disabled={disabled || anchor.type === "priorityEntry"} value={anchor.occurrence} onChange={(event) => onChange({ ...anchor, occurrence: event.target.value as "first" | "last" | "all" })}><option value="first">Первое</option>{anchor.type !== "priorityEntry" ? <><option value="last">Последнее</option>{allowAll ? <option value="all">Все повторения</option> : null}</> : null}</select></label> : null}
    </fieldset>
  );
}

function RowRuleEditor({ definition, disabled, onChange }: {
  definition: JiraSemanticAggregateDefinition;
  disabled: boolean;
  onChange: (definition: JiraSemanticAggregateDefinition) => void;
}) {
  const config = definition.rowConfig;
  if (config.kind === "interval") {
    return <fieldset className="jira-aggregate-fieldset jira-status-interval-config"><legend>Контрольные точки интервала</legend>
      <AnchorEditor title="Начало" anchor={config.start} disabled={disabled} onChange={(start) => onChange({ ...definition, rowConfig: { ...config, start } })} />
      <AnchorEditor title="Окончание" anchor={config.end} disabled={disabled} allowAll={false} onChange={(end) => onChange({ ...definition, rowConfig: { ...config, end } })} />
      <label>Незавершённый интервал<select disabled={disabled} value={config.openIntervals} onChange={(event) => onChange({ ...definition, rowConfig: { ...config, openIntervals: event.target.value as "include" | "exclude" } })}><option value="include">Включать, считать до текущего момента</option><option value="exclude">Исключать</option></select></label>
      <p className="jira-aggregate-help">Каждая начальная точка связывается с ближайшей следующей конечной точкой. «Все повторения» создаёт строку на каждый цикл.</p>
    </fieldset>;
  }
  if (config.kind === "criticalSla") {
    return <fieldset className="jira-aggregate-fieldset"><legend>Правило SLA</legend>
      <label>Типы тикетов<input disabled={disabled} value={config.issueTypes.join(", ")} onChange={(event) => onChange({ ...definition, rowConfig: { ...config, issueTypes: event.target.value.split(",").map((value) => value.trim()).filter(Boolean) } })} /></label>
      <label>Контрольные приоритеты<input disabled value={config.priorities.join(", ")} /><small>Critical и Blocker являются типизированным оператором даталейка.</small></label>
      <label className="jira-aggregate-field-option"><input type="checkbox" disabled={disabled} checked={config.requirePriorityAtResolution} onChange={(event) => onChange({ ...definition, rowConfig: { ...config, requirePriorityAtResolution: event.target.checked } })} />Проверять Critical/Blocker на момент Resolution</label>
      <label>Нерешённые тикеты<select disabled={disabled} value={config.openIntervals} onChange={(event) => onChange({ ...definition, rowConfig: { ...config, openIntervals: event.target.value as "include" | "exclude" } })}><option value="include">Включать</option><option value="exclude">Исключать</option></select></label>
    </fieldset>;
  }
  if (config.kind === "criticalRisk") {
    const values = (value: string) => value.split(",").map((item) => item.trim()).filter(Boolean);
    return <fieldset className="jira-aggregate-fieldset"><legend>Правило попадания в риск</legend>
      <label>Контрольные приоритеты<input disabled value={config.priorities.join(", ")} /><small>Начало отсчёта: создание с Critical/Blocker либо первое повышение до этого приоритета.</small></label>
      <label>Типы багов<input disabled={disabled} value={config.bugIssueTypes.join(", ")} onChange={(event) => onChange({ ...definition, rowConfig: { ...config, bugIssueTypes: values(event.target.value) } })} /></label>
      <div className="jira-aggregate-control-row"><label>SLA багов, часы<input type="number" min="1" disabled={disabled} value={config.bugSlaHours} onChange={(event) => onChange({ ...definition, rowConfig: { ...config, bugSlaHours: Number(event.target.value) } })} /></label><label>Окно риска, часы<input type="number" min="1" disabled={disabled} value={config.bugWarningHours} onChange={(event) => onChange({ ...definition, rowConfig: { ...config, bugWarningHours: Number(event.target.value) } })} /></label></div>
      <label>Типы задач<input disabled={disabled} value={config.taskIssueTypes.join(", ")} onChange={(event) => onChange({ ...definition, rowConfig: { ...config, taskIssueTypes: values(event.target.value) } })} /></label>
      <label>Задача попадает в риск через, часы<input type="number" min="1" disabled={disabled} value={config.taskRiskHours} onChange={(event) => onChange({ ...definition, rowConfig: { ...config, taskRiskHours: Number(event.target.value) } })} /></label>
      <p className="jira-aggregate-help">В агрегат входят только нерешённые тикеты, которые сейчас имеют Critical/Blocker.</p>
    </fieldset>;
  }
  return <div className="jira-aggregate-help">{ROW_KIND_LABELS[config.kind]}. Дополнительные правила для этой гранулярности не требуются.</div>;
}

function Preview({ value, fields }: { value: PreviewResponse | null; fields: JiraSemanticOutputField[] }) {
  if (!value) return <div className="jira-aggregate-preview-empty">Нажмите «Показать данные»</div>;
  return <div className="jira-aggregate-preview">
    <div className="jira-aggregate-preview-number"><strong>{value.result.totalRecords.toLocaleString("ru-RU")}</strong><span>строк в агрегате</span></div>
    <div className={`jira-aggregate-quality ${value.result.quality.status.toLocaleLowerCase()}`}><header><strong>Качество: {value.result.quality.status}</strong><span>Покрытие {value.result.quality.coveragePercent ?? 0}%</span></header><p>Оценка: {value.cost.estimatedRows.toLocaleString("ru-RU")}, лимит {value.cost.maximumRows.toLocaleString("ru-RU")}</p>{value.result.quality.warnings.length ? <ul>{value.result.quality.warnings.map((warning) => <li key={warning.code}>{warning.code}: {warning.count}</li>)}</ul> : null}</div>
    <div className="jira-aggregate-preview-records"><table><thead><tr>{fields.map((field) => <th key={field.key}>{field.label}</th>)}</tr></thead><tbody>{value.result.records.map((record) => <tr key={record.id}>{fields.map((field) => { const cell = record.values[field.key]; const text = typeof cell === "boolean" ? cell ? "Да" : "Нет" : cell ?? "-"; return <td key={field.key}>{field.key === "issueKey" ? <a href={record.issueUrl} target="_blank" rel="noreferrer">{String(text)}</a> : String(text)}</td>; })}</tr>)}</tbody></table></div>
  </div>;
}

export function JiraAggregatesPage() {
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
    if (canEdit && response.definitions.length === 0) {
      await apiClient.post(`/api/projects/${project.id}/jira/semantic-aggregates/bootstrap`, {}, "Не удалось создать системные агрегаты");
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
      rowIdentity: grain === "issue" ? ["issueKey"] : grain === "goalIssue" ? ["goalId", "issueKey"] : ["rowId"],
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

  if (!catalog) return <div className="jira-aggregate-preview-empty">Загрузка агрегатов...</div>;
  return <div className="jira-aggregates-page">
    <section className="jira-goal-mappings">
      <header><div><h3>Связь целей с Jira</h3><p>Точное совпадение лейбла создаёт строку «цель + тикет» в агрегате «Тикеты целей».</p></div>{canEdit ? <button type="button" className="secondary-button" disabled={busy} onClick={() => void saveGoalLabels()}><Save size={18} />Сохранить связи</button> : null}</header>
      {catalog.goals.length === 0 ? <p className="jira-aggregate-help">В структуре проекта нет целей.</p> : <div className="jira-goal-mapping-list">{catalog.goals.map((goal) => <div className="jira-goal-mapping-row" key={goal.id}><div><strong>{goal.title}</strong><span>{goal.dueDate ? new Date(goal.dueDate).toLocaleDateString("ru-RU") : "Дата не указана"} · {goal.status}</span></div><label>Jira-лейблы<input disabled={!canEdit} value={goalLabels[goal.id] ?? ""} placeholder="Например: MP, ota" onChange={(event) => setGoalLabels((current) => ({ ...current, [goal.id]: event.target.value }))} /></label></div>)}</div>}
    </section>
    <div className="jira-aggregate-builder">
    <aside className="jira-aggregate-catalog"><header><div><Database size={24} /><h3>Агрегаты</h3></div>{canEdit ? <button type="button" className="icon-button" title="Создать агрегат" onClick={() => { setSelectedId(null); setDraft(defaultDefinition()); setNewKey("new-aggregate"); setPreview(null); }}><Plus size={22} /></button> : null}</header><div className="jira-aggregate-catalog-list">{catalog.definitions.map((definition) => <button type="button" key={definition.id} className={selectedId === definition.id ? "active" : ""} onClick={() => choose(definition)}><strong>{definition.draft.name}</strong><span>{GRAIN_LABELS[definition.draft.grain]} · v{definition.version}{definition.publishedVersion ? ` / опубликована v${definition.publishedVersion}` : " · черновик"}</span></button>)}</div></aside>
    <main className="jira-aggregate-editor"><header><div><h3>{draft.name}</h3><span>{selected?.system ? "Системный агрегат" : selected ? "Пользовательский агрегат" : "Новый агрегат"}</span></div><div className="jira-aggregate-actions"><button type="button" className="secondary-button" disabled={!canEdit || busy || !validation.success} onClick={() => void runPreview()}><Eye size={18} />Показать данные</button>{selected && !selected.system ? <button type="button" className="icon-button danger" disabled={!canEdit || busy} onClick={() => void archive()} title="Архивировать"><Archive size={18} /></button> : null}<button type="button" className="secondary-button" disabled={!canEdit || busy || !validation.success} onClick={() => void save()}><Save size={18} />Сохранить черновик</button>{selected ? <button type="button" className="primary-button" disabled={!canEdit || busy || !validation.success || selected.publishedVersion === selected.version} onClick={() => void publish()}><Rocket size={18} />Опубликовать</button> : null}</div></header>
      <div className="jira-aggregate-editor-grid"><section className="jira-aggregate-controls">
        <fieldset className="jira-aggregate-fieldset"><legend>Описание и ревизия</legend>{!selected ? <label>Код агрегата<input disabled={!canEdit} value={newKey} onChange={(event) => setNewKey(event.target.value)} /></label> : null}<label>Название<input disabled={!canEdit} value={draft.name} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} /></label><label>Описание<textarea disabled={!canEdit} value={draft.description} onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))} /></label><label>Правило формирования строк<select disabled={!canEdit || selected?.publishedVersion != null} value={draft.rowConfig.kind} onChange={(event) => updateRowKind(event.target.value as JiraSemanticAggregateRowConfig["kind"])}>{Object.entries(ROW_KIND_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select><small>После первой публикации тип строк фиксируется; изменения выполняются через параметры правила и новые ревизии.</small></label><label>Гранулярность<input disabled value={GRAIN_LABELS[draft.grain]} /></label></fieldset>
        <RowRuleEditor definition={draft} disabled={!canEdit} onChange={setDraft} />
        <fieldset className="jira-aggregate-fieldset"><legend>Базовая популяция</legend><p>Эти условия определяют строки агрегата. Фильтры виджета применяются позже.</p><div className="jira-widget-segments"><button type="button" className={draft.basePopulation.logic === "and" ? "active" : ""} disabled={!canEdit} onClick={() => setDraft((current) => ({ ...current, basePopulation: { ...current.basePopulation, logic: "and" } }))}>И</button><button type="button" className={draft.basePopulation.logic === "or" ? "active" : ""} disabled={!canEdit} onClick={() => setDraft((current) => ({ ...current, basePopulation: { ...current.basePopulation, logic: "or" } }))}>ИЛИ</button></div>{draft.basePopulation.filters.map((filter, index) => <FilterEditor key={filter.id} filter={filter} fields={availableFields} disabled={!canEdit} onChange={(next) => setDraft((current) => ({ ...current, basePopulation: { ...current.basePopulation, filters: current.basePopulation.filters.map((item, itemIndex) => itemIndex === index ? next : item) } }))} onDelete={() => setDraft((current) => ({ ...current, basePopulation: { ...current.basePopulation, filters: current.basePopulation.filters.filter((_, itemIndex) => itemIndex !== index) } }))} />)}<button type="button" className="secondary-button" disabled={!canEdit} onClick={() => setDraft((current) => ({ ...current, basePopulation: { ...current.basePopulation, filters: [...current.basePopulation.filters, { id: uid("base"), field: availableFields[0] ?? "issueKey", operator: "equals", value: "" }] } }))}><Plus size={16} />Условие</button></fieldset>
        <fieldset className="jira-aggregate-fieldset"><legend>Идентичность и выходные поля</legend><p>Ключ определяет уникальную строку в пределах одного тикета. Для событий и интервалов используйте внутренний ID строки.</p><strong>Ключ строки</strong><div className="jira-aggregate-field-grid">{identityFields.map((field) => <label key={field} className="jira-aggregate-field-option"><input type="checkbox" disabled={!canEdit || (draft.rowIdentity.length === 1 && draft.rowIdentity[0] === field)} checked={draft.rowIdentity.includes(field)} onChange={(event) => setDraft((current) => ({ ...current, rowIdentity: event.target.checked ? [...current.rowIdentity, field] : current.rowIdentity.filter((item) => item !== field) }))} /><span>{field === "rowId" ? "Внутренний ID строки" : JIRA_SEMANTIC_FIELD_LABELS[field]}</span></label>)}</div><strong>Поля, доступные виджетам</strong><div className="jira-aggregate-field-grid">{availableFields.map((field) => <label key={field} className="jira-aggregate-field-option"><input type="checkbox" disabled={!canEdit || draft.rowIdentity.includes(field) || (draft.outputFields.length === 1 && draft.outputFields[0]?.key === field)} checked={draft.outputFields.some((item) => item.key === field)} onChange={(event) => setDraft((current) => ({ ...current, outputFields: event.target.checked ? [...current.outputFields, jiraSemanticDefaultOutputField(field)] : current.outputFields.filter((item) => item.key !== field) }))} /><span>{JIRA_SEMANTIC_FIELD_LABELS[field]}</span></label>)}</div></fieldset>
        <fieldset className="jira-aggregate-fieldset"><legend>Полнота и стоимость</legend><label>Неполные данные<select disabled value={draft.incompleteDataPolicy}><option value="exclude">Исключать строку</option><option value="includeWithWarning">Включать с предупреждением</option></select><small>Политика определяется гранулярностью и возможностями даталейка.</small></label><div className="jira-aggregate-control-row"><label>Минимальное покрытие, %<input type="number" min="0" max="100" disabled={!canEdit} value={draft.qualityRules.minimumCoveragePercent} onChange={(event) => setDraft((current) => ({ ...current, qualityRules: { ...current.qualityRules, minimumCoveragePercent: Number(event.target.value) } }))} /></label><label>Максимум строк<input type="number" min="1" disabled={!canEdit} value={draft.qualityRules.maximumRows} onChange={(event) => setDraft((current) => ({ ...current, qualityRules: { ...current.qualityRules, maximumRows: Number(event.target.value) } }))} /></label><label>Оценка строк на тикет<input type="number" min="1" disabled={!canEdit} value={draft.qualityRules.maximumRowsPerIssue} onChange={(event) => setDraft((current) => ({ ...current, qualityRules: { ...current.qualityRules, maximumRowsPerIssue: Number(event.target.value) } }))} /></label></div><label>Состояние на дату<select disabled={!canEdit || (draft.rowConfig.kind !== "issue" && draft.rowConfig.kind !== "goalIssue" && draft.rowConfig.kind !== "criticalSla")} value={draft.asOfSupport} onChange={(event) => setDraft((current) => ({ ...current, asOfSupport: event.target.value as "none" | "supported" }))}><option value="none">Не поддерживается</option><option value="supported">Поддерживается</option></select></label></fieldset>
        {!validation.success ? <div className="jira-aggregate-validation">{validation.error.issues[0]?.message}</div> : null}
        {selected ? <fieldset className="jira-aggregate-fieldset"><legend>История версий</legend><div className="jira-aggregate-revision-list">{selected.revisions.map((revision) => <div key={revision.version}><strong>v{revision.version}</strong><span>{revision.status} · {revision.changeKind}</span><small>{new Date(revision.createdAt).toLocaleString("ru-RU")}</small></div>)}</div></fieldset> : null}
      </section><section className="jira-aggregate-preview-panel"><header><h4>Реальные строки агрегата</h4><span>Предпросмотр строится по даталейку текущего проекта</span></header><Preview value={preview} fields={draft.outputFields} /></section></div>
    </main>
  </div></div>;
}
