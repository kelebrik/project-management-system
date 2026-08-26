import {
  JIRA_ANALYTICS_FIELDS_BY_SOURCE,
  jiraAnalyticsDatasetDraftSchema,
  type JiraAnalyticsDatasetDraft,
  type JiraAnalyticsEvaluationResult,
  type JiraAnalyticsFilterField,
  type JiraAnalyticsSource,
  type JiraAnalyticsStatusIntervalEndpoint,
} from "@pms/shared";
import { Database, Eye, Plus, Save, Trash2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { apiClient } from "../api/client";
import {
  JIRA_ANALYTICS_FILTER_LABELS,
  JIRA_ANALYTICS_AGGREGATE_TYPE_LABELS,
} from "../app/jiraAnalytics";
import { usePageContext } from "./PageContext";

type AggregateDefinition = JiraAnalyticsDatasetDraft & {
  id: string;
  projectId: string;
  fingerprint: string;
  version: number;
  createdAt: string;
  updatedAt: string;
};

type AggregateCatalog = { definitions: AggregateDefinition[] };

const AGGREGATE_TYPE_DESCRIPTION: Record<JiraAnalyticsSource, string> = {
  issues: "Одна строка на тикет из текущего или восстановленного снимка.",
  transitions: "Одна строка на переход статуса с длительностью завершенного этапа.",
  development: "Одна строка на наблюденное событие разработки, связанное с тикетом.",
  criticalBugs: "Одна строка на SLA-интервал Critical/Blocker.",
  statusIntervals: "Одна строка на тикет между двумя контрольными точками истории статусов.",
};

const AGGREGATE_SOURCES: JiraAnalyticsSource[] = [
  "issues",
  "transitions",
  "development",
  "criticalBugs",
  "statusIntervals",
];

function defaultStatusIntervalConfig(): NonNullable<JiraAnalyticsDatasetDraft["rowConfig"]> {
  return {
    kind: "statusInterval",
    start: { anchor: "issueCreated" },
    end: { anchor: "firstStatusEntry", statuses: ["In Progress"] },
    openIntervals: "include",
    periodAnchor: "start",
  };
}

function defaultDraft(source: JiraAnalyticsSource = "issues", sortOrder = 0): JiraAnalyticsDatasetDraft {
  return {
    name: "Новый агрегат",
    description: "",
    source,
    rowConfig: source === "statusIntervals" ? defaultStatusIntervalConfig() : null,
    timeZone: "Europe/Moscow",
    sortOrder,
  };
}

function parseStatuses(value: string) {
  return value.split(",").map((status) => status.trim()).filter(Boolean).slice(0, 10);
}

function StatusListEditor({ label, statuses, disabled, allowEmpty = false, onChange }: {
  label: string;
  statuses: string[];
  disabled: boolean;
  allowEmpty?: boolean;
  onChange: (statuses: string[]) => void;
}) {
  return (
    <label>{label}
      <input
        key={statuses.join("\u0000")}
        defaultValue={statuses.join(", ")}
        disabled={disabled}
        placeholder="In Progress, Development"
        onBlur={(event) => {
          const parsed = parseStatuses(event.target.value);
          if (parsed.length > 0 || allowEmpty) onChange(parsed);
          else event.target.value = statuses.join(", ");
        }}
      />
      <span className="jira-status-chips">{statuses.map((status) => <span key={status}>{status}</span>)}</span>
    </label>
  );
}

function StatusEndpointEditor({ label, endpoint, allowIssueCreated, disabled, onChange }: {
  label: string;
  endpoint: JiraAnalyticsStatusIntervalEndpoint;
  allowIssueCreated: boolean;
  disabled: boolean;
  onChange: (endpoint: JiraAnalyticsStatusIntervalEndpoint) => void;
}) {
  return (
    <div className="jira-status-endpoint-editor">
      <label>{label}
        <select
          value={endpoint.anchor}
          disabled={disabled}
          onChange={(event) => {
            const anchor = event.target.value as JiraAnalyticsStatusIntervalEndpoint["anchor"];
            if (anchor === "issueCreated") onChange({ anchor });
            if (anchor === "firstStatusEntry") {
              onChange({ anchor, statuses: [allowIssueCreated ? "Open" : "In Progress"] });
            }
            if (anchor === "statusTransition") {
              onChange(allowIssueCreated
                ? { anchor, fromStatuses: ["Open"], toStatuses: ["In Progress"] }
                : { anchor, fromStatuses: ["In Progress"], toStatuses: ["Resolved"] });
            }
          }}
        >
          {allowIssueCreated && <option value="issueCreated">Создание тикета</option>}
          <option value="firstStatusEntry">Первый вход в статус</option>
          <option value="statusTransition">Переход между статусами</option>
        </select>
      </label>
      {endpoint.anchor === "firstStatusEntry" && (
        <StatusListEditor
          label="Статусы входа"
          statuses={endpoint.statuses}
          disabled={disabled}
          onChange={(statuses) => onChange({ anchor: "firstStatusEntry", statuses })}
        />
      )}
      {endpoint.anchor === "statusTransition" && (
        <div className="jira-status-transition-fields">
          <StatusListEditor
            label="Из статуса (пусто = любой)"
            statuses={endpoint.fromStatuses}
            disabled={disabled}
            allowEmpty
            onChange={(fromStatuses) => onChange({ ...endpoint, fromStatuses })}
          />
          <StatusListEditor
            label="В статус (пусто = любой)"
            statuses={endpoint.toStatuses}
            disabled={disabled}
            allowEmpty
            onChange={(toStatuses) => onChange({ ...endpoint, toStatuses })}
          />
        </div>
      )}
    </div>
  );
}

function Preview({ result, fields }: { result: JiraAnalyticsEvaluationResult | null; fields: JiraAnalyticsFilterField[] }) {
  if (!result) return <div className="jira-aggregate-preview-empty">Нажмите «Показать данные»</div>;
  return (
    <div className="jira-aggregate-preview">
      <div className="jira-aggregate-preview-number"><strong>{result.totalRecords.toLocaleString("ru-RU")}</strong><span>строк в агрегате</span></div>
      <div className="jira-aggregate-preview-records">
        <table>
          <thead><tr>{fields.slice(0, 8).map((field) => <th key={field}>{JIRA_ANALYTICS_FILTER_LABELS[field]}</th>)}</tr></thead>
          <tbody>{result.records.map((record) => {
            const values: Partial<Record<JiraAnalyticsFilterField, string | number | boolean | null>> = {
              issueKey: record.issue.issueKey,
              project: record.issue.issueKey.split("-")[0] ?? "",
              summary: record.issue.summary,
              status: record.issue.status,
              assignee: record.issue.assignee,
              reporter: record.issue.reporter,
              priority: record.issue.priority,
              sprint: record.sprint,
              issueType: record.issue.issueType,
              resolution: record.issue.resolution,
              fromStatus: record.fromStatus,
              toStatus: record.toStatus,
              durationHours: record.durationHours,
              commitCount: record.commitCount,
              mergeRequestCount: record.mergeRequestCount,
              hasDevelopment: record.issue.commitCount > 0 || record.issue.mergeRequestCount > 0,
              issueCreatedAt: record.issue.issueCreatedAt,
              criticalPriorityAt: record.issue.criticalPriorityAt,
              resolutionAt: record.issue.resolutionAt,
              updatedAt: record.issue.updatedAt,
              eventAt: record.eventAt,
              intervalStartAt: record.intervalStartAt,
              intervalEndAt: record.intervalEndAt,
            };
            return <tr key={record.id}>{fields.slice(0, 8).map((field) => <td key={field}>{field === "issueKey"
              ? <a href={record.issue.issueUrl} target="_blank" rel="noreferrer">{record.issue.issueKey}</a>
              : String(values[field] ?? "-")}</td>)}</tr>;
          })}</tbody>
        </table>
      </div>
      <p className="muted">Показана первая страница. Полнота данных: {result.quality.coveragePercent ?? 0}%.</p>
    </div>
  );
}

export function JiraAggregatesPage() {
  const { currentUser, isClosedProject, project, setError, setNotice } = usePageContext();
  const canEdit = currentUser?.role === "ADMIN" && !isClosedProject;
  const [catalog, setCatalog] = useState<AggregateCatalog | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<JiraAnalyticsDatasetDraft>(() => defaultDraft());
  const [expectedVersion, setExpectedVersion] = useState<number | null>(null);
  const [preview, setPreview] = useState<JiraAnalyticsEvaluationResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const loadRef = useRef(0);

  const applyDefinition = (definition: AggregateDefinition) => {
    setSelectedId(definition.id);
    setExpectedVersion(definition.version);
    setDraft({
      name: definition.name,
      description: definition.description,
      source: definition.source,
      rowConfig: definition.rowConfig ? structuredClone(definition.rowConfig) : null,
      timeZone: definition.timeZone,
      sortOrder: definition.sortOrder,
    });
    setPreview(null);
  };

  const load = async (preferredId?: string | null) => {
    const sequence = ++loadRef.current;
    setLoading(true);
    try {
      const next = await apiClient.get<AggregateCatalog>(`/api/projects/${project.id}/jira/aggregates`, "Не удалось загрузить агрегаты Jira");
      if (sequence !== loadRef.current) return;
      setCatalog(next);
      const selected = next.definitions.find((item) => item.id === (preferredId ?? selectedId)) ?? next.definitions[0];
      if (selected) applyDefinition(selected);
      else {
        setSelectedId(null);
        setExpectedVersion(null);
        setDraft(defaultDraft("issues", next.definitions.length));
      }
    } catch (error) {
      if (sequence === loadRef.current) setError(error instanceof Error ? error.message : "Не удалось загрузить агрегаты");
    } finally { if (sequence === loadRef.current) setLoading(false); }
  };

  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (active) void load(null);
    });
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.id]);

  const availableFields = JIRA_ANALYTICS_FIELDS_BY_SOURCE[draft.source];
  const validation = jiraAnalyticsDatasetDraftSchema.safeParse(draft);
  const grouped = useMemo(() => Object.fromEntries(
    AGGREGATE_SOURCES.map((source) => [source, catalog?.definitions.filter((item) => item.source === source) ?? []]),
  ) as Record<JiraAnalyticsSource, AggregateDefinition[]>, [catalog]);

  const save = async () => {
    if (!canEdit || !validation.success) return;
    setSaving(true);
    try {
      const saved = selectedId
        ? await apiClient.patch<AggregateDefinition>(`/api/projects/${project.id}/jira/aggregates/${selectedId}`, { definition: validation.data, expectedVersion }, "Не удалось сохранить агрегат")
        : await apiClient.post<AggregateDefinition>(`/api/projects/${project.id}/jira/aggregates`, { definition: validation.data }, "Не удалось создать агрегат");
      await load(saved.id);
      setNotice("Агрегат сохранен. Виджеты «В работе» используют текущую ревизию, «Ретро» сохраняют закрепленную.");
    } catch (error) { setError(error instanceof Error ? error.message : "Не удалось сохранить агрегат"); }
    finally { setSaving(false); }
  };

  const remove = async () => {
    if (!canEdit || !selectedId || expectedVersion === null || !window.confirm("Удалить агрегат? Используемый виджетами агрегат удалить нельзя.")) return;
    setSaving(true);
    try {
      await apiClient.delete(`/api/projects/${project.id}/jira/aggregates/${selectedId}?expectedVersion=${expectedVersion}`, "Не удалось удалить агрегат");
      await load(null);
      setNotice("Агрегат удален");
    } catch (error) { setError(error instanceof Error ? error.message : "Не удалось удалить агрегат"); }
    finally { setSaving(false); }
  };

  const runPreview = async () => {
    if (!validation.success) return;
    try {
      const result = await apiClient.post<JiraAnalyticsEvaluationResult>(`/api/projects/${project.id}/jira/aggregates/preview`, {
        definition: validation.data,
        periodDays: 90,
        assignee: "",
        page: 1,
        pageSize: 12,
      }, "Не удалось построить предпросмотр");
      setPreview(result);
    } catch (error) { setError(error instanceof Error ? error.message : "Не удалось построить предпросмотр"); }
  };

  if (loading && !catalog) return <div className="jira-aggregate-preview-empty">Загрузка агрегатов...</div>;
  return (
    <div className="jira-aggregates-page"><div className="jira-aggregate-builder">
      <aside className="jira-aggregate-catalog">
        <header><div><Database size={22} /><h3>Агрегаты</h3></div>{canEdit && <button type="button" className="icon-button" title="Создать агрегат" onClick={() => { setSelectedId(null); setExpectedVersion(null); setDraft(defaultDraft("issues", catalog?.definitions.length ?? 0)); setPreview(null); }}><Plus size={20} /></button>}</header>
        <div className="jira-aggregate-catalog-list">{AGGREGATE_SOURCES.map((source) => (
          <section key={source}><h4>{JIRA_ANALYTICS_AGGREGATE_TYPE_LABELS[source]} <span>{grouped[source].length}</span></h4>
            {grouped[source].map((definition) => <button key={definition.id} type="button" className={definition.id === selectedId ? "active" : ""} onClick={() => applyDefinition(definition)}><strong>{definition.name}</strong><span>Версия {definition.version}</span></button>)}
          </section>
        ))}</div>
      </aside>

      <main className="jira-aggregate-editor">
        <header><div><h3>{selectedId ? draft.name : "Новый агрегат"}</h3><p>{AGGREGATE_TYPE_DESCRIPTION[draft.source]}</p></div>
          <div className="jira-aggregate-actions"><button type="button" className="secondary-button" disabled={!canEdit || !validation.success || saving} onClick={() => void runPreview()}><Eye size={18} />Показать данные</button>{selectedId && canEdit && <button type="button" className="icon-button danger" disabled={saving} onClick={() => void remove()} title="Удалить агрегат"><Trash2 size={18} /></button>}{canEdit && <button type="button" className="primary-button" disabled={!validation.success || saving} onClick={() => void save()}><Save size={18} />Сохранить</button>}</div>
        </header>
        <div className="jira-aggregate-editor-grid">
          <section className="jira-aggregate-controls">
            <label>Название<input value={draft.name} disabled={!canEdit} onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></label>
            <label>Описание<textarea value={draft.description} disabled={!canEdit} onChange={(event) => setDraft({ ...draft, description: event.target.value })} /></label>
            <label>Агрегат<select value={draft.source} disabled={!canEdit || selectedId !== null} onChange={(event) => { const source = event.target.value as JiraAnalyticsSource; setDraft({ ...defaultDraft(source, draft.sortOrder), name: draft.name, description: draft.description }); setPreview(null); }}>{AGGREGATE_SOURCES.map((source) => <option key={source} value={source}>{JIRA_ANALYTICS_AGGREGATE_TYPE_LABELS[source]}</option>)}</select></label>

            {draft.source === "statusIntervals" && draft.rowConfig?.kind === "statusInterval" && (
              <fieldset className="jira-aggregate-fieldset jira-status-interval-config">
                <legend>Контрольные точки интервала</legend>
                <StatusEndpointEditor
                  label="Начало"
                  endpoint={draft.rowConfig.start}
                  allowIssueCreated
                  disabled={!canEdit}
                  onChange={(start) => setDraft({
                    ...draft,
                    rowConfig: { ...draft.rowConfig!, start },
                  })}
                />
                <StatusEndpointEditor
                  label="Конец"
                  endpoint={draft.rowConfig.end}
                  allowIssueCreated={false}
                  disabled={!canEdit}
                  onChange={(end) => {
                    if (end.anchor === "issueCreated") return;
                    setDraft({
                      ...draft,
                      rowConfig: { ...draft.rowConfig!, end },
                    });
                  }}
                />
                <p className="jira-aggregate-help">
                  Используется первая подходящая пара переходов; повторные циклы не учитываются.
                </p>
                <label className="jira-aggregate-field-option">
                  <input
                    type="checkbox"
                    checked={draft.rowConfig.openIntervals === "include"}
                    disabled={!canEdit}
                    onChange={(event) => setDraft({
                      ...draft,
                      rowConfig: {
                        ...draft.rowConfig!,
                        openIntervals: event.target.checked ? "include" : "exclude",
                        periodAnchor: event.target.checked ? "start" : draft.rowConfig!.periodAnchor,
                      },
                    })}
                  />
                  <span>Учитывать незавершённые интервалы</span>
                </label>
                <label>Якорь периода
                  <select
                    value={draft.rowConfig.periodAnchor}
                    disabled={!canEdit || draft.rowConfig.openIntervals === "include"}
                    onChange={(event) => setDraft({
                      ...draft,
                      rowConfig: { ...draft.rowConfig!, periodAnchor: event.target.value as "start" | "end" },
                    })}
                  >
                    <option value="start">Дата начала</option>
                    <option value="end">Дата завершения</option>
                  </select>
                </label>
              </fieldset>
            )}

            {!validation.success && <div className="jira-aggregate-validation">{validation.error.issues[0]?.message}</div>}
          </section>
          <section className="jira-aggregate-preview-panel"><header><h4>Строки агрегата</h4><span>{draft.source === "transitions" || draft.source === "development" ? "Предпросмотр за последние 90 дней" : "Все строки; фильтрацию выполняет виджет"}</span></header><Preview result={preview} fields={[...availableFields]} /></section>
        </div>
      </main>
    </div></div>
  );
}
